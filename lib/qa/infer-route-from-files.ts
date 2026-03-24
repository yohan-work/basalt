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

/**
 * Newest-first: first file path that maps to a page route (e.g. app/login/page.tsx).
 * Skips layout.tsx, components, etc. Aligns default "modify element" file with QA preview route inference.
 */
export function pickPrimaryPageSourceFileFromChanges(filePaths: string[]): string | null {
    for (let i = filePaths.length - 1; i >= 0; i--) {
        const raw = filePaths[i] || '';
        const n = normalizeFileKey(raw);
        if (!n) continue;
        if (filePathToNextRoute(n)) return raw;
    }
    return null;
}

/**
 * When QA URL falls back to `/` because no `page.tsx` was inferable — e.g. only `app/.../index.tsx` in changes.
 */
export function buildQaRouteInferenceWarning(filePaths: string[]): string | undefined {
    const normalized = filePaths.map((p) => normalizeFileKey(p || '')).filter(Boolean);
    if (inferRoutePathFromFilePaths(normalized)) return undefined;

    const hasAppIndex = normalized.some((p) => /^(?:src\/)?app\/.+\/index\.(tsx|ts|jsx|js)$/i.test(p));
    const hasAppPage = normalized.some(
        (p) =>
            /^(?:src\/)?app\/.+\/page\.(tsx|ts|jsx|js|mdx)$/i.test(p) ||
            /^(?:src\/)?app\/page\.(tsx|ts|jsx|js|mdx)$/i.test(p)
    );
    if (hasAppIndex && !hasAppPage) {
        return (
            'App Router에서는 세그먼트 URL이 `page.tsx`(또는 `page.js` 등)로만 정의됩니다. ' +
            '변경 목록에 `.../index.tsx`만 있으면 라우트 URL을 추론할 수 없어 QA 스모크가 `/`(루트)만 열립니다. ' +
            '해당 세그먼트에 `page.tsx`를 두거나, 이미 있다면 `fileChanges`에 그 경로가 포함되도록 하세요.'
        );
    }
    return undefined;
}
