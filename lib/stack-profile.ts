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

export function detectNextStyleRouterStructure(projectRoot: string): string {
    if (fs.existsSync(path.join(projectRoot, 'app'))) return 'app-router (Base: app/)';
    if (fs.existsSync(path.join(projectRoot, 'src', 'app'))) return 'app-router (Base: src/app/)';
    if (fs.existsSync(path.join(projectRoot, 'pages'))) return 'pages-router (Base: pages/)';
    if (fs.existsSync(path.join(projectRoot, 'src', 'pages'))) return 'pages-router (Base: src/pages/)';
    return 'unknown';
}

function routerKindFromStructure(structure: string): RouterKind {
    if (structure.includes('app-router')) return 'app';
    if (structure.includes('pages-router')) return 'pages';
    if (structure === 'unknown') return 'unknown';
    return 'unknown';
}

export function inferStackProfile(projectRoot: string): StackProfile {
    const structure = detectNextStyleRouterStructure(projectRoot);
    const routerKind = routerKindFromStructure(structure);
    const pkgPath = path.join(projectRoot, 'package.json');

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

        return { primary, routerKind, structure, deps, depsWithVersions, majors };
    } catch {
        return {
            primary: 'unknown',
            routerKind,
            structure,
            deps: [],
            depsWithVersions: {},
            majors: {},
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
