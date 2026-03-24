import fs from 'fs';
import path from 'path';

export type RouteExportStyleKind = 'export_default_function' | 'const_arrow_export_default';

export type RouteExportStyleSource = 'override_file' | 'package_json' | 'heuristic' | 'fallback_no_samples' | 'fallback_tie';

export interface RouteExportStyleResolution {
    /** Resolved writing style for new route modules */
    style: RouteExportStyleKind;
    source: RouteExportStyleSource;
    defaultFunctionCount: number;
    constArrowCount: number;
    skippedCount: number;
    sampledRelPaths: string[];
}

const MAX_SAMPLE_FILES = 24;
const READ_SLICE = 12_000;

const OVERRIDE_REL = path.join('.basalt', 'conventions.json');

function readJsonFile(filePath: string): unknown | null {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    } catch {
        return null;
    }
}

function parseOverride(raw: unknown): RouteExportStyleKind | 'auto' | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const v = o.routeExportStyle;
    if (v === 'export_default_function' || v === 'const_arrow_export_default') return v;
    if (v === 'auto') return 'auto';
    return null;
}

export interface RouteExportOverride {
    style: RouteExportStyleKind;
    origin: 'override_file' | 'package_json';
}

/**
 * `.basalt/conventions.json` 우선, 다음 `package.json`의 `"basalt".routeExportStyle`.
 * `auto` 또는 미설정은 `null`(휴리스틱 사용).
 */
export function loadRouteExportStyleOverride(projectRoot: string): RouteExportOverride | null {
    const convPath = path.join(projectRoot, OVERRIDE_REL);
    const fromConv = parseOverride(readJsonFile(convPath));
    if (fromConv === 'export_default_function' || fromConv === 'const_arrow_export_default') {
        return { style: fromConv, origin: 'override_file' };
    }

    const pkgPath = path.join(projectRoot, 'package.json');
    const pkg = readJsonFile(pkgPath);
    if (pkg && typeof pkg === 'object' && pkg !== null && 'basalt' in pkg) {
        const b = (pkg as { basalt?: unknown }).basalt;
        if (b && typeof b === 'object' && b !== null) {
            const r = (b as Record<string, unknown>).routeExportStyle;
            if (r === 'export_default_function' || r === 'const_arrow_export_default') {
                return { style: r, origin: 'package_json' };
            }
        }
    }
    return null;
}

function isAppRouterStructure(structure: string): boolean {
    return structure.includes('app-router');
}

function isPagesRouterStructure(structure: string): boolean {
    return structure.includes('pages-router');
}

/**
 * Collect `page.*` / `layout.*` under App Router root, or route files under Pages Router.
 */
export function collectRouteModuleFiles(projectRoot: string, routerBase: string | null, structure: string): string[] {
    if (!routerBase) return [];
    const baseAbs = path.join(projectRoot, routerBase);
    if (!fs.existsSync(baseAbs)) return [];

    const out: string[] = [];
    const appSegmentPattern = /^(page|layout|default)\.(tsx|ts|jsx|js)$/i;

    if (isAppRouterStructure(structure)) {
        const walk = (dir: string) => {
            if (out.length >= MAX_SAMPLE_FILES) return;
            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch {
                return;
            }
            for (const e of entries) {
                if (out.length >= MAX_SAMPLE_FILES) return;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) {
                    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
                    if (e.name === 'api') continue;
                    walk(full);
                } else if (appSegmentPattern.test(e.name)) {
                    out.push(full);
                }
            }
        };
        walk(baseAbs);
        return out;
    }

    if (isPagesRouterStructure(structure)) {
        const walk = (dir: string, depth: number) => {
            if (out.length >= MAX_SAMPLE_FILES) return;
            if (depth > 4) return;
            let entries: fs.Dirent[];
            try {
                entries = fs.readdirSync(dir, { withFileTypes: true });
            } catch {
                return;
            }
            for (const e of entries) {
                if (out.length >= MAX_SAMPLE_FILES) return;
                const full = path.join(dir, e.name);
                if (e.isDirectory()) {
                    if (e.name.startsWith('_') || e.name === 'api' || e.name.startsWith('.')) continue;
                    walk(full, depth + 1);
                } else if (/\.(tsx|ts|jsx|js)$/i.test(e.name) && !/\.d\.ts$/i.test(e.name)) {
                    const base = e.name.replace(/\.(tsx|ts|jsx|js)$/i, '');
                    if (base.startsWith('_')) continue;
                    out.push(full);
                }
            }
        };
        walk(baseAbs, 0);
        return out;
    }

    return [];
}

export type ClassifiedExportForm = 'default_function' | 'const_arrow' | 'skip';

/**
 * Classify a single route module's default-export shape.
 */
export function classifyRouteModuleSource(content: string): ClassifiedExportForm {
    const c = content.slice(0, READ_SLICE);

    if (!/\bexport\s+default\b/.test(c)) return 'skip';

    if (/\bexport\s+default\s+(?:async\s+)?function\b/.test(c)) {
        return 'default_function';
    }

    if (/\bexport\s+default\s+(?:async\s*)?\(/.test(c)) {
        return 'const_arrow';
    }

    const hasConstComponent =
        /\bconst\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/.test(c) ||
        /\bconst\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s+)?function\b/.test(c);

    if (hasConstComponent) {
        return 'const_arrow';
    }

    return 'skip';
}

function voteStyle(counts: { df: number; ca: number }): RouteExportStyleKind | 'tie' {
    if (counts.df > counts.ca) return 'export_default_function';
    if (counts.ca > counts.df) return 'const_arrow_export_default';
    return 'tie';
}

interface InferredRouteExportVotes {
    style: RouteExportStyleKind | 'tie';
    defaultFunctionCount: number;
    constArrowCount: number;
    skippedCount: number;
    sampledRelPaths: string[];
}

export function inferRouteExportStyleFromFiles(projectRoot: string, absolutePaths: string[]): InferredRouteExportVotes {
    let defaultFunctionCount = 0;
    let constArrowCount = 0;
    let skippedCount = 0;
    const sampledRelPaths: string[] = [];

    for (const abs of absolutePaths) {
        if (sampledRelPaths.length >= MAX_SAMPLE_FILES) break;
        let raw: string;
        try {
            raw = fs.readFileSync(abs, 'utf8');
        } catch {
            skippedCount += 1;
            continue;
        }
        const rel = path.relative(projectRoot, abs).replace(/\\/g, '/');
        sampledRelPaths.push(rel);
        const form = classifyRouteModuleSource(raw);
        if (form === 'default_function') defaultFunctionCount += 1;
        else if (form === 'const_arrow') constArrowCount += 1;
        else skippedCount += 1;
    }

    const voted = voteStyle({ df: defaultFunctionCount, ca: constArrowCount });
    if (voted === 'tie') {
        return {
            style: 'tie',
            defaultFunctionCount,
            constArrowCount,
            skippedCount,
            sampledRelPaths,
        };
    }
    return {
        style: voted,
        defaultFunctionCount,
        constArrowCount,
        skippedCount,
        sampledRelPaths,
    };
}

/**
 * Full resolution: override → heuristic → safe default.
 */
export function resolveRouteExportStyle(
    projectRoot: string,
    routerBase: string | null,
    structure: string
): RouteExportStyleResolution {
    const override = loadRouteExportStyleOverride(projectRoot);
    if (override) {
        return {
            style: override.style,
            source: override.origin,
            defaultFunctionCount: 0,
            constArrowCount: 0,
            skippedCount: 0,
            sampledRelPaths: [],
        };
    }

    const files = collectRouteModuleFiles(projectRoot, routerBase, structure);
    const inferred = inferRouteExportStyleFromFiles(projectRoot, files);

    if (inferred.style === 'tie' || (inferred.defaultFunctionCount === 0 && inferred.constArrowCount === 0)) {
        return {
            style: 'export_default_function',
            source: inferred.defaultFunctionCount === 0 && inferred.constArrowCount === 0 ? 'fallback_no_samples' : 'fallback_tie',
            defaultFunctionCount: inferred.defaultFunctionCount,
            constArrowCount: inferred.constArrowCount,
            skippedCount: inferred.skippedCount,
            sampledRelPaths: inferred.sampledRelPaths,
        };
    }

    return {
        style: inferred.style,
        source: 'heuristic',
        defaultFunctionCount: inferred.defaultFunctionCount,
        constArrowCount: inferred.constArrowCount,
        skippedCount: inferred.skippedCount,
        sampledRelPaths: inferred.sampledRelPaths,
    };
}

export function formatExportStylePolicySection(resolution: RouteExportStyleResolution): string {
    const srcKr =
        resolution.source === 'override_file'
            ? '`.basalt/conventions.json` 설정'
            : resolution.source === 'package_json'
              ? '`package.json`의 `basalt.routeExportStyle` 설정'
              : resolution.source === 'heuristic'
                ? '저장소 내 라우트 모듈 샘플 다수결'
                : resolution.source === 'fallback_tie'
                  ? '샘플이 무승부여서 Next.js 문서 권장 패턴을 기본값으로 사용'
                  : '라우트 모듈 샘플이 없어 Next.js 문서 권장 패턴을 기본값으로 사용';

    const sampleNote =
        resolution.sampledRelPaths.length > 0
            ? `검사한 파일 예: ${resolution.sampledRelPaths.slice(0, 6).join(', ')}${resolution.sampledRelPaths.length > 6 ? ', …' : ''}.`
            : '로컬에서 라우트 파일을 찾지 못했습니다.';

    const countsNote = `(휴리스틱: export default function ${resolution.defaultFunctionCount}개, const/화살표+default ${resolution.constArrowCount}개, 분류 제외 ${resolution.skippedCount}개)`;

    if (resolution.style === 'export_default_function') {
        return `## EXPORT_STYLE_POLICY
- **근거**: ${srcKr}. ${sampleNote} ${resolution.source === 'heuristic' ? countsNote : ''}
- **라우트 모듈** (\`page.tsx\`, \`layout.tsx\`, Pages Router의 \`pages/**/*.tsx\` 등 **기본 export가 있는 경로**): 새 코드는 **\`export default function Name\`** 또는 **\`export default async function Name\`** 형태를 우선한다.
- **금지(이 스타일일 때)**: 라우트 파일을 **\`const Name = () => …\` + \`export default Name\`** 로만 새로 만들지 말 것(기존 파일을 수정할 때는 해당 파일과 동일 패턴 유지).
- **UI 키트** (\`@/components/ui/*\`): **위 문장보다 앞선 \`UI Component Import Style\` / named·default import 규칙이 우선**한다. 이 블록은 **라우트(페이지·레이아웃) 모듈의 default export 선언 형태**만 다룬다.`;
    }

    return `## EXPORT_STYLE_POLICY
- **근거**: ${srcKr}. ${sampleNote} ${resolution.source === 'heuristic' ? countsNote : ''}
- **라우트 모듈** (\`page.tsx\`, \`layout.tsx\`, Pages Router의 \`pages/**\` 등): 새 코드는 **\`const Name = (…) => { … }\` (또는 \`const Name = async (…) => …\`) 뒤에 \`export default Name\`** 패턴을 우선한다.
- **금지(이 스타일일 때)**: 라우트 파일에 **\`export default function …\`** 를 새로 도입하지 말 것(기존 파일을 수정할 때는 해당 파일과 동일 패턴 유지).
- **UI 키트** (\`@/components/ui/*\`): **\`UI Component Import Style\` 규칙이 우선**한다. 이 블록은 **라우트 모듈 default export 형태**만 다룬다.`;
}
