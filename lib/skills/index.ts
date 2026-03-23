import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as ts from 'typescript';

import { AgentDefinition, AgentLoader } from '../agent-loader';
import * as llm from '../llm';
import { MODEL_CONFIG } from '../model-config';
import { ProjectProfiler } from '../profiler';
import { mergeCompilerPathsFromConfigs } from '../tsconfig-paths';

const execAsync = promisify(exec);
const READ_CACHE = new Map<string, string>();
const DIR_CACHE = new Map<string, string[] | string>();
const CLIENT_DIRECTIVE_RE = /^\s*['"]use client['"]/;
const SERVER_DIRECTIVE_RE = /^\s*['"]use server['"]/;
const REACT_HOOK_NAMES = [
    'useState',
    'useEffect',
    'useMemo',
    'useCallback',
    'useReducer',
    'useRef',
    'useLayoutEffect',
    'useTransition',
    'useActionState',
    'useOptimistic',
    'useDeferredValue',
    'useId',
];
const HOOK_USAGE_RE = new RegExp(`\\b(?:${REACT_HOOK_NAMES.join('|')})\\s*\\(`);
const REACT_NAMESPACE_HOOK_USAGE_RE = new RegExp(`\\b(?:React|[A-Za-z_$][\\w$]*)\\.\\s*(?:${REACT_HOOK_NAMES.join('|')})\\s*\\(`);
const APP_METADATA_IMPORT_RE = /from\s+(['"])(@\/app\/metadata(?:\.(?:t|j)sx?)?)(\1)/g;

/** `app/page.tsx` / `src/app/page.tsx` (root segment) */
const APP_ROUTER_ROOT_PAGE_LAYOUT_RE =
    /^(?:src\/)?app\/(page|layout)\.(tsx|jsx|ts|js)$/i;
/** `app/foo/page.tsx`, `src/app/a/b/layout.tsx` */
const APP_ROUTER_NESTED_PAGE_LAYOUT_RE =
    /^(?:src\/)?app\/.+\/(page|layout)\.(tsx|jsx|ts|js)$/i;

/** Server-only exports for App Router (must not combine with `"use client"`). */
const SERVER_ONLY_APP_ROUTER_EXPORT_RE =
    /export\s+(?:const\s+metadata\b|async\s+function\s+generateMetadata\b|function\s+generateMetadata\b|const\s+viewport\b|async\s+function\s+generateViewport\b|function\s+generateViewport\b)/;

const GENERATE_METADATA_DOC =
    'https://nextjs.org/docs/app/api-reference/functions/generate-metadata#why-generatemetadata-is-server-component-only';

const MAX_IMPORT_VALIDATION_UI_HINT = 12;
const IMPORT_VALIDATION_FILE_SUFFIXES = ['.ts', '.tsx', '.js', '.jsx', '.d.ts', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

/** `write_code` import 검증 실패 분류 — Orchestrator UI 복구 루프에서 사용 */
export type ImportValidationCode = 'UI_IMPORT_NOT_ON_DISK' | 'UI_BARREL_INVALID' | 'OTHER';

export type ImportValidationResult =
    | { valid: true }
    | {
          valid: false;
          message: string;
          codes: ImportValidationCode[];
          allowedUiBasenames?: string[];
          offendingUiSpecifiers?: string[];
      };

const BUILTIN_NODE_MODULES = new Set([
    'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
    'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'http2',
    'https', 'module', 'net', 'os', 'path', 'perf_hooks', 'process',
    'punycode', 'querystring', 'readline', 'repl', 'stream', 'string_decoder',
    'sys', 'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'wasi',
    'worker_threads', 'zlib',
]);

const installedPackagesCache = new Map<string, Set<string>>();

function getInstalledPackages(projectRoot: string): Set<string> {
    if (installedPackagesCache.has(projectRoot)) {
        return installedPackagesCache.get(projectRoot)!;
    }

    const pkgPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        const empty = new Set<string>();
        installedPackagesCache.set(projectRoot, empty);
        return empty;
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const allDeps = new Set<string>([
            ...Object.keys(pkg.dependencies || {}),
            ...Object.keys(pkg.devDependencies || {}),
            ...Object.keys(pkg.peerDependencies || {}),
        ]);
        installedPackagesCache.set(projectRoot, allDeps);
        return allDeps;
    } catch {
        const empty = new Set<string>();
        installedPackagesCache.set(projectRoot, empty);
        return empty;
    }
}

function getBasePackageName(specifier: string): string {
    if (specifier.startsWith('@')) {
        const parts = specifier.split('/');
        return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
    }
    return specifier.split('/')[0];
}

function normalizeImportPathWithAlias(specifier: string, projectRoot: string): string | null {
    if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) {
        return null;
    }

    if (!specifier.startsWith('@/')) {
        return null;
    }

    return path.join(projectRoot, specifier.replace(/^@\//, ''));
}

function parseProjectPathAliases(projectRoot: string): Array<{ pattern: string; target: string; wildcard: boolean }> {
    const merged = mergeCompilerPathsFromConfigs(projectRoot);
    const entries: Array<{ pattern: string; target: string; wildcard: boolean }> = [];
    for (const [pattern, targetValues] of Object.entries(merged)) {
        if (targetValues.length === 0) continue;
        entries.push({
            pattern: String(pattern),
            target: String(targetValues[0]),
            wildcard: String(pattern).endsWith('/*'),
        });
    }
    return entries;
}

function resolveAliasImportPath(specifier: string, projectRoot: string): string | null {
    const aliases = parseProjectPathAliases(projectRoot);
    if (aliases.length === 0) {
        return normalizeImportPathWithAlias(specifier, projectRoot);
    }

    const fallbackAlias = normalizeImportPathWithAlias(specifier, projectRoot);

    for (const alias of aliases) {
        const pattern = alias.pattern;
        const hasWildcard = alias.wildcard;

        if (hasWildcard) {
            const base = pattern.slice(0, -2);
            if (!specifier.startsWith(base + '/')) {
                continue;
            }

            const tail = specifier.slice(base.length + 1);
            const target = alias.target.includes('*') ? alias.target.replace('*', tail) : alias.target;
            const normalized = target.replace(/^\.\//, '');
            return path.join(projectRoot, normalized);
        }

        if (specifier === pattern) {
            const normalized = alias.target.replace(/^\.\//, '');
            return path.join(projectRoot, normalized);
        }
    }

    return fallbackAlias;
}

function resolveModuleCandidates(absBase: string): string[] {
    const candidates: string[] = [];

    if (path.extname(absBase)) {
        candidates.push(absBase);
        return candidates;
    }

    candidates.push(absBase);
    for (const suffix of IMPORT_VALIDATION_FILE_SUFFIXES) {
        candidates.push(`${absBase}${suffix}`);
    }

    return candidates;
}

function isComponentsUiBarrelSpecifier(spec: string): boolean {
    return spec.replace(/\/+$/, '') === '@/components/ui';
}

function isComponentsUiDeepSpecifier(spec: string): boolean {
    if (spec.startsWith('@/')) {
        return /^@\/components\/ui\/.+/.test(spec);
    }
    return spec.includes('/components/ui/');
}

function barrelIndexExists(uiDirAbs: string): boolean {
    if (!fs.existsSync(uiDirAbs)) return false;
    try {
        if (!fs.statSync(uiDirAbs).isDirectory()) return false;
    } catch {
        return false;
    }
    return ['index.ts', 'index.tsx', 'index.js', 'index.jsx'].some((n) => fs.existsSync(path.join(uiDirAbs, n)));
}

function moduleResolvableFromBase(absBase: string): boolean {
    return resolveModuleCandidates(absBase).some((candidate) => fs.existsSync(candidate));
}

/** 별칭 해석 + `@/components/ui` 계열 디스크 폴백(루트 vs src). */
function collectAliasResolvedBases(specifier: string, projectRoot: string): string[] {
    const out: string[] = [];
    const push = (p: string | null) => {
        if (p && !out.includes(p)) out.push(p);
    };

    push(resolveAliasImportPath(specifier, projectRoot));

    if (specifier.startsWith('@/')) {
        const tail = specifier.replace(/^@\//, '');
        if (tail.startsWith('components/ui')) {
            push(path.join(projectRoot, tail));
            push(path.join(projectRoot, 'src', tail));
        }
    }

    return out;
}

async function getAvailableUiComponentNames(projectRoot: string): Promise<Set<string>> {
    const profiler = new ProjectProfiler(projectRoot);
    const profile = await profiler.getProfileData();
    return new Set(profile.availableUIComponents.map((name: string) => name.toLowerCase()));
}

function getAvailableImportSource(node: ts.Node): string | null {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
            return node.moduleSpecifier.text.trim();
        }
    }
    return null;
}

function isExternalPackageImport(specifier: string): boolean {
    return !specifier.startsWith('.') &&
        !specifier.startsWith('/') &&
        !specifier.startsWith('@/') &&
        !specifier.startsWith('~/' ) &&
        !specifier.startsWith('@@/') &&
        !specifier.includes(':');
}

function shouldValidateImportPath(specifier: string): boolean {
    return !isExternalPackageImport(specifier);
}

async function validateImportsExistence(
    content: string,
    filePath: string,
    baseDir: string
): Promise<ImportValidationResult> {
    const normalized = path.normalize(filePath).replace(/^\/+/, '');
    if (!/\.(tsx|ts|jsx|js)$/.test(normalized)) return { valid: true };

    const fullPath = path.join(baseDir, normalized);
    const containingDir = path.dirname(fullPath);
    const sourceFile = ts.createSourceFile(fullPath, content, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
    const aliases = parseProjectPathAliases(baseDir);
    const uiComponents = await getAvailableUiComponentNames(baseDir);
    const hasDiscoveredUiKit = uiComponents.size > 0;
    const installedPkgs = getInstalledPackages(baseDir);
    const uiComponentImports: string[] = [];
    const missingImports: string[] = [];
    const missingPackages: string[] = [];
    const violationCodes = new Set<ImportValidationCode>();
    const offendingUiSpecifiers = new Set<string>();

    const visitNode = (node: ts.Node) => {
        const candidateSpecifier = getAvailableImportSource(node);
        if (!candidateSpecifier) return;

        if (isExternalPackageImport(candidateSpecifier)) {
            const basePkg = getBasePackageName(candidateSpecifier);
            if (BUILTIN_NODE_MODULES.has(basePkg) || candidateSpecifier.startsWith('node:')) return;
            if (installedPkgs.size > 0 && !installedPkgs.has(basePkg)) {
                missingPackages.push(candidateSpecifier);
            }
            return;
        }

        if (!shouldValidateImportPath(candidateSpecifier)) {
            return;
        }

        let basesToTry: string[] = [];
        if (candidateSpecifier.startsWith('.')) {
            basesToTry = [path.resolve(containingDir, candidateSpecifier)];
        } else if (candidateSpecifier.startsWith('/')) {
            basesToTry = [path.join(baseDir, candidateSpecifier.replace(/^\/+/, ''))];
        } else if (candidateSpecifier.startsWith('@/')) {
            basesToTry = collectAliasResolvedBases(candidateSpecifier, baseDir);
        } else if (
            aliases.length > 0 &&
            aliases.some((alias) => candidateSpecifier.startsWith(alias.pattern.replace(/\*$/, '')))
        ) {
            const rb = resolveAliasImportPath(candidateSpecifier, baseDir);
            basesToTry = rb ? [rb] : [];
        } else if (candidateSpecifier.startsWith('~/') || candidateSpecifier.startsWith('@@/')) {
            return;
        } else {
            const rb = resolveAliasImportPath(candidateSpecifier, baseDir);
            basesToTry = rb ? [rb] : [];
        }

        if (basesToTry.length === 0) {
            return;
        }

        const existsModule = basesToTry.some((b) => moduleResolvableFromBase(b));

        if (!existsModule) {
            if (isComponentsUiDeepSpecifier(candidateSpecifier)) {
                const componentName = path.basename(candidateSpecifier).toLowerCase();
                uiComponentImports.push(componentName);
                if (hasDiscoveredUiKit) {
                    if (!uiComponents.has(componentName)) {
                        const availableUi = Array.from(uiComponents).slice(0, MAX_IMPORT_VALIDATION_UI_HINT).join(', ');
                        missingImports.push(
                            `${candidateSpecifier} (UI component not found; available: ${availableUi})`
                        );
                        violationCodes.add('UI_IMPORT_NOT_ON_DISK');
                        offendingUiSpecifiers.add(candidateSpecifier);
                    } else {
                        missingImports.push(
                            `${candidateSpecifier} (path resolves to no file; check alias or filename)`
                        );
                        violationCodes.add('OTHER');
                    }
                    return;
                }
            } else if (isComponentsUiBarrelSpecifier(candidateSpecifier)) {
                uiComponentImports.push('barrel');
                violationCodes.add('UI_BARREL_INVALID');
                offendingUiSpecifiers.add(candidateSpecifier);
                if (!hasDiscoveredUiKit) {
                    missingImports.push(
                        `${candidateSpecifier} (UI barrel: no components/ui kit; use semantic HTML or add primitives / index)`
                    );
                } else {
                    missingImports.push(
                        `${candidateSpecifier} (UI barrel: path not found; check tsconfig/jsconfig paths and components/ui vs src/components/ui)`
                    );
                }
                return;
            }
            missingImports.push(candidateSpecifier);
            violationCodes.add('OTHER');
            return;
        }

        if (isComponentsUiBarrelSpecifier(candidateSpecifier)) {
            const hasIndex = basesToTry.some((b) => barrelIndexExists(b));
            if (!hasIndex) {
                missingImports.push(
                    `${candidateSpecifier} (배럴 import requires components/ui/index.(ts|tsx|js|jsx). Use per-file imports e.g. @/components/ui/button, or add index re-exports)`
                );
                uiComponentImports.push('barrel');
                violationCodes.add('UI_BARREL_INVALID');
                offendingUiSpecifiers.add(candidateSpecifier);
            }
            return;
        }

        return;
    };

    sourceFile.forEachChild((node) => {
        visitNode(node);
        ts.forEachChild(node, visitNode);
    });

    const allErrors: string[] = [];

    if (missingPackages.length > 0) {
        violationCodes.add('OTHER');
        const installed = installedPkgs.size > 0
            ? Array.from(installedPkgs).sort().join(', ')
            : 'N/A';
        const missingRoots = [...new Set(missingPackages.map((s) => getBasePackageName(s)))];
        const installHint =
            missingRoots.length > 0
                ? ` 복구: 프로젝트 루트에서 \`npm install ${missingRoots.join(' ')}\` 실행 후 같은 단계를 재시도하거나, 해당 import를 제거하고 이미 설치된 패키지·표준 API(예: 날짜는 \`Intl.DateTimeFormat\`)만 사용하세요.`
                : '';
        allErrors.push(
            `Uninstalled npm package imports in ${filePath}: ${missingPackages.join(', ')}. ` +
            `Only packages listed in package.json may be used. Installed: ${installed}.${installHint}`
        );
    }

    if (missingImports.length > 0) {
        let missingMsg =
            `Missing module imports detected in ${filePath}: ${missingImports.join(', ')}` +
            (uiComponentImports.length > 0 ? ` | UI import candidates: ${uiComponentImports.join(', ')}` : '');
        if (uiComponentImports.length > 0 && !hasDiscoveredUiKit) {
            missingMsg +=
                ' | This project has no components/ui/* (shadcn-style kit not found). Use semantic HTML (<button>, <input>, <label>) and styles already used in the repo; do not import @/components/ui/*.';
        }
        allErrors.push(missingMsg);
    }

    if (allErrors.length > 0) {
        const codes =
            violationCodes.size > 0 ? Array.from(violationCodes) : (['OTHER'] as ImportValidationCode[]);
        return {
            valid: false,
            message: allErrors.join(' | '),
            codes,
            allowedUiBasenames: hasDiscoveredUiKit ? Array.from(uiComponents).sort() : undefined,
            offendingUiSpecifiers:
                offendingUiSpecifiers.size > 0 ? Array.from(offendingUiSpecifiers) : undefined,
        };
    }

    return { valid: true };
}

function resolveRelativeImportToMetadata(filePath: string, projectRoot: string): string | null {
    const normalizedFile = filePath.replace(/^\/+/, '').replace(/\\/g, '/');
    const appMetadataCandidates = [
        path.join(projectRoot, 'app', 'metadata.ts'),
        path.join(projectRoot, 'app', 'metadata.tsx'),
        path.join(projectRoot, 'app', 'metadata.jsx'),
        path.join(projectRoot, 'app', 'metadata.js'),
    ];

    const metadataFile = appMetadataCandidates.find((candidate) => fs.existsSync(candidate));
    if (!metadataFile) {
        return null;
    }

    const fileDir = path.dirname(path.join(projectRoot, normalizedFile));
    const relative = path.relative(fileDir, metadataFile).replace(/\\/g, '/');
    const withoutExt = relative.replace(/\.(tsx?|jsx?)$/, '');
    return withoutExt.startsWith('.') ? withoutExt : `./${withoutExt}`;
}

function sanitizeMetadataImportAliases(content: string, filePath: string, projectRoot: string): string {
    const normalizedImportPath = resolveRelativeImportToMetadata(filePath, projectRoot);
    if (!normalizedImportPath) {
        return content;
    }

    let mutated = false;
    const replaced = content.replace(APP_METADATA_IMPORT_RE, (match, quote, importPath, _endQuote) => {
        if (importPath.startsWith('@/app/metadata')) {
            mutated = true;
            return `from ${quote}${normalizedImportPath}${quote}`;
        }
        return match;
    });

    if (!mutated) {
        return content;
    }

    return replaced;
}

function stripCommentsAndStringsForHookScan(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/\/\/.*$/gm, ' ')
        .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, ' ')
        .replace(/`[\s\S]*?`/g, ' ');
}

function hasHookUsageForBoundary(content: string): boolean {
    const cleaned = stripCommentsAndStringsForHookScan(content);
    return HOOK_USAGE_RE.test(cleaned) || REACT_NAMESPACE_HOOK_USAGE_RE.test(cleaned);
}

function isAppRouterPageOrLayoutFile(relativePath: string): boolean {
    const n = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    return APP_ROUTER_ROOT_PAGE_LAYOUT_RE.test(n) || APP_ROUTER_NESTED_PAGE_LAYOUT_RE.test(n);
}

function hasServerOnlyAppRouterExports(content: string): boolean {
    const cleaned = stripCommentsAndStringsForHookScan(content);
    return SERVER_ONLY_APP_ROUTER_EXPORT_RE.test(cleaned);
}

/** First non-comment line is `"use client"` (Next.js: only comments may precede it). */
function fileLeadsWithUseClientDirective(content: string): boolean {
    const lines = content.split('\n');
    let inBlock = false;
    for (const line of lines) {
        let t = line.trim();
        if (!t) continue;

        if (inBlock) {
            if (t.includes('*/')) {
                inBlock = false;
                const after = t.split('*/').slice(1).join('*/').trim();
                if (!after) continue;
                t = after;
            } else {
                continue;
            }
        }

        if (t.startsWith('/*')) {
            if (!t.includes('*/')) inBlock = true;
            continue;
        }
        if (t.startsWith('//')) continue;

        return CLIENT_DIRECTIVE_RE.test(t);
    }
    return false;
}

/**
 * Block `metadata` / `generateMetadata` / `viewport` with `"use client"` or with hooks but no client split.
 */
function validateAppRouterServerExportClientBoundary(
    relativePath: string,
    content: string
): { valid: true } | { valid: false; message: string } {
    if (!isAppRouterPageOrLayoutFile(relativePath)) return { valid: true };
    if (!hasServerOnlyAppRouterExports(content)) return { valid: true };

    const hasUse = fileLeadsWithUseClientDirective(content);
    const hooks = hasHookUsageForBoundary(content);

    if (hasUse) {
        return {
            valid: false,
            message:
                `Next.js App Router: cannot export metadata/generateMetadata/viewport in a file with "use client". ` +
                `Keep ${path.basename(relativePath)} as a Server Component and move interactive logic to a separate file ` +
                `(e.g. components/*Client.tsx with "use client" only there). Docs: ${GENERATE_METADATA_DOC}`,
        };
    }
    if (hooks) {
        return {
            valid: false,
            message:
                `Next.js App Router: this file exports server-only metadata/viewport but uses React hooks. ` +
                `Keep SEO exports in the server page/layout and move hooks to a separate *Client.tsx with "use client". ` +
                `Docs: ${GENERATE_METADATA_DOC}`,
        };
    }
    return { valid: true };
}

function getFirstNonEmptyCodeLine(content: string): string | null {
    const lines = content.split('\n');
    let inBlockComment = false;
    for (const line of lines) {
        let trimmed = line.trim();
        if (!trimmed) continue;

        if (inBlockComment) {
            if (trimmed.includes('*/')) {
                const afterComment = trimmed.split('*/')[1]?.trim();
                inBlockComment = false;
                if (!afterComment) continue;
                trimmed = afterComment;
            } else {
                continue;
            }
        }

        if (trimmed.startsWith('/*')) {
            if (trimmed.includes('*/')) {
                const afterComment = trimmed.split('*/')[1]?.trim();
                if (!afterComment) continue;
                trimmed = afterComment;
            } else {
                inBlockComment = true;
                continue;
            }
        }

        if (!trimmed || trimmed.startsWith('//')) continue;
        return trimmed;
    }
    return null;
}

async function validateGeneratedTypeSafety(relativePath: string, baseDir: string, fileLabel: string): Promise<{ valid: boolean; message?: string }> {
    const ext = path.extname(relativePath).toLowerCase();
    if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        return { valid: true };
    }

    const scriptPath = path.join(baseDir, 'scripts', 'validate-client-boundary.mjs');
    if (!fs.existsSync(scriptPath)) {
        return { valid: true };
    }

    const normalizedPath = path.resolve(baseDir, relativePath);
    try {
        await execAsync(`node "${scriptPath}" --types-only "${normalizedPath}"`, {
            cwd: baseDir,
            encoding: 'utf8',
            maxBuffer: 1024 * 1024,
        });
        return { valid: true };
    } catch (error: any) {
        const raw = `${error.stdout || ''}${error.stderr || ''}`.trim();
        const fallback = `Failed to validate TypeScript for ${fileLabel}.`;
        return { valid: false, message: raw || error.message || fallback };
    }
}

function ensureClientDirectiveForReactHooks(filePath: string, rawContent: string): string {
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (!/\.(tsx|jsx)$/.test(normalizedPath)) {
        return rawContent;
    }

    if (!hasHookUsageForBoundary(rawContent)) {
        return rawContent;
    }

    if (isAppRouterPageOrLayoutFile(normalizedPath) && hasServerOnlyAppRouterExports(rawContent)) {
        return rawContent;
    }

    const firstNonEmpty = getFirstNonEmptyCodeLine(rawContent);
    if (firstNonEmpty && (CLIENT_DIRECTIVE_RE.test(firstNonEmpty) || SERVER_DIRECTIVE_RE.test(firstNonEmpty))) {
        return rawContent;
    }

    return `'use client';\n\n${rawContent}`;
}

export function reset_runtime_caches() {
    READ_CACHE.clear();
    DIR_CACHE.clear();
    installedPackagesCache.clear();
}

function getDynamicSkillModel(skillName: string): string {
    const fastSkills = new Set([
        'list_directory',
        'check_environment',
        'search_npm_package',
    ]);
    return fastSkills.has(skillName) ? MODEL_CONFIG.FAST_MODEL : MODEL_CONFIG.SMART_MODEL;
}

function validateDynamicSkillInputs(skillName: string, inputs: any, requiredParams: string[]): { valid: boolean; message?: string } {
    const normalizedArgs = Array.isArray(inputs?.args) ? inputs.args : [];
    if (requiredParams.length === 0) return { valid: true };

    // 1) Positional args mode: { args: [...] }
    if (normalizedArgs.length > 0) {
        if (normalizedArgs.length < requiredParams.length) {
            return {
                valid: false,
                message: `스킬 "${skillName}" 입력 인자가 부족합니다. 필요: ${requiredParams.length}개(${requiredParams.join(', ')}), 전달: ${normalizedArgs.length}개`,
            };
        }
        return { valid: true };
    }

    // 2) Named input mode: { codeToReview: "...", context: "..." }
    if (inputs && typeof inputs === 'object') {
        const source = inputs as Record<string, unknown>;
        const missing = requiredParams.filter((param) => {
            const value = source[param];
            return value === undefined || value === null || value === '';
        });
        if (missing.length === 0) {
            return { valid: true };
        }
        return {
            valid: false,
            message: `스킬 "${skillName}" 입력 인자가 부족합니다. 필요: ${requiredParams.length}개(${requiredParams.join(', ')}), 누락: ${missing.join(', ')}`,
        };
    }

    return {
        valid: false,
        message: `스킬 "${skillName}" 입력 인자가 없습니다. 필요: ${requiredParams.join(', ')}`,
    };
}

// --- Dynamic Skill Executor ---
export async function execute_skill(
    skillName: string,
    inputs: any,
    codebaseContext: string = '',
    emitter: any = null
) {
    try {
        console.log(`[Skill Executor] Executing dynamic skill: ${skillName}`);
        
        // 1. Load the markdown skill definition
        const skillDef = AgentLoader.loadSkill(skillName);
        if (!skillDef || !skillDef.instructions) {
             throw new Error(`Failed to load instructions for skill: ${skillName}`);
        }

        const requiredParams = Array.isArray(skillDef.inputParams) ? skillDef.inputParams : [];
        const validation = validateDynamicSkillInputs(skillName, inputs, requiredParams);
        if (!validation.valid) {
            return {
                success: false,
                error: true,
                skill: skillName,
                message: validation.message,
            };
        }

        // 2. Prepare the system prompt with the skill's instructions
        const systemPrompt = `You are an expert AI Agent executing a specialized skill.
Skill Name: ${skillDef.name}
Description: ${skillDef.description}

### Skill Instructions & Workflow
${skillDef.instructions}

### Execution Context
Current Codebase Context:
${codebaseContext}

### Provided Inputs
${JSON.stringify(inputs, null, 2)}

Please execute the skill based on the instructions above.`;

        const model = getDynamicSkillModel(skillName);
        const schema = AgentLoader.extractSection(skillDef.instructions, 'Schema');

        // 3. Prompt the LLM to execute (prefer structured result when schema exists)
        if (schema) {
            const result = await llm.generateJSON(
                systemPrompt,
                "Execute the skill based on the provided inputs and context.",
                schema,
                model
            );
            return {
                success: true,
                error: false,
                skill: skillName,
                result,
            };
        }

        const response = await llm.generateText(
            systemPrompt,
            "Execute the skill based on the provided inputs and context.",
            model,
            emitter
        );

        return {
            success: true,
            error: false,
            skill: skillName,
            content: response,
        };
    } catch (e: any) {
        console.error(`Failed to execute skill ${skillName}:`, e);
        return {
            success: false,
            error: true,
            skill: skillName,
            message: `Execution failed for ${skillName}: ${e.message}`
        };
    }
}

// --- Main Agent Skills (Migrated to Markdown & execute.ts) ---
export { analyze_task } from './analyze_task/execute';
export { create_workflow } from './create_workflow/execute';
export { consult_agents, type ConsultAgentsOptions } from './consult_agents/execute';
export { verify_final_output } from './verify_final_output/execute';

// --- Software Engineer Skills ---
export async function read_codebase(filePath: string, projectPath: string = process.cwd()) {
    try {
        // Secure handle: if path starts with '/', treat it as relative to projectPath to avoid OS root access
        let relativePath = filePath;
        if (path.isAbsolute(filePath)) {
            relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        }
        const fullPath = path.resolve(projectPath, relativePath);
        const cacheKey = `${projectPath}:${relativePath}`;
        if (READ_CACHE.has(cacheKey)) {
            return READ_CACHE.get(cacheKey)!;
        }

        if (!fs.existsSync(fullPath)) {
            return `File "${filePath}" does not exist in project. (Path: ${relativePath})`;
        }
        const content = fs.readFileSync(fullPath, 'utf8');
        READ_CACHE.set(cacheKey, content);
        return content;
    } catch (error: any) {
        return `Error reading file: ${error.message} `;
    }
}

export async function write_code(filePath: string, content: string, baseDir: string = process.cwd()) {
    try {
        // Ensure relative path by stripping leading slash
        const relativePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        const fullPath = path.resolve(baseDir, relativePath);
        const dir = path.dirname(fullPath);

        const boundaryRaw = validateAppRouterServerExportClientBoundary(relativePath, content);
        if (!boundaryRaw.valid) {
            return {
                success: false,
                message: boundaryRaw.message,
                filePath,
                rscBoundaryViolation: true,
            };
        }

        const withClientDirective = ensureClientDirectiveForReactHooks(filePath, content);
        const sanitizedContent = sanitizeMetadataImportAliases(withClientDirective, relativePath, baseDir);

        const boundaryFinal = validateAppRouterServerExportClientBoundary(relativePath, sanitizedContent);
        if (!boundaryFinal.valid) {
            return {
                success: false,
                message: boundaryFinal.message,
                filePath,
                rscBoundaryViolation: true,
            };
        }

        const importValidation = await validateImportsExistence(sanitizedContent, relativePath, baseDir);
        if (!importValidation.valid) {
            return {
                success: false,
                message: importValidation.message || `Invalid imports for ${filePath}`,
                filePath,
                importValidation: {
                    codes: importValidation.codes,
                    allowedUiBasenames: importValidation.allowedUiBasenames,
                    offendingUiSpecifiers: importValidation.offendingUiSpecifiers,
                },
            };
        }

        // Capture before content if file exists (for diff viewer)
        let before: string | null = null;
        if (fs.existsSync(fullPath)) {
            before = fs.readFileSync(fullPath, 'utf-8');
        }

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, sanitizedContent, 'utf-8');
        const typeSafety = await validateGeneratedTypeSafety(relativePath, baseDir, filePath);
        if (!typeSafety.valid) {
            return {
                success: false,
                message: typeSafety.message || `Type validation failed for ${filePath}`,
                filePath,
                before,
                after: sanitizedContent,
                isNew: before === null
            };
        }
        const cacheKey = `${baseDir}:${relativePath}`;
        READ_CACHE.set(cacheKey, sanitizedContent);

        return {
            success: true,
            message: `Successfully wrote to ${filePath} `,
            filePath,
            before,
            after: sanitizedContent,
            isNew: before === null
        };
    } catch (error: any) {
        return { success: false, message: `Error writing file: ${error.message} ` };
    }
}

export async function refactor_code(code: string, instructions: string, targetFilePath: string = '') {
    try {
        const systemPrompt = `
You are an expert Refactoring Agent.
Your goal is to refactor the provided code according to the specific instructions.
Maintain the exact same functionality, but improve structure, readability, or performance as requested.
Return the refactored code ONLY, with NO explanations.
`;

        const result = await llm.generateCode(
            instructions,
            `Code to refactor: \n\`\`\`\n${code}\n\`\`\``,
            MODEL_CONFIG.CODING_MODEL
        );

        if (result.error) {
            throw new Error(result.content);
        }

        // result.files will likely contain the refactored content if LLM followed "File:" format,
        // but since we want the raw content or the first file:
        let refactoredContent: string;
        if (result.files && result.files.length > 0) {
            refactoredContent = result.files[0].content;
        } else {
            refactoredContent = result.content;
        }

        const withClientDirective = ensureClientDirectiveForReactHooks(targetFilePath, refactoredContent);
        const sanitizedRefactorContent = targetFilePath
            ? sanitizeMetadataImportAliases(withClientDirective, targetFilePath, process.cwd())
            : withClientDirective;

        if (targetFilePath) {
            const relativePath = targetFilePath.startsWith('/') ? targetFilePath.substring(1) : targetFilePath;
            const refactorImportValidation = await validateImportsExistence(sanitizedRefactorContent, relativePath, process.cwd());
            if (!refactorImportValidation.valid) {
                return `Error during refactoring: ${refactorImportValidation.message || `Invalid imports for ${targetFilePath}`}`;
            }

            const typeSafety = await validateGeneratedTypeSafety(relativePath, process.cwd(), targetFilePath);
            if (!typeSafety.valid) {
                return `Error during refactoring: ${typeSafety.message}`;
            }
        }

        return sanitizedRefactorContent;
    } catch (error: any) {
        return `Error during refactoring: ${error.message}`;
    }
}

export async function search_npm_package(query: string) {
    return `Found package: ${query} (latest)`;
}

// --- Style Architect Skills ---
export async function apply_design_system(componentPath: string) {
    // Logic to inject class names or imports
    return `Applied design system to ${componentPath}`;
}

export async function generate_scss(moduleName: string) {
    return `
.${moduleName} {
  background-color: var(--background);
  color: var(--foreground);
  border: 1px solid var(--border);
}
`;
}

export { check_responsive } from './check_responsive/execute';
export { visual_test } from './visual_test/execute';
export { e2e_test } from './e2e_test/execute';
export { browse_web } from './browse_web/execute';
export { screenshot_page } from './screenshot_page/execute';

// --- QA & Debugger Skills ---
export async function run_shell_command(command: string, cwd: string = process.cwd()) {
    try {
        const { stdout, stderr } = await execAsync(command, { cwd });
        return { stdout, stderr };
    } catch (error: any) {
        return { error: error.message };
    }
}

export async function analyze_error_logs(logs: string) {
    try {
        const systemPrompt = `
You are a Debugging Expert.
Analyze the following error logs and identify the root cause.
Provide a clear explanation and a specific suggested fix.
`;

        const schema = `{
    "cause": "string",
    "solution": "string",
    "severity": "low" | "medium" | "high"
}`;

        const analysis = await llm.generateJSON(
            systemPrompt,
            `Error Logs:\n${logs}`,
            schema,
            MODEL_CONFIG.SMART_MODEL
        );

        return analysis;
    } catch (e: any) {
        return {
            cause: 'Analysis Failed',
            solution: 'Manual investigation required.',
            severity: 'medium'
        };
    }
}

// --- Git & DevOps Manager Skills ---
export async function manage_git(action: 'checkout' | 'commit' | 'merge' | 'add' | 'push' | 'status' | 'create_pr', args: string, cwd: string = process.cwd()) {
    // Check if 'gh' CLI is available for PR creation
    if (action === 'create_pr') {
        try {
            await execAsync('gh --version');
        } catch (e) {
            throw new Error('GitHub CLI (gh) is not installed. Please install it and authenticate using `gh auth login` to enable automated PR creation.');
        }
    }

    // Simplified git wrapper
    const commands: Record<string, string> = {
        checkout: `git checkout ${args}`,
        commit: `git commit --allow-empty -m "${args}"`,
        merge: `git merge ${args}`,
        add: `git add ${args}`,
        push: `git push ${args}`,
        status: `git status`,
        create_pr: `gh pr create ${args}`
    };

    if (!commands[action]) throw new Error(`Invalid git action: ${action}`);

    try {
        const { stdout, stderr } = await execAsync(commands[action], { cwd });
        if (stderr && !stdout && !commands[action].includes('status')) {
            // Some git commands output to stderr even on success, but usually not all of it.
            // However, execAsync might put actual errors here.
        }
        return stdout;
    } catch (error: any) {
        // Throw actual error instead of returning it as a string
        throw new Error(`Git command failed (${commands[action]}): ${error.message}`);
    }
}


export async function check_environment() {
    let agentBrowser = false;
    try {
        const { stdout } = await execAsync('agent-browser --version', { timeout: 5_000 });
        agentBrowser = !!stdout.trim();
    } catch { /* not installed */ }

    return {
        node: process.version,
        supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
        agentBrowser,
    };
}

export async function list_directory(dirPath: string = '.', baseDir: string = process.cwd()) {
    try {
        const fullPath = path.resolve(baseDir, dirPath);
        const cacheKey = `${baseDir}:${dirPath}`;
        if (DIR_CACHE.has(cacheKey)) {
            return DIR_CACHE.get(cacheKey)!;
        }
        if (!fs.existsSync(fullPath)) return 'Directory does not exist';
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        const result = entries.map(entry => {
            return `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`;
        });
        DIR_CACHE.set(cacheKey, result);
        return result;
    } catch (error: any) {
        return `Error listing directory: ${error.message}`;
    }
}

// --- Missing Skill Implementations (Auto-added to fix export errors) ---

export async function lint_code(target: string = '.', projectPath: string = process.cwd(), fix: boolean = false) {
    try {
        const cmd = fix ? `npx eslint "${target}" --fix --format json` : `npx eslint "${target}" --format json`;
        const { stdout, stderr } = await execAsync(cmd, { cwd: projectPath });
        return { success: true, stdout, stderr };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function typecheck(projectPath: string = process.cwd(), configPath: string = 'tsconfig.json') {
    try {
        const { stdout, stderr } = await execAsync(`npx tsc --noEmit -p "${configPath}"`, { cwd: projectPath });
        return { success: true, stdout, stderr };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

function collectExistingConfigFiles(projectRoot: string): string[] {
    const out: string[] = [];
    let names: string[] = [];
    try {
        names = fs.readdirSync(projectRoot);
    } catch {
        return out;
    }
    for (const n of names) {
        let st: fs.Stats;
        try {
            st = fs.statSync(path.join(projectRoot, n));
        } catch {
            continue;
        }
        if (!st.isFile()) continue;
        if (
            /^(package\.json|tsconfig|jsconfig|postcss\.config|vite\.config|\.eslintrc)/i.test(n) ||
            n.startsWith('next.config.') ||
            n.startsWith('tailwind.config.') ||
            n.startsWith('eslint.config.')
        ) {
            out.push(n);
        }
    }
    return out.sort();
}

/** Relative directory paths under projectRoot up to `maxDepth` segments (skips dot dirs and node_modules). */
function listDirectoryTreeSample(projectRoot: string, maxDepth: number, maxEntries: number): string[] {
    const results: string[] = [];
    function walk(dir: string, rel: string) {
        if (results.length >= maxEntries) return;
        const segments = rel ? rel.split('/').length : 0;
        if (segments > maxDepth) return;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            if (results.length >= maxEntries) return;
            if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
            const r = rel ? `${rel}/${e.name}` : e.name;
            results.push(r);
            walk(path.join(dir, e.name), r);
        }
    }
    walk(projectRoot, '');
    return results.sort();
}

function guessStylePaths(projectRoot: string, hasTailwind: boolean): string[] {
    const paths: string[] = [];
    const candidates = [
        'app/globals.css',
        'src/app/globals.css',
        'styles/globals.css',
        'src/styles/globals.css',
        'app/global.css',
        'src/app/global.css',
    ];
    for (const c of candidates) {
        if (fs.existsSync(path.join(projectRoot, c))) paths.push(c);
    }
    if (hasTailwind) {
        for (const n of ['tailwind.config.ts', 'tailwind.config.js']) {
            if (fs.existsSync(path.join(projectRoot, n))) paths.push(n);
        }
    }
    return paths;
}

function guessRouterEntryFiles(projectRoot: string, routerBase: string | null, structure: string): string[] {
    const eps: string[] = [];
    if (!routerBase) return eps;
    const base = path.join(projectRoot, routerBase);
    if (!fs.existsSync(base)) return eps;

    if (structure.includes('app-router')) {
        for (const f of ['page.tsx', 'page.ts', 'page.jsx', 'page.js']) {
            const p = path.join(base, f);
            if (fs.existsSync(p)) eps.push(`${routerBase}/${f}`);
        }
    } else if (structure.includes('pages-router')) {
        for (const f of ['index.tsx', 'index.ts', 'index.jsx', 'index.js']) {
            const p = path.join(base, f);
            if (fs.existsSync(p)) eps.push(`${routerBase}/${f}`);
        }
    }
    return eps;
}

/**
 * Structured project scan — uses {@link ProjectProfiler} (same signals as planning `codebaseContext`).
 */
export async function scan_project(projectPath: string = process.cwd(), depth: number = 3) {
    const root = path.resolve(projectPath);
    const profiler = new ProjectProfiler(root);
    const data = await profiler.getProfileData();
    let stackSummaryKr = '';
    try {
        stackSummaryKr = await profiler.getStackSummary();
    } catch {
        stackSummaryKr = '';
    }

    const maxDepth = Math.max(1, Math.min(6, Number(depth) || 3));
    const directoryTreeSample = listDirectoryTreeSample(root, maxDepth, 180);

    const componentPaths: string[] = [];
    if (data.uiKitRelativePath) componentPaths.push(data.uiKitRelativePath);
    for (const rel of ['components', 'src/components']) {
        if (componentPaths.includes(rel)) continue;
        const p = path.join(root, rel);
        try {
            if (fs.existsSync(p) && fs.statSync(p).isDirectory()) componentPaths.push(rel);
        } catch {
            /* skip */
        }
    }

    const entryPoints = guessRouterEntryFiles(root, data.routerBase, data.structure);
    if (fs.existsSync(path.join(root, 'package.json'))) entryPoints.push('package.json');

    return {
        techStack: data.techStack,
        structure: data.structure,
        routerBase: data.routerBase,
        routerDualRoot: data.routerDualRoot ?? false,
        routerResolutionNote: data.routerResolutionNote ?? null,
        pageCandidates: data.pageCandidates,
        entryPoints,
        configFiles: collectExistingConfigFiles(root),
        dependencies: data.dependencies,
        depsWithVersions: data.depsWithVersions,
        componentPaths,
        stylePaths: guessStylePaths(root, data.hasTailwind),
        directoryTreeSample,
        stackSummaryKr: stackSummaryKr.slice(0, 4000),
        scannedAt: new Date().toISOString(),
    };
}

export async function extract_patterns(projectPath: string = process.cwd(), fileTypes: string[] = ['.tsx', '.ts', '.jsx', '.js']) {
    return { message: "extract_patterns not fully implemented yet." };
}

export async function find_similar_components(projectPath: string = process.cwd(), query: string, componentType: string) {
    return [];
}
