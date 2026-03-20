import { AgentDefinition, AgentLoader } from '@/lib/agent-loader';
import { pickConsultParticipantRoles, resolveTargetedConsultRole } from '@/lib/agent-roster-heuristics';
import * as llm from '@/lib/llm';
import { MODEL_CONFIG } from '@/lib/model-config';

export type ConsultAgentsOptions = {
    /** Merged into keyword heuristics (e.g. raw task description). */
    extraHintText?: string;
};

export async function consult_agents(
    taskAnalysis: any,
    availableAgents: AgentDefinition[],
    codebaseContext: string,
    emitter: any = null,
    pastThoughts: any[] = [],
    consultOptions?: ConsultAgentsOptions
) {
    try {
        const participantRoles = pickConsultParticipantRoles(taskAnalysis, availableAgents, {
            extraHintText: consultOptions?.extraHintText,
        });
        const agents = availableAgents.filter((a) => participantRoles.includes(a.role));
        const agentsList = agents.map(a => `- ${a.name} (Role: ${a.role}, Expertise: ${a.skills.join(', ')})`).join('\n');
        console.log(`[Consultation] participants (${agents.length}): ${participantRoles.join(', ')}`);

        const contextDiscussion = pastThoughts.length > 0
            ? `Previous Discussion History:\n${pastThoughts.map(t => `[${t.agent_role || t.agent}] ${t.message || t.thought}`).join('\n')}\n`
            : '';

        // Detect targeted agent from the last user message
        const lastUserThought = pastThoughts.filter(t => t.agent_role === 'user').pop();
        const lastUserMessage = lastUserThought ? (lastUserThought.message || lastUserThought.thought || '') : '';

        let targetedAgentRole = resolveTargetedConsultRole(lastUserMessage);
        if (targetedAgentRole && !participantRoles.includes(targetedAgentRole)) {
            targetedAgentRole = null;
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
