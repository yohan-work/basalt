import fs from 'fs';
import path from 'path';

/**
 * Next.js App Router root layout must wrap children in `<html>` and `<body>`.
 * @see https://nextjs.org/docs/messages/missing-root-layout-tags
 */

const ROOT_LAYOUT_PATH = /^(?:src\/)?app\/layout\.(tsx|ts|jsx|js)$/i;

export function isAppRootLayoutPath(relPath: string): boolean {
    return ROOT_LAYOUT_PATH.test(relPath.replace(/\\/g, '/').replace(/^\.\//, ''));
}

export function analyzeRootLayoutFile(relPath: string, source: string): string[] {
    const issues: string[] = [];
    const s = source.replace(/\r\n/g, '\n');
    if (!/<html\b/.test(s)) {
        issues.push(
            `${relPath}: 루트 layout에 <html>이 없습니다. <html lang="..."><body>{children}</body></html> 형태가 필요합니다. https://nextjs.org/docs/messages/missing-root-layout-tags`
        );
    }
    if (!/<body\b/.test(s)) {
        issues.push(
            `${relPath}: 루트 layout에 <body>가 없습니다. https://nextjs.org/docs/messages/missing-root-layout-tags`
        );
    }
    return issues;
}

const CANDIDATES = [
    'app/layout.tsx',
    'app/layout.ts',
    'app/layout.jsx',
    'app/layout.js',
    'src/app/layout.tsx',
    'src/app/layout.ts',
    'src/app/layout.jsx',
    'src/app/layout.js',
];

function findExistingRootLayoutOnDisk(projectRoot: string): string | null {
    const root = path.resolve(projectRoot);
    for (const rel of CANDIDATES) {
        const full = path.join(root, rel);
        if (fs.existsSync(full) && fs.statSync(full).isFile()) {
            return rel;
        }
    }
    return null;
}

const MAX_READ = 200_000;

/**
 * Checks `fileChanges` paths that are root layouts, plus on-disk root layout if present.
 */
export function collectRootLayoutSanityIssues(projectPath: string, relativePaths: string[]): string[] {
    const issues: string[] = [];
    const seen = new Set<string>();
    const root = path.resolve(projectPath);

    const toCheck = new Set<string>();
    for (const rel of relativePaths) {
        const n = rel.replace(/\\/g, '/');
        if (isAppRootLayoutPath(n)) toCheck.add(n);
    }
    const diskLayout = findExistingRootLayoutOnDisk(root);
    if (diskLayout) toCheck.add(diskLayout);

    for (const rel of toCheck) {
        if (seen.has(rel)) continue;
        seen.add(rel);
        const full = path.join(root, rel);
        if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
        let source: string;
        try {
            source = fs.readFileSync(full, 'utf8').slice(0, MAX_READ);
        } catch {
            continue;
        }
        issues.push(...analyzeRootLayoutFile(rel, source));
    }

    return issues;
}
