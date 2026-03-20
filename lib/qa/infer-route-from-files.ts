/**
 * Heuristic: map edited file paths to a Next.js-style URL pathname for QA (e.g. app/test/page.tsx → /test).
 */

function normalizeFileKey(filePath: string): string {
    return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** Remove Next.js route group segments like (marketing) from an app-relative directory chain */
function stripRouteGroupSegments(routeDir: string): string {
    const parts = routeDir.split('/').filter((s) => s.length > 0);
    const kept = parts.filter((seg) => !/^\([^)]+\)$/.test(seg));
    if (kept.length === 0) return '/';
    return '/' + kept.join('/');
}

function appPageFileToRoute(normalizedPath: string): string | null {
    if (/^(?:src\/)?app\/page\.(tsx|jsx|js|mdx)$/i.test(normalizedPath)) {
        return '/';
    }
    const m = normalizedPath.match(/^(?:src\/)?app\/(.+)\/page\.(tsx|jsx|js|mdx)$/i);
    if (!m) return null;
    const inner = m[1];
    if (inner === 'api' || inner.startsWith('api/')) return null;
    return stripRouteGroupSegments(inner);
}

function pagesFileToRoute(normalizedPath: string): string | null {
    const m = normalizedPath.match(/^(?:src\/)?pages\/(.+)\.(tsx|jsx|js)$/i);
    if (!m) return null;
    const rel = m[1];
    if (rel.startsWith('api/') || rel === 'api') return null;
    if (rel.startsWith('_')) return null;

    if (rel === 'index') return '/';
    if (rel.endsWith('/index')) {
        const base = rel.slice(0, -'/index'.length);
        return base ? `/${base}` : '/';
    }
    return `/${rel}`;
}

function filePathToNextRoute(normalizedPath: string): string | null {
    return appPageFileToRoute(normalizedPath) ?? pagesFileToRoute(normalizedPath);
}

/**
 * Walk file paths from last change to first; return first inferable page route.
 */
export function inferRoutePathFromFilePaths(filePaths: string[]): string | null {
    for (let i = filePaths.length - 1; i >= 0; i--) {
        const n = normalizeFileKey(filePaths[i] || '');
        if (!n) continue;
        const route = filePathToNextRoute(n);
        if (route) return route;
    }
    return null;
}
