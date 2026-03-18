import { AgentDefinition, AgentLoader } from '@/lib/agent-loader';
import * as llm from '@/lib/llm';

function normalizeAgentKey(value: string): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .trim();
}

function resolveRequiredAgents(raw: any, availableAgents: AgentDefinition[]): string[] {
    const normalizedAgents = new Set<string>();
    const requested = Array.isArray(raw) ? raw : [];
    const availableByRole = new Map<string, AgentDefinition>();
    const availableByName = new Map<string, AgentDefinition>();

    for (const agent of availableAgents) {
        availableByRole.set(normalizeAgentKey(agent.role), agent);
        availableByName.set(normalizeAgentKey(agent.name), agent);
    }

    for (const candidate of requested) {
        if (typeof candidate !== 'string') continue;
        const normalized = normalizeAgentKey(candidate);
        const found = availableByRole.get(normalized) || availableByName.get(normalized);
        if (found) {
            normalizedAgents.add(normalizeAgentKey(found.role));
        }
    }

    const result = Array.from(normalizedAgents);
    if (result.length > 0) return result;

    const fallbackAgent = availableByRole.get('software-engineer')?.role || availableAgents[0]?.role || 'main-agent';
    return fallbackAgent ? [normalizeAgentKey(fallbackAgent)] : ['main-agent'];
}

function sanitizeAnalysis(raw: any, taskDescription: string, availableAgents: AgentDefinition[]) {
    const analysis = raw || {};
    const complexity = ['low', 'medium', 'high'].includes(analysis?.complexity) ? analysis.complexity : 'medium';
    const requiredAgents = resolveRequiredAgents(analysis?.required_agents || [], availableAgents);
    const summary =
        typeof analysis?.summary === 'string' && analysis.summary.trim().length > 0
            ? analysis.summary
            : `요청: ${taskDescription}`;

    return {
        ...analysis,
        complexity,
        required_agents: requiredAgents,
        summary,
    };
}

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
        return sanitizeAnalysis(analysis, taskDescription, agents);

    } catch (e) {
        console.error('LLM Analysis Failed, falling back to heuristic', e);
        const fallbackRequired = resolveRequiredAgents([], agents);
        return {
            complexity: 'medium',
            required_agents: fallbackRequired,
            summary: `Fallback analysis due to LLM error on task: ${taskDescription}`
        };
    }
}
