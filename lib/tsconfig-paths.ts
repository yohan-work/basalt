import fs from 'fs';
import path from 'path';
import * as ts from 'typescript';

/** `lib/skills/index.ts` 와 동일 순서 — 뒤 파일이 앞의 동일 키를 덮어쓴다. */
export const CONFIG_FILES_FOR_PATHS = [
    'tsconfig.json',
    'jsconfig.json',
    'tsconfig.app.json',
    'tsconfig.build.json',
] as const;

/**
 * tsconfig / jsconfig 등에서 `compilerOptions.paths` 를 병합한다.
 */
export function mergeCompilerPathsFromConfigs(projectRoot: string): Record<string, string[]> {
    const merged: Record<string, string[]> = {};
    for (const name of CONFIG_FILES_FOR_PATHS) {
        const configPath = path.join(projectRoot, name);
        if (!fs.existsSync(configPath)) continue;
        try {
            const raw = fs.readFileSync(configPath, 'utf-8');
            const parsed = ts.parseConfigFileTextToJson(configPath, raw);
            const paths = parsed.config?.compilerOptions?.paths;
            if (!paths || typeof paths !== 'object' || Array.isArray(paths)) continue;
            for (const [k, v] of Object.entries(paths)) {
                if (typeof v === 'object' && v !== null) {
                    const arr = Array.isArray(v) ? v : [v];
                    merged[String(k)] = arr.filter((x): x is string => typeof x === 'string');
                }
            }
        } catch {
            /* ignore */
        }
    }
    return merged;
}

/** `@/*` 패턴의 첫 번째 path 타깃 (없으면 null) */
export function getAtStarFirstPathTarget(projectRoot: string): string | null {
    const paths = mergeCompilerPathsFromConfigs(projectRoot);
    const atStar = paths['@/*'];
    if (Array.isArray(atStar) && typeof atStar[0] === 'string' && atStar[0].length > 0) {
        return atStar[0];
    }
    return null;
}

/**
 * `@/*` 가 프로젝트 루트 기준인지 `src/` 기준인지 구분한다.
 * - `./*` → project_root (`@/components/ui` → `./components/ui`)
 * - `./src/*` / `src/*` → src_dir
 * - 그 외(예: `./lib/*`) → unspecified (휴리스틱으로 폴백)
 */
export type AtAliasPhysicalKind = 'project_root' | 'src_dir' | 'unspecified';

export function classifyAtStarMapping(firstTarget: string | null | undefined): AtAliasPhysicalKind {
    if (!firstTarget || typeof firstTarget !== 'string') return 'unspecified';
    const t = firstTarget.trim().replace(/\\/g, '/');
    const withoutStar = t.endsWith('*') ? t.slice(0, -1) : t;
    const normalized = withoutStar.replace(/^\.\//, '').replace(/\/+$/, '');
    if (normalized === '' || normalized === '.') return 'project_root';
    if (normalized === 'src' || normalized.startsWith('src/')) return 'src_dir';
    return 'unspecified';
}

/**
 * `paths` 에 `@/*` 가 없을 때 사용: 폴더 구조로 components/ui 위치를 추정한다.
 */
export function inferComponentsUiRelativeDirHeuristic(projectRoot: string): string {
    if (
        fs.existsSync(path.join(projectRoot, 'src', 'app')) ||
        fs.existsSync(path.join(projectRoot, 'src', 'pages')) ||
        fs.existsSync(path.join(projectRoot, 'src', 'main.tsx')) ||
        fs.existsSync(path.join(projectRoot, 'src', 'main.jsx'))
    ) {
        return 'src/components/ui';
    }
    return 'components/ui';
}

/**
 * tsconfig/jsconfig 별칭과 일치하는 `components/ui` 상대 경로 (POSIX).
 * — `@/*` → `./*` 인데 `src/app` 만 있는 프로젝트에서 `src/components/ui` 로 잘못 쓰는 것을 방지한다.
 */
export function inferComponentsUiRelativeDirFromConfig(projectRoot: string): string {
    const first = getAtStarFirstPathTarget(projectRoot);
    const kind = classifyAtStarMapping(first);
    if (kind === 'project_root') return 'components/ui';
    if (kind === 'src_dir') return 'src/components/ui';
    return inferComponentsUiRelativeDirHeuristic(projectRoot);
}

export interface AlignNextPathAliasResult {
    patched: boolean;
    reason?: string;
}

/**
 * Next.js + `src/app`(또는 pages)만 쓰고 루트에 `app/` 이 없는데 `@/*` 가 `./*` 로만 잡힌 잘못된 템플릿을 보정한다.
 * `BASALT_ALIGN_NEXT_PATH_ALIAS=1` 일 때만 동작.
 */
export function maybeAlignNextPathAlias(projectRoot: string): AlignNextPathAliasResult {
    const env = process.env.BASALT_ALIGN_NEXT_PATH_ALIAS;
    if (env !== '1' && env !== 'true') {
        return { patched: false, reason: 'env_disabled' };
    }

    const pkgPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        return { patched: false, reason: 'no_package_json' };
    }
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (!deps['next']) {
            return { patched: false, reason: 'not_next' };
        }
    } catch {
        return { patched: false, reason: 'package_read_error' };
    }

    const hasRootApp = fs.existsSync(path.join(projectRoot, 'app'));
    const hasSrcApp =
        fs.existsSync(path.join(projectRoot, 'src', 'app')) ||
        fs.existsSync(path.join(projectRoot, 'src', 'pages'));
    if (!hasSrcApp || hasRootApp) {
        return { patched: false, reason: 'layout_not_src_only' };
    }

    const first = getAtStarFirstPathTarget(projectRoot);
    if (first === null) {
        return { patched: false, reason: 'no_at_star_paths' };
    }
    if (classifyAtStarMapping(first) !== 'project_root') {
        return { patched: false, reason: 'already_non_root_alias' };
    }

    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
        return { patched: false, reason: 'no_tsconfig' };
    }

    let raw: string;
    let json: Record<string, unknown>;
    try {
        raw = fs.readFileSync(tsconfigPath, 'utf-8');
        json = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return { patched: false, reason: 'tsconfig_parse_error' };
    }

    const co = (json.compilerOptions && typeof json.compilerOptions === 'object'
        ? (json.compilerOptions as Record<string, unknown>)
        : {}) as Record<string, unknown>;
    const paths = (co.paths && typeof co.paths === 'object' && !Array.isArray(co.paths)
        ? { ...(co.paths as Record<string, unknown>) }
        : {}) as Record<string, string[] | string>;

    const existing = paths['@/*'];
    const firstExisting = Array.isArray(existing) ? existing[0] : existing;
    if (typeof firstExisting === 'string' && classifyAtStarMapping(firstExisting) !== 'project_root') {
        return { patched: false, reason: 'paths_already_divergent' };
    }

    paths['@/*'] = ['./src/*'];
    co.paths = paths;
    if (co.baseUrl === undefined) {
        co.baseUrl = '.';
    }
    json.compilerOptions = co;

    try {
        fs.writeFileSync(tsconfigPath, JSON.stringify(json, null, 2) + '\n', 'utf-8');
    } catch {
        return { patched: false, reason: 'write_failed' };
    }

    return { patched: true, reason: 'aligned_to_src_star' };
}
