import { AgentDefinition, AgentLoader } from '@/lib/agent-loader';
import * as llm from '@/lib/llm';

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
        
        const skillsBrief = AgentLoader.listSkillsBrief();
        const skillsInfo = skillsBrief.map(s => `- ${s.name}: ${s.description}`).join('\n');

        // Load specific instructions and schema from SKILL.md
        const skillDef = AgentLoader.loadSkill('analyze_task');

        const systemPrompt = `${skillDef.instructions}

${codebaseContext ? `Current Codebase Context:\n${codebaseContext}\n` : ''}

Available Agents:
${agentsList}

Available Skills (for agents to use):
${skillsInfo}
`;

        // Extract schema from SKILL.md (assuming it's under ## Schema)
        const schema = AgentLoader.extractSection(skillDef.instructions, 'Schema') || `{
    "complexity": "low" | "medium" | "high",
    "required_agents": ["agent-role-slug"],
    "summary": "Brief analysis of the task"
}`;

        const analysis = await llm.generateJSONStream(systemPrompt, taskDescription, schema, emitter);
        return analysis;

    } catch (e) {
        console.error('LLM Analysis Failed, falling back to heuristic', e);
        return {
            complexity: 'medium',
            required_agents: ['software-engineer'],
            summary: 'Fallback analysis due to LLM error.'
        };
    }
}
