import { AgentDefinition, AgentLoader } from '@/lib/agent-loader';
import * as llm from '@/lib/llm';
import { MODEL_CONFIG } from '@/lib/model-config';

export async function consult_agents(
    taskAnalysis: any,
    availableAgents: AgentDefinition[],
    codebaseContext: string,
    emitter: any = null,
    pastThoughts: any[] = []
) {
    try {
        const requiredAgents = taskAnalysis.required_agents || [];
        const CORE_UI_AGENTS = ['product-manager', 'main-agent', 'software-engineer', 'style-architect'];
        const activeRoles = Array.from(new Set([...requiredAgents, ...CORE_UI_AGENTS]));
        const agents = availableAgents.filter(a => activeRoles.includes(a.role));
        const agentsList = agents.map(a => `- ${a.name} (Role: ${a.role}, Expertise: ${a.skills.join(', ')})`).join('\n');

        const contextDiscussion = pastThoughts.length > 0
            ? `Previous Discussion History:\n${pastThoughts.map(t => `[${t.agent_role || t.agent}] ${t.message || t.thought}`).join('\n')}\n`
            : '';

        // Detect targeted agent from the last user message
        const lastUserThought = pastThoughts.filter(t => t.agent_role === 'user').pop();
        const lastUserMessage = lastUserThought ? (lastUserThought.message || lastUserThought.thought || '') : '';

        let targetedAgentRole = null;
        const msgLower = lastUserMessage.toLowerCase();
        if (msgLower.includes('디자이너') || msgLower.includes('스타일') || msgLower.includes('디자인')) {
            targetedAgentRole = 'style-architect';
        } else if (msgLower.includes('엔지니어') || msgLower.includes('개발') || msgLower.includes('프론트') || msgLower.includes('백엔드')) {
            targetedAgentRole = 'software-engineer';
        } else if (msgLower.includes('pm') || msgLower.includes('기획') || msgLower.includes('피엠')) {
            targetedAgentRole = 'product-manager';
        } else if (msgLower.includes('리드') || msgLower.includes('팀장') || msgLower.includes('메인')) {
            targetedAgentRole = 'main-agent';
        }

        const targetedRule = targetedAgentRole
            ? `\n\nCRITICAL DIRECTIVE: The user has explicitly addressed the ${targetedAgentRole}. You MUST ONLY generate exactly ONE thought, and its "agent" field MUST BE "${targetedAgentRole}". DO NOT generate thoughts for any other agent.`
            : '';

        const skillDef = AgentLoader.loadSkill('consult_agents');

        const systemPrompt = `${skillDef.instructions}
${pastThoughts.length > 0 ? 'Continue the existing discussion based on the history provided.' : ''}

Available Agents in this discussion (USE THESE EXACT ROLES):
${agentsList}

Current Codebase Context:
${codebaseContext}

Task Analysis:
${JSON.stringify(taskAnalysis)}
${contextDiscussion}${targetedRule}
`;

        const schema = AgentLoader.extractSection(skillDef.instructions, 'Schema') || `{ "thoughts": [ { "agent": "role", "thought": "...", "type": "idea" } ] }`;

        const response = await llm.generateJSONStream(
            systemPrompt,
            "에이전트들이 작업에 대해 심도 있는 논의를 진행합니다.",
            schema,
            emitter,
            MODEL_CONFIG.SMART_MODEL
        );

        const thoughts = Array.isArray(response) ? response : (response.thoughts || []);
        console.log(`[Consultation] Generated ${thoughts.length} thoughts`);
        return thoughts;
    } catch (e) {
        console.error('Consultation failed:', e);
        return [];
    }
}
