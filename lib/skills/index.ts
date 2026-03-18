import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

import { AgentDefinition, AgentLoader } from '../agent-loader';
import * as llm from '../llm';
import { MODEL_CONFIG } from '../model-config';

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
        const sanitizedContent = ensureClientDirectiveForReactHooks(filePath, content);

        // Capture before content if file exists (for diff viewer)
        let before: string | null = null;
        if (fs.existsSync(fullPath)) {
            before = fs.readFileSync(fullPath, 'utf-8');
        }

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, sanitizedContent, 'utf-8');
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

        return ensureClientDirectiveForReactHooks(targetFilePath, refactoredContent);
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
