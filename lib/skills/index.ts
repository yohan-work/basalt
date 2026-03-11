import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

import { AgentDefinition, AgentLoader } from '../agent-loader';
import * as llm from '../llm';
import { MODEL_CONFIG } from '../model-config';

const execAsync = promisify(exec);

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

        // 3. Prompt the LLM to execute
        // For now, we return text. If skills define specific schema, we could parse it.
        const response = await llm.generateText(
            systemPrompt,
            "Execute the skill based on the provided inputs and context.",
            MODEL_CONFIG.SMART_MODEL,
            emitter
        );

        return response;
    } catch (e: any) {
        console.error(`Failed to execute skill ${skillName}:`, e);
        return {
            error: true,
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

        if (!fs.existsSync(fullPath)) {
            return `File "${filePath}" does not exist in project. (Path: ${relativePath})`;
        }
        const content = fs.readFileSync(fullPath, 'utf8');
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

        // Capture before content if file exists (for diff viewer)
        let before: string | null = null;
        if (fs.existsSync(fullPath)) {
            before = fs.readFileSync(fullPath, 'utf-8');
        }

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content, 'utf-8');

        return {
            success: true,
            message: `Successfully wrote to ${filePath} `,
            filePath,
            before,
            after: content,
            isNew: before === null
        };
    } catch (error: any) {
        return { success: false, message: `Error writing file: ${error.message} ` };
    }
}

export async function refactor_code(code: string, instructions: string) {
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
        if (result.files && result.files.length > 0) {
            return result.files[0].content;
        }

        return result.content;
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
        if (!fs.existsSync(fullPath)) return 'Directory does not exist';
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        return entries.map(entry => {
            return `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`;
        });
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
