import fs from 'fs';
import path from 'path';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import * as ts from 'typescript';

import { AgentDefinition, AgentLoader } from '../agent-loader';
import { resolveRouteExportStyle } from '../component-export-style';
import * as llm from '../llm';
import { MODEL_CONFIG } from '../model-config';
import { isDefaultPrismaGeneratedClientPresent, ProjectProfiler } from '../profiler';
import { mergeCompilerPathsFromConfigs } from '../tsconfig-paths';
import { getAgentBrowserExecutable } from '../browser/agent-browser';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const READ_CACHE = new Map<string, string>();
const DIR_CACHE = new Map<string, string[] | string>();
const CLIENT_DIRECTIVE_RE = /^\s*['"]use client['"]/;
const SERVER_DIRECTIVE_RE = /^\s*['"]use server['"]/;
/** React core hooks (local import names tracked; supports `use` / aliases). */
const REACT_CORE_HOOK_NAMES = [
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
    'use',
] as const;
const REACT_CORE_HOOK_NAME_SET = new Set<string>(REACT_CORE_HOOK_NAMES);

const NEXT_NAVIGATION_HOOK_NAMES = [
    'useRouter',
    'usePathname',
    'useSearchParams',
    'useParams',
    'useSelectedLayoutSegment',
    'useSelectedLayoutSegments',
    'useServerInsertedHTML',
] as const;
const NEXT_NAVIGATION_HOOK_NAME_SET = new Set<string>(NEXT_NAVIGATION_HOOK_NAMES);

const NEXT_ROUTER_PAGE_HOOK_NAMES = ['useRouter'] as const;
const NEXT_ROUTER_PAGE_HOOK_NAME_SET = new Set<string>(NEXT_ROUTER_PAGE_HOOK_NAMES);

const REACT_DOM_HOOK_NAMES = ['useFormState', 'useFormStatus'] as const;
const REACT_DOM_HOOK_NAME_SET = new Set<string>(REACT_DOM_HOOK_NAMES);

/** DOM event props in JSX require a Client boundary in App Router (host elements). */
const INTERACTIVE_JSX_ATTR_NAMES = new Set([
    'onClick',
    'onChange',
    'onSubmit',
    'onKeyDown',
    'onKeyUp',
    'onFocus',
    'onBlur',
    'onInput',
    'onMouseDown',
    'onMouseUp',
    'onPointerDown',
    'onPointerUp',
    'onDragStart',
    'onDragEnd',
    'onDrop',
]);

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
          /** 외부 npm 패키지 미설치 시 루트 이름(@scope/pkg 또는 pkg) — 자동 설치·복구용 */
          missingNpmPackageRoots?: string[];
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

/**
 * When `@prisma/client` is installed and the file uses `prisma.`, require an import or local binding
 * so TS2304 is caught before disk write (clearer than full tsc rollback).
 */
function validatePrismaClientIdentifierUsage(
    content: string,
    projectRoot: string
): { valid: true } | { valid: false; message: string } {
    if (!getInstalledPackages(projectRoot).has('@prisma/client')) {
        return { valid: true };
    }
    if (!/\bprisma\s*\./.test(content)) {
        return { valid: true };
    }
    if (/\bimport\s+[^;]*\bprisma\b[^;]*\bfrom\b/m.test(content)) {
        return { valid: true };
    }
    if (/\b(?:const|let)\s+prisma\s*=/m.test(content)) {
        return { valid: true };
    }
    return {
        valid: false,
        message:
            'Prisma: this file uses `prisma.` but `prisma` is not imported or declared. Import the project singleton (e.g. `import { prisma } from \'@/lib/prisma\'`) or add `import { PrismaClient } from \'@prisma/client\'` and `const prisma = new PrismaClient()`. Use `read_codebase` to match the target repo.',
    };
}

/** `import … from '@prisma/client'` requires `prisma generate` (default output under `node_modules/.prisma/client`). */
const PRISMA_CLIENT_MODULE_IMPORT_RE = /\bfrom\s+['"](@prisma\/client(?:\/[^'"]*)?)['"]/gm;

function validatePrismaClientGeneratedForImports(
    content: string,
    projectRoot: string
): { valid: true } | { valid: false; message: string } {
    if (!getInstalledPackages(projectRoot).has('@prisma/client')) {
        return { valid: true };
    }
    if (isDefaultPrismaGeneratedClientPresent(projectRoot)) {
        return { valid: true };
    }
    PRISMA_CLIENT_MODULE_IMPORT_RE.lastIndex = 0;
    if (!PRISMA_CLIENT_MODULE_IMPORT_RE.test(content)) {
        return { valid: true };
    }
    return {
        valid: false,
        message:
            'Prisma: this file imports from `@prisma/client`, but the default generated client directory (`node_modules/.prisma/client`) is missing. **For UI-only pages (boards, lists, etc.), remove all `@prisma/client` / `PrismaClient` imports and use typed mock/sample data in the file instead — Prisma is not required for front-end layout.** If you truly need the database, run `npx prisma generate` in the target project root (or use your schema’s custom `generator client { output = ... }` path). TypeScript often reports TS2305 until generate runs. When a singleton exists and you need DB, prefer `import { prisma } from \'@/lib/prisma\'`.',
    };
}

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
    let missingNpmPackageRoots: string[] | undefined;
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
        missingNpmPackageRoots = missingRoots;
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
            missingNpmPackageRoots,
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

function getScriptKindForBoundaryPath(filePath: string): ts.ScriptKind {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.tsx' || ext === '.jsx') return ts.ScriptKind.TSX;
    return ts.ScriptKind.TS;
}

interface ClientBoundaryScanResult {
    needsClientDirective: boolean;
    usesReactCoreHookCall: boolean;
    hasReactImport: boolean;
}

/**
 * TypeScript AST scan: React / next/navigation / react-dom hooks (incl. aliases), React.use*, JSX events.
 * Align with `scripts/validate-client-boundary.mjs` logic.
 */
function scanSourceFileForClientBoundary(sourceFile: ts.SourceFile, normalizedPath: string): ClientBoundaryScanResult {
    const importedReactCoreHooks = new Set<string>();
    const importedNextNavHooks = new Set<string>();
    const importedNextRouterHooks = new Set<string>();
    const importedReactDomHooks = new Set<string>();
    const importedReactNamespaces = new Set<string>();
    let hasReactImport = false;
    let needsClientDirective = false;
    let usesReactCoreHookCall = false;
    const isTsx = /\.(tsx|jsx)$/i.test(normalizedPath);

    const addNamed = (
        elements: ts.NodeArray<ts.ImportSpecifier>,
        allowed: Set<string>,
        target: Set<string>
    ) => {
        for (const element of elements) {
            const importedName = element.propertyName ? element.propertyName.text : element.name.text;
            if (allowed.has(importedName)) {
                target.add(element.name.text);
            }
        }
    };

    const addImport = (importDecl: ts.ImportDeclaration) => {
        if (!ts.isStringLiteral(importDecl.moduleSpecifier)) return;
        const mod = importDecl.moduleSpecifier.text;
        const clause = importDecl.importClause;
        if (!clause) return;

        if (mod === 'react') {
            hasReactImport = true;
            if (clause.name) {
                importedReactNamespaces.add(clause.name.text);
            }
            if (!clause.namedBindings) return;
            if (ts.isNamespaceImport(clause.namedBindings)) {
                importedReactNamespaces.add(clause.namedBindings.name.text);
                return;
            }
            if (ts.isNamedImports(clause.namedBindings)) {
                addNamed(clause.namedBindings.elements, REACT_CORE_HOOK_NAME_SET, importedReactCoreHooks);
            }
            return;
        }

        if (mod === 'next/navigation') {
            if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
            addNamed(clause.namedBindings.elements, NEXT_NAVIGATION_HOOK_NAME_SET, importedNextNavHooks);
            return;
        }

        if (mod === 'next/router') {
            if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
            addNamed(clause.namedBindings.elements, NEXT_ROUTER_PAGE_HOOK_NAME_SET, importedNextRouterHooks);
            return;
        }

        if (mod === 'react-dom') {
            if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
            addNamed(clause.namedBindings.elements, REACT_DOM_HOOK_NAME_SET, importedReactDomHooks);
        }
    };

    const isHookCallExpression = (expression: ts.Expression): boolean => {
        if (ts.isIdentifier(expression)) {
            if (importedReactCoreHooks.has(expression.text)) {
                usesReactCoreHookCall = true;
                return true;
            }
            if (
                importedNextNavHooks.has(expression.text) ||
                importedNextRouterHooks.has(expression.text) ||
                importedReactDomHooks.has(expression.text)
            ) {
                return true;
            }
            return false;
        }

        if (ts.isPropertyAccessExpression(expression)) {
            const obj = expression.expression;
            const prop = expression.name;
            if (ts.isIdentifier(obj) && ts.isIdentifier(prop)) {
                if (importedReactNamespaces.has(obj.text) && REACT_CORE_HOOK_NAME_SET.has(prop.text)) {
                    usesReactCoreHookCall = true;
                    return true;
                }
            }
        }
        return false;
    };

    const visit = (node: ts.Node) => {
        if (ts.isImportDeclaration(node)) {
            addImport(node);
        }

        if (ts.isJsxAttribute(node) && isTsx) {
            const n = node.name;
            if (ts.isIdentifier(n) && INTERACTIVE_JSX_ATTR_NAMES.has(n.text)) {
                needsClientDirective = true;
            }
        }

        if (ts.isCallExpression(node)) {
            if (isHookCallExpression(node.expression)) {
                needsClientDirective = true;
                return;
            }
        }

        ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return { needsClientDirective, usesReactCoreHookCall, hasReactImport };
}

function analyzeContentForClientBoundary(content: string, pathForLabel: string): ClientBoundaryScanResult {
    const kind = getScriptKindForBoundaryPath(pathForLabel);
    const sourceFile = ts.createSourceFile(pathForLabel, content, ts.ScriptTarget.Latest, true, kind);
    const normalized = pathForLabel.replace(/\\/g, '/');
    return scanSourceFileForClientBoundary(sourceFile, normalized);
}

function needsClientDirectiveHeuristic(content: string, normalizedPath: string): boolean {
    return analyzeContentForClientBoundary(content, normalizedPath).needsClientDirective;
}

function resolveSpecifierToFirstExistingFile(
    specifier: string,
    containingDir: string,
    baseDir: string
): string | null {
    const aliases = parseProjectPathAliases(baseDir);
    let basesToTry: string[] = [];

    if (specifier.startsWith('.')) {
        basesToTry = [path.resolve(containingDir, specifier)];
    } else if (specifier.startsWith('/')) {
        basesToTry = [path.join(baseDir, specifier.replace(/^\/+/, ''))];
    } else if (specifier.startsWith('@/')) {
        basesToTry = collectAliasResolvedBases(specifier, baseDir);
    } else if (
        aliases.length > 0 &&
        aliases.some((alias) => specifier.startsWith(alias.pattern.replace(/\*$/, '')))
    ) {
        const rb = resolveAliasImportPath(specifier, baseDir);
        basesToTry = rb ? [rb] : [];
    } else {
        const rb = resolveAliasImportPath(specifier, baseDir);
        basesToTry = rb ? [rb] : [];
    }

    for (const b of basesToTry) {
        const hit = resolveModuleCandidates(b).find((candidate) => fs.existsSync(candidate));
        if (hit) return hit;
    }
    return null;
}

/**
 * Server `page`/`layout` (no leading `"use client"`) must not statically import project modules that use hooks/events without `"use client"`.
 * Applies with or without `metadata` / `generateMetadata` / `viewport` exports.
 */
function validateServerPageLayoutImportedClientBoundaries(
    relativePath: string,
    content: string,
    baseDir: string
): { valid: true } | { valid: false; message: string } {
    if (!isAppRouterPageOrLayoutFile(relativePath)) return { valid: true };
    if (fileLeadsWithUseClientDirective(content)) return { valid: true };

    const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const fullPath = path.join(baseDir, normalized);
    const containingDir = path.dirname(fullPath);
    const sourceFile = ts.createSourceFile(
        fullPath,
        content,
        ts.ScriptTarget.Latest,
        true,
        getScriptKindForBoundaryPath(fullPath)
    );

    const problems: string[] = [];

    for (const stmt of sourceFile.statements) {
        if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
        if (stmt.importClause?.isTypeOnly) continue;
        const spec = stmt.moduleSpecifier.text.trim();
        if (isExternalPackageImport(spec)) continue;
        if (!shouldValidateImportPath(spec)) continue;

        const resolvedAbs = resolveSpecifierToFirstExistingFile(spec, containingDir, baseDir);
        if (!resolvedAbs) continue;

        let targetContent: string;
        try {
            targetContent = fs.readFileSync(resolvedAbs, 'utf8');
        } catch {
            continue;
        }

        const targetRel = path.relative(baseDir, resolvedAbs).replace(/\\/g, '/');
        if (fileLeadsWithUseClientDirective(targetContent)) continue;

        if (needsClientDirectiveHeuristic(targetContent, targetRel)) {
            problems.push(
                `- "${spec}" -> ${targetRel}: uses client-only hooks/JSX events but is missing "use client" at the top.`
            );
        }
    }

    if (problems.length === 0) return { valid: true };

    return {
        valid: false,
        message:
            `Next.js App Router: server ${path.basename(relativePath)} imports modules that need a Client Component boundary:\n` +
            problems.join('\n') +
            `\nAdd "use client" at the top of those files (or use a *Client.tsx split). If this route needs metadata/generateMetadata/viewport, keep those exports only in the server page/layout. Docs: https://nextjs.org/docs/app/api-reference/directives/use-client`,
    };
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
    const hooks = needsClientDirectiveHeuristic(content, relativePath.replace(/\\/g, '/').replace(/^\/+/, ''));

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
                `Next.js App Router: this file exports server-only metadata/viewport but uses React/Next client hooks, React.use(), or interactive JSX (e.g. onClick). ` +
                `Keep SEO exports in the server page/layout and move that UI to a separate *Client.tsx with "use client". ` +
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

/** When `validate-client-boundary.mjs` is absent (e.g. target workspace), catch MISSING_USE_CLIENT-class issues in-process. */
function validateInProcessSingleFileClientBoundary(
    relativePath: string,
    content: string
): { valid: true } | { valid: false; message: string } {
    const norm = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!/\.(tsx|ts|jsx|js)$/i.test(norm)) return { valid: true };

    const hasClient = fileLeadsWithUseClientDirective(content);
    const firstLine = getFirstNonEmptyCodeLine(content);
    const hasServer = firstLine ? SERVER_DIRECTIVE_RE.test(firstLine) : false;

    if (needsClientDirectiveHeuristic(content, norm) && !hasClient && !hasServer) {
        return {
            valid: false,
            message:
                `React/Next client hooks, React.use(), or interactive JSX in ${relativePath} require "use client" at the top of the file (or split into *Client.tsx). ` +
                `Docs: https://nextjs.org/docs/app/api-reference/directives/use-client`,
        };
    }
    return { valid: true };
}

/**
 * When `validate-client-boundary.mjs` is missing, run the same single-file `tsc` pattern in-process
 * (catches e.g. `showPassword` / TS2304 before the app runs).
 */
function runInProcessTypeScriptDiagnosticsForFile(
    baseDir: string,
    absoluteFilePath: string,
    fileLabel: string
): { valid: true } | { valid: false; message: string } {
    const tsconfigPath = path.join(baseDir, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
        return { valid: true };
    }

    const resolvedAbs = path.resolve(absoluteFilePath);
    if (!/\.(tsx?|jsx?)$/i.test(resolvedAbs)) {
        return { valid: true };
    }

    const rawConfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (rawConfig.error) {
        return { valid: true };
    }

    const parsed = ts.parseJsonConfigFileContent(rawConfig.config, ts.sys, baseDir);
    const requestedSet = new Set([resolvedAbs]);

    const program = ts.createProgram({
        rootNames: [resolvedAbs],
        options: {
            ...parsed.options,
            noEmit: true,
            pretty: false,
        },
        projectReferences: parsed.projectReferences,
    });

    const lines: string[] = [];
    for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
        const file = diagnostic.file;
        if (!file) continue;
        const sourceFile = path.resolve(file.fileName);
        if (!requestedSet.has(sourceFile)) continue;
        const { line, character } = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
        const messageText = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
        lines.push(`[TS${diagnostic.code}] ${messageText} (line ${line + 1}:${character + 1})`);
    }

    for (const diag of parsed.errors) {
        if (!diag.file) continue;
        const file = path.resolve(diag.file.fileName);
        if (!requestedSet.has(file)) continue;
        const msg = ts.flattenDiagnosticMessageText(diag.messageText, ' ');
        lines.push(`[TS${diag.code}] ${msg}`);
    }

    if (lines.length > 0) {
        return {
            valid: false,
            message: `TypeScript errors in ${fileLabel}:\n${lines.join('\n')}`,
        };
    }
    return { valid: true };
}

async function validateGeneratedTypeSafety(relativePath: string, baseDir: string, fileLabel: string): Promise<{ valid: boolean; message?: string }> {
    const ext = path.extname(relativePath).toLowerCase();
    if (!['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
        return { valid: true };
    }

    const normalizedPath = path.resolve(baseDir, relativePath);
    const scriptPath = path.join(baseDir, 'scripts', 'validate-client-boundary.mjs');
    if (!fs.existsSync(scriptPath)) {
        let diskContent: string;
        try {
            diskContent = fs.readFileSync(normalizedPath, 'utf8');
        } catch {
            diskContent = '';
        }
        const boundary = validateInProcessSingleFileClientBoundary(relativePath, diskContent);
        if (!boundary.valid) {
            return { valid: false, message: boundary.message };
        }
        const tscResult = runInProcessTypeScriptDiagnosticsForFile(baseDir, normalizedPath, fileLabel);
        if (!tscResult.valid) {
            return { valid: false, message: tscResult.message };
        }
        return { valid: true };
    }

    try {
        await execAsync(
            `node "${scriptPath}" --types-only --boundary-file="${normalizedPath}" "${normalizedPath}"`,
            {
                cwd: baseDir,
                encoding: 'utf8',
                maxBuffer: 1024 * 1024,
            }
        );
        return { valid: true };
    } catch (error: any) {
        const raw = `${error.stdout || ''}${error.stderr || ''}`.trim();
        const fallback = `Failed to validate TypeScript for ${fileLabel}.`;
        return { valid: false, message: raw || error.message || fallback };
    }
}

function ensureClientDirectiveForReactHooks(filePath: string, rawContent: string): string {
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (!/\.(tsx|jsx|ts|js)$/.test(normalizedPath)) {
        return rawContent;
    }

    if (!needsClientDirectiveHeuristic(rawContent, normalizedPath)) {
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

/**
 * When `path.relative(project, absoluteFile)` fails (different roots, symlinks), infer repo-relative path from
 * Next.js / Pages markers. First match wins. May mis-detect rare paths like `.../node_modules/.../app/`.
 */
function extractFrameworkRelativeFromAbsolutePath(absolutePosixish: string): string | null {
    const n = absolutePosixish.replace(/\\/g, '/');
    let idx = n.indexOf('/src/app/');
    if (idx >= 0) {
        return n.slice(idx + 1).replace(/\/+/g, '/');
    }
    idx = n.indexOf('/src/pages/');
    if (idx >= 0) {
        return n.slice(idx + 1).replace(/\/+/g, '/');
    }
    idx = n.search(/\/app\//);
    if (idx >= 0) {
        return n.slice(idx + 1).replace(/\/+/g, '/');
    }
    idx = n.search(/\/pages\//);
    if (idx >= 0) {
        return n.slice(idx + 1).replace(/\/+/g, '/');
    }
    if (/^(src\/app\/|app\/|src\/pages\/|pages\/)/.test(n)) {
        return n.replace(/\/+/g, '/');
    }
    return null;
}

/**
 * Normalize a path for reads/writes under `projectPath`.
 * - Absolute paths inside the project → repo-relative POSIX path (fixes modify-element / react-grab absolute file paths).
 * - If `path.relative` leaves the tree (`..`) or is empty, try `src/app/`, `app/`, etc. from the absolute path.
 * - Otherwise → strip mistaken leading slashes (e.g. "/app/page.tsx" → "app/page.tsx") and normalize separators.
 */
export function resolvePathRelativeToProject(filePath: string, projectPath: string): string {
    const trimmed = filePath.trim();
    if (!trimmed) return trimmed;
    const absProj = path.resolve(projectPath);
    if (path.isAbsolute(trimmed)) {
        const absTarget = path.resolve(trimmed);
        const rel = path.relative(absProj, absTarget);
        if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
            return rel.split(path.sep).join('/');
        }
        const posixish = absTarget.split(path.sep).join('/');
        const fromMarker = extractFrameworkRelativeFromAbsolutePath(posixish);
        if (fromMarker) {
            return fromMarker.replace(/^\/+/, '');
        }
        return trimmed.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    }
    return trimmed.replace(/^[/\\]+/, '').replace(/\\/g, '/');
}

export async function read_codebase(filePath: string, projectPath: string = process.cwd()) {
    try {
        const relativePath = resolvePathRelativeToProject(filePath, projectPath);
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
        const relativePath = resolvePathRelativeToProject(filePath, baseDir);
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

        const withClientDirective = ensureClientDirectiveForReactHooks(relativePath, content);
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

        const importedBoundary = validateServerPageLayoutImportedClientBoundaries(
            relativePath,
            sanitizedContent,
            baseDir
        );
        if (!importedBoundary.valid) {
            return {
                success: false,
                message: importedBoundary.message,
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
                    missingNpmPackageRoots: importValidation.missingNpmPackageRoots,
                },
            };
        }

        const prismaId = validatePrismaClientIdentifierUsage(sanitizedContent, baseDir);
        if (!prismaId.valid) {
            return {
                success: false,
                message: prismaId.message,
                filePath,
            };
        }

        const prismaGen = validatePrismaClientGeneratedForImports(sanitizedContent, baseDir);
        if (!prismaGen.valid) {
            return {
                success: false,
                message: prismaGen.message,
                filePath,
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
            try {
                if (before !== null) {
                    fs.writeFileSync(fullPath, before, 'utf-8');
                } else if (fs.existsSync(fullPath)) {
                    fs.unlinkSync(fullPath);
                }
            } catch {
                // Best-effort rollback; caller may retry with repaired content.
            }
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

            const refactorBoundary = validateAppRouterServerExportClientBoundary(relativePath, sanitizedRefactorContent);
            if (!refactorBoundary.valid) {
                return `Error during refactoring: ${refactorBoundary.message}`;
            }

            const refactorImported = validateServerPageLayoutImportedClientBoundaries(
                relativePath,
                sanitizedRefactorContent,
                process.cwd()
            );
            if (!refactorImported.valid) {
                return `Error during refactoring: ${refactorImported.message}`;
            }

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

const NPM_QUERY_MAX_LEN = 220;
/** Unscoped or scoped package name for `npm view` (no arbitrary shell). */
function isSafeNpmPackageQuery(raw: string): boolean {
    const q = raw.trim();
    if (!q || q.length > NPM_QUERY_MAX_LEN) return false;
    return /^(@[a-z0-9-~][a-z0-9-._~]*\/[a-z0-9-._~]+|[a-z0-9@._~-]+)$/i.test(q);
}

/**
 * Resolves registry metadata via `npm view` (requires network / npm cache).
 */
export async function search_npm_package(query: string, projectPath: string = process.cwd()) {
    const q = String(query || '').trim();
    if (!q) {
        return { success: false, error: 'Empty package name or query.' };
    }
    if (!isSafeNpmPackageQuery(q)) {
        return {
            success: false,
            error: `Invalid package name format: "${q}". Use an npm package name (e.g. react, lodash, @types/node).`,
        };
    }
    try {
        const { stdout, stderr } = await execAsync(`npm view ${JSON.stringify(q)} version description homepage repository peerDependencies --json`, {
            cwd: projectPath,
            timeout: 25_000,
            maxBuffer: 2 * 1024 * 1024,
            encoding: 'utf8',
        });
        const combined = `${stdout || ''}${stderr || ''}`.trim();
        let data: Record<string, unknown>;
        try {
            data = JSON.parse(stdout || '{}') as Record<string, unknown>;
        } catch {
            return { success: false, error: `npm view returned non-JSON. Output: ${combined.slice(0, 500)}` };
        }
        if (data && typeof data === 'object' && 'error' in data) {
            return { success: false, error: String((data as { error?: string }).error || 'Package not found'), query: q };
        }
        const installed = getInstalledPackages(projectPath);
        const inProject = installed.has(q.startsWith('@') ? q.split('/').slice(0, 2).join('/') : q.split('/')[0]);
        return {
            success: true,
            query: q,
            version: data.version ?? null,
            description: data.description ?? null,
            homepage: data.homepage ?? null,
            repository: data.repository ?? null,
            peerDependencies: data.peerDependencies ?? null,
            listedInProjectPackageJson: inProject,
        };
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
            success: false,
            error: `npm view failed for "${q}": ${msg}`,
            query: q,
        };
    }
}

// --- Style Architect Skills ---
/**
 * Aligns one component/page file with the **target** project's styling (tokens, Tailwind, existing patterns).
 * Requires `projectPath` as final arg when invoked from the orchestrator (same pattern as `read_codebase`).
 */
export async function apply_design_system(componentPath: string, projectPath: string = process.cwd()) {
    const relativePath = resolvePathRelativeToProject(componentPath, projectPath);
    const fullPath = path.resolve(projectPath, relativePath);
    if (!fs.existsSync(fullPath)) {
        return `apply_design_system: file not found — ${relativePath} (project: ${projectPath})`;
    }

    const existing = await read_codebase(relativePath, projectPath);
    if (typeof existing === 'string' && existing.startsWith('File "') && existing.includes('does not exist')) {
        return existing;
    }

    const profiler = new ProjectProfiler(projectPath);
    const profile = await profiler.getProfileData();
    const context = await profiler.getContextString();
    const techStack = profile.techStack || 'unknown';

    const prompt = `Align this single file with the target project's design system.

Rules:
- Change only styling/markup structure needed for visual consistency (className, inline style, semantic wrappers).
- Preserve behavior: state, effects, data fetching, event handlers, exports, and types must stay equivalent.
- Obey [PROJECT CONTEXT]: Tailwind only if installed; shadcn/ui only if listed; otherwise CSS or semantic HTML.
- Use colors/spacing/radius from DESIGN HINTS and existing code — no unrelated product themes.
- **Readability**: Verify foreground/background contrast (WCAG-minded); remove white-on-white, near-identical luminance pairs, and light text on light containers unless the design system explicitly defines that dark-on-light pattern.

You MUST output exactly one file using the required format. The path line must be:
File: ${relativePath}

Current file:
\`\`\`
${existing}
\`\`\`
`;

    const result = await llm.generateCode(prompt, context, MODEL_CONFIG.CODING_MODEL, techStack);
    if (result.error) {
        return `apply_design_system failed: ${result.content}`;
    }

    const norm = (p: string) => p.replace(/^\/+/, '').replace(/\\/g, '/');
    const targetNorm = norm(relativePath);
    const picked =
        result.files.find((f) => norm(f.path) === targetNorm) ??
        (result.files.length === 1 ? result.files[0] : null);

    if (!picked || !picked.content?.trim()) {
        return `apply_design_system: model returned no usable file (expected path like "${relativePath}")`;
    }

    const writeResult = await write_code(relativePath, picked.content, projectPath);
    if (typeof writeResult === 'object' && writeResult && 'success' in writeResult && writeResult.success === false) {
        return `apply_design_system: write failed — ${writeResult.message || 'unknown error'}`;
    }

    return `Applied design system to ${relativePath}`;
}

export async function generate_scss(moduleName: string, projectPath: string = process.cwd()) {
    const safeName = moduleName.replace(/[^a-zA-Z0-9_-]/g, '') || 'Block';
    const profiler = new ProjectProfiler(projectPath);
    const context = await profiler.getContextString();

    const systemPrompt = `You write SCSS only. Output a single root block (e.g. .${safeName} { ... }) suitable for a component module.
Use variables that exist in the target project (see DESIGN HINTS / context) such as var(--background). Do not invent npm imports.
No markdown fences, no commentary — SCSS only.`;

    const userPrompt = `Module name / BEM block: ${safeName}\n\n${context}`;

    try {
        const scss = await llm.generateText(systemPrompt, userPrompt, MODEL_CONFIG.CODING_MODEL, null);
        return scss.trim();
    } catch (e: any) {
        return `generate_scss failed: ${e.message}`;
    }
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
        await execFileAsync(getAgentBrowserExecutable(), ['--version'], {
            timeout: 5_000,
            env: process.env,
            windowsHide: true,
        });
        agentBrowser = true;
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

function countSubstringInFiles(
    rootDir: string,
    extensions: Set<string>,
    sub: string,
    maxFiles: number
): { scannedFiles: number; matchCount: number; samplePaths: string[] } {
    let scannedFiles = 0;
    let matchCount = 0;
    const samplePaths: string[] = [];
    const needle = sub.toLowerCase();

    function walk(dir: string) {
        if (scannedFiles >= maxFiles || samplePaths.length >= 12) return;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            if (scannedFiles >= maxFiles) return;
            if (e.name.startsWith('.') || e.name === 'node_modules') continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                walk(full);
                continue;
            }
            const ext = path.extname(e.name).toLowerCase();
            if (!extensions.has(ext)) continue;
            scannedFiles += 1;
            try {
                const content = fs.readFileSync(full, 'utf8').slice(0, 8000);
                if (content.toLowerCase().includes(needle)) {
                    matchCount += 1;
                    if (samplePaths.length < 12) {
                        samplePaths.push(path.relative(rootDir, full).replace(/\\/g, '/'));
                    }
                }
            } catch {
                /* skip */
            }
        }
    }

    if (fs.existsSync(rootDir)) walk(rootDir);
    return { scannedFiles, matchCount, samplePaths };
}

function detectDefaultVsNamedExportSample(projectRoot: string, relPaths: string[]): {
    defaultExport: number;
    namedExport: number;
} {
    let defaultExport = 0;
    let namedExport = 0;
    for (const rel of relPaths.slice(0, 8)) {
        const full = path.join(projectRoot, rel);
        if (!fs.existsSync(full)) continue;
        try {
            const c = fs.readFileSync(full, 'utf8').slice(0, 6000);
            if (/export\s+default\b/.test(c)) defaultExport += 1;
            if (/export\s+(?:async\s+)?function\s+/.test(c) || /export\s+const\s+\w+\s*=/.test(c)) namedExport += 1;
        } catch {
            /* skip */
        }
    }
    return { defaultExport, namedExport };
}

/**
 * Heuristic project conventions for planners (router, UI kit, import style samples).
 */
export async function extract_patterns(projectPath: string = process.cwd(), fileTypes: string[] = ['.tsx', '.ts', '.jsx', '.js']) {
    const root = path.resolve(projectPath);
    const extSet = new Set((fileTypes.length ? fileTypes : ['.tsx', '.ts', '.jsx', '.js']).map((e) => e.toLowerCase()));

    const profiler = new ProjectProfiler(root);
    const data = await profiler.getProfileData();
    const routerBase = data.routerBase;
    const scanRoots: string[] = [];
    if (routerBase) scanRoots.push(path.join(root, routerBase));
    for (const rel of ['components', 'src/components', 'lib', 'src/lib']) {
        const p = path.join(root, rel);
        if (fs.existsSync(p) && fs.statSync(p).isDirectory()) scanRoots.push(p);
    }

    let useClientHits = 0;
    let filesScannedUseClient = 0;
    for (const dir of scanRoots.slice(0, 4)) {
        const r = countSubstringInFiles(dir, extSet, "'use client'", 35);
        filesScannedUseClient += r.scannedFiles;
        useClientHits += r.matchCount;
    }

    const pageSample = (data.pageCandidates || []).filter((p: string) => /\.(tsx|ts|jsx|js)$/i.test(p));
    const exportSample = detectDefaultVsNamedExportSample(root, pageSample);
    const routeExportStyle = resolveRouteExportStyle(root, data.routerBase, data.structure);

    const aliasHints: string[] = [];
    try {
        const merged = mergeCompilerPathsFromConfigs(root);
        for (const k of Object.keys(merged)) {
            if (k.includes('@/') || k.startsWith('@')) aliasHints.push(k);
        }
    } catch {
        /* skip */
    }

    return {
        techStack: data.techStack,
        structure: data.structure,
        routerBase: data.routerBase,
        routerResolutionNote: data.routerResolutionNote ?? null,
        hasTailwind: data.hasTailwind,
        uiKitPresent: data.uiKitPresent,
        uiKitRelativePath: data.uiKitRelativePath,
        pageCandidatesSample: pageSample.slice(0, 15),
        conventions: {
            useClientOccurrencesInSampledFiles: useClientHits,
            filesSampledForUseClient: filesScannedUseClient,
            defaultVsNamedExportInPageSample: exportSample,
            routeExportStyle: {
                style: routeExportStyle.style,
                source: routeExportStyle.source,
                defaultFunctionCount: routeExportStyle.defaultFunctionCount,
                constArrowCount: routeExportStyle.constArrowCount,
                skippedCount: routeExportStyle.skippedCount,
                sampledRelPaths: routeExportStyle.sampledRelPaths,
            },
            tsconfigPathPatterns: aliasHints.slice(0, 12),
        },
        notes: [
            'Patterns are heuristic; confirm in repo before relying on them.',
            data.routerDualRoot
                ? 'Dual app/pages router roots detected — verify route ownership.'
                : null,
        ].filter(Boolean) as string[],
    };
}

function collectComponentLikeFiles(projectRoot: string, maxTotal: number): string[] {
    const out: string[] = [];
    const exts = new Set(['.tsx', '.ts', '.jsx', '.js']);
    const roots = ['components', 'src/components', 'app', 'src/app'].map((r) => path.join(projectRoot, r));

    function walk(dir: string) {
        if (out.length >= maxTotal) return;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entries) {
            if (out.length >= maxTotal) return;
            if (e.name.startsWith('.') || e.name === 'node_modules') continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) {
                const normDir = dir.replace(/\\/g, '/');
                if (e.name === 'api' && /(^|\/)app(\/|$)/.test(normDir)) {
                    /* skip route handlers for “component” similarity */
                    continue;
                }
                walk(full);
                continue;
            }
            const ext = path.extname(e.name).toLowerCase();
            if (!exts.has(ext)) continue;
            out.push(path.relative(projectRoot, full).replace(/\\/g, '/'));
        }
    }

    for (const r of roots) {
        if (fs.existsSync(r) && fs.statSync(r).isDirectory()) walk(r);
    }
    return out;
}

/**
 * Returns relative paths whose basename or content matches `query` (case-insensitive).
 * `componentType` narrows to filenames containing that substring when non-empty.
 */
export async function find_similar_components(
    projectPath: string = process.cwd(),
    query: string = '',
    componentType: string = ''
) {
    const root = path.resolve(projectPath);
    const q = String(query || '').trim().toLowerCase();
    const typeFilter = String(componentType || '').trim().toLowerCase();
    if (!q && !typeFilter) {
        return { matches: [] as string[], note: 'Provide query and/or componentType for meaningful results.' };
    }

    const profiler = new ProjectProfiler(root);
    const data = await profiler.getProfileData();

    const scored: { path: string; score: number; reason: string }[] = [];
    const push = (rel: string, score: number, reason: string) => {
        if (!rel || scored.some((s) => s.path === rel)) return;
        scored.push({ path: rel, score, reason });
    };

    for (const c of data.availableUIComponents || []) {
        const name = String(c).toLowerCase();
        if (q && name.includes(q)) {
            const base = data.uiKitRelativePath
                ? `${data.uiKitRelativePath}/${c}.tsx`
                : `components/ui/${c}.tsx`;
            push(base, 10, 'UI kit basename match');
        }
    }

    const files = collectComponentLikeFiles(root, 400);
    for (const rel of files) {
        const base = path.basename(rel).toLowerCase();
        if (typeFilter && !base.includes(typeFilter) && !rel.toLowerCase().includes(typeFilter)) {
            continue;
        }
        if (q) {
            if (base.includes(q) || rel.toLowerCase().includes(q)) {
                push(rel, base.includes(q) ? 8 : 5, 'path/basename match');
                continue;
            }
            try {
                const content = fs.readFileSync(path.join(root, rel), 'utf8').slice(0, 6000).toLowerCase();
                if (content.includes(q)) {
                    push(rel, 3, 'content match');
                }
            } catch {
                /* skip */
            }
        } else if (typeFilter && (base.includes(typeFilter) || rel.toLowerCase().includes(typeFilter))) {
            push(rel, 6, 'componentType path match');
        }
    }

    scored.sort((a, b) => b.score - a.score);
    return {
        matches: scored.slice(0, 24).map((s) => s.path),
        details: scored.slice(0, 12),
        query: query || null,
        componentType: componentType || null,
    };
}
