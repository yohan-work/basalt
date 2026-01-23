
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
import * as llm from '@/lib/llm';
import { AgentLoader, AgentDefinition } from '../agent-loader';
import { ContextManager } from '../context-manager';

interface AgentTask {
    id: string; // Supabase UUID
    description: string;
    status: 'pending' | 'planning' | 'working' | 'testing' | 'review' | 'done';
    metadata?: any; // JSONB for storing plan, workflow, results
}

export class Orchestrator {
    private taskId: string;
    private mainAgentDef: AgentDefinition;
    private contextManager: ContextManager;

    constructor(taskId: string) {
        this.taskId = taskId;
        this.mainAgentDef = AgentLoader.loadAgent('main-agent');
        this.contextManager = new ContextManager(taskId);
    }

    private async log(agentName: string, message: string, metadata: any = {}) {
        console.log(`[${agentName}] ${message}`, metadata);
        try {
            await supabase.from('Execution_Logs').insert({
                task_id: this.taskId,
                agent_role: agentName,
                message: message,
                metadata: metadata,
                created_at: new Date().toISOString()
            });
        } catch (e) {
            console.error('Supabase Log Error:', e);
        }
    }

    private async updateStatus(status: AgentTask['status']) {
        try {
            await supabase.from('Tasks').update({ status }).eq('id', this.taskId);
        } catch (e) {
            console.error('Supabase Status Update Error:', e);
        }
    }

    private async updateMetadata(data: any) {
        try {
            // Fetch current metadata first to merge? Or just upsert?
            // Since we don't have existing metadata in memory, let's just fetch and merge or just update top level keys
            // Simplify: We assume 'data' is the partial update
            const { data: current } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
            const newMetadata = { ...(current?.metadata || {}), ...data };

            await supabase.from('Tasks').update({ metadata: newMetadata }).eq('id', this.taskId);
        } catch (e) {
            console.error('Supabase Metadata Update Error:', e);
        }
    }

    private async getTask(): Promise<AgentTask | null> {
        const { data, error } = await supabase.from('Tasks').select('*').eq('id', this.taskId).single();
        if (error || !data) return null;
        return data as AgentTask;
    }

    private getSkillFunction(skillName: string) {
        return (skills as any)[skillName];
    }

    // --- Phase 1: Planning ---
    public async plan(taskDescription: string) {
        const mainAgentName = this.mainAgentDef.name;
        await this.log(mainAgentName, `Initialized Planning Phase.`);
        await this.updateStatus('planning');

        // Load all available agents to determine who can do the task
        const availableAgents = AgentLoader.listAgents();
        await this.log(mainAgentName, `Loaded ${availableAgents.length} potential agents.`);

        // Analyze
        const analysis = await skills.analyze_task(taskDescription, availableAgents);
        await this.log(mainAgentName, 'Task Analysis Completed', analysis);

        // Create Workflow
        const workflow = await skills.create_workflow(analysis, availableAgents);
        await this.log(mainAgentName, 'Workflow Created', workflow);

        // Save Plan to Metadata
        await this.updateMetadata({ analysis, workflow });

        // Wait for user confirmation
        await this.log(mainAgentName, 'Plan created. Waiting for user approval.');
    }

    // --- Phase 2: Execution ---
    private async generateSkillArguments(
        skillName: string,
        taskDescription: string,
        projectPath: string,
        techStack: string
        // contextData removed, using contextManager
    ): Promise<any[]> {
        const skillDef = AgentLoader.loadSkill(skillName);
        const inputsDef = skillDef.inputs ? `\nInputs Definition:\n${skillDef.inputs}` : '';

        // Get Optimized Context
        const dynamicContext = this.contextManager.getOptimizedContext(6000);

        const systemPrompt = `
You are an intelligent agent orchestrator.
Your goal is to generate the exact arguments needed to call a TypeScript function for a specific skill.

Skill Name: ${skillName}
Skill Instructions: ${skillDef.instructions}
${inputsDef}

Context:
- Task: ${taskDescription}
- Project Path: ${projectPath}
- Tech Stack: ${techStack}

${dynamicContext}

Return ONLY a JSON object with a key "arguments" which is an array of values to pass to the function.
Example: { "arguments": ["someValue", "anotherValue"] }
Do not return markdown.
`;

        try {
            const response = await llm.generateJSON(
                systemPrompt,
                "Generate valid arguments for this skill based on the task.",
                '{ "arguments": [] }'
            );
            return response.arguments || [];
        } catch (e) {
            console.error(`Failed to generate arguments for ${skillName}`, e);
            return [];
        }
    }

    public async execute() {
        const task = await this.getTask();
        if (!task || !task.metadata?.workflow) {
            await this.log('System', 'No workflow found in metadata. Please run planning first.');
            return;
        }

        // Fetch Project Path if available
        let projectPath = process.cwd();
        if ((task as any).project_id) {
            const { data: project } = await supabase.from('Projects').select('path').eq('id', (task as any).project_id).single();
            if (project?.path) {
                projectPath = project.path;
                this.log('System', `Using Project Path: ${projectPath}`);
            }
        }

        const workflow = task.metadata.workflow;
        await this.updateStatus('working');
        const mainAgentName = this.mainAgentDef.name;

        // 1. Scan Project Context and Tech Stack
        // (Simplified for now, in reality we might want a 'ProjectAnalyst' agent to do this)
        const dirList = await skills.list_directory('.', projectPath);
        const isNode = Array.isArray(dirList) && dirList.some((f: string) => f.includes('package.json'));
        let techStack = 'static-html';

        if (isNode) {
            try {
                const pkgJson = await skills.read_codebase('package.json', projectPath);
                // Add package.json to context so the agent knows about dependencies (tailwind, shadcn, etc.)
                this.contextManager.addFile('package.json', pkgJson);

                if (pkgJson.includes('next')) techStack = 'nextjs';
                else if (pkgJson.includes('react')) techStack = 'react';
                else techStack = 'node-generic';
            } catch (e) { /* ignore */ }
        }
        await this.log(mainAgentName, `Detected Tech Stack: ${techStack}`);

        // Initial Scan
        try {
            const dirList = await skills.list_directory('.', projectPath);
            this.contextManager.addLog('System', `Initial Directory Scan: ${JSON.stringify(dirList?.slice(0, 5))}...`);
        } catch (e) { }

        for (const step of workflow.steps) {
            const { agent, action } = step;
            const agentRoleSlug = agent.toLowerCase().replace(/\s+/g, '-');

            try {
                const stepAgentDef = AgentLoader.loadAgent(agentRoleSlug);
                const skillFunc = this.getSkillFunction(action);

                if (skillFunc) {
                    // THOUGHT: Agent is thinking about arguments
                    await this.log(mainAgentName, `Generative Logic: Determining arguments for ${action}...`, { type: 'THOUGHT' });

                    // Generate Arguments with Context Manager
                    let args = await this.generateSkillArguments(action, task.description, projectPath, techStack);

                    // Safety Injection (Project Path)
                    const filesystemSkills = ['read_codebase', 'write_code', 'run_shell_command', 'manage_git', 'list_directory'];
                    if (filesystemSkills.includes(action)) {
                        if (args.length === 0 || args[args.length - 1] !== projectPath) {
                            args.push(projectPath);
                        }
                    }

                    // ACTION: Agent is about to execute
                    await this.log(stepAgentDef.name, `Executing ${action}`, { args, type: 'ACTION' });

                    // --- EXECUTE ---
                    const result = await skillFunc(...args);

                    // --- CAPTURE CONTEXT ---
                    // If read_codebase, store content
                    if (action === 'read_codebase' && typeof result === 'string') {
                        const filePath = args[0]; // Convention: first arg is file path
                        this.contextManager.addFile(filePath, result);
                        this.log('System', `Captured file content for ${filePath} into memory.`, { type: 'System' });
                    }
                    else if (action === 'read_codebase' && typeof result === 'object' && result.content) {
                        // Some skills might return object
                        const filePath = args[0];
                        this.contextManager.addFile(filePath, result.content);
                    }

                    this.contextManager.addLog(stepAgentDef.name, `Executed ${action}. Result summary: ${JSON.stringify(result).slice(0, 200)}...`);

                    // RESULT: Execution finished
                    await this.log(stepAgentDef.name, `Executed ${action}`, { result, type: 'RESULT' });
                } else {
                    await this.log(mainAgentName, `Runtime function for skill ${action} not found.`, { type: 'ERROR' });
                }

            } catch (err: any) {
                await this.log(mainAgentName, `Failed to load or execute agent ${agentRoleSlug}: ${err.message}`, { type: 'ERROR' });
                this.contextManager.addLog('System', `Error executing ${action}: ${err.message}`);
            }
        }

        await this.updateStatus('testing');
        await this.log(mainAgentName, 'Workflow Execution Completed. Task moved to Testing phase.');
    }

    // --- Phase 3: Verification ---
    public async verify() {
        const mainAgentName = this.mainAgentDef.name;
        await this.updateStatus('testing');

        // Fetch Project Path
        let projectPath = process.cwd();
        const task = await this.getTask();
        if (task && (task as any).project_id) {
            const { data: project } = await supabase.from('Projects').select('path').eq('id', (task as any).project_id).single();
            if (project?.path) {
                projectPath = project.path;
                this.log('System', `Using Project Path for Verification: ${projectPath}`);
            }
        }

        const verification = await skills.verify_final_output('output_ref');
        await this.log(mainAgentName, 'Final Verification', verification);
        await this.updateMetadata({ verification });

        if (verification.verified) {
            await this.log(mainAgentName, 'Verification Successful. Starting Git Automation...');

            const branchName = `feature/task-${this.taskId.slice(0, 8)}`;
            const commitMsg = `feat: Task ${this.taskId.slice(0, 8)} implementation`;

            try {
                await skills.manage_git('checkout', `-b ${branchName}`, projectPath);
                await skills.manage_git('add', '.', projectPath);
                await skills.manage_git('commit', commitMsg, projectPath);
                await skills.manage_git('push', `origin ${branchName}`, projectPath);
                // specific CLI flags
                await skills.manage_git('create_pr', `--fill --title "${commitMsg}" --body "Automated PR for task ${this.taskId}"`, projectPath);

                await this.log(mainAgentName, 'Git Automation Completed (Branch, Commit, Push, PR).');

            } catch (gitError: any) {
                await this.log(mainAgentName, `Git Automation Warning: ${gitError.message}`);
            }

            await this.updateStatus('review');
            await this.log(mainAgentName, 'Task moved to Review');
        }
    }
}
