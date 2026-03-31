import fs from 'fs';
import path from 'path';

/**
 * Deterministic checks for Next.js App Router `page.*` files.
 * Catches common mistakes like pasting mock-data modules into `page.tsx` without a component default export.
 */

const APP_PAGE_PATH =
    /^(?:src\/)?app\/(?:.+\/)*page\.(tsx|ts|jsx|js)$/i;

export function isAppRouterPagePath(relPath: string): boolean {
    const n = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
    return APP_PAGE_PATH.test(n);
}

function reEscape(id: string): string {
    return id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasComponentStyleDefaultExport(source: string): boolean {
    return (
        /\bexport\s+default\s+async\s+function\b/.test(source) ||
        /\bexport\s+default\s+function\b/.test(source) ||
        /\bexport\s+default\s+memo\s*\(/.test(source) ||
        /\bexport\s+default\s+forwardRef\s*\(/.test(source) ||
        /\bexport\s+default\s+dynamic\s*\(/.test(source) ||
        /\bexport\s+default\s+lazy\s*\(/.test(source)
    );
}

/** `export default Foo` where `Foo` is declared as a function or arrow component elsewhere in the file. */
function isDefaultIdentifierLikelyComponent(source: string, id: string): boolean {
    const esc = reEscape(id);
    if (new RegExp(`\\bfunction\\s+${esc}\\s*\\(`).test(source)) return true;
    if (new RegExp(`\\bconst\\s+${esc}\\s*=\\s*\\([^)]*\\)\\s*=>`).test(source)) return true;
    if (new RegExp(`\\bconst\\s+${esc}\\s*=\\s*async\\s*\\([^)]*\\)\\s*=>`).test(source)) return true;
    return false;
}

/**
 * Returns human-readable issues; empty means heuristic pass.
 */
export function analyzeAppRoutePageFile(relPath: string, source: string): string[] {
    const issues: string[] = [];
    const s = source.replace(/\r\n/g, '\n');

    if (!/\bexport\s+default\b/.test(s)) {
        issues.push(`${relPath}: App Router 페이지 파일에 export default가 없습니다.`);
        return issues;
    }

    if (hasComponentStyleDefaultExport(s)) {
        return issues;
    }

    const identDefault = s.match(/\bexport\s+default\s+([A-Za-z_$][\w$]*)\s*(?:;|\n|$)/);
    if (identDefault && isDefaultIdentifierLikelyComponent(s, identDefault[1])) {
        return issues;
    }

    if (/\bexport\s+default\s*\[/.test(s)) {
        issues.push(`${relPath}: export default가 배열 리터럴입니다. React 컴포넌트(함수)를 기본보내기 하세요. mock 데이터는 별도 모듈로 두세요.`);
        return issues;
    }

    if (/\bexport\s+default\s*\{/.test(s)) {
        issues.push(`${relPath}: export default가 객체 리터럴입니다. 페이지 기본보내기는 컴포넌트여야 합니다.`);
        return issues;
    }

    if (/\bexport\s+default\s*[`'"]/.test(s) || /\bexport\s+default\s*\d/.test(s)) {
        issues.push(`${relPath}: export default가 원시값입니다. 컴포넌트 함수를 사용하세요.`);
        return issues;
    }

    if (identDefault) {
        const id = identDefault[1];
        const constDecl = new RegExp(`(?:const|let|var)\\s+${reEscape(id)}\\s*=\\s*([\\[{'"\`])`);
        const cm = s.match(constDecl);
        if (cm && (cm[1] === '[' || cm[1] === '{' || cm[1] === "'" || cm[1] === '"' || cm[1] === '`')) {
            issues.push(
                `${relPath}: export default \`${id}\`가 배열/객체/문자열 등 데이터에 바인딩되어 있습니다. UI 컴포넌트를 기본보내기하고 데이터는 lib 등에서 import 하세요.`
            );
            return issues;
        }
        if (/^[A-Z][A-Z0-9_]*$/.test(id)) {
            issues.push(
                `${relPath}: export default가 상수 식별자(\`${id}\`)만 가리킵니다. 페이지는 보통 \`export default function Page()\` 형태여야 합니다.`
            );
            return issues;
        }
    }

    // Default export exists but not a recognized component pattern.
    if (!/\bexport\s+default\s*\(/.test(s)) {
        issues.push(
            `${relPath}: export default가 함수/Async 함수/memo/dynamic 등 표준 페이지 패턴이 아닙니다. mock 전용 모듈 내용이 붙어 있지 않은지 확인하세요.`
        );
    }

    return issues;
}

const MAX_READ = 200_000;

export function collectAppRoutePageSanityIssues(
    projectPath: string,
    relativePaths: string[]
): string[] {
    const issues: string[] = [];
    const seen = new Set<string>();
    const root = path.resolve(projectPath);

    for (const rel of relativePaths) {
        if (!isAppRouterPagePath(rel)) continue;
        const key = rel.replace(/\\/g, '/');
        if (seen.has(key)) continue;
        seen.add(key);

        const full = path.join(root, rel);
        if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;

        let source: string;
        try {
            source = fs.readFileSync(full, 'utf8').slice(0, MAX_READ);
        } catch {
            continue;
        }
        issues.push(...analyzeAppRoutePageFile(key, source));
    }

    return issues;
}
