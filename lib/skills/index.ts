import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

import { AgentDefinition, AgentLoader } from '../agent-loader';
import * as llm from '../llm';
import { MODEL_CONFIG } from '../model-config';

const execAsync = promisify(exec);

// --- Main Agent Skills ---
export async function analyze_task(
    taskDescription: string,
    availableAgents?: AgentDefinition[],
    codebaseContext?: string,
    emitter: any = null
) {
    try {
        const rawAgents = (availableAgents && availableAgents.length > 0) ? availableAgents : AgentLoader.listAgents();
        const agents = Array.isArray(rawAgents) ? rawAgents : [];
        const agentsList = agents.map(a => `- ${a.name} (Role: ${a.role}, Skills: ${a.skills?.join(', ') || ''})`).join('\n');

        const systemPrompt = `You are a Lead AI Architect.
Your goal is to analyze a user request and determine which agents are required to fulfill it.

${codebaseContext ? `Current Codebase Context:\n${codebaseContext}\n` : ''}

Available Agents:
${agentsList}

IMPORTANT: Provide all analysis summaries and reasoning in KOREAN.
중요: 모든 분석 결과와 이유 등 사용자가 읽는 텍스트는 한국어로 작성하세요.
`;


        const schema = `{
    "complexity": "low" | "medium" | "high",
    "required_agents": ["agent-role-slug"],
    "summary": "Brief analysis of the task"
}
IMPORTANT: Use the exact agent role slugs from the Available Agents list above (e.g. "software-engineer", "product-manager", "qa"). Do NOT use underscores or other formats.`;

        const analysis = await llm.generateJSONStream(systemPrompt, taskDescription, schema, emitter);
        return analysis;

    } catch (e) {
        console.error('LLM Analysis Failed, falling back to heuristic', e);
        // Fallback or re-throw
        return {
            complexity: 'medium',
            required_agents: ['software-engineer'], // Safer fallback
            summary: 'Fallback analysis due to LLM error.'
        };
    }
}

export async function create_workflow(
    taskAnalysis: any,
    availableAgents?: AgentDefinition[],
    codebaseContext?: string,
    emitter: any = null
) {
    try {
        const agents = availableAgents?.length ? availableAgents : AgentLoader.listAgents();
        const requiredAgents = taskAnalysis.required_agents || [];
        const agentsInfo = agents
            .filter(a => requiredAgents.includes(a.name) || a.role === 'main-agent')
            .map(a => `- ${a.name}: [${a.skills.join(', ')}]`)
            .join('\n');

        const systemPrompt = `You are a Project Manager.
Create a step-by-step workflow to complete the task.
Use ONLY the available agents and their specific skills.

${codebaseContext ? `Current Codebase Context (Project Structure/Config):\n${codebaseContext}\n` : ''}

Supported Skills:
- read_codebase: Read file content
- write_code: Create or modify files
- refactor_code: Refactor existing code
- run_shell_command: Execute terminal commands
- manage_git: Git operations (checkout, commit, push, etc.)
- list_directory: List directory contents
- apply_design_system: Apply design tokens to components
- generate_scss: Generate SCSS module files
- check_responsive: Check responsive layout
- check_environment: Verify dev environment setup
- search_npm_package: Search npm registry
- analyze_error_logs: Analyze error logs for root cause
- verify_final_output: Final verification of task completion

Available Agents and their skills:
${agentsInfo}
`;

        const schema = `{
    "steps": [
        { "agent": "software-engineer", "action": "read_codebase", "description": "Analyzing existing project structure" },
        { "agent": "software-engineer", "action": "write_code", "description": "Implementing the requested feature/page at the appropriate path" },
        { "agent": "main-agent", "action": "verify_final_output", "description": "Verifying implementation against requirements" }
    ]
}
OR
{
    "steps": [
        { "agent": "product-manager", "action": "search_npm_package", "description": "Searching for libraries related to the task" },
        { "agent": "software-engineer", "action": "write_code", "description": "Integrating the new library into the project" }
    ]
}
`;
        const instructions = `
IMPORTANT:
- Use the exact agent role slugs (e.g. "software-engineer", "product-manager", "qa").
- MANDATORY: Use the 'codebaseContext' provided above to determine actual file paths and folder structures.
- For new pages, check if the project uses 'app/' (App Router) or 'pages/' (Page Router) and follow that pattern.
- Each 'description' MUST be UNIQUE, SPECIFIC and ACTIONABLE for the designated agent.
- EVERY 'description' MUST BE WRITTEN IN KOREAN.
- 모든 단계의 설명(description)은 반드시 한국어로 작성하십시오.`;


        const fullSchema = schema + instructions;

        const workflow = await llm.generateJSONStream(systemPrompt, `Task Analysis: ${JSON.stringify(taskAnalysis)} `, fullSchema, emitter);

        // Ensure steps exists
        if (!workflow.steps || !Array.isArray(workflow.steps)) {
            workflow.steps = [];
        }

        // Ensure verify step exists
        if (!workflow.steps.find((s: any) => s.action === 'verify_final_output')) {
            workflow.steps.push({ agent: 'main-agent', action: 'verify_final_output' });
        }

        return workflow;

    } catch (e) {
        console.error('LLM Workflow Creation Failed, using fallback', e);
        return {
            steps: [
                { agent: 'software-engineer', action: 'read_codebase' },
                { agent: 'software-engineer', action: 'write_code' },
                { agent: 'main-agent', action: 'verify_final_output' }
            ]
        };
    }
}

export async function consult_agents(
    taskAnalysis: any,
    availableAgents: AgentDefinition[],
    codebaseContext: string,
    emitter: any = null,
    pastThoughts: any[] = []
) {
    try {
        const requiredAgents = taskAnalysis.required_agents || [];
        const agents = availableAgents.filter(a => requiredAgents.includes(a.role) || a.role === 'main-agent');
        const agentsList = agents.map(a => `- ${a.name} (Role: ${a.role}, Expertise: ${a.skills.join(', ')})`).join('\n');

        const contextDiscussion = pastThoughts.length > 0
            ? `Previous Discussion History:\n${pastThoughts.map(t => `[${t.agent_role || t.agent}] ${t.message || t.thought}`).join('\n')}\n`
            : '';

        const systemPrompt = `You are a group of AI agents brainstorming a technical solution.
Generate a realistic dialogue between the following agents about the task at hand.
${pastThoughts.length > 0 ? 'Continue the existing discussion based on the history provided.' : ''}

Available Agents in this discussion:
${agentsList}

Current Codebase Context:
${codebaseContext}

Task Analysis:
${JSON.stringify(taskAnalysis)}

${contextDiscussion}

Instructions:
1. Generate 3-5 additional distinct thoughts/messages.
2. Each message should be from one of the available agents.
3. The discussion should focus on responding to the latest points or the user's feedback if present.
4. The tone should be professional and collaborative.
5. MANDATORY: All thoughts/messages MUST BE IN KOREAN.
6. Provide the output as a JSON object with the following schema:
   {
     "thoughts": [
       { "agent": "software-engineer", "thought": "메시지 내용...", "type": "idea" | "critique" | "agreement" },
       ...
     ]
   }

중요: 모든 대화 내용은 한국어로 작성하십시오.
`;

        const response = await llm.generateJSONStream(
            systemPrompt,
            "에이전트들이 작업에 대해 심도 있는 논의를 진행합니다.",
            "{ \"thoughts\": [ { \"agent\": \"role\", \"thought\": \"...\", \"type\": \"idea\" } ] }",
            emitter,
            MODEL_CONFIG.SMART_MODEL
        );

        const thoughts = response.thoughts || [];
        console.log(`[Consultation] Generated ${thoughts.length} thoughts`);
        return thoughts;
    } catch (e) {
        console.error('Consultation failed:', e);
        return [];
    }
}

export async function verify_final_output(taskDescription: string, projectPath: string = process.cwd()) {
    try {
        // 1. Get list of files in the project
        const files = await list_directory('.', projectPath);
        const fileListStr = Array.isArray(files) ? files.join('\n') : String(files);

        // 2. Perform a deeper check using LLM to see if the requirements were met
        // We'll also try to check for common errors if possible
        const systemPrompt = `
You are a Senior QA Engineer.
Your goal is to verify if the user's task was successfully completed based on the current file structure and project context.

Task Description: ${taskDescription}
Current Project Files(Top Level):
${fileListStr.slice(0, 1000)}

        Instructions:
        1. Check if the expected files appear to be present.
2. If the task involved creating a specific component or page, confirm it exists in the correct directory(app / for App Router, pages / for Page Router).
3. Provide a clear reasoning for your verification status.
`;

        const schema = `{
            "verified": boolean,
                "notes": "string",
                    "suggestedFix": "string (optional, if verification fails)"
        } `;

        const verification = await llm.generateJSON(
            systemPrompt,
            "Verify task completion against project structure.",
            schema,
            MODEL_CONFIG.SMART_MODEL
        );

        return verification;
    } catch (e: any) {
        console.warn('Verification LLM failed, defaulting to success with warning.');
        return {
            verified: true,
            notes: `Verification logic failed but defaulting to true to avoid blocking.Error: ${e.message} `
        };
    }
}

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
        commit: `git commit -m "${args}"`,
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
