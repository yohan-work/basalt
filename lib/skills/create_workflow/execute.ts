import { AgentDefinition, AgentLoader } from '@/lib/agent-loader';
import * as llm from '@/lib/llm';

function normalizeAgentKey(value: string): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .trim();
}

function resolveAgentOrDefault(
    candidate: unknown,
    availableAgents: AgentDefinition[],
    fallback: string
): string {
    if (typeof candidate !== 'string' || !candidate.trim()) return fallback;
    const normalized = normalizeAgentKey(candidate);
    const match = availableAgents.find((agent) =>
        normalizeAgentKey(agent.role) === normalized || normalizeAgentKey(agent.name) === normalized
    );
    return match ? match.role : fallback;
}

function sanitizeWorkflow(workflow: any, analysis: any, availableAgents: AgentDefinition[]) {
    const fallbackAgent =
        availableAgents.find(agent => agent.role === 'main-agent')?.role
        || availableAgents.find(agent => agent.role === 'software-engineer')?.role
        || availableAgents[0]?.role
        || 'main-agent';

    const requiredAgentsRaw: string[] = Array.isArray(analysis?.required_agents)
        ? analysis.required_agents.map((candidate: any) => String(candidate).trim()).filter(Boolean)
        : [];
    const requiredSet = new Set<string>([
        'main-agent',
        ...requiredAgentsRaw
            .map((candidate) =>
                availableAgents.find(agent =>
                    normalizeAgentKey(agent.role) === normalizeAgentKey(String(candidate)) ||
                    normalizeAgentKey(agent.name) === normalizeAgentKey(String(candidate))
                )?.role || null
            )
                .filter((value: string | null): value is string => Boolean(value))
    ]);

    const sanitized: any = { ...(workflow || {}) };
    const repairs: string[] = [];
    const safeSteps = Array.isArray(sanitized.steps) ? sanitized.steps : [];
    const actionMap = new Map<string, string>();
    for (const skill of AgentLoader.listSkillsBrief()) {
        const normalizedAction = normalizeAgentKey(skill.name);
        actionMap.set(normalizedAction, skill.name);
    }
    // Ensure execute-critical defaults are available even if listSkillsBrief is empty
    for (const action of ['analyze_task', 'create_workflow', 'consult_agents', 'read_codebase', 'write_code', 'verify_final_output', 'run_shell_command', 'lint_code', 'typecheck']) {
        const normalizedAction = normalizeAgentKey(action);
        actionMap.set(normalizedAction, action);
    }

    const normalizedSteps: any[] = [];
    for (let i = 0; i < safeSteps.length; i++) {
        const step = safeSteps[i];
        if (!step || typeof step !== 'object') {
            repairs.push(`Step ${i + 1}: invalid step object replaced with fallback`);
            normalizedSteps.push({
                agent: fallbackAgent,
                action: 'read_codebase',
                description: `Fallback step ${i + 1}`,
            });
            continue;
        }

        const normalizedAgent = resolveAgentOrDefault(step.agent, availableAgents, fallbackAgent);
        if (normalizeAgentKey(String(step.agent || '')) !== normalizeAgentKey(normalizedAgent)) {
            repairs.push(`Step ${i + 1}: agent "${step.agent}" replaced with "${normalizedAgent}"`);
        }

        const rawAction = typeof step.action === 'string' ? step.action.trim() : '';
        const normalizedAction = normalizeAgentKey(rawAction);
        const canonicalAction = actionMap.get(normalizedAction);
        const resolvedAction = canonicalAction || 'read_codebase';
        if (!rawAction || !actionMap.has(normalizedAction)) {
            repairs.push(`Step ${i + 1}: action "${rawAction || '<empty>'}" normalized to "read_codebase"`);
        }

        normalizedSteps.push({
            ...(step || {}),
            agent: normalizedAgent,
            action: resolvedAction,
            description: typeof step.description === 'string' && step.description.trim().length > 0
                ? step.description.trim()
                : `Step ${i + 1}`,
        });
    }

    const dedupedSteps = [];
    let hasVerify = false;
    for (const step of normalizedSteps) {
        if (step.action === 'verify_final_output') {
            if (hasVerify) {
                repairs.push('중복된 verify_final_output 단계는 제거했습니다.');
                continue;
            }
            hasVerify = true;
        }
        dedupedSteps.push(step);
    }

    if (!hasVerify) {
        repairs.push('workflow에 verify_final_output 누락되어 추가했습니다.');
        dedupedSteps.push({
            agent: fallbackAgent,
            action: 'verify_final_output',
            description: '최종 검증',
        });
    }

    sanitized.steps = dedupedSteps;
    sanitized.required_agents = Array.from(requiredSet);
    sanitized._sanity = {
        requiredAgentsCount: requiredSet.size,
        normalizedSteps: sanitized.steps.length,
        repairs,
    };

    return { workflow: sanitized, repairs };
}

export async function create_workflow(
    taskAnalysis: any,
    availableAgents?: AgentDefinition[],
    codebaseContext?: string,
    emitter: any = null
) {
    try {
        const agents = availableAgents?.length ? availableAgents : AgentLoader.listAgents();
        const requiredAgents: unknown[] = Array.isArray(taskAnalysis?.required_agents) ? taskAnalysis.required_agents : [];
        const normalizedAvailableAgents = agents.map(agent => ({
            ...agent,
            normalizedRole: normalizeAgentKey(agent.role),
            normalizedName: normalizeAgentKey(agent.name),
        }));
        const normalizedRequiredAgents = Array.from(new Set(
            requiredAgents
                .map((agent: any) => normalizeAgentKey(String(agent || '')))
                .filter((agent: string): agent is string => Boolean(agent))
        ));
        const requiredSet = new Set<string>(['main-agent', ...normalizedRequiredAgents]);
        for (const availableAgent of normalizedAvailableAgents) {
            if (availableAgent.role === 'main-agent' || normalizedRequiredAgents.includes(availableAgent.normalizedRole)) {
                requiredSet.add(availableAgent.role);
            }
        }
        const requiredAgentSet = new Set<string>(
            normalizedAvailableAgents
                .filter((agent: any) =>
                    requiredSet.has(agent.role) ||
                    requiredSet.has(agent.normalizedRole) ||
                    requiredSet.has(agent.normalizedName)
                )
                .map((agent: { name: string }) => agent.name)
        );
        const agentsInfo = normalizedAvailableAgents
            .filter(a => requiredAgentSet.has(a.role) || requiredAgentSet.has(a.name))
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

        const workflowRaw = await llm.generateJSONStream(systemPrompt, `Task Analysis: ${JSON.stringify(taskAnalysis)} `, schema, emitter);
        const { workflow } = sanitizeWorkflow(workflowRaw, taskAnalysis, agents);
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
