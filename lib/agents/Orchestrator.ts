
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
import { AgentLoader, AgentDefinition } from '../agent-loader';

interface AgentTask {
    id: string; // Supabase UUID
    description: string;
    status: 'pending' | 'planning' | 'working' | 'testing' | 'review' | 'done';
}

export class Orchestrator {
    private taskId: string;
    private mainAgentDef: AgentDefinition;

    constructor(taskId: string) {
        this.taskId = taskId;
        // Load the Main Agent configuration on init
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

    /**
     * Resolves the runtime function for a skill name.
     */
    private getSkillFunction(skillName: string) {
        return (skills as any)[skillName];
    }

    public async run(taskDescription: string) {
        // 1. Initialization
        const mainAgentName = this.mainAgentDef.name; // "main-agent"
        await this.log(mainAgentName, `Initialized. System Prompt loaded from AGENT.md.`);
        await this.log(mainAgentName, `Starting analysis for task: ${taskDescription}`);

        await this.updateStatus('planning');

        // 2. Planning (Using Main Agent Skills)

        const analysis = await skills.analyze_task(taskDescription);
        await this.log(mainAgentName, 'Task Analysis Completed', analysis);

        const workflow = await skills.create_workflow(analysis);
        await this.log(mainAgentName, 'Workflow Created', workflow);

        await this.updateStatus('working');

        // 3. Execution Loop
        for (const step of workflow.steps) {
            const { agent, action } = step;
            // 'agent' from workflow might be "Software Engineer". We need to map to "software-engineer" folder.
            const agentRoleSlug = agent.toLowerCase().replace(/\s+/g, '-');

            try {
                // Dynamically load the agent to ensure it exists and we know its persona
                const stepAgentDef = AgentLoader.loadAgent(agentRoleSlug);
                await this.log(mainAgentName, `Delegating to ${stepAgentDef.name}: ${action}`);

                // Check if this agent actually has this skill in its config
                // NOTE: We assume the extracted skills match the action name exactly
                if (!stepAgentDef.skills.includes(action)) {
                    await this.log(mainAgentName, `WARNING: Agent ${stepAgentDef.name} does not have skill '${action}' listed in AGENT.md`);
                }

                // Load Skill Definition for context 
                const skillDef = AgentLoader.loadSkill(action);

                // Execute Runtime Logic
                const skillFunc = this.getSkillFunction(action);

                if (skillFunc) {
                    // Mocking args (same as before)
                    let args: any = '';
                    if (action === 'read_codebase') args = './app/page.tsx';
                    else if (action === 'write_code') args = ['./app/example.tsx', '// Generated Code'];
                    else if (action === 'apply_design_system') args = 'ComponentX';
                    else if (action === 'run_shell_command') args = 'npm test';

                    let result;
                    if (Array.isArray(args)) {
                        result = await skillFunc(...args);
                    } else {
                        result = await skillFunc(args);
                    }
                    await this.log(stepAgentDef.name, `Executed ${action}`, { result });
                } else {
                    await this.log(mainAgentName, `Runtime function for skill ${action} not found.`);
                }

            } catch (err: any) {
                await this.log(mainAgentName, `Failed to load or execute agent ${agentRoleSlug}: ${err.message}`);
            }
        }

        // 4. Verification
        await this.updateStatus('testing');
        const verification = await skills.verify_final_output('output_ref');
        await this.log(mainAgentName, 'Final Verification', verification);

        if (verification.verified) {
            await this.updateStatus('review');
            await this.log(mainAgentName, 'Task moved to Review');
        }
    }
}
