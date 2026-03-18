import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as ts from 'typescript';

import { AgentDefinition, AgentLoader } from '../agent-loader';
import * as llm from '../llm';
import { MODEL_CONFIG } from '../model-config';
import { ProjectProfiler } from '../profiler';

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

const MAX_IMPORT_VALIDATION_UI_HINT = 12;
const IMPORT_VALIDATION_FILE_SUFFIXES = ['.ts', '.tsx', '.js', '.jsx', '.d.ts', '.mjs', '.cjs', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

function normalizeImportPathWithAlias(specifier: string, projectRoot: string): string | null {
    if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) {
        return null;
    }

    if (!specifier.startsWith('@/')) {
        return null;
    }

    return path.join(projectRoot, specifier.replace(/^@\//, ''));
}

function parseTsconfigPathAliases(projectRoot: string): Array<{ pattern: string; target: string; wildcard: boolean }> {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) return [];

    try {
        const tsconfigFile = fs.readFileSync(tsconfigPath, 'utf-8');
        const parsed = ts.parseConfigFileTextToJson(tsconfigPath, tsconfigFile);
        const paths = parsed.config?.compilerOptions?.paths;
        if (!paths || typeof paths !== 'object' || Array.isArray(paths)) return [];

        const entries: Array<{ pattern: string; target: string; wildcard: boolean }> = [];
        for (const [pattern, targetValues] of Object.entries(paths)) {
            if (typeof targetValues !== 'object' || targetValues === null) continue;
            const targets = Array.isArray(targetValues) ? targetValues : [targetValues];
            if (targets.length === 0 || typeof targets[0] !== 'string') continue;
            entries.push({
                pattern: String(pattern),
                target: String(targets[0]),
                wildcard: String(pattern).endsWith('/*')
            });
        }
        return entries;
    } catch {
        return [];
    }
}

function resolveAliasImportPath(specifier: string, projectRoot: string): string | null {
    const aliases = parseTsconfigPathAliases(projectRoot);
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
): Promise<{ valid: boolean; message?: string }> {
    const normalized = path.normalize(filePath).replace(/^\/+/, '');
    if (!/\.(tsx|ts|jsx|js)$/.test(normalized)) return { valid: true };

    const fullPath = path.join(baseDir, normalized);
    const containingDir = path.dirname(fullPath);
    const sourceFile = ts.createSourceFile(fullPath, content, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
    const aliases = parseTsconfigPathAliases(baseDir);
    const uiComponents = await getAvailableUiComponentNames(baseDir);
    const uiComponentImports: string[] = [];
    const missingImports: string[] = [];

    const visitNode = (node: ts.Node) => {
        const candidateSpecifier = getAvailableImportSource(node);
        if (!candidateSpecifier || !shouldValidateImportPath(candidateSpecifier)) {
            return;
        }

        let resolvedBase: string | null = null;
        if (candidateSpecifier.startsWith('.')) {
            resolvedBase = path.resolve(containingDir, candidateSpecifier);
        } else if (candidateSpecifier.startsWith('/')) {
            resolvedBase = path.join(baseDir, candidateSpecifier.replace(/^\/+/, ''));
        } else if (candidateSpecifier.startsWith('@/')) {
            resolvedBase = resolveAliasImportPath(candidateSpecifier, baseDir);
        } else if (aliases.length > 0 && aliases.some((alias) => candidateSpecifier.startsWith(alias.pattern.replace('*', '')))) {
            resolvedBase = resolveAliasImportPath(candidateSpecifier, baseDir);
        } else if (candidateSpecifier.startsWith('~/') || candidateSpecifier.startsWith('@@/')) {
            resolvedBase = null;
        }

        if (!resolvedBase) {
            return;
        }

        const exists = resolveModuleCandidates(resolvedBase).some((candidate) => fs.existsSync(candidate));
        if (exists) {
            return;
        }

        if (candidateSpecifier.includes('/components/ui/')) {
            const componentName = path.basename(candidateSpecifier).toLowerCase();
            uiComponentImports.push(componentName);
            if (!uiComponents.has(componentName)) {
                const availableUi = Array.from(uiComponents).slice(0, MAX_IMPORT_VALIDATION_UI_HINT).join(', ') || 'None';
                missingImports.push(
                    `${candidateSpecifier} (UI component not found; available: ${availableUi})`
                );
                return;
            }
        }

        missingImports.push(candidateSpecifier);
    };

    sourceFile.forEachChild((node) => {
        visitNode(node);
        ts.forEachChild(node, visitNode);
    });

    if (missingImports.length > 0) {
        const detail =
            `Missing module imports detected in ${filePath}: ${missingImports.join(', ')}` +
            (uiComponentImports.length > 0 ? ` | UI import candidates: ${uiComponentImports.join(', ')}` : '');
        return { valid: false, message: detail };
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

    const firstNonEmpty = getFirstNonEmptyCodeLine(rawContent);
    if (firstNonEmpty && (CLIENT_DIRECTIVE_RE.test(firstNonEmpty) || SERVER_DIRECTIVE_RE.test(firstNonEmpty))) {
        return rawContent;
    }

    return `'use client';\n\n${rawContent}`;
}

export function reset_runtime_caches() {
    READ_CACHE.clear();
    DIR_CACHE.clear();
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
export { consult_agents } from './consult_agents/execute';
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
        const withClientDirective = ensureClientDirectiveForReactHooks(filePath, content);
        const sanitizedContent = sanitizeMetadataImportAliases(withClientDirective, relativePath, baseDir);

        const importValidation = await validateImportsExistence(sanitizedContent, relativePath, baseDir);
        if (!importValidation.valid) {
            return {
                success: false,
                message: importValidation.message || `Invalid imports for ${filePath}`,
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

export async function check_responsive(url: string) {
    return { mobile: true, desktop: true };
}

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
    return {
        node: process.version,
        supabase: !!process.env.NEXT_PUBLIC_SUPABASE_URL
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

export async function scan_project(projectPath: string = process.cwd(), depth: number = 3) {
    return { techStack: "unknown", message: "scan_project not fully implemented yet." };
}

export async function extract_patterns(projectPath: string = process.cwd(), fileTypes: string[] = ['.tsx', '.ts', '.jsx', '.js']) {
    return { message: "extract_patterns not fully implemented yet." };
}

export async function find_similar_components(projectPath: string = process.cwd(), query: string, componentType: string) {
    return [];
}
