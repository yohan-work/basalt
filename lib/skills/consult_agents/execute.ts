import { AgentDefinition, AgentLoader } from '@/lib/agent-loader';
import { pickConsultParticipantRoles, resolveTargetedConsultRole } from '@/lib/agent-roster-heuristics';
import * as llm from '@/lib/llm';
import { MODEL_CONFIG } from '@/lib/model-config';

export type ConsultAgentsOptions = {
    /** Merged into keyword heuristics (e.g. raw task description). */
    extraHintText?: string;
};

type ConsultThought = {
    agent: string;
    thought: string;
    type?: string;
};

function stripCodeFences(text: string): string {
    const trimmed = String(text || '').trim();
    if (!trimmed.startsWith('```')) return trimmed;
    return trimmed
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

function normalizeRoleName(value: string): string {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-');
}

function parsePipeDelimitedThought(line: string): ConsultThought | null {
    const normalized = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
    const parts = normalized.split('|').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 3) return null;

    const agentToken = parts[0].replace(/^agent\s*[:=]\s*/i, '');
    const typeToken = parts[1].replace(/^type\s*[:=]\s*/i, '');
    const thoughtToken = parts.slice(2).join(' | ').replace(/^thought\s*[:=]\s*/i, '').trim();
    const agent = normalizeRoleName(agentToken);
    const type = typeToken.toLowerCase();
    const thought = thoughtToken;
    if (!agent || !thought) return null;
    return { agent, type, thought };
}

function parseLabelledThought(line: string): ConsultThought | null {
    const cleaned = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
    const agentMatch = cleaned.match(/\bagent\s*[:=]\s*([a-z0-9_-]+)/i);
    const typeMatch = cleaned.match(/\btype\s*[:=]\s*(idea|critique|agreement)\b/i);
    const thoughtMatch = cleaned.match(/\bthought\s*[:=]\s*(.+)$/i);
    if (!agentMatch || !thoughtMatch) return null;

    const agent = normalizeRoleName(agentMatch[1]);
    const type = typeMatch?.[1]?.toLowerCase() || 'idea';
    const thought = thoughtMatch[1].trim();
    if (!agent || !thought) return null;
    return { agent, type, thought };
}

export function parseThoughtsFromRawText(rawText: string): ConsultThought[] {
    const cleaned = stripCodeFences(rawText);
    const lines = cleaned
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const thoughts: ConsultThought[] = [];
    for (const line of lines) {
        const parsed = parsePipeDelimitedThought(line) || parseLabelledThought(line);
        if (parsed) {
            thoughts.push(parsed);
        }
    }

    return thoughts.filter((item) => item.agent && item.thought);
}

function synthesizeFallbackThoughts(
    taskAnalysis: any,
    participantRoles: string[],
    availableAgents: AgentDefinition[]
): ConsultThought[] {
    const analysisSummary = typeof taskAnalysis?.summary === 'string' && taskAnalysis.summary.trim()
        ? taskAnalysis.summary.trim()
        : '작업 요약을 확인할 수 없습니다.';
    const roleSet = new Set(participantRoles);
    const hasRole = (role: string) => roleSet.has(role);
    const thoughts: ConsultThought[] = [];

    if (hasRole('product-manager')) {
        thoughts.push({
            agent: 'product-manager',
            thought: `요구사항 관점에서 이 작업은 "${analysisSummary}"로 보입니다. 수용 기준이 더 분명해야 하고, 성공 조건과 제외 범위를 먼저 고정해야 합니다.`,
            type: 'critique',
        });
    }
    if (hasRole('software-engineer')) {
        thoughts.push({
            agent: 'software-engineer',
            thought: '구현 관점에서는 가장 단순한 경로를 우선해야 합니다. 새 추상화나 과한 분리는 나중에 검증된 뒤에만 도입하는 편이 안전합니다.',
            type: 'idea',
        });
    }
    if (hasRole('qa')) {
        thoughts.push({
            agent: 'qa',
            thought: '검증 관점에서는 실패 케이스와 경계값이 빠지기 쉽습니다. 핵심 흐름뿐 아니라 롤백, 빈 데이터, 잘못된 입력을 포함한 테스트가 필요합니다.',
            type: 'critique',
        });
    }
    if (hasRole('style-architect')) {
        thoughts.push({
            agent: 'style-architect',
            thought: 'UI 작업이라면 시각적 일관성과 컴포넌트 재사용성을 먼저 점검해야 합니다. 레이아웃 패턴이 기존 저장소의 규칙과 충돌하지 않는지도 확인이 필요합니다.',
            type: 'critique',
        });
    }

    if (thoughts.length === 0) {
        const fallbackAgent = availableAgents.find((agent) => agent.role === participantRoles[0]) || availableAgents[0];
        thoughts.push({
            agent: fallbackAgent?.role || 'main-agent',
            thought: '모델 응답이 불안정합니다. 우선 계획을 단순화하고, 검증 단계를 분리한 뒤 다시 실행하는 것이 안전합니다.',
            type: 'critique',
        });
    }

    return thoughts;
}

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
        const lineFormatDirective = targetedAgentRole
            ? `\n\n출력 규칙:\n- 딱 1줄만 출력한다.\n- 형식: ${targetedAgentRole} | critique | 한 문장 피드백\n- 다른 설명, 코드펜스, JSON, 목록을 쓰지 않는다.`
            : `\n\n출력 규칙:\n- 1~3줄만 출력한다.\n- 각 줄은 정확히 다음 형식을 사용한다: role-slug | idea|critique|agreement | 한 문장 의견\n- role-slug는 available agents의 정확한 role slug여야 한다.\n- 다른 설명, 코드펜스, JSON, 목록을 쓰지 않는다.\n- 한 줄에 하나의 생각만 쓰고, 줄바꿈은 사용하지 않는다.`;

        const systemPrompt = `${skillDef.instructions}
${pastThoughts.length > 0 ? 'Continue the existing discussion based on the history provided.' : ''}

Available Agents in this discussion (USE THESE EXACT ROLES):
${agentsList}

Current Codebase Context:
${codebaseContext}

Task Analysis:
${JSON.stringify(taskAnalysis)}
${contextDiscussion}${targetedRule}${lineFormatDirective}
`;

        const responseText = await llm.generateText(
            systemPrompt,
            `에이전트들이 작업에 대해 심도 있는 논의를 진행합니다. 참여 가능한 에이전트는 ${participantRoles.join(', ')} 입니다.`,
            MODEL_CONFIG.SMART_MODEL,
            emitter
        );

        const parsedThoughts = parseThoughtsFromRawText(responseText);
        const normalizedThoughts = parsedThoughts
            .filter((item: any) => item && typeof item.agent === 'string' && typeof item.thought === 'string')
            .map((item: any) => ({
                agent: normalizeRoleName(item.agent),
                thought: String(item.thought).replace(/\s+/g, ' ').trim(),
                type: ['idea', 'critique', 'agreement'].includes(String(item.type).toLowerCase())
                    ? String(item.type).toLowerCase()
                    : 'idea',
            }));

        if (normalizedThoughts.length > 0) {
            console.log(`[Consultation] Generated ${normalizedThoughts.length} thoughts`);
            return normalizedThoughts;
        }

        if (responseText.trim().length > 0) {
            const recoveredThoughts = synthesizeFallbackThoughts(taskAnalysis, participantRoles, availableAgents);
            console.warn(`[Consultation] Falling back to synthesized thoughts after unparsable response.`);
            return recoveredThoughts;
        }

        const fallbackThoughts = synthesizeFallbackThoughts(taskAnalysis, participantRoles, availableAgents);
        console.warn(`[Consultation] Falling back to synthesized thoughts (${fallbackThoughts.length}).`);
        return fallbackThoughts;
    } catch (e) {
        console.error('Consultation failed:', e);
        const participantRoles = pickConsultParticipantRoles(taskAnalysis, availableAgents, {
            extraHintText: consultOptions?.extraHintText,
        });
        return synthesizeFallbackThoughts(taskAnalysis, participantRoles, availableAgents);
    }
}
