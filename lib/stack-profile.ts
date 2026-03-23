import fs from 'fs';
import path from 'path';

export type StackPrimary =
    | 'next'
    | 'angular'
    | 'nuxt'
    | 'sveltekit'
    | 'vue_vite'
    | 'react_vite'
    | 'vite_generic'
    | 'static'
    | 'unknown';

export type RouterKind = 'app' | 'pages' | 'none' | 'unknown';

export interface StackProfile {
    primary: StackPrimary;
    routerKind: RouterKind;
    /** Labels aligned with legacy ProjectProfiler.detectStructure() */
    structure: string;
    deps: string[];
    depsWithVersions: Record<string, string>;
    majors: Partial<Record<'next' | 'react' | 'vue' | 'nuxt' | 'angular' | 'svelte', number>>;
    /** Both `app/` and `src/app/` exist (or both pages trees) — see {@link routerResolutionNote} */
    routerDualRoot?: boolean;
    /** Korean explanation when two possible router roots exist; inject into [PROJECT CONTEXT] */
    routerResolutionNote?: string | null;
}

const APP_ROUTE_MARKER = /^page\.(tsx|ts|jsx|js|mdx)$/i;
const LAYOUT_MARKER = /^layout\.(tsx|ts|jsx|js)$/i;

function scoreAppRouterDirectory(rootDir: string): number {
    if (!fs.existsSync(rootDir)) return 0;
    let score = 0;
    function walk(dir: string, depth: number) {
        if (depth > 40) return;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            const name = e.name;
            if (name === 'node_modules' || name.startsWith('.')) continue;
            const full = path.join(dir, name);
            if (e.isDirectory()) {
                walk(full, depth + 1);
            } else if (APP_ROUTE_MARKER.test(name) || LAYOUT_MARKER.test(name)) {
                score++;
            }
        }
    }
    walk(rootDir, 0);
    return score;
}

function scorePagesDirectory(rootDir: string): number {
    if (!fs.existsSync(rootDir)) return 0;
    let score = 0;
    function walk(dir: string, depth: number) {
        if (depth > 40) return;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            const name = e.name;
            if (name.startsWith('.') || name.startsWith('_')) continue;
            const full = path.join(dir, name);
            if (e.isDirectory()) {
                if (name === 'api') continue;
                walk(full, depth + 1);
            } else if (/\.(tsx|ts|jsx|js)$/.test(name) && !name.endsWith('.d.ts')) {
                score++;
            }
        }
    }
    walk(rootDir, 0);
    return score;
}

export interface NextStyleRouterDetectionMeta {
    structure: string;
    dualAppRoots: boolean;
    dualPagesRoots: boolean;
    resolutionNote: string | null;
}

/**
 * Resolves `app/` vs `src/app/` (and `pages/` vs `src/pages/`) when both exist.
 * Picks the tree with more route files; on a tie prefers `src/*` (common when migrating).
 */
export function detectNextStyleRouterStructureWithMeta(projectRoot: string): NextStyleRouterDetectionMeta {
    const appDir = path.join(projectRoot, 'app');
    const srcAppDir = path.join(projectRoot, 'src', 'app');
    const hasApp = fs.existsSync(appDir);
    const hasSrcApp = fs.existsSync(srcAppDir);

    if (hasApp && hasSrcApp) {
        const scoreRoot = scoreAppRouterDirectory(appDir);
        const scoreSrc = scoreAppRouterDirectory(srcAppDir);
        let chosen: 'app' | 'src/app';
        let note: string;
        if (scoreRoot > scoreSrc) {
            chosen = 'app';
            note =
                '루트 `app/`와 `src/app/`가 모두 있습니다. `page`/`layout` 파일 개수가 더 많은 쪽으로 Router Base를 `app`(루트)로 두었습니다. 사용하지 않는 쪽 폴더를 제거하면 혼동을 줄일 수 있습니다.';
        } else if (scoreSrc > scoreRoot) {
            chosen = 'src/app';
            note =
                '루트 `app/`와 `src/app/`가 모두 있습니다. `page`/`layout` 파일 개수가 더 많은 쪽으로 Router Base를 `src/app`으로 두었습니다. 사용하지 않는 쪽 폴더를 제거하면 혼동을 줄일 수 있습니다.';
        } else {
            chosen = 'src/app';
            note =
                '루트 `app/`와 `src/app/`가 모두 있고 `page`/`layout` 개수가 같습니다. Router Base는 `src/app`으로 두었습니다(동률 시 src 우선). 한쪽만 남기는 것을 권장합니다.';
        }
        return {
            structure: chosen === 'app' ? 'app-router (Base: app/)' : 'app-router (Base: src/app/)',
            dualAppRoots: true,
            dualPagesRoots: false,
            resolutionNote: note,
        };
    }

    if (hasApp) {
        return {
            structure: 'app-router (Base: app/)',
            dualAppRoots: false,
            dualPagesRoots: false,
            resolutionNote: null,
        };
    }
    if (hasSrcApp) {
        return {
            structure: 'app-router (Base: src/app/)',
            dualAppRoots: false,
            dualPagesRoots: false,
            resolutionNote: null,
        };
    }

    const pagesDir = path.join(projectRoot, 'pages');
    const srcPagesDir = path.join(projectRoot, 'src', 'pages');
    const hasPages = fs.existsSync(pagesDir);
    const hasSrcPages = fs.existsSync(srcPagesDir);

    if (hasPages && hasSrcPages) {
        const scoreRoot = scorePagesDirectory(pagesDir);
        const scoreSrc = scorePagesDirectory(srcPagesDir);
        let chosen: 'pages' | 'src/pages';
        let note: string;
        if (scoreRoot > scoreSrc) {
            chosen = 'pages';
            note =
                '루트 `pages/`와 `src/pages/`가 모두 있습니다. 라우트 파일이 더 많은 쪽으로 Router Base를 `pages`(루트)로 두었습니다. 한쪽 정리를 권장합니다.';
        } else if (scoreSrc > scoreRoot) {
            chosen = 'src/pages';
            note =
                '루트 `pages/`와 `src/pages/`가 모두 있습니다. 라우트 파일이 더 많은 쪽으로 Router Base를 `src/pages`로 두었습니다. 한쪽 정리를 권장합니다.';
        } else {
            chosen = 'src/pages';
            note =
                '루트 `pages/`와 `src/pages/`가 모두 있고 파일 개수가 같습니다. Router Base는 `src/pages`로 두었습니다(동률 시 src 우선).';
        }
        return {
            structure: chosen === 'pages' ? 'pages-router (Base: pages/)' : 'pages-router (Base: src/pages/)',
            dualAppRoots: false,
            dualPagesRoots: true,
            resolutionNote: note,
        };
    }

    if (hasPages) {
        return {
            structure: 'pages-router (Base: pages/)',
            dualAppRoots: false,
            dualPagesRoots: false,
            resolutionNote: null,
        };
    }
    if (hasSrcPages) {
        return {
            structure: 'pages-router (Base: src/pages/)',
            dualAppRoots: false,
            dualPagesRoots: false,
            resolutionNote: null,
        };
    }

    return {
        structure: 'unknown',
        dualAppRoots: false,
        dualPagesRoots: false,
        resolutionNote: null,
    };
}

export function detectNextStyleRouterStructure(projectRoot: string): string {
    return detectNextStyleRouterStructureWithMeta(projectRoot).structure;
}

/**
 * First numeric major from semver ranges like "^15.0.0", "~14.2.3", "16.1.1".
 */
export function parseMajor(versionRange: string | undefined): number | null {
    if (!versionRange || typeof versionRange !== 'string') return null;
    const trimmed = versionRange.trim();
    const m = trimmed.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
}

function routerKindFromStructure(structure: string): RouterKind {
    if (structure.includes('app-router')) return 'app';
    if (structure.includes('pages-router')) return 'pages';
    if (structure === 'unknown') return 'unknown';
    return 'unknown';
}

export function inferStackProfile(projectRoot: string): StackProfile {
    const det = detectNextStyleRouterStructureWithMeta(projectRoot);
    const structure = det.structure;
    const routerKind = routerKindFromStructure(structure);
    const pkgPath = path.join(projectRoot, 'package.json');

    const dual = det.dualAppRoots || det.dualPagesRoots;
    const note = det.resolutionNote;

    if (!fs.existsSync(pkgPath)) {
        const hasIndex =
            fs.existsSync(path.join(projectRoot, 'index.html')) ||
            fs.existsSync(path.join(projectRoot, 'public', 'index.html'));
        return {
            primary: hasIndex ? 'static' : 'unknown',
            routerKind: hasIndex ? 'none' : 'unknown',
            structure,
            deps: [],
            depsWithVersions: {},
            majors: {},
            routerDualRoot: dual || undefined,
            routerResolutionNote: note,
        };
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const depsWithVersions: Record<string, string> = {
            ...(pkg.dependencies || {}),
            ...(pkg.devDependencies || {}),
        };
        const deps = Object.keys(depsWithVersions);

        let primary: StackPrimary = 'unknown';
        if (depsWithVersions['next']) {
            primary = 'next';
        } else if (depsWithVersions['@angular/core']) {
            primary = 'angular';
        } else if (depsWithVersions['nuxt']) {
            primary = 'nuxt';
        } else if (depsWithVersions['@sveltejs/kit']) {
            primary = 'sveltekit';
        } else if (depsWithVersions['vite']) {
            if (depsWithVersions['vue']) primary = 'vue_vite';
            else if (depsWithVersions['react']) primary = 'react_vite';
            else primary = 'vite_generic';
        }

        const majors: StackProfile['majors'] = {
            next: parseMajor(depsWithVersions['next']) ?? undefined,
            react: parseMajor(depsWithVersions['react']) ?? undefined,
            vue: parseMajor(depsWithVersions['vue']) ?? undefined,
            nuxt: parseMajor(depsWithVersions['nuxt']) ?? undefined,
            angular: parseMajor(depsWithVersions['@angular/core']) ?? undefined,
            svelte: parseMajor(depsWithVersions['svelte']) ?? undefined,
        };

        return {
            primary,
            routerKind,
            structure,
            deps,
            depsWithVersions,
            majors,
            routerDualRoot: dual || undefined,
            routerResolutionNote: note,
        };
    } catch {
        return {
            primary: 'unknown',
            routerKind,
            structure,
            deps: [],
            depsWithVersions: {},
            majors: {},
            routerDualRoot: dual || undefined,
            routerResolutionNote: note,
        };
    }
}

export function formatTechStackDisplay(profile: StackProfile): string {
    const v = profile.depsWithVersions;
    switch (profile.primary) {
        case 'next':
            return `Next.js ${v['next'] || ''}`.trim();
        case 'nuxt':
            return `Nuxt ${v['nuxt'] || ''}`.trim();
        case 'sveltekit':
            return `SvelteKit ${v['@sveltejs/kit'] || ''}`.trim();
        case 'angular':
            return `Angular ${v['@angular/core'] || ''}`.trim();
        case 'vue_vite':
            return `Vue ${v['vue'] || ''} + Vite ${v['vite'] || ''}`.trim();
        case 'react_vite':
            return `React ${v['react'] || ''} + Vite ${v['vite'] || ''}`.trim();
        case 'vite_generic':
            return `Vite ${v['vite'] || ''}`.trim();
        case 'static':
            return 'Static HTML';
        default:
            if (v['react']) return `React ${v['react']}`.trim();
            if (v['vue']) return `Vue ${v['vue']}`.trim();
            if (profile.deps.length > 0) return 'Node.js / npm (프레임워크 미분류)';
            return 'unknown';
    }
}
