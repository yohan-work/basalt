#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const projectRoot = process.cwd();
const targets = [
    'app',
    'components'
];
const hookNames = ['useState', 'useEffect', 'useMemo', 'useCallback', 'useReducer', 'useRef', 'useLayoutEffect', 'useTransition', 'useActionState', 'useOptimistic', 'useDeferredValue', 'useId'];
const hookNameSet = new Set(hookNames);
const nextHeadPattern = /from\s+['"]next\/head['"]/;

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

function collectReactHookUsage(sourceFile) {
    const importedReactHooks = new Set();
    const importedReactNamespaces = new Set();
    let hasReactImport = false;
    let usesHooks = false;

    const addImport = (importDecl) => {
        if (!ts.isStringLiteral(importDecl.moduleSpecifier)) return;
        if (importDecl.moduleSpecifier.text !== 'react') return;

        hasReactImport = true;
        const clause = importDecl.importClause;
        if (!clause) return;

        if (clause.name) {
            importedReactNamespaces.add(clause.name.text);
        }

        if (!clause.namedBindings) return;
        if (ts.isNamespaceImport(clause.namedBindings)) {
            importedReactNamespaces.add(clause.namedBindings.name.text);
            return;
        }
        if (ts.isNamedImports(clause.namedBindings)) {
            for (const element of clause.namedBindings.elements) {
                const importedName = element.propertyName ? element.propertyName.text : element.name.text;
                if (hookNameSet.has(importedName)) {
                    importedReactHooks.add(element.name.text);
                }
            }
        }
    };

    const isHookCall = (expression) => {
        if (ts.isIdentifier(expression) && importedReactHooks.has(expression.text)) {
            return true;
        }

        if (ts.isPropertyAccessExpression(expression)) {
            const obj = expression.expression;
            if (ts.isIdentifier(obj) && ts.isIdentifier(expression.name)) {
                return importedReactNamespaces.has(obj.text) && hookNameSet.has(expression.name.text);
            }
        }

        return false;
    };

    const visit = (node) => {
        if (ts.isImportDeclaration(node)) {
            addImport(node);
        }

        if (ts.isCallExpression(node) && isHookCall(node.expression)) {
            usesHooks = true;
            return;
        }

        ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    return { usesHooks, hasReactImport };
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

        const content = fs.readFileSync(nextPath, 'utf8');
        const sourceFile = ts.createSourceFile(
            nextPath,
            content,
            ts.ScriptTarget.Latest,
            true,
            getScriptKind(nextPath)
        );
        const { hasClientDirective, hasServerDirective } = getBoundaryDirectives(sourceFile.statements);
        const { usesHooks, hasReactImport } = collectReactHookUsage(sourceFile);
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
                message: 'React hook imported without "use client" at top of file',
            });
            continue;
        }

        if (usesHooks && !hasReactImport) {
            problems.push({
                type: 'MISSING_REACT_IMPORT',
                file: nextPath,
                message: 'React hook-like usage found without importing from react.',
            });
        }
    }
}

async function main() {
    const problems = [];
    for (const target of targets) {
        scanDir(path.join(projectRoot, target), problems);
    }

    if (problems.length === 0) {
        console.log('[validate-client-boundary] No React hook boundary issues found.');
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
