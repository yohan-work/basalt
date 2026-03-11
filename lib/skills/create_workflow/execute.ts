import { AgentDefinition, AgentLoader } from '@/lib/agent-loader';
import * as llm from '@/lib/llm';

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

        const skillsBrief = AgentLoader.listSkillsBrief();
        const skillsInfo = skillsBrief.map(s => `- ${s.name}: ${s.description}`).join('\n');

        const skillDef = AgentLoader.loadSkill('create_workflow');

        const systemPrompt = `${skillDef.instructions}

${codebaseContext ? `Current Codebase Context (Project Structure/Config):\n${codebaseContext}\n` : ''}

Supported Skills:
${skillsInfo}

Available Agents and their skills:
${agentsInfo}
`;

        const schema = AgentLoader.extractSection(skillDef.instructions, 'Schema') || `{
    "steps": [
        { "agent": "software-engineer", "action": "write_code", "description": "Implementing feature" }
    ]
}`;

        const workflow = await llm.generateJSONStream(systemPrompt, `Task Analysis: ${JSON.stringify(taskAnalysis)} `, schema, emitter);

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
