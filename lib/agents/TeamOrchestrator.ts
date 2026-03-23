
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
import * as llm from '@/lib/llm';
import { AgentLoader } from '../agent-loader';
import { ContextManager } from '../context-manager';
import { TeamState, AgentAction, TeamMetadata, TeamCollaborationMap } from '../team-types';
import {
    DEFAULT_BUDGET_POLICY,
    ExecutionBudgetPolicy,
    StrategyPreset,
    TeamExecutionMetrics,
} from '../orchestration/metrics';
import { resolveExecutionTokenCap } from '../orchestration/policy';
// import { v4 as uuidv4 } from 'uuid'; // Removed unused import to avoid dependency issues
const generateId = () => Math.random().toString(36).substring(2, 9);

export class TeamOrchestrator {
    private taskId: string;
    private contextManagers: Map<string, ContextManager> = new Map(); // AgentName -> ContextManager
    private teamState: TeamState;
    private mutationQueue: Promise<void> = Promise.resolve();
    private readonly TURN_PARALLELISM = 2;
    private budgetPolicy: ExecutionBudgetPolicy = { ...DEFAULT_BUDGET_POLICY };
    private executionMetrics: TeamExecutionMetrics = {
        startedAt: Date.now(),
        rounds: 0,
        discussionRounds: 0,
        agentTurns: 0,
        llmCalls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        actionsProcessed: 0,
        skillCalls: 0,
        skillLatencyMs: 0,
        dbUpdates: 0,
    };

    constructor(taskId: string, initialTeamState?: TeamState) {
        this.taskId = taskId;
        // Default State
        this.teamState = initialTeamState || {
            name: 'Dev Team',
            leader: 'product-manager',
            members: ['product-manager', 'software-engineer', 'qa'], // Default members
            messages: [],
            board: {
                todo: [],
                in_progress: [],
                review: [],
                done: []
            },
            metadata: {
                round: 0,
                discussionMode: 'enabled',
                collaboration: {},
                roundSummaries: []
            }
        };
    }

    private normalizeAgentKey(agent: string): string {
        return String(agent || '')
            .toLowerCase()
            .replace(/[\s_]+/g, '-')
            .trim();
    }

    private incrementDbUpdate() {
        this.executionMetrics.dbUpdates += 1;
    }

    private resolveBudgetPolicy(
        raw: unknown,
        opts: { strategyPreset: StrategyPreset; syntheticStepCount: number }
    ): ExecutionBudgetPolicy {
        const policy = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
        const maxTokensPerTask = resolveExecutionTokenCap(
            { budgetPolicy: policy as Partial<ExecutionBudgetPolicy> },
            opts.strategyPreset,
            opts.syntheticStepCount
        );
        return {
            maxTokensPerTask,
            maxDiscussionCalls: Math.max(0, Number(policy.maxDiscussionCalls) || DEFAULT_BUDGET_POLICY.maxDiscussionCalls),
            maxSkillRetries: Math.max(0, Math.min(3, Number(policy.maxSkillRetries) || DEFAULT_BUDGET_POLICY.maxSkillRetries)),
            maxDbWritesPerTask: Math.max(20, Number(policy.maxDbWritesPerTask) || DEFAULT_BUDGET_POLICY.maxDbWritesPerTask),
        };
    }

    private llmTelemetry(): llm.LLMTelemetryHooks {
        return {
            onRequestStart: () => {
                this.executionMetrics.llmCalls += 1;
            },
            onTokenUsage: ({ promptTokens, completionTokens }) => {
                this.executionMetrics.promptTokens += promptTokens;
                this.executionMetrics.completionTokens += completionTokens;
                this.executionMetrics.totalTokens += promptTokens + completionTokens;
            },
        };
    }

    private async persistExecutionMetrics() {
        this.teamState.metadata.teamExecutionMetrics = this.executionMetrics;
        this.teamState.metadata.budgetPolicy = this.budgetPolicy;
        await this.saveState();
    }

    private enqueueMutation(mutator: () => void | Promise<void>): Promise<void> {
        this.mutationQueue = this.mutationQueue.then(async () => {
            await mutator();
        });
        return this.mutationQueue;
    }

    private shouldRunDiscussionRound(round: number): boolean {
        if (round === 0) return true;
        const recentMessages = this.teamState.messages.slice(-12);
        const hasRecentHandoff = recentMessages.some((msg) =>
            msg.messageType === 'system' && msg.content.includes('핸드오프')
        );
        const hasBlockedTasks = this.teamState.board.in_progress.some((task) =>
            Date.now() - task.updated_at > 2 * 60 * 1000
        );
        const backlogPressure = this.teamState.board.todo.length > this.teamState.members.length;
        return hasRecentHandoff || hasBlockedTasks || backlogPressure;
    }

    private ensureTeamMetadataDefaults() {
        const metadata = (this.teamState.metadata || {}) as Partial<TeamMetadata> & Record<string, unknown>;
        if (typeof metadata.round !== 'number') metadata.round = 0;
        if (metadata.discussionMode !== 'enabled' && metadata.discussionMode !== 'disabled') {
            metadata.discussionMode = 'enabled';
        }
        if (!metadata.collaboration || typeof metadata.collaboration !== 'object') {
            metadata.collaboration = {};
        }
        if (!Array.isArray(metadata.roundSummaries)) {
            metadata.roundSummaries = [];
        }
        const preset = (metadata.strategyPreset as StrategyPreset) || 'balanced';
        const b = this.teamState.board;
        const taskCount = b.todo.length + b.in_progress.length + b.review.length + b.done.length;
        const syntheticStepCount = Math.max(24, taskCount * 4, 20);
        this.budgetPolicy = this.resolveBudgetPolicy(metadata.budgetPolicy, {
            strategyPreset: preset,
            syntheticStepCount,
        });
        const savedMetrics = (metadata.teamExecutionMetrics && typeof metadata.teamExecutionMetrics === 'object')
            ? (metadata.teamExecutionMetrics as Partial<TeamExecutionMetrics>)
            : {};
        this.executionMetrics = {
            startedAt: Number(savedMetrics.startedAt) || Date.now(),
            endedAt: Number(savedMetrics.endedAt) || undefined,
            rounds: Number(savedMetrics.rounds) || 0,
            discussionRounds: Number(savedMetrics.discussionRounds) || 0,
            agentTurns: Number(savedMetrics.agentTurns) || 0,
            llmCalls: Number(savedMetrics.llmCalls) || 0,
            promptTokens: Number(savedMetrics.promptTokens) || 0,
            completionTokens: Number(savedMetrics.completionTokens) || 0,
            totalTokens: Number(savedMetrics.totalTokens) || 0,
            actionsProcessed: Number(savedMetrics.actionsProcessed) || 0,
            skillCalls: Number(savedMetrics.skillCalls) || 0,
            skillLatencyMs: Number(savedMetrics.skillLatencyMs) || 0,
            dbUpdates: Number(savedMetrics.dbUpdates) || 0,
        };
        this.teamState.metadata = metadata as TeamMetadata;
    }

    private parseMentions(content: string): string[] {
        if (!content) return [];
        const matches = content.match(/@[a-z0-9-_]+/gi) || [];
        return Array.from(new Set(matches.map(m => this.normalizeAgentKey(m.slice(1)))));
    }

    private recordCollaboration(from: string, to: string, weight = 1) {
        const src = this.normalizeAgentKey(from);
        const dst = this.normalizeAgentKey(to);
        if (!src || !dst || src === dst) return;

        const collaboration = (this.teamState.metadata.collaboration || {}) as TeamCollaborationMap;
        if (!collaboration[src]) collaboration[src] = {};
        collaboration[src][dst] = (collaboration[src][dst] || 0) + weight;
        this.teamState.metadata.collaboration = collaboration;
    }

    private async runDiscussionRound(round: number) {
        if (this.teamState.metadata.discussionMode !== 'enabled') return;
        if (this.executionMetrics.discussionRounds >= this.budgetPolicy.maxDiscussionCalls) return;

        try {
            this.executionMetrics.discussionRounds += 1;
            const availableAgents = AgentLoader.listAgents().filter(a =>
                this.teamState.members.includes(a.role) || this.teamState.members.includes(a.name)
            );
            const boardSnapshot = {
                todo: this.teamState.board.todo.map(t => ({ id: t.id, description: t.description, assignee: t.assignee })),
                in_progress: this.teamState.board.in_progress.map(t => ({ id: t.id, description: t.description, assignee: t.assignee })),
                review: this.teamState.board.review.map(t => ({ id: t.id, description: t.description, assignee: t.assignee })),
            };
            const recentMessages = this.teamState.messages.slice(-8).map(m => ({
                agent: m.sender,
                thought: m.content
            }));

            const thoughts = await skills.consult_agents(
                {
                    summary: `팀 라운드 ${round} 조율 토론`,
                    required_agents: this.teamState.members,
                    round,
                    board: boardSnapshot
                },
                availableAgents.length > 0 ? availableAgents : AgentLoader.listAgents(),
                JSON.stringify(boardSnapshot, null, 2),
                null,
                recentMessages
            );

            const selected = Array.isArray(thoughts) ? thoughts.slice(0, 5) : [];
            if (selected.length === 0) return;

            let prevSpeaker = this.teamState.leader;
            for (const thought of selected) {
                if (!thought?.agent || !thought?.thought) continue;
                this.teamState.messages.push({
                    id: generateId(),
                    sender: thought.agent,
                    content: `[라운드 ${round}] ${thought.thought}`,
                    timestamp: Date.now(),
                    messageType: 'discussion'
                });
                this.recordCollaboration(prevSpeaker, thought.agent, 1);
                prevSpeaker = thought.agent;
            }

            const roundSummaries = Array.isArray(this.teamState.metadata.roundSummaries)
                ? this.teamState.metadata.roundSummaries
                : [];
            roundSummaries.push({
                round,
                createdAt: Date.now(),
                thoughts: selected
            });
            this.teamState.metadata.roundSummaries = roundSummaries;
        } catch (e) {
            console.error('Discussion round failed:', e);
        }
    }

    /**
     * Initialize or Restore team state
     */
    public async initialize() {
        // Try to load state from Supabase first
        const { data } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
        if (data?.metadata?.teamState) {
            this.teamState = data.metadata.teamState;
            console.log('Restored Team State');
        } else {
            // Initializing new team
            console.log('Initializing New Team');
            // If no members, maybe dynamic loading? For now use defaults or from constructor
        }
        this.ensureTeamMetadataDefaults();

        // Initialize Context Managers for each member
        for (const member of this.teamState.members) {
            if (!this.contextManagers.has(member)) {
                this.contextManagers.set(member, new ContextManager(this.taskId));
            }
        }
    }

    private async saveState() {
        try {
            // We save the entire team state into metadata.teamState
            const { data: current } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
            this.teamState.metadata.teamExecutionMetrics = this.executionMetrics;
            this.teamState.metadata.budgetPolicy = this.budgetPolicy;
            const newMetadata = {
                ...(current?.metadata || {}),
                teamState: this.teamState
            };

            this.incrementDbUpdate();
            await supabase.from('Tasks').update({ metadata: newMetadata }).eq('id', this.taskId);
        } catch (e) {
            console.error('Failed to save team state:', e);
        }
    }

    /**
     * The Main Cycle: Round-Robin Execution
     */
    public async runTeamLoop(maxRounds: number = 20) {
        await this.initialize();
        skills.reset_runtime_caches();
        this.executionMetrics.startedAt = this.executionMetrics.startedAt || Date.now();

        for (let i = 0; i < maxRounds; i++) {
            this.teamState.metadata.round = i;
            this.executionMetrics.rounds = i + 1;
            console.log(`--- Round ${i} ---`);
            if (this.shouldRunDiscussionRound(i)) {
                await this.runDiscussionRound(i);
            }

            // Check termination condition: All items done? Leader says stop? 
            // Simplified: If todo and in_progress are empty and we have at least 1 done item, stop.
            if (this.teamState.board.todo.length === 0 &&
                this.teamState.board.in_progress.length === 0 &&
                this.teamState.board.done.length > 0) {
                console.log('All tasks completed. Team finished.');
                break;
            }

            for (let memberIndex = 0; memberIndex < this.teamState.members.length; memberIndex += this.TURN_PARALLELISM) {
                const chunk = this.teamState.members.slice(memberIndex, memberIndex + this.TURN_PARALLELISM);
                await Promise.all(chunk.map((agentName) => this.executeAgentTurn(agentName)));
            }

            await this.saveState();
        }
        this.executionMetrics.endedAt = Date.now();
        await this.persistExecutionMetrics();
    }

    private async executeAgentTurn(agentName: string) {
        console.log(`[${agentName}] is thinking...`);
        this.executionMetrics.agentTurns += 1;
        const agentDef = AgentLoader.loadAgent(agentName); // Assumes folder name matches agent name for simplification
        const ctxManager = this.contextManagers.get(agentName)!;

        // 1. Construct Prompt
        const teamContext = ctxManager.getTeamContext(this.teamState, agentName);
        const systemPrompt = `
You are ${agentDef.name}, a member of a software engineering team.
Role Description: ${agentDef.description}

${agentDef.systemPrompt}

### COLLABORATION PROTOCOL
You work in a team with a Shared Task Board and a Chat Channel.
You must communicate with your team, pick up tasks, and execute them.

AVAILABLE ACTIONS (JSON):
1. send_message: { "type": "send_message", "payload": { "content": "..." } }
2. create_task: { "type": "create_task", "payload": { "description": "...", "assignee": "optional_agent_name" } }
3. claim_task: { "type": "claim_task", "payload": { "taskId": "..." } }
4. submit_task: { "type": "submit_task", "payload": { "taskId": "...", "result": "..." } }
5. review_task: { "type": "review_task", "payload": { "taskId": "..." } }
6. handoff_task: { "type": "handoff_task", "payload": { "taskId": "...", "to": "agent_role" } }
7. call_skill: { "type": "call_skill", "payload": { "skill": "skill_name", "args": [...] } }

RULES:
- Be proactive. If there are tasks in TODO, claim them.
- If you claimed a task, use 'call_skill' to do the work.
- After work is done, use 'submit_task'.
- Communicate via 'send_message' to coordinate.
- If blocked, use @mentions in send_message to ask another agent for help.
- Output a SINGLE JSON object with "thought" and "actions" (array).

Context:
${teamContext}
`;

        // 2. LLM Call
        try {
            if (this.executionMetrics.totalTokens >= this.budgetPolicy.maxTokensPerTask) {
                console.warn(`[${agentName}] token budget reached, skipping turn`);
                return;
            }
            const response = await llm.generateJSON(
                systemPrompt,
                "Analyze the situation and decide your next move.",
                `{ "thought": "...", "actions": [] }`,
                undefined,
                this.llmTelemetry()
            );

            // 3. Process Actions
            if (response.thought) {
                console.log(`[${agentName} Thought]: ${response.thought}`);
            }

            if (Array.isArray(response.actions)) {
                this.executionMetrics.actionsProcessed += response.actions.length;
                for (const action of response.actions) {
                    await this.processAction(agentName, action, ctxManager);
                }
            }

        } catch (e) {
            console.error(`Agent ${agentName} crashed:`, e);
        }
    }

    private async processAction(agentName: string, action: AgentAction, ctxManager: ContextManager) {
        console.log(`[${agentName} Action]: ${action.type}`, action.payload);

        switch (action.type) {
            case 'send_message':
                await this.enqueueMutation(async () => {
                    const mentions = this.parseMentions(action.payload.content || '');
                    this.teamState.messages.push({
                        id: generateId(),
                        sender: agentName,
                        content: action.payload.content,
                        timestamp: Date.now(),
                        mentions,
                        messageType: 'chat'
                    });
                    for (const mention of mentions) {
                        this.recordCollaboration(agentName, mention, 1);
                    }
                });
                break;

            case 'create_task':
                await this.enqueueMutation(async () => {
                    this.teamState.board.todo.push({
                        id: generateId(),
                        description: action.payload.description,
                        assignee: action.payload.assignee || null,
                        status: 'todo',
                        creator: agentName,
                        created_at: Date.now(),
                        updated_at: Date.now()
                    });
                    if (action.payload.assignee) {
                        this.recordCollaboration(agentName, action.payload.assignee, 1);
                    }
                });
                break;

            case 'claim_task':
                await this.enqueueMutation(async () => {
                    // Find task in todo
                    const taskIndex = this.teamState.board.todo.findIndex(t => t.id === action.payload.taskId);
                    if (taskIndex !== -1) {
                        const task = this.teamState.board.todo.splice(taskIndex, 1)[0];
                        task.status = 'in_progress';
                        task.assignee = agentName;
                        task.updated_at = Date.now();
                        this.teamState.board.in_progress.push(task);
                        this.recordCollaboration(task.creator, agentName, 2);
                    }
                });
                break;

            case 'submit_task':
                await this.enqueueMutation(async () => {
                    // Find in in_progress
                    const progIndex = this.teamState.board.in_progress.findIndex(t => t.id === action.payload.taskId);
                    if (progIndex !== -1) {
                        const task = this.teamState.board.in_progress.splice(progIndex, 1)[0];
                        task.status = 'done'; // Skip review for simplicity in v1
                        task.result = action.payload.result;
                        task.updated_at = Date.now();
                        this.teamState.board.done.push(task);
                        this.recordCollaboration(agentName, this.teamState.leader, 1);

                        // Auto-notify
                        this.teamState.messages.push({
                            id: generateId(),
                            sender: 'system',
                            content: `Task ${task.description} completed by ${agentName}.`,
                            timestamp: Date.now(),
                            messageType: 'system'
                        });
                    }
                });
                break;

            case 'review_task':
                await this.enqueueMutation(async () => {
                    // Find task in in_progress and move to review
                    const reviewIndex = this.teamState.board.in_progress.findIndex(t => t.id === action.payload.taskId);
                    if (reviewIndex !== -1) {
                        const task = this.teamState.board.in_progress.splice(reviewIndex, 1)[0];
                        task.status = 'review';
                        task.updated_at = Date.now();
                        this.teamState.board.review.push(task);
                        this.recordCollaboration(agentName, this.teamState.leader, 1);

                        this.teamState.messages.push({
                            id: generateId(),
                            sender: 'system',
                            content: `Task "${task.description}" moved to review by ${agentName}.`,
                            timestamp: Date.now(),
                            messageType: 'system'
                        });
                    }
                });
                break;

            case 'handoff_task':
                await this.enqueueMutation(async () => {
                    const handoffIndex = this.teamState.board.in_progress.findIndex(t => t.id === action.payload.taskId);
                    if (handoffIndex !== -1) {
                        const handoffTask = this.teamState.board.in_progress[handoffIndex];
                        const nextAssignee = this.normalizeAgentKey(action.payload.to || '');
                        if (nextAssignee) {
                            handoffTask.assignee = nextAssignee;
                            handoffTask.updated_at = Date.now();
                            this.recordCollaboration(agentName, nextAssignee, 2);
                            this.teamState.messages.push({
                                id: generateId(),
                                sender: 'system',
                                content: `Task "${handoffTask.description}"가 ${agentName}에서 ${nextAssignee}에게 핸드오프되었습니다.`,
                                timestamp: Date.now(),
                                messageType: 'system'
                            });
                        }
                    }
                });
                break;

            case 'call_skill':
                const { skill, args } = action.payload;
                const skillStartedAt = Date.now();
                try {
                    this.executionMetrics.skillCalls += 1;
                    const normalizedArgs = Array.isArray(args) ? args : [];
                    const skillRegistry = skills as unknown as Record<string, (...skillArgs: unknown[]) => Promise<unknown> | unknown>;
                    const skillFunc = skillRegistry[skill]
                        || ((...dynamicArgs: unknown[]) =>
                            skills.execute_skill(
                                skill,
                                { args: dynamicArgs },
                                ctxManager.getOptimizedContext(4000),
                                null
                            ));

                    if (skillFunc) {
                        const result = await skillFunc(...normalizedArgs);
                        const resultWithContent =
                            typeof result === 'object' &&
                            result !== null &&
                            'content' in result &&
                            typeof (result as { content?: unknown }).content === 'string'
                                ? (result as { content: string })
                                : null;

                        // Capture result in context
                        ctxManager.addLog(agentName, `Called skill ${skill}`, result);

                        // If reading file, cache it
                        if (skill === 'read_codebase') {
                            const targetPath = typeof normalizedArgs[0] === 'string' ? normalizedArgs[0] : null;
                            if (targetPath && typeof result === 'string') {
                                ctxManager.addFile(targetPath, result);
                            } else if (targetPath && resultWithContent) {
                                ctxManager.addFile(targetPath, resultWithContent.content);
                            }
                        }
                        await this.enqueueMutation(async () => {
                            this.recordCollaboration(agentName, this.teamState.leader, 1);
                        });
                        this.executionMetrics.skillLatencyMs += Date.now() - skillStartedAt;

                    } else {
                        console.error(`Skill ${skill} not found`);
                        this.executionMetrics.skillLatencyMs += Date.now() - skillStartedAt;
                    }
                } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : String(e);
                    console.error(`Skill execution failed: ${message}`);
                    ctxManager.addLog(agentName, `Skill ${skill} failed`, message);
                    this.executionMetrics.skillLatencyMs += Date.now() - skillStartedAt;
                }
                break;
        }
    }
}
