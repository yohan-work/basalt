
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
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

        for (const step of workflow.steps) {
            const { agent, action } = step;
            const agentRoleSlug = agent.toLowerCase().replace(/\s+/g, '-');

            try {
                const stepAgentDef = AgentLoader.loadAgent(agentRoleSlug);
                await this.log(mainAgentName, `Delegating to ${stepAgentDef.name}: ${action}`);

                if (!stepAgentDef.skills.includes(action)) {
                    await this.log(mainAgentName, `WARNING: Agent ${stepAgentDef.name} misses skill '${action}'`);
                }

                const skillFunc = this.getSkillFunction(action);

                if (skillFunc) {
                    // Mocking args as per previous logic, but now supporting baseDir injection
                    // In a real system, args would come from the plan or previous steps

                    let args: any[] = [];
                    // Default generic args for demo purposes if not specified in step
                    if (action === 'read_codebase') args = ['./app/page.tsx'];
                    else if (action === 'write_code') args = ['./app/example.tsx', '// Generated Code'];
                    else if (action === 'apply_design_system') args = ['ComponentX'];
                    else if (action === 'run_shell_command') args = ['npm test'];
                    else if (action === 'manage_git') args = ['status', ''];

                    // Inject projectPath as the last argument for filesystem skills
                    // Skills signatures are updated to take (..., baseDir) or (..., cwd)
                    if (['read_codebase', 'write_code', 'run_shell_command', 'manage_git'].includes(action)) {
                        // Ensure we match the signature: 
                        // read_codebase(path, baseDir)
                        // write_code(path, content, baseDir)
                        // run_shell_command(cmd, cwd)
                        args.push(projectPath);
                    }

                    let result;
                    // Spread args into the function call
                    result = await skillFunc(...args);

                    await this.log(stepAgentDef.name, `Executed ${action}`, { result });
                } else {
                    await this.log(mainAgentName, `Runtime function for skill ${action} not found.`);
                }

            } catch (err: any) {
                await this.log(mainAgentName, `Failed to load or execute agent ${agentRoleSlug}: ${err.message}`);
            }
        }
    }

    // --- Phase 3: Verification ---
    public async verify() {
        const mainAgentName = this.mainAgentDef.name;
        await this.updateStatus('testing');

        const verification = await skills.verify_final_output('output_ref');
        await this.log(mainAgentName, 'Final Verification', verification);
        await this.updateMetadata({ verification });

        if (verification.verified) {
            await this.updateStatus('review');
            await this.log(mainAgentName, 'Task moved to Review');
        }
    }
}
