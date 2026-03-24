#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { execSync } from 'child_process';

const projectRoot = process.cwd();
const cliArgs = new Set(process.argv.slice(2));
const cliArgsList = process.argv.slice(2);
const explicitTypecheckFiles = cliArgsList.filter((arg) => !arg.startsWith('--'));
const runBoundaryCheck = !cliArgs.has('--types-only');
const runTypecheckMode = !cliArgs.has('--boundary-only');
const runChangedTypecheck = cliArgs.has('--changed');
const boundaryFileArg = cliArgsList.find((arg) => arg.startsWith('--boundary-file='));
const boundarySingleFile = boundaryFileArg
    ? path.resolve(projectRoot, boundaryFileArg.slice('--boundary-file='.length).trim())
    : null;
const explicitGitRef = (() => {
    const gitRefArg = cliArgsList.find((arg) => arg.startsWith('--git-ref='));
    return gitRefArg ? gitRefArg.replace('--git-ref=', '').trim() || 'HEAD' : 'HEAD';
})();
const targetDirCandidates = ['app', 'components', 'src/app', 'src/components'];
const targets = targetDirCandidates.filter((t) => fs.existsSync(path.join(projectRoot, t)));
const hookNames = [
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
];
const nextNavigationHookNames = [
    'useRouter',
    'usePathname',
    'useSearchParams',
    'useParams',
    'useSelectedLayoutSegment',
    'useSelectedLayoutSegments',
    'useServerInsertedHTML',
];
const nextNavigationHookNameSet = new Set(nextNavigationHookNames);
const nextRouterPageHookNameSet = new Set(['useRouter']);
const reactDomHookNameSet = new Set(['useFormState', 'useFormStatus']);
const reactCoreHookNameSet = new Set(hookNames);
const interactiveJsxAttrNames = new Set([
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
const nextHeadPattern = /from\s+['"]next\/head['"]/;
const tsconfigAliasCache = new Map();

function resolveTypecheckTargets() {
    if (explicitTypecheckFiles.length > 0) {
        return explicitTypecheckFiles
            .map((candidate) => path.resolve(projectRoot, candidate))
            .filter((candidate) => fs.existsSync(candidate));
    }

    if (!runChangedTypecheck) return [];

    try {
        const diffRef = explicitGitRef || 'HEAD';
        const raw = execSync(`git diff --name-only ${diffRef} --`, {
            cwd: projectRoot,
            encoding: 'utf8',
        });
        return raw
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && /\.(tsx?|jsx?)$/.test(line))
            .map((line) => path.resolve(projectRoot, line));
    } catch (error) {
        return [];
    }
}

function getAliasMapping(projectRoot) {
    if (tsconfigAliasCache.has(projectRoot)) {
        return tsconfigAliasCache.get(projectRoot);
    }

    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
        tsconfigAliasCache.set(projectRoot, { raw: null });
        return tsconfigAliasCache.get(projectRoot);
    }

    try {
        const raw = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
        const aliasPattern = raw?.compilerOptions?.paths?.['@/*'];
        tsconfigAliasCache.set(projectRoot, {
            raw: Array.isArray(aliasPattern) && aliasPattern[0] ? aliasPattern[0] : null
        });
    } catch (err) {
        tsconfigAliasCache.set(projectRoot, { raw: null });
    }

    return tsconfigAliasCache.get(projectRoot);
}

function resolveAliasImportPath(projectRoot, importPath) {
    if (!importPath.startsWith('@/')) {
        return null;
    }

    const aliasConfig = getAliasMapping(projectRoot)?.raw;
    if (!aliasConfig || typeof aliasConfig !== 'string') {
        const fallback = path.join(projectRoot, importPath.replace('@/', './').replace(/\\/g, '/'));
        return [fallback + '.ts', fallback + '.tsx', fallback + '.js', fallback + '.jsx'];
    }

    const starIndex = aliasConfig.indexOf('*');
    if (starIndex === -1) return null;

    const aliasBase = aliasConfig.slice(0, starIndex);
    const importSuffix = importPath.slice(2);
    const resolved = path.join(projectRoot, aliasBase, importSuffix);
    return [resolved + '.ts', resolved + '.tsx', resolved + '.js', resolved + '.jsx', resolved];
}

function hasAliasResolution(importPath, projectRoot) {
    const candidates = resolveAliasImportPath(projectRoot, importPath);
    if (!candidates || !Array.isArray(candidates)) return false;
    return candidates.some((candidate) => fs.existsSync(candidate));
}

function hasAppMetadataFile(projectRoot) {
    const bases = [path.join(projectRoot, 'app'), path.join(projectRoot, 'src/app')];
    for (const base of bases) {
        const metadataCandidates = [
            path.join(base, 'metadata.ts'),
            path.join(base, 'metadata.tsx'),
            path.join(base, 'metadata.js'),
            path.join(base, 'metadata.jsx'),
        ];
        if (metadataCandidates.some((file) => fs.existsSync(file))) return true;
    }
    return false;
}

function validateAppMetadataAliasImport(sourceFile, projectRoot) {
    const aliasImports = [];
    const targetPattern = /^@\/app\/metadata(?:\.(?:ts|tsx|js|jsx))?$/;

    const visit = (node) => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const importPath = node.moduleSpecifier.text;
            if (targetPattern.test(importPath) && hasAppMetadataFile(projectRoot) && !hasAliasResolution(importPath, projectRoot)) {
                aliasImports.push(importPath);
            }
        }
        ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return aliasImports;
}

function getScriptKind(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.tsx' || ext === '.jsx') return ts.ScriptKind.TSX;
    if (ext === '.ts' || ext === '.js') return ts.ScriptKind.TS;
    return ts.ScriptKind.TSX;
}

function getBoundaryDirectives(statements) {
    let hasClientDirective = false;
    let hasServerDirective = false;
    let checkingPrologue = true;

    for (const stmt of statements) {
        if (ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression)) {
            if (!checkingPrologue) continue;

            if (stmt.expression.text === 'use client') {
                hasClientDirective = true;
                continue;
            }
            if (stmt.expression.text === 'use server') {
                hasServerDirective = true;
                continue;
            }

            // Any other leading expression ends directive parsing.
            checkingPrologue = false;
            continue;
        }

        if (!ts.isImportDeclaration(stmt) && !ts.isImportEqualsDeclaration(stmt)) {
            checkingPrologue = false;
        }
    }

    return { hasClientDirective, hasServerDirective };
}

function collectReactHookUsage(sourceFile, filePath) {
    const importedReactCoreHooks = new Set();
    const importedNextNavHooks = new Set();
    const importedNextRouterHooks = new Set();
    const importedReactDomHooks = new Set();
    const importedReactNamespaces = new Set();
    let hasReactImport = false;
    let usesHooks = false;
    let usesReactCoreHookCall = false;
    const isTsx = /\.(tsx|jsx)$/i.test(filePath || '');

    const addNamed = (elements, allowedSet, targetSet) => {
        for (const element of elements) {
            const importedName = element.propertyName ? element.propertyName.text : element.name.text;
            if (allowedSet.has(importedName)) {
                targetSet.add(element.name.text);
            }
        }
    };

    const addImport = (importDecl) => {
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
                addNamed(clause.namedBindings.elements, reactCoreHookNameSet, importedReactCoreHooks);
            }
            return;
        }

        if (mod === 'next/navigation') {
            if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
            addNamed(clause.namedBindings.elements, nextNavigationHookNameSet, importedNextNavHooks);
            return;
        }

        if (mod === 'next/router') {
            if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
            addNamed(clause.namedBindings.elements, nextRouterPageHookNameSet, importedNextRouterHooks);
            return;
        }

        if (mod === 'react-dom') {
            if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
            addNamed(clause.namedBindings.elements, reactDomHookNameSet, importedReactDomHooks);
        }
    };

    const isHookCall = (expression) => {
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
            if (ts.isIdentifier(obj) && ts.isIdentifier(expression.name)) {
                if (importedReactNamespaces.has(obj.text) && reactCoreHookNameSet.has(expression.name.text)) {
                    usesReactCoreHookCall = true;
                    return true;
                }
            }
        }

        return false;
    };

    const visit = (node) => {
        if (ts.isImportDeclaration(node)) {
            addImport(node);
        }

        if (isTsx && ts.isJsxAttribute(node)) {
            const n = node.name;
            if (ts.isIdentifier(n) && interactiveJsxAttrNames.has(n.text)) {
                usesHooks = true;
            }
        }

        if (ts.isCallExpression(node) && isHookCall(node.expression)) {
            usesHooks = true;
            return;
        }

        ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return { usesHooks, hasReactImport, usesReactCoreHookCall };
}

function hasClientIncompatibleMetadataExport(sourceFile, hasClientDirective) {
    if (!hasClientDirective) return false;

    let hasMetadataExport = false;
    const visit = (node) => {
        if (ts.isVariableStatement(node) && node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
            for (const declaration of node.declarationList.declarations) {
                if (declaration.name && ts.isIdentifier(declaration.name) && declaration.name.text === 'metadata') {
                    hasMetadataExport = true;
                    return;
                }
            }
        }
        ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return hasMetadataExport;
}

function analyzeBoundaryForFile(nextPath, problems) {
    if (!fs.existsSync(nextPath)) return;
    if (!/\.(ts|tsx|js|jsx)$/.test(nextPath)) return;

    const content = fs.readFileSync(nextPath, 'utf8');
    const sourceFile = ts.createSourceFile(
        nextPath,
        content,
        ts.ScriptTarget.Latest,
        true,
        getScriptKind(nextPath)
    );
    const { hasClientDirective, hasServerDirective } = getBoundaryDirectives(sourceFile.statements);
    const { usesHooks, hasReactImport, usesReactCoreHookCall } = collectReactHookUsage(sourceFile, nextPath);
    const badMetadataAliasImports = validateAppMetadataAliasImport(sourceFile, projectRoot);
    const invalidMetadataExport = hasClientIncompatibleMetadataExport(sourceFile, hasClientDirective);
    const usesNextHead = nextHeadPattern.test(content);

    if (usesNextHead) {
        problems.push({
            type: 'DEPRECATED_NEXT_HEAD',
            file: nextPath,
            message: 'use of next/head is deprecated in app router. use metadata in page.tsx or layout.tsx instead.',
        });
    }

    if (usesHooks && !hasClientDirective && !hasServerDirective) {
        problems.push({
            type: 'MISSING_USE_CLIENT',
            file: nextPath,
            message:
                'React/Next client hook usage, React.use(), or interactive JSX requires "use client" at top of file (or split into a *Client.tsx).',
        });
        return;
    }

    for (const importPath of badMetadataAliasImports) {
        problems.push({
            type: 'INVALID_ALIAS_IMPORT',
            file: nextPath,
            message: `Alias import "${importPath}" does not resolve under current tsconfig. Use a relative path for app/metadata import.`,
        });
    }

    if (invalidMetadataExport) {
        problems.push({
            type: 'INVALID_METADATA_EXPORT',
            file: nextPath,
            message: 'Client Component exports `metadata`. App Router forbids export const metadata in client components.',
        });
    }

    if (usesHooks && usesReactCoreHookCall && !hasReactImport) {
        problems.push({
            type: 'MISSING_REACT_IMPORT',
            file: nextPath,
            message: 'React hook usage found without importing from react.',
        });
    }
}

function scanDir(dir, problems) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const nextPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            scanDir(nextPath, problems);
            continue;
        }

        if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;

        analyzeBoundaryForFile(nextPath, problems);
    }
}

function dedupeProblems(problems) {
    const seen = new Set();
    const out = [];
    for (const p of problems) {
        const k = `${p.file}\0${p.type}\0${p.message}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(p);
    }
    return out;
}

function runTypeCheck(problems, targetFiles = []) {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
        return;
    }

    const rawConfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
    if (rawConfig.error) {
        const msg = ts.flattenDiagnosticMessageText(rawConfig.error.messageText, ' ');
        problems.push({
            type: 'TYPECHECK_FAILED',
            file: tsconfigPath,
            message: `[TS${rawConfig.error.code}] ${msg}`,
        });
        return;
    }

    const parsed = ts.parseJsonConfigFileContent(rawConfig.config, ts.sys, projectRoot);
    const requestedFiles = targetFiles.length > 0
        ? targetFiles.map((candidate) => path.resolve(projectRoot, candidate))
        : parsed.fileNames;

    const validTargets = requestedFiles.filter((candidate) => /\.(tsx?|jsx?)$/i.test(candidate));
    if (validTargets.length === 0) return;

    const requestedSet = new Set(validTargets.map((candidate) => path.resolve(candidate)));
    const program = ts.createProgram({
        rootNames: validTargets,
        options: {
            ...parsed.options,
            noEmit: true,
            pretty: false,
        },
        projectReferences: parsed.projectReferences,
    });

    const diagnostics = ts.getPreEmitDiagnostics(program);
    for (const diagnostic of diagnostics) {
        const file = diagnostic.file;
        if (!file) {
            continue;
        }

        const sourceFile = path.resolve(file.fileName);
        if (targetFiles.length > 0 && !requestedSet.has(sourceFile)) {
            continue;
        }

        const { line, character } = file.getLineAndCharacterOfPosition(diagnostic.start || 0);
        const messageText = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
        const lineNumber = line + 1;
        const columnNumber = character + 1;
        problems.push({
            type: 'TYPE_ERROR',
            file: sourceFile,
            message: `[TS${diagnostic.code}] ${messageText} (line ${lineNumber}:${columnNumber})`,
        });
    }

    for (const diag of parsed.errors) {
        const msg = ts.flattenDiagnosticMessageText(diag.messageText, ' ');
        const file = diag.file ? path.resolve(diag.file.fileName) : tsconfigPath;
        if (targetFiles.length > 0 && diag.file && !requestedSet.has(file)) continue;
        problems.push({
            type: 'TYPE_ERROR',
            file,
            message: `[TS${diag.code}] ${msg}`,
        });
    }
}

async function main() {
    let problems = [];
    if (boundarySingleFile) {
        analyzeBoundaryForFile(boundarySingleFile, problems);
    }
    if (runBoundaryCheck) {
        for (const target of targets) {
            scanDir(path.join(projectRoot, target), problems);
        }
    }

    if (runTypecheckMode) {
        const typecheckTargets = resolveTypecheckTargets();
        runTypeCheck(problems, typecheckTargets);
    }

    problems = dedupeProblems(problems);

    if (problems.length === 0) {
        if (runBoundaryCheck && runTypecheckMode) {
            console.log('[validate-client-boundary] No React boundary or TypeScript issues found.');
        } else if (runTypecheckMode) {
            console.log('[validate-client-boundary] No TypeScript issues found.');
        } else {
            console.log('[validate-client-boundary] No React hook boundary issues found.');
        }
        return;
    }

    console.log('[validate-client-boundary] detected issues:');
    for (const item of problems) {
        const rel = path.relative(projectRoot, item.file);
        console.log(`- [${item.type}] ${rel}: ${item.message}`);
    }
    process.exitCode = 1;
}

main().catch((error) => {
    console.error('[validate-client-boundary] failed:', error);
    process.exit(1);
});
