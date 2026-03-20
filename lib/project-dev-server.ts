import fs from 'fs';
import path from 'path';

import { inferRoutePathFromFilePaths } from '@/lib/qa/infer-route-from-files';

const DEFAULT_PORTS: Record<string, number> = {
    next: 3001,
    vite: 5173,
    'react-scripts': 3001,
    webpack: 3001,
};

export type DevServerInference = { port: number; inferred: boolean };

/**
 * Infer dev server port from package.json "scripts"."dev".
 * Handles: next dev, vite, react-scripts start, and --port / -p overrides.
 */
export function inferDevServerFromProjectPath(projectPath: string): DevServerInference | null {
    const pkgPath = path.join(projectPath, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const devScript = typeof pkg.scripts?.dev === 'string' ? pkg.scripts.dev : '';
        if (!devScript) return null;

        const script = devScript.trim();

        const portMatch = script.match(/(?:--port|-p)\s+(\d+)/);
        if (portMatch) {
            const port = parseInt(portMatch[1], 10);
            if (port > 0 && port < 65536) return { port, inferred: false };
        }

        if (script.includes('next')) return { port: DEFAULT_PORTS.next, inferred: true };
        if (script.includes('vite')) return { port: DEFAULT_PORTS.vite, inferred: true };
        if (script.includes('react-scripts')) return { port: DEFAULT_PORTS['react-scripts'], inferred: true };
        if (script.includes('webpack')) return { port: DEFAULT_PORTS.webpack, inferred: true };

        return null;
    } catch {
        return null;
    }
}

function normalizeBaseUrl(raw: string): string {
    const t = raw.trim();
    if (!t) return 'http://localhost:3001';
    if (/^https?:\/\//i.test(t)) return t.replace(/\/$/, '');
    return `http://${t.replace(/\/$/, '')}`;
}

function urlToOrigin(normalizedUrl: string): string {
    try {
        return new URL(normalizedUrl).origin;
    } catch {
        return normalizedUrl;
    }
}

/**
 * Origin only (scheme + host + port) for the *target* repo dev server.
 * Same source priority as the former base URL resolver; strips any path/query on candidates.
 */
export function resolveQaDevServerOrigin(
    projectPath: string,
    taskMetadata?: Record<string, unknown> | null
): string {
    const metaUrl = taskMetadata?.qaDevServerUrl;
    if (typeof metaUrl === 'string' && metaUrl.trim()) {
        return urlToOrigin(normalizeBaseUrl(metaUrl.trim()));
    }

    const qaEnv = process.env.QA_DEV_SERVER_URL?.trim();
    if (qaEnv) return urlToOrigin(normalizeBaseUrl(qaEnv));

    const devEnv = process.env.DEV_SERVER_URL?.trim();
    if (devEnv) return urlToOrigin(normalizeBaseUrl(devEnv));

    const inferred = inferDevServerFromProjectPath(projectPath);
    if (inferred) {
        return `http://localhost:${inferred.port}`;
    }

    return 'http://localhost:3001';
}

export function normalizeQaPathname(raw: unknown): string {
    if (typeof raw !== 'string' || !raw.trim()) return '';
    let p = raw.trim();
    if (!p.startsWith('/')) p = `/${p}`;
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
}

type FileChangeLike = { filePath?: string } | string;

/**
 * Full page URL for QA (smoke, screenshots, verify_final_output browser).
 *
 * 1) metadata.qaDevServerUrl with a non-root path → use that URL as-is (normalized).
 * 2) Else origin from resolveQaDevServerOrigin + metadata.qaDevServerPath (if set).
 * 3) Else origin + route inferred from fileChanges (or optional fileChangeList), newest-first.
 * 4) Else origin only.
 */
export function resolveQaPageUrl(
    projectPath: string,
    taskMetadata?: Record<string, unknown> | null,
    fileChangeList?: FileChangeLike[] | null
): string {
    const meta = taskMetadata || {};
    const metaUrl = typeof meta.qaDevServerUrl === 'string' ? meta.qaDevServerUrl.trim() : '';
    if (metaUrl) {
        const full = normalizeBaseUrl(metaUrl);
        try {
            const u = new URL(full);
            if (u.pathname && u.pathname !== '/') {
                return full;
            }
        } catch {
            /* fall through */
        }
    }

    const origin = resolveQaDevServerOrigin(projectPath, meta);

    const pathFromMeta = normalizeQaPathname(meta.qaDevServerPath);
    if (pathFromMeta) {
        return `${origin}${pathFromMeta}`;
    }

    let paths: string[] = [];
    if (fileChangeList && fileChangeList.length > 0) {
        paths = fileChangeList
            .map((entry) => (typeof entry === 'string' ? entry : entry.filePath || ''))
            .filter(Boolean);
    } else {
        const fc = meta.fileChanges;
        if (Array.isArray(fc)) {
            paths = fc.map((x: { filePath?: string }) => x?.filePath || '').filter(Boolean);
        }
    }

    const inferred = inferRoutePathFromFilePaths(paths);
    return inferred ? `${origin}${inferred}` : origin;
}

/**
 * @deprecated Prefer {@link resolveQaPageUrl} for browser QA. This returns **origin only** (no route path).
 */
export function resolveQaDevServerBaseUrl(
    projectPath: string,
    taskMetadata?: Record<string, unknown> | null
): string {
    return resolveQaDevServerOrigin(projectPath, taskMetadata);
}
