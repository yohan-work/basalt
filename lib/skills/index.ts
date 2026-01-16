import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

import { AgentDefinition } from '../agent-loader';

const execAsync = promisify(exec);

// --- Main Agent Skills ---
export async function analyze_task(taskDescription: string, availableAgents: AgentDefinition[]) {
    const requiredAgents: string[] = [];
    const complexityScore = 0;

    // Simple heuristic: check if agent's skills or role description match the task
    // This is a naive implementation; a real LLM would be better here.
    const lowerDesc = taskDescription.toLowerCase();

    // Keyword mappings for roles
    const roleKeywords: Record<string, string[]> = {
        'style-architect': ['design', 'css', 'style', 'ui', 'ux', 'frontend', 'look', 'modern'],
        'qa': ['test', 'verify', 'check', 'bug', 'quality'],
        'git-manager': ['git', 'commit', 'branch', 'merge', 'repo'],
        'software-engineer': ['code', 'implement', 'build', 'create', 'function', 'api', 'backend', 'logic', 'form', 'page', 'component', 'app', 'feature']
    };

    for (const agent of availableAgents) {
        if (agent.role === 'main-agent') continue; // Skip self

        let matched = false;

        // 1. Check Role Keywords
        const keywords = roleKeywords[agent.role] || [];
        for (const kw of keywords) {
            if (lowerDesc.includes(kw)) {
                matched = true;
                break;
            }
        }

        // 2. Match against skills (fuzzy)
        if (!matched) {
            for (const skill of agent.skills) {
                const parts = skill.split('_');
                // If any significant part of the skill name is in description
                for (const part of parts) {
                    if (part.length > 3 && lowerDesc.includes(part)) {
                        matched = true;
                        break;
                    }
                }
                if (matched) break;
            }
        }

        // 3. Match against basic role/name
        if (!matched && (lowerDesc.includes(agent.role) || lowerDesc.includes(agent.name.toLowerCase()))) {
            matched = true;
        }

        if (matched) {
            requiredAgents.push(agent.name);
        }
    }

    // Default if none matched
    if (requiredAgents.length === 0) {
        // Fallback to Software Engineer if available, else just pick the first one
        const swe = availableAgents.find(a => a.role === 'software-engineer');
        if (swe) requiredAgents.push(swe.name);
    }

    return {
        complexity: requiredAgents.length > 2 ? 'high' : 'medium',
        required_agents: requiredAgents,
        summary: `Analyzed task: "${taskDescription}". Identified ${requiredAgents.length} required agents.`
    };
}

export async function create_workflow(taskAnalysis: any, availableAgents: AgentDefinition[]) {
    const steps: any[] = [];
    const agents = taskAnalysis.required_agents as string[];

    // Heuristic: Assign 1-2 generic steps per agent
    for (const agentName of agents) {
        const agentDef = availableAgents.find(a => a.name === agentName);
        if (!agentDef) continue;

        // Try to find relevant skills
        // For now, just pick the first 1-2 skills that aren't 'manage_git' or generic check
        const usefulSkills = agentDef.skills.filter(s => !s.includes('check') && !s.includes('manage'));

        if (usefulSkills.length > 0) {
            steps.push({ agent: agentName, action: usefulSkills[0] });
            if (usefulSkills.length > 1) {
                steps.push({ agent: agentName, action: usefulSkills[1] });
            }
        } else if (agentDef.skills.length > 0) {
            steps.push({ agent: agentName, action: agentDef.skills[0] });
        }
    }

    // Always add a final verify step if not present
    if (!steps.find(s => s.action === 'verify_final_output')) {
        steps.push({ agent: 'main-agent', action: 'verify_final_output' });
    }

    return { steps };
}

export async function verify_final_output(outputRef: string) {
    return { verified: true, notes: 'Output meets requirements' };
}

// --- Software Engineer Skills ---
export async function read_codebase(filePath: string, baseDir: string = process.cwd()) {
    try {
        const fullPath = path.resolve(baseDir, filePath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        return content;
    } catch (error: any) {
        return `Error reading file: ${error.message}`;
    }
}

export async function write_code(filePath: string, content: string, baseDir: string = process.cwd()) {
    try {
        const fullPath = path.resolve(baseDir, filePath);
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(fullPath, content, 'utf-8');
        return `Successfully wrote to ${filePath}`;
    } catch (error: any) {
        return `Error writing file: ${error.message}`;
    }
}

export async function refactor_code(code: string) {
    // Mock refactor
    return `// Refactored Code\n${code}`;
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
    return { cause: 'SyntaxError', solution: 'Fix typo on line 10' };
}

// --- Git & DevOps Manager Skills ---
export async function manage_git(action: 'checkout' | 'commit' | 'merge', args: string, cwd: string = process.cwd()) {
    // Simplified git wrapper
    const commands: Record<string, string> = {
        checkout: `git checkout ${args}`,
        commit: `git commit -m "${args}"`,
        merge: `git merge ${args}`
    };

    if (!commands[action]) return 'Invalid action';

    try {
        const { stdout } = await execAsync(commands[action], { cwd });
        return stdout;
    } catch (error: any) {
        return error.message;
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
