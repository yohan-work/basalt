
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
import * as llm from '@/lib/llm';
import path from 'path';
import { AgentLoader, AgentDefinition } from '../agent-loader';
import { ContextManager } from '../context-manager';
import { StreamEmitter } from '../stream-emitter';
import { ProjectProfiler } from '../profiler';
import { MODEL_CONFIG } from '../model-config';
import { isAgentBrowserAvailable } from '../browser/agent-browser';
import {
    BudgetEvent,
    DEFAULT_BUDGET_POLICY,
    ExecutionBudgetPolicy,
    ExecutionMetrics,
    StepExecutionMetric,
    StrategyPreset,
} from '../orchestration/metrics';
import { applyPresetDefaults, resolveStepPolicy } from '../orchestration/policy';

interface AgentTask {
    id: string; // Supabase UUID
    description: string;
    status: 'pending' | 'planning' | 'working' | 'testing' | 'review' | 'done' | 'failed';
    metadata?: any; // JSONB for storing plan, workflow, results
}

interface ErrorMetadata {
    lastError: string;
    failedStep: number;
    failedAction: string;
    failedAgent: string;
    retryCount: number;
    failedAt: string;
    previousStatus: string;
}

interface ProgressInfo {
    currentStep: number;      // 현재 실행 중인 step (0-based)
    totalSteps: number;       // 전체 step 수
    currentAction: string;    // 현재 실행 중인 action 이름
    currentAgent: string;     // 현재 담당 agent 이름
    completedSteps: string[]; // 완료된 step action 목록
    startedAt?: string;       // 실행 시작 시간
    stepStatus: 'pending' | 'running' | 'completed' | 'failed'; // 현재 step 상태
}

type DiscussionMode = 'off' | 'step_handoff' | 'roundtable';

interface ExecutionOptions {
    discussionMode?: DiscussionMode;
    maxDiscussionThoughts?: number;
    carryDiscussionToPrompt?: boolean;
    strategyPreset?: StrategyPreset;
}

type CollaborationGraph = Record<string, Record<string, {
    weight: number;
    reasons: string[];
    updatedAt: string;
}>>;

export class Orchestrator {
    private taskId: string;
    private mainAgentDef: AgentDefinition;
    private contextManager: ContextManager;
    private profiler: ProjectProfiler;
    private emitter: StreamEmitter | null;
    private collaborationGraph: CollaborationGraph = {};
    private executionOptions: Required<ExecutionOptions> = {
        discussionMode: 'step_handoff',
        maxDiscussionThoughts: 3,
        carryDiscussionToPrompt: true,
        strategyPreset: 'balanced',
    };
    private budgetPolicy: ExecutionBudgetPolicy = { ...DEFAULT_BUDGET_POLICY };
    private executionMetrics: ExecutionMetrics = {
        startedAt: new Date().toISOString(),
        profile: 'balanced',
        llmCalls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        skillCalls: 0,
        skillLatencyMs: 0,
        dbUpdates: 0,
        discussionCalls: 0,
        budgetEvents: [],
        stepMetrics: {},
    };
    private activeStepIndex: number | null = null;
    private metadataCache: Record<string, any> | null = null;
    private metadataLastFlushedAt = 0;
    private readonly METADATA_FLUSH_INTERVAL_MS = 1500;
    private readonly skillArgCache = new Map<string, any[]>();

    // Simple in-memory lock to prevent concurrent executions of the same task
    private static runningTasks = new Set<string>();

    constructor(taskId: string, emitter?: StreamEmitter) {
        this.taskId = taskId;
        this.mainAgentDef = AgentLoader.loadAgent('main-agent');
        this.contextManager = new ContextManager(taskId);
        this.profiler = new ProjectProfiler(process.cwd()); // Default to current dir
        this.emitter = emitter || null;
    }

    private createStepMetric(stepIndex: number, action: string, agent: string): StepExecutionMetric {
        return {
            stepIndex,
            action,
            agent,
            status: 'pending',
            llmCalls: 0,
            promptTokens: 0,
            completionTokens: 0,
            skillCalls: 0,
            skillLatencyMs: 0,
            dbUpdates: 0,
        };
    }

    private ensureStepMetric(stepIndex: number, action: string, agent: string): StepExecutionMetric {
        if (!this.executionMetrics.stepMetrics[stepIndex]) {
            this.executionMetrics.stepMetrics[stepIndex] = this.createStepMetric(stepIndex, action, agent);
        }
        return this.executionMetrics.stepMetrics[stepIndex];
    }

    private incrementDbUpdate() {
        this.executionMetrics.dbUpdates += 1;
        if (this.activeStepIndex !== null && this.executionMetrics.stepMetrics[this.activeStepIndex]) {
            this.executionMetrics.stepMetrics[this.activeStepIndex].dbUpdates += 1;
        }
    }

    private pushBudgetEvent(event: Omit<BudgetEvent, 'createdAt'>) {
        this.executionMetrics.budgetEvents.push({
            ...event,
            createdAt: new Date().toISOString(),
        });
    }

    private resolveBudgetPolicy(taskMetadata: any, strategyPreset: StrategyPreset): ExecutionBudgetPolicy {
        const raw = taskMetadata?.budgetPolicy || {};
        const presetDefaults = applyPresetDefaults(strategyPreset).budgetPolicy;
        return {
            maxTokensPerTask: Math.max(
                1000,
                Number(raw.maxTokensPerTask) || Number(presetDefaults.maxTokensPerTask) || DEFAULT_BUDGET_POLICY.maxTokensPerTask
            ),
            maxDiscussionCalls: Math.max(
                0,
                Number(raw.maxDiscussionCalls) || Number(presetDefaults.maxDiscussionCalls) || DEFAULT_BUDGET_POLICY.maxDiscussionCalls
            ),
            maxSkillRetries: Math.max(
                0,
                Math.min(3, Number(raw.maxSkillRetries) || Number(presetDefaults.maxSkillRetries) || DEFAULT_BUDGET_POLICY.maxSkillRetries)
            ),
            maxDbWritesPerTask: Math.max(20, Number(raw.maxDbWritesPerTask) || DEFAULT_BUDGET_POLICY.maxDbWritesPerTask),
        };
    }

    private checkBudget(type: BudgetEvent['type']): boolean {
        if (type === 'tokens' && this.executionMetrics.totalTokens >= this.budgetPolicy.maxTokensPerTask) {
            this.pushBudgetEvent({
                type,
                message: `토큰 예산 초과: ${this.executionMetrics.totalTokens}/${this.budgetPolicy.maxTokensPerTask}`,
            });
            return false;
        }
        if (type === 'discussion' && this.executionMetrics.discussionCalls >= this.budgetPolicy.maxDiscussionCalls) {
            this.pushBudgetEvent({
                type,
                message: `토론 호출 예산 초과: ${this.executionMetrics.discussionCalls}/${this.budgetPolicy.maxDiscussionCalls}`,
            });
            return false;
        }
        if (type === 'db_writes' && this.executionMetrics.dbUpdates >= this.budgetPolicy.maxDbWritesPerTask) {
            this.pushBudgetEvent({
                type,
                message: `DB write 예산 초과: ${this.executionMetrics.dbUpdates}/${this.budgetPolicy.maxDbWritesPerTask}`,
            });
            return false;
        }
        return true;
    }

    private llmTelemetry(modeHint?: { action?: string; agent?: string }): llm.LLMTelemetryHooks {
        return {
            onRequestStart: ({ mode }) => {
                this.executionMetrics.llmCalls += 1;
                if (this.activeStepIndex !== null && this.executionMetrics.stepMetrics[this.activeStepIndex]) {
                    this.executionMetrics.stepMetrics[this.activeStepIndex].llmCalls += 1;
                }
                void this.log('System', `[LLM] ${mode} 요청 시작`, { type: 'System', ...modeHint });
            },
            onError: ({ message }) => {
                void this.log('System', `[LLM] 요청 오류: ${message}`, { type: 'WARNING', ...modeHint });
            },
        };
    }

    private async log(agentName: string, message: string, metadata: any = {}) {
        console.log(`[${agentName}] ${message}`, metadata);
        try {
            if (!this.checkBudget('db_writes')) return;
            this.incrementDbUpdate();
            await supabase.from('Execution_Logs').insert({
                task_id: this.taskId,
                agent_role: agentName,
                message: message,
                metadata: metadata,
                created_at: new Date().toISOString()
            });
        } catch (e: any) {
            console.error('Supabase Log Error:', e);
        }
    }

    private async updateStatus(status: AgentTask['status']) {
        try {
            this.incrementDbUpdate();
            await supabase.from('Tasks').update({ status }).eq('id', this.taskId);
        } catch (e: any) {
            console.error('Supabase Status Update Error:', e);
        }
    }

    private async updateMetadata(data: any, immediate: boolean = true) {
        try {
            await this.ensureMetadataCache();
            this.metadataCache = { ...(this.metadataCache || {}), ...data };
            await this.flushMetadataCache(immediate);
        } catch (e: any) {
            console.error('Supabase Metadata Update Error:', e);
        }
    }

    private async updateProgress(progress: Partial<ProgressInfo>, immediate: boolean = true) {
        try {
            await this.ensureMetadataCache();
            const currentProgress = this.metadataCache?.progress || {};
            const newProgress: ProgressInfo = {
                ...currentProgress,
                ...progress
            };
            this.metadataCache = {
                ...(this.metadataCache || {}),
                progress: newProgress,
            };
            await this.flushMetadataCache(immediate);
        } catch (e: any) {
            console.error('Supabase Progress Update Error:', e);
        }
    }

    private async getTask(): Promise<AgentTask | null> {
        const { data, error } = await supabase.from('Tasks').select('*').eq('id', this.taskId).single();
        if (error || !data) return null;
        this.metadataCache = (data as AgentTask).metadata || {};
        return data as AgentTask;
    }

    private async ensureMetadataCache() {
        if (this.metadataCache) return;
        const { data } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
        this.metadataCache = (data?.metadata || {}) as Record<string, any>;
    }

    private async flushMetadataCache(force: boolean = false) {
        if (!this.metadataCache) return;
        const now = Date.now();
        if (!force && now - this.metadataLastFlushedAt < this.METADATA_FLUSH_INTERVAL_MS) {
            return;
        }
        this.incrementDbUpdate();
        await supabase.from('Tasks').update({ metadata: this.metadataCache }).eq('id', this.taskId);
        this.metadataLastFlushedAt = now;
    }

    private normalizeAgentKey(agent: string): string {
        return String(agent || '')
            .toLowerCase()
            .replace(/[\s_]+/g, '-')
            .trim();
    }

    private buildExecutionRepairRecord(stepIndex: number, action: string, detail: string) {
        return {
            stage: 'runtime',
            step: stepIndex,
            action,
            detail,
            at: new Date().toISOString(),
        };
    }

    private async getRoutePolicyHintsForWrite() {
        try {
            return await this.profiler.getProfileData();
        } catch {
            return null;
        }
    }

    private isExplicitRootPageRequest(taskDescription: string, stepDescription: string, codePrompt: string): boolean {
        const combined = [taskDescription, stepDescription, codePrompt]
            .join(' ')
            .toLowerCase();

        return [
            'root page',
            'home page',
            'homepage',
            'root route',
            'home',
            '메인',
            '루트',
            '메인 페이지',
        ].some((token) => combined.includes(token));
    }

    private inferFeatureRouteFromRequest(taskDescription: string, stepDescription: string): string {
        const source = `${taskDescription || ''} ${stepDescription || ''}`.toLowerCase();
        const explicit = source.match(/\/([a-z0-9-]+)/);
        if (explicit) {
            return explicit[1];
        }

        const mapping: Array<[RegExp, string]> = [
            [/\bchat\b|채팅|챗|메신저/u, 'chat'],
            [/\bdashboard\b|대시보드/u, 'dashboard'],
            [/\blogin\b|로그인/u, 'login'],
            [/\bsignup\b|회원가입|회원가입/u, 'signup'],
            [/\bsettings\b|설정/u, 'settings'],
            [/\bprofile\b|프로필/u, 'profile'],
            [/\bsearch\b|검색/u, 'search'],
            [/\babout\b|소개/u, 'about'],
            [/\bcontact\b|문의/u, 'contact'],
        ];

        for (const [pattern, route] of mapping) {
            if (pattern.test(source)) {
                return route;
            }
        }

        return 'feature';
    }

    private async normalizeWriteTargetPath(
        rawPath: string,
        taskDescription: string,
        stepDescription: string,
        codePrompt: string
    ): Promise<{
        path: string;
        repairs: string[];
        failed: boolean;
        message?: string;
    }> {
        const repairs: string[] = [];
        if (!rawPath || typeof rawPath !== 'string') {
            return {
                path: rawPath,
                failed: true,
                message: 'write_code output path is missing',
                repairs,
            };
        }

        let normalized = rawPath.trim().replace(/\\/g, '/');
        if (normalized.startsWith('/')) {
            normalized = normalized.replace(/^\/+/, '');
            repairs.push(`Removed leading slash from path: ${rawPath}`);
        }
        if (normalized.startsWith('..')) {
            return {
                path: normalized,
                failed: true,
                message: `Unsafe path traversal detected: ${rawPath}`,
                repairs,
            };
        }

        // Keep as-is if not a recognizable route file
        if (!normalized.includes('app/') && !normalized.includes('pages/') && !normalized.includes('src/app/') && !normalized.includes('src/pages/')) {
            return { path: normalized, repairs, failed: false };
        }

        const profile = await this.getRoutePolicyHintsForWrite();
        if (!profile) {
            return { path: normalized, repairs, failed: false };
        }

        const routeBase = (profile as any).routerBase as string | null;
        if (!routeBase) {
            return { path: normalized, repairs, failed: false };
        }

        const normalizedRouteBase = routeBase.endsWith('/') ? routeBase.slice(0, -1) : routeBase;
        const posix = path.posix.normalize(normalized);
        const isAppRouter = normalizedRouteBase.includes('app');
        const appRoot = isAppRouter ? `${normalizedRouteBase}/page.tsx` : `${normalizedRouteBase}/index.tsx`;
        const targetExtension = isAppRouter ? 'tsx' : 'tsx';
        const explicitRootRequest = this.isExplicitRootPageRequest(taskDescription, stepDescription, codePrompt);

        if (posix === path.posix.normalize(appRoot)) {
            if (!explicitRootRequest) {
                const inferred = this.inferFeatureRouteFromRequest(taskDescription, stepDescription);
                const candidateBase = `${normalizedRouteBase}/${inferred}`;
                const rewritten = isAppRouter
                    ? `${candidateBase}/page.${targetExtension}`
                    : `${candidateBase}.${targetExtension}`;
                repairs.push(`Route guard: remapped root target ${rawPath} -> ${rewritten} (non-root feature path inferred)`);
                return { path: rewritten, repairs, failed: false };
            }
        }

        if (!path.extname(posix)) {
            const rewritten = isAppRouter
                ? `${posix.replace(/\/?$/, '/')}page.${targetExtension}`
                : `${posix}.${targetExtension}`;
            repairs.push(`Added missing extension to route file: ${rewritten}`);
            return { path: rewritten, repairs, failed: false };
        }

        return { path: posix, repairs, failed: false };
    }

    private resolveExecutionOptions(taskMetadata: any, runtimeOptions?: ExecutionOptions): Required<ExecutionOptions> {
        const saved = taskMetadata?.executionOptions || {};
        const preset = (runtimeOptions?.strategyPreset ?? saved.strategyPreset ?? 'balanced') as StrategyPreset;
        const presetDefaults = applyPresetDefaults(preset);
        const merged = {
            discussionMode: runtimeOptions?.discussionMode ?? saved.discussionMode ?? presetDefaults.discussionMode,
            maxDiscussionThoughts: runtimeOptions?.maxDiscussionThoughts ?? saved.maxDiscussionThoughts ?? presetDefaults.maxDiscussionThoughts,
            carryDiscussionToPrompt: runtimeOptions?.carryDiscussionToPrompt ?? saved.carryDiscussionToPrompt ?? presetDefaults.carryDiscussionToPrompt,
            strategyPreset: preset,
        };

        const validModes: DiscussionMode[] = ['off', 'step_handoff', 'roundtable'];
        const discussionMode = validModes.includes(merged.discussionMode) ? merged.discussionMode : 'step_handoff';
        const maxDiscussionThoughts = Math.max(1, Math.min(8, Number(merged.maxDiscussionThoughts) || 3));

        return {
            discussionMode,
            maxDiscussionThoughts,
            carryDiscussionToPrompt: Boolean(merged.carryDiscussionToPrompt),
            strategyPreset: ['quality_first', 'balanced', 'speed_first', 'cost_saver'].includes(merged.strategyPreset)
                ? merged.strategyPreset
                : 'balanced',
        };
    }

    private recordCollaboration(from: string | null | undefined, to: string | null | undefined, reason: string) {
        const src = this.normalizeAgentKey(from || '');
        const dst = this.normalizeAgentKey(to || '');
        if (!src || !dst || src === dst) return;

        if (!this.collaborationGraph[src]) {
            this.collaborationGraph[src] = {};
        }

        const current = this.collaborationGraph[src][dst] || {
            weight: 0,
            reasons: [],
            updatedAt: new Date().toISOString(),
        };

        current.weight += 1;
        if (reason && !current.reasons.includes(reason)) {
            current.reasons.push(reason);
        }
        current.updatedAt = new Date().toISOString();
        this.collaborationGraph[src][dst] = current;
    }

    private seedCollaborationFromWorkflow(workflow: any) {
        if (!workflow?.steps || !Array.isArray(workflow.steps)) return;
        for (let i = 1; i < workflow.steps.length; i++) {
            const prev = this.normalizeAgentKey(workflow.steps[i - 1]?.agent || '');
            const curr = this.normalizeAgentKey(workflow.steps[i]?.agent || '');
            if (prev && curr) {
                this.recordCollaboration(prev, curr, 'workflow_transition');
            }
        }
    }

    private resolveDiscussionParticipants(
        workflow: any,
        stepIndex: number,
        currentAgent: string,
        discussionMode: DiscussionMode
    ): string[] {
        const participants = new Set<string>();
        const current = this.normalizeAgentKey(currentAgent);
        if (current) participants.add(current);
        participants.add(this.normalizeAgentKey(this.mainAgentDef.role || this.mainAgentDef.name));

        const prevStepAgent = this.normalizeAgentKey(workflow?.steps?.[stepIndex - 1]?.agent || '');
        const nextStepAgent = this.normalizeAgentKey(workflow?.steps?.[stepIndex + 1]?.agent || '');

        if (discussionMode === 'roundtable') {
            const requiredAgents = workflow?.requiredAgents || workflow?.required_agents || [];
            for (const role of requiredAgents) {
                participants.add(this.normalizeAgentKey(role));
            }
        } else {
            if (prevStepAgent) participants.add(prevStepAgent);
            if (nextStepAgent) participants.add(nextStepAgent);
        }

        return Array.from(participants).filter(Boolean);
    }

    private buildActionCatalog(): Map<string, string> {
        const catalog = new Map<string, string>();

        for (const key of Object.keys(skills)) {
            if (typeof key === 'string' && key.trim()) {
                catalog.set(this.normalizeAgentKey(key), key);
            }
        }

        try {
            const skillBriefs = AgentLoader.listSkillsBrief();
            for (const skill of skillBriefs) {
                catalog.set(this.normalizeAgentKey(skill.name), skill.name);
            }
        } catch (error) {
            console.error('Failed to load skill briefs for action catalog:', error);
        }

        const fallbackActions = [
            'analyze_task',
            'create_workflow',
            'consult_agents',
            'read_codebase',
            'write_code',
            'verify_final_output',
            'run_shell_command',
            'lint_code',
            'typecheck',
            'refactor_code',
            'check_responsive',
            'visual_test',
            'e2e_test',
            'browse_web',
            'screenshot_page',
            'check_environment',
            'list_directory',
            'apply_design_system',
            'generate_scss',
            'search_npm_package',
        ];
        for (const action of fallbackActions) {
            catalog.set(this.normalizeAgentKey(action), action);
        }

        return catalog;
    }

    private resolveExecutionAgent(rawAgent: unknown, availableAgents: AgentDefinition[]): {
        agentDef: AgentDefinition | null;
        repairedAgent: string;
        repairs: string[];
    } {
        const repairs: string[] = [];
        const fallbackAgent = availableAgents.find(a => a.role === 'main-agent')
            || availableAgents.find(a => a.role === 'software-engineer')
            || availableAgents[0];

        if (!fallbackAgent) {
            return {
                agentDef: null,
                repairedAgent: '',
                repairs: ['No available agents found for execution'],
            };
        }

        const fallbackAgentName = fallbackAgent.role;
        if (typeof rawAgent !== 'string' || !rawAgent.trim()) {
            repairs.push('step.agent missing -> fallback agent used');
            return { agentDef: fallbackAgent, repairedAgent: fallbackAgentName, repairs };
        }

        const normalized = this.normalizeAgentKey(rawAgent);
        const exactRole = availableAgents.find(agent => this.normalizeAgentKey(agent.role) === normalized);
        if (exactRole) {
            return { agentDef: exactRole, repairedAgent: exactRole.role, repairs };
        }

        const exactName = availableAgents.find(agent => this.normalizeAgentKey(agent.name) === normalized);
        if (exactName) {
            return { agentDef: exactName, repairedAgent: exactName.role, repairs };
        }

        repairs.push(`Unknown agent "${rawAgent}" -> fallback`);
        return { agentDef: fallbackAgent, repairedAgent: fallbackAgentName, repairs };
    }

    private resolveExecutionAction(
        rawAction: unknown,
        actionCatalog: Map<string, string>
    ): {
        action: string;
        repaired: boolean;
        repairs: string[];
    } {
        const repairs: string[] = [];
        if (typeof rawAction !== 'string' || !rawAction.trim()) {
            repairs.push('Missing action -> read_codebase fallback');
            return { action: 'read_codebase', repaired: true, repairs };
        }

        const normalized = this.normalizeAgentKey(rawAction);
        const canonicalAction = actionCatalog.get(normalized)
            || actionCatalog.get(normalized.replace(/-/g, '_'))
            || actionCatalog.get(normalized.replace(/_/g, '-'));
        if (!canonicalAction) {
            repairs.push(`Unsupported action "${rawAction}" -> read_codebase fallback`);
            return { action: 'read_codebase', repaired: true, repairs };
        }

        if (canonicalAction !== rawAction) {
            repairs.push(`Action "${rawAction}" normalized to "${canonicalAction}"`);
        }
        return { action: canonicalAction, repaired: false, repairs };
    }

    private normalizeExecutionStep(
        step: any,
        availableAgents: AgentDefinition[],
        actionCatalog: Map<string, string>
    ) {
        const repairs: string[] = [];
        if (!step || typeof step !== 'object') {
            const fallback = { agent: 'software-engineer', action: 'read_codebase', description: 'Fallback step' };
            return {
                resolvedStep: fallback,
                stepAgentDef: this.resolveExecutionAgent(fallback.agent, availableAgents).agentDef,
                repairs: [...repairs, 'Invalid step shape -> replaced with fallback'],
            };
        }

        const agentResult = this.resolveExecutionAgent(step.agent, availableAgents);
        const actionResult = this.resolveExecutionAction(step.action, actionCatalog);
        repairs.push(...agentResult.repairs, ...actionResult.repairs);

        const resolvedStep = {
            ...step,
            agent: agentResult.repairedAgent,
            action: actionResult.action,
            description:
                typeof step.description === 'string' && step.description.trim()
                    ? step.description.trim()
                    : 'Task execution step',
        };

        return {
            resolvedStep,
            stepAgentDef: agentResult.agentDef,
            repairs,
        };
    }

    private sanitizePlannedWorkflow(
        workflow: any,
        analysis: any,
        availableAgents: AgentDefinition[]
    ): { workflow: any; repairs: string[]; reason: string } {
        const repairs: string[] = [];
        const safeWorkflow = workflow && typeof workflow === 'object' ? { ...workflow } : {};
        const fallbackAgent = availableAgents.find(a => a.role === 'main-agent')?.role
            || availableAgents.find(a => a.role === 'software-engineer')?.role
            || availableAgents[0]?.role
            || 'main-agent';

        const normalizedAgents = availableAgents.map((agent) => ({
            role: this.normalizeAgentKey(agent.role),
            name: this.normalizeAgentKey(agent.name),
            originalRole: agent.role,
        }));
        const validRoles = new Set(normalizedAgents.map(a => a.role));
        const resolveAgentRole = (raw: unknown): string => {
            if (typeof raw !== 'string' || !raw.trim()) {
                return fallbackAgent;
            }
            const normalized = this.normalizeAgentKey(raw);
            const exact = normalizedAgents.find(a => a.role === normalized || a.name === normalized);
            if (exact) return exact.originalRole;
            return fallbackAgent;
        };

        const rawSteps = Array.isArray(safeWorkflow.steps) ? safeWorkflow.steps : [];
        if (rawSteps.length === 0) {
            repairs.push('workflow.steps가 비어 있어 기본 워크플로우로 보완했습니다.');
            return {
                workflow: {
                    ...safeWorkflow,
                    required_agents: ['software-engineer', 'main-agent'],
                    steps: [
                        { agent: 'software-engineer', action: 'read_codebase', description: '코드베이스 읽기' },
                        { agent: 'software-engineer', action: 'write_code', description: '핵심 코드 구현' },
                        { agent: 'main-agent', action: 'verify_final_output', description: '최종 검증' },
                    ],
                },
                repairs,
                reason: 'empty-steps',
            };
        }

        const normalizedSteps = [];
        for (let index = 0; index < rawSteps.length; index++) {
            const step = rawSteps[index];
            if (!step || typeof step !== 'object') {
                repairs.push(`Step ${index + 1}: 잘못된 step 객체를 기본값으로 대체했습니다.`);
                normalizedSteps.push({
                    agent: fallbackAgent,
                    action: 'read_codebase',
                    description: `Step ${index + 1} fallback`,
                });
                continue;
            }

            const normalizedAgent = resolveAgentRole(step.agent);
            if (this.normalizeAgentKey(String(step.agent || '')) !== this.normalizeAgentKey(normalizedAgent)) {
                repairs.push(`Step ${index + 1}: agent "${String(step.agent)}" -> "${normalizedAgent}"로 보정`);
            }

            const action = typeof step.action === 'string' && step.action.trim() ? step.action.trim() : '';
            const resolvedAction = action || 'read_codebase';
            if (!action) {
                repairs.push(`Step ${index + 1}: action이 없어 read_codebase로 보정`);
            }

            normalizedSteps.push({
                ...step,
                agent: normalizedAgent,
                action: resolvedAction,
                description: typeof step.description === 'string' && step.description.trim()
                    ? step.description
                    : `Step ${index + 1}`,
            });
        }

        const dedupedSteps = [];
        let hasVerify = false;
        for (const step of normalizedSteps) {
            if (step.action === 'verify_final_output') {
                if (hasVerify) {
                    repairs.push('중복된 verify_final_output step 제거');
                    continue;
                }
                hasVerify = true;
            }
            dedupedSteps.push(step);
        }

        if (!hasVerify) {
            dedupedSteps.push({ agent: fallbackAgent, action: 'verify_final_output', description: '최종 검증' });
            repairs.push('workflow에서 verify_final_output이 없어 추가');
        }

        const normalizedRequiredAgents = Array.isArray(analysis?.required_agents)
            ? analysis.required_agents
                .map((agent: any) => {
                    const name = typeof agent === 'string' ? agent.trim() : '';
                    const normalized = this.normalizeAgentKey(name);
                    if (validRoles.has(normalized)) return normalized;
                    const exact = normalizedAgents.find(a => a.name === normalized);
                    return exact?.originalRole || null;
                })
                .filter((agent: string | null): agent is string => Boolean(agent))
                .filter((agent: string, idx: number, arr: string[]) => arr.indexOf(agent) === idx)
            : [];

        if (normalizedRequiredAgents.length === 0) {
            normalizedRequiredAgents.push('software-engineer', 'main-agent');
            repairs.push('required_agents가 비어 있어 기본값으로 대체');
        }

        return {
            workflow: {
                ...safeWorkflow,
                required_agents: normalizedRequiredAgents,
                steps: dedupedSteps,
            },
            repairs,
            reason: repairs.length > 0 ? 'repaired' : 'ok',
        };
    }

    private async runStepDiscussion(
        task: AgentTask,
        workflow: any,
        stepIndex: number,
        step: any,
        discussionMode: DiscussionMode,
        shouldRun: boolean
    ): Promise<string> {
        if (!shouldRun || discussionMode === 'off') return '';
        if (!this.checkBudget('discussion')) {
            await this.log('System', `Step ${stepIndex + 1} 토론 생략: discussion budget 초과`, { type: 'WARNING' });
            return '';
        }

        try {
            this.executionMetrics.discussionCalls += 1;
            const allAgents = AgentLoader.listAgents().filter(a => a.name !== 'git-manager');
            const participantRoles = this.resolveDiscussionParticipants(workflow, stepIndex, step.agent, discussionMode);
            const activeAgents = allAgents.filter(a => participantRoles.includes(this.normalizeAgentKey(a.role || a.name)));
            const participants = activeAgents.length > 0 ? activeAgents : allAgents;

            const analysisForStep = {
                summary: `Step ${stepIndex + 1} 사전 토론`,
                required_agents: participants.map(a => a.role),
                objective: step.description || `${step.action} 실행 품질 고도화`,
                overallTask: task.description,
                constraints: [
                    '다음 step과의 핸드오프 품질 보장',
                    '파일 경로/스킬 인자 정확성 우선',
                    '재시도 발생 가능성을 줄이는 선제적 리스크 제거',
                ],
            };

            const context = `${await this.profiler.getContextString()}\n\n${this.contextManager.getOptimizedContext(5000)}`;

            this.emitter?.emit({ type: 'skill_execute', skill: 'consult_agents', args: `step-${stepIndex + 1}` });
            const rawThoughts = await skills.consult_agents(
                analysisForStep,
                participants,
                context,
                this.emitter
            );
            const thoughts = Array.isArray(rawThoughts)
                ? rawThoughts.slice(0, this.executionOptions.maxDiscussionThoughts)
                : [];

            if (thoughts.length === 0) return '';

            let prevAgent = this.normalizeAgentKey(step.agent);
            for (const item of thoughts) {
                if (!item?.agent || !item?.thought) continue;
                await this.log(item.agent, `[Step ${stepIndex + 1} 토론] ${item.thought}`, {
                    type: 'THOUGHT',
                    thought_type: item.type || 'idea',
                    step: stepIndex,
                });
                const currentAgent = this.normalizeAgentKey(item.agent);
                this.recordCollaboration(prevAgent, currentAgent, 'step_discussion');
                prevAgent = currentAgent;
            }

            const { data: current } = await supabase
                .from('Tasks')
                .select('metadata')
                .eq('id', this.taskId)
                .single();
            const existing = Array.isArray(current?.metadata?.executionDiscussions)
                ? current.metadata.executionDiscussions
                : [];
            const entry = {
                step: stepIndex,
                action: step.action,
                createdAt: new Date().toISOString(),
                participants: participants.map(a => a.role),
                thoughts,
            };
            await this.updateMetadata({
                executionDiscussions: [...existing, entry],
                agentCollaboration: this.collaborationGraph,
                executionMetrics: this.executionMetrics,
                budgetPolicy: this.budgetPolicy,
            });
            this.emitter?.emit({
                type: 'skill_result',
                skill: 'consult_agents',
                summary: `Step ${stepIndex + 1} 토론 완료 (${thoughts.length}개 인사이트)`,
            });

            if (!this.executionOptions.carryDiscussionToPrompt) return '';

            return thoughts
                .map((t: any) => `- ${t.agent}: ${t.thought}`)
                .join('\n');
        } catch (error: any) {
            await this.log('System', `Step discussion skipped: ${error.message}`, { type: 'WARNING' });
            return '';
        }
    }

    private getSkillFunction(skillName: string) {
        if ((skills as any)[skillName]) {
            return (skills as any)[skillName];
        }
        
        // Fallback to the new Markdown-based Dynamic Skill Executor
        // This allows seamlessly running community skills loaded from SKILL.md
        return async (...args: any[]) => {
            return await skills.execute_skill(skillName, { args }, await this.profiler.getContextString(), this.emitter);
        };
    }

    // --- Phase 1: Planning ---
    public async plan(taskDescription: string) {
        try {
            const mainAgentName = this.mainAgentDef.name;
            await this.log(mainAgentName, `Initialized Planning Phase.`);
            await this.updateStatus('planning');
            this.emitter?.emit({ type: 'phase_start', phase: 'planning', taskId: this.taskId });

            // Fetch Project Path if available
            let projectPath = process.cwd();
            let codebaseContext = '';

            const task = await this.getTask();
            if (task && (task as any).project_id) {
                const { data: project } = await supabase.from('Projects').select('path').eq('id', (task as any).project_id).single();
                if (project?.path) {
                    projectPath = project.path;
                    this.profiler = new ProjectProfiler(projectPath);
                    await this.log(mainAgentName, `Scanning project at: ${projectPath}`, { type: 'System' });

                    try {
                        const profilerContext = await this.profiler.getContextString();
                        codebaseContext = profilerContext;

                        // Also Add package.json explicitly for more depth if needed
                        const pkgJson = await skills.read_codebase('package.json', projectPath);
                        this.contextManager.addFile('package.json', pkgJson);
                    } catch (error: any) {
                        await this.log(mainAgentName, `Initial scan failed: ${error.message}`, { type: 'WARNING' });
                    }
                }
            }

            // Load all available agents, excluding git-manager which is reserved for Orchestrator automation
            const availableAgents = AgentLoader.listAgents().filter(a => a.name !== 'git-manager');
            await this.log(mainAgentName, `Loaded ${availableAgents.length} potential agents.`);

            // Analyze with context
            this.emitter?.emit({ type: 'skill_execute', skill: 'analyze_task' });
            const analysis = await skills.analyze_task(taskDescription, availableAgents, codebaseContext, this.emitter);
            await this.log(mainAgentName, 'Task Analysis Completed', analysis);
            this.emitter?.emit({ type: 'skill_result', skill: 'analyze_task', summary: analysis.summary || 'Analysis complete' });

            // Create Workflow with context
            this.emitter?.emit({ type: 'skill_execute', skill: 'create_workflow' });

            // Inject consultation process - Agent Discussion Simulation
            await this.log(mainAgentName, "에이전트 그룹 논의 시작: 작업 범위를 확정하고 최적의 실행 계획을 수립합니다.", { type: 'THOUGHT' });
            this.emitter?.emit({ type: 'skill_execute', skill: 'consult_agents' });

            const discussion = await skills.consult_agents(analysis, availableAgents, codebaseContext, this.emitter);

            // Log each individual thought from the discussion
            console.log(`[Orchestrator] Saving ${discussion.length} discussion items to DB...`);
            for (const item of discussion) {
                if (!item.agent || !item.thought) continue;
                console.log(`[Orchestrator] Logging thought from ${item.agent}: ${item.thought.substring(0, 30)}...`);
                await this.log(item.agent, item.thought, { type: 'THOUGHT', thought_type: item.type || 'idea' });
                this.recordCollaboration(mainAgentName, item.agent, 'planning_discussion');
                // Small delay to make it feel more natural in the UI if needed
                await new Promise(resolve => setTimeout(resolve, 300));
            }


            const workflow = await skills.create_workflow(analysis, availableAgents, codebaseContext, this.emitter);
            const workflowSanity = this.sanitizePlannedWorkflow(workflow, analysis, availableAgents);
            this.seedCollaborationFromWorkflow(workflowSanity.workflow);

            // Log the discussion wrap-up in Korean
            await this.log(mainAgentName, '에이전트 간 협의가 완료되었습니다. 수립된 워크플로우를 저장합니다.', workflow);
            this.emitter?.emit({ type: 'skill_result', skill: 'create_workflow', summary: `${workflow.steps?.length || 0}개 단계의 워크플로우가 생성되었습니다.` });


            // Save Plan to Metadata
            await this.updateMetadata({
                analysis,
                workflow: workflowSanity.workflow,
                workflowSanity: {
                    source: workflowSanity.reason,
                    repairs: workflowSanity.repairs,
                    required_agents: workflowSanity.workflow.required_agents,
                },
                agentCollaboration: this.collaborationGraph,
            });

            // Wait for user confirmation
            await this.log(mainAgentName, 'Plan created. Waiting for user approval.');
            this.emitter?.emit({ type: 'done', status: 'planning_complete' });
        } catch (error: any) {
            await this.log('System', `Planning Phase Failed: ${error.message}`, { type: 'ERROR' });
            this.emitter?.emit({ type: 'error', message: error.message });
        }
    }

    // --- Phase 2: Execution ---

    // Skills that only need a file path or simple string — FAST model is sufficient
    private static readonly FAST_ARG_SKILLS = [
        'read_codebase', 'list_directory', 'check_environment', 'manage_git',
        'lint_code', 'typecheck', 'check_responsive', 'screenshot_page'
    ];

    private buildArgCacheKey(
        skillName: string,
        taskDescription: string,
        projectPath: string,
        techStack: string,
        stepDescription?: string
    ): string {
        return [
            this.normalizeAgentKey(skillName),
            this.normalizeAgentKey(taskDescription || ''),
            this.normalizeAgentKey(projectPath || ''),
            this.normalizeAgentKey(techStack || ''),
            this.normalizeAgentKey(stepDescription || ''),
        ].join('|');
    }

    private buildFastPathArgs(
        skillName: string,
        taskDescription: string,
        stepDescription?: string
    ): { arguments: any[]; cached: boolean } | null {
        const normalized = this.normalizeAgentKey(skillName);
        const baseText = `${stepDescription || ''} ${taskDescription || ''}`;

        const extractLikelyPath = (input: string): string | null => {
            const quotedMatch = input.match(/['"`]([^'"`]+)['"`]/);
            if (quotedMatch && quotedMatch[1]) {
                const value = quotedMatch[1].trim();
                if (value && /[./]/.test(value) && !value.startsWith('http')) {
                    return value;
                }
            }

            const tokens = input
                .split(/\s+/)
                .map((token) => token.replace(/[.,)]$/, '').trim())
                .filter(Boolean);
            const pathLike = tokens.find((token) =>
                /(?:^|\/)([A-Za-z0-9._-]+\/?)+/.test(token) && (/\.[A-Za-z0-9]+$/.test(token) || token === '.' || token === 'app' || token === 'src')
            );
            return pathLike || null;
        };

        if (normalized === 'read_codebase') {
            const pathArg = extractLikelyPath(baseText) || 'package.json';
            return { arguments: [pathArg], cached: true };
        }

        if (normalized === 'list_directory') {
            const pathArg = extractLikelyPath(baseText) || '.';
            return { arguments: [pathArg], cached: true };
        }

        if (normalized === 'manage_git') {
            const lower = baseText.toLowerCase();
            if (lower.includes('status')) return { arguments: ['status'], cached: true };
            if (lower.includes('add')) return { arguments: ['.'], cached: true };
            if (lower.includes('checkout')) return { arguments: ['.'], cached: true };
            if (lower.includes('commit')) {
                const quoteMatch = /"([^"]+)"|'([^']+)'/.exec(baseText);
                const commitMessage = quoteMatch ? (quoteMatch[1] || quoteMatch[2] || '').trim() : `${this.taskId.slice(0, 8)} changes`;
                return { arguments: ['commit', commitMessage], cached: true };
            }
            if (lower.includes('push')) return { arguments: ['push'], cached: true };
            if (lower.includes('merge')) return { arguments: [''], cached: true };
            return { arguments: ['status'], cached: true };
        }

        if (normalized === 'lint_code') {
            return { arguments: ['.'], cached: true };
        }

        if (normalized === 'typecheck') {
            return { arguments: ['.', 'tsconfig.json'], cached: true };
        }

        if (normalized === 'check_environment') {
            return { arguments: [], cached: true };
        }

        if (normalized === 'check_responsive' || normalized === 'screenshot_page') {
            const devUrl = process.env.DEV_SERVER_URL || 'http://localhost:3000';
            return { arguments: [devUrl], cached: true };
        }

        return null;
    }

    private async generateSkillArguments(
        skillName: string,
        taskDescription: string,
        projectPath: string,
        techStack: string,
        stepDescription?: string,
        modelTier: 'fast' | 'smart' = 'smart',
        contextBudget: number = 10000
    ): Promise<any[]> {
        if (!this.checkBudget('tokens')) {
            await this.log('System', `[Budget] ${skillName} 인자 생성을 건너뜁니다.`, { type: 'WARNING' });
            return [];
        }

        const cacheKey = this.buildArgCacheKey(skillName, taskDescription, projectPath, techStack, stepDescription);
        const cachedArgs = this.skillArgCache.get(cacheKey);
        if (cachedArgs) {
            return cachedArgs;
        }

        const fastPath = this.buildFastPathArgs(skillName, taskDescription, stepDescription);
        if (fastPath) {
            this.skillArgCache.set(cacheKey, fastPath.arguments);
            return fastPath.arguments;
        }

        const skillDef = AgentLoader.loadSkill(skillName);
        const inputsDef = skillDef.inputs ? `\nInputs Definition:\n${skillDef.inputs}` : '';

        // Get Optimized Context
        const dynamicContext = this.contextManager.getOptimizedContext(contextBudget);

        // Route to FAST model for skills that just need a path/simple arg
        const defaultModel = Orchestrator.FAST_ARG_SKILLS.includes(skillName)
            ? MODEL_CONFIG.FAST_MODEL
            : MODEL_CONFIG.SMART_MODEL;
        const model = modelTier === 'fast' ? MODEL_CONFIG.FAST_MODEL : defaultModel;

        const systemPrompt = `
You are an intelligent agent orchestrator.
Your goal is to generate the exact arguments needed to call a TypeScript function for a specific skill.

Skill Name: ${skillName}
Skill Instructions: ${skillDef.instructions}
${inputsDef}

Current Step Goal: ${stepDescription || taskDescription}
Overall Task: ${taskDescription}
Project Path: ${projectPath}
Tech Stack: ${techStack}

${await this.profiler.getContextString()}

${dynamicContext}

IMPORTANT RULES:
1. MANDATORY: ALWAYS use relative paths from the project root. DO NOT start with "/".
   GOOD: "app/some-feature/page.tsx", "components/Button.tsx", "src/utils/helpers.ts"
   BAD: "/app/some-feature/page.tsx", "/Users/yohan/projects/...", "/pages/login"
2. DO NOT include the Project Path in the arguments.
3. Generate ACTUAL values — NO placeholders like "filePath", "content".
4. Match the function signature exactly.
5. ROUTE MAPPING: When creating a new route page "[route-name]", ensure the file is generated inside the correct subfolder (e.g., "app/[route-name]/page.tsx"). DO NOT overwrite the root app/page.tsx.

Return ONLY a JSON object with a key "arguments" which is an array of actual values.
Example for read_codebase: { "arguments": ["package.json"] }
Example for write_code: { "arguments": ["app/some-feature/page.tsx", "export default function..."] }

IMPORTANT: All reasoning, documentation summaries, and user-facing messages MUST be in KOREAN.
중요: 모든 분석 결과와 설명, 메시지는 한국어로 작성하세요.
`;


        try {
            const response = await llm.generateJSONStream(
                systemPrompt,
                "Generate valid arguments for this skill based on the task.",
                '{ "arguments": [] }',
                this.emitter,
                model,
                () => this.refreshLock(),
                this.llmTelemetry({ action: skillName })
            );

            if (response.__tokens) {
                await this.accumulateTokens(response.__tokens.prompt_eval_count, response.__tokens.eval_count);
            }

            const args = Array.isArray((response as any)?.arguments) ? response.arguments : [];
            this.skillArgCache.set(cacheKey, args);
            return args;
        } catch (e: any) {
            console.error(`Failed to generate arguments for ${skillName}`, e);
            const fallback = this.buildFastPathArgs(skillName, taskDescription, stepDescription);
            if (fallback) {
                this.skillArgCache.set(cacheKey, fallback.arguments);
                return fallback.arguments;
            }
            return [];
        }
    }

    private async refreshLock() {
        try {
            await this.ensureMetadataCache();
            this.metadataCache = {
                ...(this.metadataCache || {}),
                lock: {
                    held_since: Date.now(),
                    process_id: process.pid
                }
            };
            await this.flushMetadataCache(true);
            // console.log(`[System] Lock refreshed at ${new Date().toLocaleTimeString()}`);
        } catch (e) {
            console.error('Failed to refresh lock:', e);
        }
    }

    private async accumulateTokens(promptTokens: number, evalTokens: number) {
        try {
            this.executionMetrics.promptTokens += promptTokens;
            this.executionMetrics.completionTokens += evalTokens;
            this.executionMetrics.totalTokens += promptTokens + evalTokens;
            if (this.activeStepIndex !== null && this.executionMetrics.stepMetrics[this.activeStepIndex]) {
                const stepMetric = this.executionMetrics.stepMetrics[this.activeStepIndex];
                stepMetric.promptTokens += promptTokens;
                stepMetric.completionTokens += evalTokens;
            }

            await this.ensureMetadataCache();
            const existingTokens = this.metadataCache?.tokens || { prompt: 0, completion: 0, total: 0 };
            
            const newTokens = {
                prompt: existingTokens.prompt + promptTokens,
                completion: existingTokens.completion + evalTokens,
                total: existingTokens.total + promptTokens + evalTokens
            };

            this.metadataCache = {
                ...(this.metadataCache || {}),
                tokens: newTokens,
                executionMetrics: this.executionMetrics,
            };
            await this.flushMetadataCache(false);

            // Emit token update to UI if needed
            this.emitter?.emit({ type: 'llm_token_usage', tokens: newTokens });
        } catch (e) {
            console.error('Failed to record token usage:', e);
        }
    }

    public async execute(startFromStep?: number, options?: ExecutionOptions) {
        try {
            // Check if task exists and its status
            const { data: task, error: fetchError } = await supabase.from('Tasks').select('*').eq('id', this.taskId).single();
            if (fetchError || !task) {
                console.error('Task not found:', this.taskId);
                this.emitter?.emit({ type: 'error', message: 'Task not found' });
                return;
            }
            this.metadataCache = task.metadata || {};

            // --- Persistent Lock Check ---
            const currentLock = task.metadata?.lock;
            const now = Date.now();
            const LOCK_TIMEOUT = 60_000;

            if (task.status === 'working' && currentLock) {
                const lockAge = now - currentLock.held_since;
                if (lockAge < LOCK_TIMEOUT) {
                    console.log(`[System] Execution blocked: Task is already active (Lock held since ${new Date(currentLock.held_since).toISOString()}).`, {});
                    this.emitter?.emit({ type: 'error', message: `Task is currently being processed by another instance (Lock age: ${Math.round(lockAge / 1000)}s)` });
                    return;
                } else {
                    console.log(`[System] Detected stale lock (${Math.round(lockAge / 1000)}s). Proceeding with execution takeover.`, {});
                }
            }

            // 2. Acquire/Refresh Lock
            await this.updateMetadata({
                lock: { held_since: now, process_id: process.pid }
            });

            // Prevent auto-resume if task already failed (unless explicitly called via retry)
            if (task.status === 'failed' && startFromStep === undefined) {
                await this.log('System', 'Task is in a failed state. Skipping auto-resume. Use retry.');
                this.emitter?.emit({ type: 'done', status: 'failed_auto_halt' });
                return;
            }

            // Determine where to start: explicit arg > saved progress > 0
            const lastStep = task.metadata?.progress?.currentStep;
            const resumeFrom = startFromStep !== undefined ? startFromStep : (lastStep !== undefined ? lastStep : 0);

            // Fetch Project Path if available
            let projectPath = process.cwd();
            if ((task as any).project_id) {
                const { data: project } = await supabase.from('Projects').select('path').eq('id', (task as any).project_id).single();
                if (project?.path) {
                    projectPath = project.path;
                    this.profiler = new ProjectProfiler(projectPath);
                    this.log('System', `Using Project Path: ${projectPath}`);
                }
            }

            const mainAgentName = this.mainAgentDef.name;
            const workflowAgents = AgentLoader.listAgents();
            const workflowSanity = this.sanitizePlannedWorkflow(task.metadata?.workflow, task.metadata?.analysis, workflowAgents);
            const workflow = workflowSanity.workflow;
            if (workflowSanity.repairs.length > 0) {
                await this.updateMetadata({
                    executionRepairs: [
                        ...(task.metadata?.executionRepairs || []),
                        ...workflowSanity.repairs.map((repair, idx) => ({
                            stage: 'runtime',
                            step: idx,
                            repair,
                            at: new Date().toISOString(),
                        })),
                    ],
                });
                await this.log(mainAgentName, `워크플로우 실행 시작 전 정합성 보정 적용: ${workflowSanity.reason}`, { type: 'WARNING' });
            }
            this.executionOptions = this.resolveExecutionOptions(task.metadata, options);
            this.budgetPolicy = this.resolveBudgetPolicy(task.metadata, this.executionOptions.strategyPreset);
            const existingMetrics = task.metadata?.executionMetrics;
            this.executionMetrics = {
                startedAt: existingMetrics?.startedAt || new Date().toISOString(),
                profile: this.executionOptions.strategyPreset,
                llmCalls: Number(existingMetrics?.llmCalls) || 0,
                promptTokens: Number(existingMetrics?.promptTokens) || 0,
                completionTokens: Number(existingMetrics?.completionTokens) || 0,
                totalTokens: Number(existingMetrics?.totalTokens) || 0,
                skillCalls: Number(existingMetrics?.skillCalls) || 0,
                skillLatencyMs: Number(existingMetrics?.skillLatencyMs) || 0,
                dbUpdates: Number(existingMetrics?.dbUpdates) || 0,
                discussionCalls: Number(existingMetrics?.discussionCalls) || 0,
                budgetEvents: Array.isArray(existingMetrics?.budgetEvents) ? existingMetrics.budgetEvents : [],
                stepMetrics: existingMetrics?.stepMetrics && typeof existingMetrics.stepMetrics === 'object'
                    ? existingMetrics.stepMetrics
                    : {},
            };
            this.collaborationGraph =
                task.metadata?.agentCollaboration && typeof task.metadata.agentCollaboration === 'object'
                    ? (task.metadata.agentCollaboration as CollaborationGraph)
                    : {};
            this.seedCollaborationFromWorkflow(workflow);
            await this.updateMetadata({
                executionOptions: this.executionOptions,
                budgetPolicy: this.budgetPolicy,
                executionMetrics: this.executionMetrics,
                agentCollaboration: this.collaborationGraph
            });
            await this.updateStatus('working');
            skills.reset_runtime_caches();
            this.emitter?.emit({ type: 'phase_start', phase: 'execution', taskId: this.taskId });

            // Create a new branch for this task BEFORE making any changes
            const branchName = `feature/task-${this.taskId.slice(0, 8)}`;
            try {
                await this.log(mainAgentName, `Creating feature branch: ${branchName}`);
                await skills.manage_git('checkout', `-b ${branchName}`, projectPath);
                await this.updateMetadata({ branchName });
                await this.log(mainAgentName, `Switched to branch: ${branchName}`);
            } catch (branchError: any) {
                // Branch might already exist, try to switch to it
                await this.log(mainAgentName, `Branch creation failed, attempting to switch: ${branchError.message}`);
                try {
                    await skills.manage_git('checkout', branchName, projectPath);
                    await this.updateMetadata({ branchName });
                } catch (switchError: any) {
                    await this.log(mainAgentName, `Warning: Could not switch to feature branch: ${switchError.message}`, { type: 'WARNING' });
                }
            }

            // 1. Scan Project Context and Tech Stack
            // (Simplified for now, in reality we might want a 'ProjectAnalyst' agent to do this)
            const dirList = await skills.list_directory('.', projectPath);
            const isNode = Array.isArray(dirList) && dirList.some((f: string) => f.includes('package.json'));
            let techStack = 'static-html';

            if (isNode) {
                try {
                    const pkgJson = await skills.read_codebase('package.json', projectPath);
                    // Add package.json to context so the agent knows about dependencies (tailwind, shadcn, etc.)
                    this.contextManager.addFile('package.json', pkgJson);

                    if (pkgJson.includes('next')) techStack = 'nextjs';
                    else if (pkgJson.includes('react')) techStack = 'react';
                    else techStack = 'react'; // Changed from 'node-generic' to 'react' as per instruction
                } catch (e: any) { /* ignore */ }
            }
            await this.log(mainAgentName, `Detected Tech Stack: ${techStack}`);

            // Initial Scan
            try {
                const initialDirList = await skills.list_directory('.', projectPath);
                this.contextManager.addLog('System', `Initial Directory Scan: ${JSON.stringify(initialDirList?.slice(0, 5))}...`);
            } catch (e: any) { }

            // Attached components: pre-load into context for page/component tasks
            const attachedPaths = task.metadata?.attachedComponentPaths as string[] | undefined;
            if (Array.isArray(attachedPaths) && attachedPaths.length > 0) {
                for (const filePath of attachedPaths) {
                    try {
                        const content = await skills.read_codebase(filePath, projectPath);
                        if (content && typeof content === 'string' && !content.startsWith('File "')) {
                            this.contextManager.addFile(filePath, content);
                            await this.log(mainAgentName, `Attached component loaded: ${filePath}`, { type: 'System' });
                        }
                    } catch (e: any) {
                        await this.log(mainAgentName, `Could not load attached component ${filePath}: ${e.message}`, { type: 'WARNING' });
                    }
                }
            }

            // Initialize progress tracking
            const totalSteps = workflow.steps.length;
            const existingCompleted = task.metadata?.progress?.completedSteps || [];
            await this.updateProgress({
                currentStep: resumeFrom,
                totalSteps,
                currentAction: '',
                currentAgent: '',
                completedSteps: existingCompleted,
                startedAt: resumeFrom === 0 ? new Date().toISOString() : (task.metadata?.progress?.startedAt || new Date().toISOString()),
                stepStatus: 'pending'
            });

            if (resumeFrom > 0) {
                await this.log(mainAgentName, `Resuming execution from step ${resumeFrom + 1} of ${totalSteps}.`);
            }

            let previousStepAgent: string | null = resumeFrom > 0
                ? this.normalizeAgentKey(workflow.steps[resumeFrom - 1]?.agent || '')
                : null;
            const stepExecutionAgents = workflowAgents;
            const actionCatalog = this.buildActionCatalog();

            for (let stepIndex = resumeFrom; stepIndex < workflow.steps.length; stepIndex++) {
                // Heartbeat/Lock Refresh: Update metadata periodically to show we are still alive
                if (stepIndex > resumeFrom) {
                    await this.updateMetadata({ lock: { held_since: Date.now(), process_id: process.pid } }, false);
                }

                const normalizedStep = this.normalizeExecutionStep(workflow.steps[stepIndex], stepExecutionAgents, actionCatalog);
                const step = normalizedStep.resolvedStep;
                const stepAgentDef = normalizedStep.stepAgentDef;
                if (!stepAgentDef) {
                    await this.log('System', `No executable agent found for step ${stepIndex + 1}`, { type: 'ERROR' });
                    await this.updateMetadata({
                        executionRepairs: [
                            ...(task.metadata?.executionRepairs || []),
                            {
                                step: stepIndex,
                                action: step.action,
                                repairs: normalizedStep.repairs,
                                timestamp: new Date().toISOString(),
                            },
                        ],
                    });
                    return;
                }
                const action = step.action;
                const agentRoleSlug = this.normalizeAgentKey(stepAgentDef.role);
                const stepPolicy = resolveStepPolicy({
                    strategyPreset: this.executionOptions.strategyPreset,
                    discussionMode: this.executionOptions.discussionMode,
                    action,
                    stepIndex,
                    totalSteps,
                    maxSkillRetries: this.budgetPolicy.maxSkillRetries,
                    currentTotalTokens: this.executionMetrics.totalTokens,
                    budgetPolicy: this.budgetPolicy,
                });
                if (normalizedStep.repairs.length > 0) {
                    await this.updateMetadata({
                        workflowRepairs: [
                            ...(task.metadata?.workflowRepairs || []),
                            ...normalizedStep.repairs.map((repair: string) => ({
                                step: stepIndex,
                                repair,
                                at: new Date().toISOString(),
                            })),
                        ],
                    });
                    for (const repair of normalizedStep.repairs) {
                        await this.log(mainAgentName, `[실행 정규화] Step ${stepIndex + 1}: ${repair}`, { type: 'WARNING' });
                    }
                }
                this.recordCollaboration(previousStepAgent, agentRoleSlug, 'step_handoff');

                try {
                    this.activeStepIndex = stepIndex;
                    const stepMetric = this.ensureStepMetric(stepIndex, action, stepAgentDef.name);
                    stepMetric.status = 'running';
                    stepMetric.startedAt = stepMetric.startedAt || new Date().toISOString();
                    const skillFunc = this.getSkillFunction(action);
                    const discussionGuidance = await this.runStepDiscussion(
                        task,
                        workflow,
                        stepIndex,
                        step,
                        stepPolicy.discussionMode,
                        stepPolicy.shouldRunDiscussion
                    );
                    const stepGoalWithDiscussion = discussionGuidance
                        ? `${step.description || ''}\n\n[팀 토론 인사이트]\n${discussionGuidance}`
                        : (step.description || task.description);

                    // Update progress: step starting
                    await this.updateProgress({
                        currentStep: stepIndex,
                        currentAction: action,
                        currentAgent: stepAgentDef.name,
                        stepStatus: 'running'
                    }, false);
                    this.emitter?.emit({
                        type: 'step_start',
                        step: stepIndex,
                        total: totalSteps,
                        action,
                        agent: stepAgentDef.name
                    });
                    this.emitter?.markStepStart();

                    // --- EXECUTION WITH RETRY/SELF-HEAL LOOP ---
                    let stepSuccess = false;
                    let executionError: any = null;
                    const MAX_STEP_RETRIES = stepPolicy.maxSkillRetries;

                    for (let stepAttempt = 0; stepAttempt <= MAX_STEP_RETRIES; stepAttempt++) {
                        const skillAttemptStartedAt = Date.now();
                        this.executionMetrics.skillCalls += 1;
                        stepMetric.skillCalls += 1;
                        try {
                            if (stepAttempt > 0) {
                                await this.log(mainAgentName, `Self-Heal Attempt ${stepAttempt} for action: ${action}`, { type: 'WARNING' });
                                // Add log to context about the failure
                                this.contextManager.addLog('System', `Previous attempt for ${action} failed: ${executionError?.message}. Retrying with same goal.`);
                            }

                            if (skillFunc) {
                                // THOUGHT: Agent is thinking about arguments
                                await this.log(mainAgentName, `Generative Logic: Determining arguments for ${action}...`, { type: 'THOUGHT' });

                                // --- SPECIAL HANDLING: write_code uses CODING model directly ---
                                if (action === 'write_code') {
                                    if (!this.checkBudget('tokens')) {
                                        throw new Error('Token budget exceeded before code generation');
                                    }
                                    const codePrompt = `${stepGoalWithDiscussion}\n\nOverall task: ${task.description}`;

                                    await this.log(stepAgentDef.name, `Generating code with CODING model for: ${step.description || task.description}`, { type: 'ACTION' });
                                    this.emitter?.emit({ type: 'skill_execute', skill: action, args: step.description });

                                    let codeResult;
                                    let contextSize = 3000;
                                    let attempt = 0;
                                    const maxAttempts = 3;

                                    while (attempt < maxAttempts) {
                                        const contextData = this.contextManager.getOptimizedContext(contextSize);
                                        let augmentedContext = contextData;
                                        if (this.profiler) {
                                            const profilerData = await this.profiler.getContextString();
                                            augmentedContext = `${profilerData}\n\n${contextData}`;
                                        }

                                        codeResult = await llm.generateCodeStream(
                                            codePrompt,
                                            augmentedContext,
                                            this.emitter,
                                            MODEL_CONFIG.CODING_MODEL,
                                            techStack,
                                            () => this.refreshLock(),
                                            this.llmTelemetry({ action, agent: stepAgentDef.name })
                                        );

                                        if (codeResult?.tokens) {
                                            await this.accumulateTokens(codeResult.tokens.prompt_eval_count, codeResult.tokens.eval_count);
                                        }

                                        if (!codeResult.error) break;

                                        if (codeResult.content.includes('timed out') || codeResult.content.includes('AbortError') || codeResult.content.includes('too large')) {
                                            attempt++;
                                            if (attempt < maxAttempts) {
                                                contextSize = Math.floor(contextSize / 1.5);
                                                continue;
                                            }
                                        }
                                        break;
                                    }

                                    if (codeResult && !codeResult.error && codeResult.files.length > 0) {
                                        const { data: metaForChanges } = await supabase.from('Tasks').select('metadata').eq('id', this.taskId).single();
                                        const existingChanges = metaForChanges?.metadata?.fileChanges || [];
                                        const existingRepairs = metaForChanges?.metadata?.executionRepairs || [];
                                        const writtenPaths: string[] = [];

                                        for (const file of codeResult.files) {
                                            const normalizedPath = await this.normalizeWriteTargetPath(
                                                file.path,
                                                task.description || '',
                                                step.description || '',
                                                stepGoalWithDiscussion
                                            );
                                            if (normalizedPath.failed) {
                                                throw new Error(`write_code path normalization failed: ${normalizedPath.message}`);
                                            }

                                            if (normalizedPath.repairs.length > 0) {
                                                existingRepairs.push(this.buildExecutionRepairRecord(stepIndex, action, normalizedPath.repairs.join(' | ')));
                                                await this.updateMetadata({ executionRepairs: existingRepairs });
                                            }

                                            const writeResult = await skillFunc(normalizedPath.path, file.content, projectPath);
                                            if (!writeResult?.success) {
                                                const detail = writeResult?.message || 'write_code execution returned failure';
                                                existingRepairs.push(this.buildExecutionRepairRecord(stepIndex, action, detail));
                                                await this.updateMetadata({ executionRepairs: existingRepairs });
                                                throw new Error(detail);
                                            }

                                            if (writeResult?.filePath) {
                                                existingChanges.push({
                                                    filePath: normalizedPath.path,
                                                    before: writeResult.before,
                                                    after: writeResult.after,
                                                    isNew: writeResult.isNew,
                                                    agent: stepAgentDef.name,
                                                    stepIndex
                                                });
                                                writtenPaths.push(normalizedPath.path);
                                            }
                                            const reportPath = normalizedPath.path;
                                            this.contextManager.addFile(reportPath, file.content);
                                            this.contextManager.addLog(stepAgentDef.name, `Wrote ${reportPath}`);
                                            await this.log(stepAgentDef.name, `Wrote file: ${reportPath}`, { type: 'RESULT' });
                                        }

                                        await this.updateMetadata({ fileChanges: existingChanges });
                                        const resultSummary = `Wrote ${writtenPaths.length} file(s): ${writtenPaths.join(', ')}`;
                                        this.emitter?.emit({ type: 'skill_result', skill: action, summary: resultSummary });
                                    } else {
                                        const errMsg = codeResult?.error ? codeResult.content : 'No files generated by CODING model';
                                        if (codeResult?.content) {
                                            console.warn('[Orchestrator] Code generation failed to extract files. Raw content starts with:', codeResult.content.slice(0, 200));
                                        }
                                        throw new Error(`Code generation failed: ${errMsg}`);
                                    }
                                } else {
                                    let args = await this.generateSkillArguments(
                                        action,
                                        task.description,
                                        projectPath,
                                        techStack,
                                        stepGoalWithDiscussion,
                                        stepPolicy.modelTier,
                                        stepPolicy.contextBudget
                                    );

                                    const filesystemSkills = ['read_codebase', 'run_shell_command', 'manage_git', 'list_directory'];
                                    if (filesystemSkills.includes(action)) {
                                        if (args.length === 0 || args[args.length - 1] !== projectPath) {
                                            args.push(projectPath);
                                        }
                                    }

                                    await this.log(stepAgentDef.name, `Executing ${action}`, { args, type: 'ACTION' });
                                    this.emitter?.emit({ type: 'skill_execute', skill: action, args: args.length > 0 ? args[0] : undefined });

                                    // Special handling for skills that require the emitter (analyze_task, create_workflow)
                                    const metaSkills = ['analyze_task', 'create_workflow'];
                                    if (metaSkills.includes(action) && this.emitter) {
                                        // analyze_task: (taskDesc, availableAgents, codebaseContext, emitter)
                                        // Ensure we don't have too many args and append emitter at the right position (4th)
                                        if (args.length > 3) args = args.slice(0, 3);
                                        while (args.length < 3) args.push(undefined);
                                        args.push(this.emitter);
                                    }

                                    const result = await skillFunc(...args);

                                    if (action === 'read_codebase' && typeof result === 'string') {
                                        const filePath = args[0];
                                        this.contextManager.addFile(filePath, result);
                                    }
                                    else if (action === 'read_codebase' && typeof result === 'object' && result.content) {
                                        const filePath = args[0];
                                        this.contextManager.addFile(filePath, result.content);
                                    }

                                    this.contextManager.addLog(stepAgentDef.name, `Executed ${action}. Result summary: ${JSON.stringify(result).slice(0, 200)}...`);
                                    await this.log(stepAgentDef.name, `Executed ${action}`, { result, type: 'RESULT' });
                                    const resultSummary = typeof result === 'string' ? result.slice(0, 100) : (result?.message || JSON.stringify(result).slice(0, 100));
                                    this.emitter?.emit({ type: 'skill_result', skill: action, summary: resultSummary });
                                }
                                stepSuccess = true;
                                const skillAttemptLatency = Date.now() - skillAttemptStartedAt;
                                this.executionMetrics.skillLatencyMs += skillAttemptLatency;
                                stepMetric.skillLatencyMs += skillAttemptLatency;
                                break; // Exit attempt loop on success
                            } else {
                                throw new Error(`Runtime function for skill ${action} not found.`);
                            }
                        } catch (err: any) {
                            const skillAttemptLatency = Date.now() - skillAttemptStartedAt;
                            this.executionMetrics.skillLatencyMs += skillAttemptLatency;
                            stepMetric.skillLatencyMs += skillAttemptLatency;
                            executionError = err;
                            await this.log(mainAgentName, `Step ${stepIndex + 1} attempt ${stepAttempt + 1} failed: ${err.message}`, { type: 'WARNING' });

                            if (stepAttempt < MAX_STEP_RETRIES) {
                                // Attempt self-analysis
                                try {
                                    const analysis = await skills.analyze_error_logs(err.message);
                                    await this.log(mainAgentName, `Error Analysis: ${analysis.cause}. Recommendation: ${analysis.solution}`, { type: 'THOUGHT' });
                                    this.contextManager.addLog('System', `Error Analysis: ${analysis.cause}. Suggestion: ${analysis.solution}`);
                                } catch (analErr) { /* ignore analysis failure */ }
                                continue;
                            }
                        }
                    }

                    if (!stepSuccess) {
                        throw executionError || new Error(`Step execution failed after retries.`);
                    }

                    // Update progress: step completed
                    const stepDuration = this.emitter?.markStepEnd() || 0;
                    await this.ensureMetadataCache();
                    const completedSteps = this.metadataCache?.progress?.completedSteps || [];
                    await this.updateProgress({
                        completedSteps: [...completedSteps, action],
                        stepStatus: 'completed'
                    }, false);
                    stepMetric.status = 'completed';
                    stepMetric.endedAt = new Date().toISOString();
                    await this.updateMetadata({
                        executionMetrics: this.executionMetrics,
                        budgetPolicy: this.budgetPolicy,
                        agentCollaboration: this.collaborationGraph
                    });
                    previousStepAgent = agentRoleSlug;

                    // Emit step_complete with ETA
                    const eta = this.emitter?.calculateETA(stepIndex, totalSteps) || 0;
                    this.emitter?.emit({
                        type: 'step_complete',
                        step: stepIndex,
                        total: totalSteps,
                        duration: stepDuration,
                        eta
                    });
                    this.emitter?.emitProgress(stepIndex, totalSteps);

                    // Persist context state for retry recovery
                    await this.contextManager.saveState();

                } catch (err: any) {
                    await this.log(mainAgentName, `Fatal failure in agent ${agentRoleSlug} during ${action}: ${err.message}`, { type: 'ERROR' });
                    this.contextManager.addLog('System', `Error executing ${action}: ${err.message}`);
                    this.emitter?.emit({ type: 'error', message: err.message, step: stepIndex });

                    // Update progress: step failed
                    await this.updateProgress({
                        stepStatus: 'failed'
                    }, false);

                    const failedStepMetric = this.executionMetrics.stepMetrics[stepIndex];
                    if (failedStepMetric) {
                        failedStepMetric.status = 'failed';
                        failedStepMetric.endedAt = new Date().toISOString();
                    }
                    // Save error metadata for retry functionality
                    const errorMetadata: ErrorMetadata = {
                        lastError: err.message,
                        failedStep: stepIndex,
                        failedAction: action,
                        failedAgent: agentRoleSlug,
                        retryCount: (task.metadata?.retryCount || 0) + 1,
                        failedAt: new Date().toISOString(),
                        previousStatus: task.status
                    };
                    await this.updateMetadata(errorMetadata, false);
                    await this.updateMetadata({ executionMetrics: this.executionMetrics, budgetPolicy: this.budgetPolicy });
                    await this.updateStatus('failed');
                    await this.log('System', `Task marked as failed. Can be retried from step ${stepIndex + 1}.`, { type: 'ERROR' });
                    this.emitter?.emit({ type: 'done', status: 'failed' });
                    return; // Exit instead of throwing
                }
            }

            this.executionMetrics.endedAt = new Date().toISOString();
            await this.updateStatus('testing');
            await this.log(mainAgentName, 'Workflow Execution Completed. Task moved to Testing phase.');
            // Release lock on success
            await this.updateMetadata({
                lock: null,
                executionMetrics: this.executionMetrics,
                budgetPolicy: this.budgetPolicy,
            });
            this.emitter?.emit({ type: 'done', status: 'execution_complete' });
        } catch (error: any) {
            await this.log('System', `Execution Phase Failed: ${error.message}`, { type: 'ERROR' });
            await this.updateStatus('failed');
            // Release lock on fatal error
            this.executionMetrics.endedAt = new Date().toISOString();
            await this.updateMetadata({
                lock: null,
                lastError: error.message,
                failedAt: new Date().toISOString(),
                retryCount: ((await this.getTask())?.metadata?.retryCount || 0) + 1,
                executionMetrics: this.executionMetrics,
                budgetPolicy: this.budgetPolicy,
            });
            this.emitter?.emit({ type: 'error', message: error.message });
            this.emitter?.emit({ type: 'done', status: 'failed' });
        } finally {
            // Orchestrator.runningTasks is no longer used, we rely on DB lock
        }
    }

    // --- Phase 3: Verification ---
    public async verify() {
        try {
            const mainAgentName = this.mainAgentDef.name;
            await this.updateStatus('testing');
            this.emitter?.emit({ type: 'phase_start', phase: 'verification', taskId: this.taskId });

            // Fetch Project Path
            let projectPath = process.cwd();
            const task = await this.getTask();
            if (task && (task as any).project_id) {
                const { data: project } = await supabase.from('Projects').select('path').eq('id', (task as any).project_id).single();
                if (project?.path) {
                    projectPath = project.path;
                    this.log('System', `Using Project Path for Verification: ${projectPath}`);
                }
            }

            this.emitter?.emit({ type: 'skill_execute', skill: 'verify_final_output' });
            const verification = await skills.verify_final_output(task?.description || 'No description', projectPath);
            await this.log(mainAgentName, 'Final Verification', verification);
            await this.updateMetadata({ verification });
            this.emitter?.emit({ type: 'skill_result', skill: 'verify_final_output', summary: verification.verified ? 'Verified' : 'Failed' });

            if (verification.verified) {
                // Browser-based visual verification (non-blocking)
                const browserAvailable = await isAgentBrowserAvailable();
                if (browserAvailable) {
                    try {
                        const devServerUrl = process.env.DEV_SERVER_URL || 'http://localhost:3000';
                        this.emitter?.emit({ type: 'skill_execute', skill: 'screenshot_page' });
                        const screenshotResult = await skills.screenshot_page(devServerUrl, true);
                        if (screenshotResult.success) {
                            await this.log(mainAgentName, 'Page screenshot captured', { screenshotPath: screenshotResult.screenshotPath });
                        }

                        this.emitter?.emit({ type: 'skill_execute', skill: 'check_responsive' });
                        const responsiveResult = await skills.check_responsive(devServerUrl);
                        await this.log(mainAgentName, 'Responsive check completed', { summary: responsiveResult.summary });

                        await this.updateMetadata({
                            visualVerification: {
                                screenshotPath: screenshotResult.screenshotPath,
                                responsiveSummary: responsiveResult.summary,
                                mobile: responsiveResult.mobile?.ok,
                                tablet: responsiveResult.tablet?.ok,
                                desktop: responsiveResult.desktop?.ok,
                                checkedAt: new Date().toISOString(),
                            },
                        });
                        this.emitter?.emit({ type: 'skill_result', skill: 'check_responsive', summary: responsiveResult.summary });
                    } catch (browserErr: any) {
                        await this.log('System', `Browser visual verification skipped: ${browserErr.message}`);
                    }
                }

                await this.log(mainAgentName, 'Verification Successful. Starting Git Automation...');
                this.emitter?.emit({ type: 'skill_execute', skill: 'manage_git' });

                // Get branch name from metadata (created during execute phase)
                const branchName = task?.metadata?.branchName || `feature/task-${this.taskId.slice(0, 8)}`;
                const fileChanges = task?.metadata?.fileChanges || [];

                // Dynamic Git Details Generation (commit message and PR details)
                const fileSummary = fileChanges.map((f: any) => `- ${f.isNew ? '[NEW]' : '[MOD]'} ${f.filePath}`).join('\n');

                const systemPrompt = `
You are a Lead DevOps Engineer.
Generate a concise and professional PR description based on the task and the actual file changes.
Task: ${task?.description || 'Update'}
File Changes:
${fileSummary}

Return JSON: { "commitMessage": "feat: ...", "prTitle": "...", "prBody": "..." }
Use 'feat:', 'fix:', 'refactor:' conventions for commit messages.
`;
                let gitDetails = {
                    commitMessage: `feat: Task ${this.taskId.slice(0, 8)} implementation`,
                    prTitle: `feat: Task ${this.taskId.slice(0, 8)}`,
                    prBody: `Automated PR for task ${this.taskId}\n\n### Changes\n${fileSummary}`
                };

                try {
                    const generated = await llm.generateJSONStream(
                        systemPrompt,
                        "Generate professional git details based on changes",
                        "{}",
                        this.emitter,
                        MODEL_CONFIG.FAST_MODEL,
                        () => this.refreshLock(),
                        this.llmTelemetry({ action: 'manage_git', agent: mainAgentName })
                    );
                    
                    if (generated.__tokens) {
                        await this.accumulateTokens(generated.__tokens.prompt_eval_count, generated.__tokens.eval_count);
                    }

                    if (generated.commitMessage && generated.commitMessage.trim()) {
                        gitDetails.commitMessage = generated.commitMessage.trim();
                    }
                    if (generated.prTitle && generated.prTitle.trim()) {
                        gitDetails.prTitle = generated.prTitle.trim();
                    }
                    if (generated.prBody && generated.prBody.trim()) {
                        gitDetails.prBody = generated.prBody.trim();
                    }
                } catch (e) {
                    console.warn('Failed to generate dynamic git details, using defaults.');
                }
                
                // Securely escape double quotes for Bash execution
                const safeTitle = gitDetails.prTitle.replace(/"/g, '\\"');
                const safeBody = gitDetails.prBody.replace(/"/g, '\\"');

                try {
                    // Branch was already created in execute(), just commit, push and create PR
                    await this.log(mainAgentName, 'Staging changes...');
                    await skills.manage_git('add', '.', projectPath);

                    await this.log(mainAgentName, `Committing: ${gitDetails.commitMessage}`);
                    await skills.manage_git('commit', gitDetails.commitMessage, projectPath);

                    await this.log(mainAgentName, `Pushing to ${branchName}...`);
                    await skills.manage_git('push', `origin ${branchName}`, projectPath);

                    await this.log(mainAgentName, 'Creating Pull Request...');
                    // Create PR from feature branch to main
                    await skills.manage_git('create_pr', `--fill --title "${safeTitle}" --body "${safeBody}"`, projectPath);

                    await this.log(mainAgentName, `Git Automation Completed (Commit, Push, PR on branch ${branchName}).`);
                    this.emitter?.emit({ type: 'skill_result', skill: 'manage_git', summary: `PR created on ${branchName}` });

                } catch (gitError: any) {
                    const errorMsg = gitError.message || String(gitError);
                    console.error('Git Automation Failed:', errorMsg);
                    await this.log(mainAgentName, `Git Automation Failed: ${errorMsg}`, { type: 'ERROR' });
                    // Even if git fails, we might want to stay in 'working' or 'testing' but for now 'failed' is clearer if the user expects a PR
                    // Actually, let's keep it in 'testing' but mark as warning if we can, or just keep it 'working'.
                    // The user said it moves to 'Review' but PR is not created.
                    // We should only move to 'review' if PR is created successfully? 
                    // Or move to 'review' and tell them to do it manually.

                    if (errorMsg.includes('gh') || errorMsg.includes('GitHub CLI')) {
                        await this.log('System', 'NOTE: PR creation skipped because GitHub CLI is not configured. Please handle the PR manually.', { type: 'ERROR' });
                    }

                    // Do NOT move to review if hit a hard git error?
                    // Let's throw so it hits the main catch and stays in 'failed'
                    throw gitError;
                }

                await this.updateStatus('review');
                await this.log(mainAgentName, 'Task moved to Review');
                // Ensure lock is cleared if it was somehow held
                await this.updateMetadata({ lock: null });
                this.emitter?.emit({ type: 'done', status: 'review' });
            } else {
                this.emitter?.emit({ type: 'done', status: 'verification_failed' });
            }
        } catch (error: any) {
            await this.log('System', `Verification Phase Failed: ${error.message}`, { type: 'ERROR' });
            await this.updateStatus('failed');
            await this.updateMetadata({
                lastError: error.message,
                failedAction: 'verify',
                failedAt: new Date().toISOString(),
                retryCount: ((await this.getTask())?.metadata?.retryCount || 0) + 1
            });
            this.emitter?.emit({ type: 'error', message: error.message });
            this.emitter?.emit({ type: 'done', status: 'failed' });
        }
    }

    // --- Retry: Resume from failed step ---
    public async retry() {
        try {
            const task = await this.getTask();
            if (!task || task.status !== 'failed') {
                await this.log('System', 'Task is not in failed state. Cannot retry.');
                return;
            }

            const failedStep = task.metadata?.failedStep;
            const failedAction = task.metadata?.failedAction;

            await this.log('System', `Retrying task from step ${failedStep !== undefined ? failedStep + 1 : 'beginning'}...`);

            // Restore context from previous execution
            await this.contextManager.restoreState();

            // If failed during verification, retry verification
            if (failedAction === 'verify') {
                await this.verify();
                return;
            }

            // Resume execution from the failed step instead of restarting
            const resumeFrom = typeof failedStep === 'number' ? failedStep : 0;
            await this.execute(resumeFrom);
        } catch (error: any) {
            await this.log('System', `Retry failed: ${error.message}`, { type: 'ERROR' });
        }
    }
}
