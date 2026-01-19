
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
import * as llm from '@/lib/llm';
import { AgentLoader, AgentDefinition } from '../agent-loader';

interface AgentTask {
    id: string; // Supabase UUID
    description: string;
    status: 'pending' | 'planning' | 'working' | 'testing' | 'review' | 'done';
    metadata?: any; // JSONB for storing plan, workflow, results
}

export class Orchestrator {
    private taskId: string;
    private mainAgentDef: AgentDefinition;

    constructor(taskId: string) {
        this.taskId = taskId;
        this.mainAgentDef = AgentLoader.loadAgent('main-agent');
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

        // 1. Scan Project Context
        const dirList = await skills.list_directory('.', projectPath);
        const isNode = Array.isArray(dirList) && dirList.some((f: string) => f.includes('package.json'));
        let techStack = 'static-html';

        if (isNode) {
            try {
                const pkgJson = await skills.read_codebase('package.json', projectPath);
                if (pkgJson.includes('next')) techStack = 'nextjs';
                else if (pkgJson.includes('react')) techStack = 'react';
                else techStack = 'node-generic';
            } catch (e) {
                // ignore
            }
        }
        await this.log(mainAgentName, `Detected Tech Stack: ${techStack}`);

        for (const step of workflow.steps) {
            const { agent, action } = step;
            const agentRoleSlug = agent.toLowerCase().replace(/\s+/g, '-');

            try {
                const stepAgentDef = AgentLoader.loadAgent(agentRoleSlug);
                const skillFunc = this.getSkillFunction(action);

                if (skillFunc) {
                    let args: any[] = [];

                    // --- INTELLIGENT ARGUMENT INJECTION (Rules Engine) ---
                    // In a real system, an LLM would generate these arguments.
                    // Here we use a rule-based template engine.

                    if (action === 'read_codebase') {
                        // Default to sensing key files
                        args.push(techStack === 'nextjs' ? 'app/page.tsx' : 'index.html');
                    }
                    else if (action === 'write_code') {
                        // DETECT INTENT & CALL LLM
                        const taskDesc = task.description;

                        // Construct Context String
                        const context = `
                        Project Path: ${projectPath}
                        Tech Stack: ${techStack}
                        Detected Files: ${JSON.stringify(dirList.slice(0, 10))} ...
                        `;

                        await this.log(mainAgentName, 'Requesting AI Generation...', { prompt: taskDesc });

                        try {
                            const aiResponse = await llm.generateCode(taskDesc, context);

                            if (aiResponse.files.length > 0) {
                                // For simplicity, we just take the first file logic for now
                                // In reality, we might loop or write multiple
                                const file = aiResponse.files[0];
                                args.push(file.path);
                                args.push(file.content);
                                await this.log(mainAgentName, `AI Generated File: ${file.path}`);
                            } else {
                                // Fallback
                                args.push('ai_output.txt');
                                args.push(aiResponse.content || 'AI could not generate code.');
                            }
                        } catch (genError: any) {
                            args.push('error.txt');
                            args.push(`Generation Error: ${genError.message}`);
                        }
                    }
                    else if (action === 'apply_design_system') args.push('LoginComponent');
                    else if (action === 'run_shell_command') args.push('ls -la');
                    else if (action === 'manage_git') args.push('status', '');
                    else if (action === 'list_directory') args.push('.'); // Default

                    // Inject projectPath as the last argument for filesystem skills
                    if (['read_codebase', 'write_code', 'run_shell_command', 'manage_git', 'list_directory'].includes(action)) {
                        args.push(projectPath);
                    }

                    const result = await skillFunc(...args);
                    await this.log(stepAgentDef.name, `Executed ${action}`, { result });
                } else {
                    await this.log(mainAgentName, `Runtime function for skill ${action} not found.`);
                }

            } catch (err: any) {
                await this.log(mainAgentName, `Failed to load or execute agent ${agentRoleSlug}: ${err.message}`);
            }
        }

        // Transition to testing (verification) instead of review
        await this.updateStatus('testing');
        await this.log(mainAgentName, 'Workflow Execution Completed. Task moved to Testing phase. Waiting for verification.');
    }

    // --- Phase 3: Verification ---
    public async verify() {
        const mainAgentName = this.mainAgentDef.name;
        await this.updateStatus('testing');

        const verification = await skills.verify_final_output('output_ref');
        await this.log(mainAgentName, 'Final Verification', verification);
        await this.updateMetadata({ verification });

        if (verification.verified) {
            await this.log(mainAgentName, 'Verification Successful. Starting Git Automation...');

            // Git Automation
            const branchName = `feature/task-${this.taskId.slice(0, 8)}`;
            const commitMsg = `feat: Task ${this.taskId.slice(0, 8)} implementation`;

            try {
                // 1. Create Branch
                // We try to checkout -b. If it fails (exists), we might want to just checkout.
                // For simplicity in this iteration, we try -b.
                await skills.manage_git('checkout', `-b ${branchName}`);

                // 2. Add
                await skills.manage_git('add', '.');

                // 3. Commit
                await skills.manage_git('commit', commitMsg);

                // 4. Push
                await skills.manage_git('push', `origin ${branchName}`);

                // 5. PR
                // specific CLI flags might depend on user config, strictly following "pr생성"
                await skills.manage_git('create_pr', `--fill --title "${commitMsg}" --body "Automated PR for task ${this.taskId}"`);

                await this.log(mainAgentName, 'Git Automation Completed (Branch, Commit, Push, PR).');

            } catch (gitError: any) {
                await this.log(mainAgentName, `Git Automation Warning: ${gitError.message}`);
            }

            await this.updateStatus('review');
            await this.log(mainAgentName, 'Task moved to Review');
        }
    }
}
