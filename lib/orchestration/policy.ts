import { DEFAULT_BUDGET_POLICY, ExecutionBudgetPolicy, StrategyPreset } from './metrics';

/** 프리셋별 워크플로 스텝당 여유 + 플랜·토론·Dev QA 등 고정 버퍼(토큰) */
const PRESET_TOKEN_SCALING: Record<StrategyPreset, { perStep: number; postBuffer: number }> = {
    quality_first: { perStep: 15_000, postBuffer: 140_000 },
    balanced: { perStep: 12_000, postBuffer: 110_000 },
    speed_first: { perStep: 7_000, postBuffer: 45_000 },
    cost_saver: { perStep: 3_000, postBuffer: 15_000 },
};

/**
 * 절대 상한(기본 400만). `BASALT_MAX_TOKENS_PER_TASK_CEILING=0` 또는 `unlimited`면 ~21억(실질 무제한).
 */
export function getTokenBudgetAbsoluteCeiling(): number {
    const raw = process.env.BASALT_MAX_TOKENS_PER_TASK_CEILING;
    if (raw === '0' || raw === 'unlimited') {
        return 2_147_000_000;
    }
    const n = parseInt(String(raw || ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 4_000_000;
}

/**
 * 워크플로 스텝 수에 따라 태스크당 토큰 상한을 스케일한다(고정 상한만으로는 장기 실행에서 부족함).
 */
export function computeDynamicMaxTokensPerTask(preset: StrategyPreset, workflowStepCount: number): number {
    const defaults = applyPresetDefaults(preset).budgetPolicy;
    const base = Math.max(
        1000,
        Number(defaults.maxTokensPerTask) || DEFAULT_BUDGET_POLICY.maxTokensPerTask
    );
    const scaling = PRESET_TOKEN_SCALING[preset] ?? PRESET_TOKEN_SCALING.balanced;
    const steps = Math.max(0, workflowStepCount);
    const raw = base + steps * scaling.perStep + scaling.postBuffer;
    return Math.min(getTokenBudgetAbsoluteCeiling(), raw);
}

/**
 * metadata.budgetPolicy.maxTokensPerTask(명시)와 동적 하한 중 큰 값, 이후 절대 상한으로 캡.
 */
export function resolveExecutionTokenCap(
    taskMetadata: { budgetPolicy?: Partial<ExecutionBudgetPolicy> } | null | undefined,
    strategyPreset: StrategyPreset,
    workflowStepCount: number
): number {
    const raw = taskMetadata?.budgetPolicy || {};
    const dynamic = computeDynamicMaxTokensPerTask(strategyPreset, workflowStepCount);
    const explicit = Number(raw.maxTokensPerTask);
    const ceiling = getTokenBudgetAbsoluteCeiling();
    return Math.min(
        ceiling,
        Math.max(1000, dynamic, Number.isFinite(explicit) && explicit > 0 ? explicit : 0)
    );
}

export type DiscussionMode = 'off' | 'step_handoff' | 'roundtable';
export type ModelTier = 'fast' | 'smart';

export interface PolicyInput {
    strategyPreset: StrategyPreset;
    discussionMode: DiscussionMode;
    action: string;
    stepIndex: number;
    totalSteps: number;
    maxSkillRetries: number;
    currentTotalTokens: number;
    budgetPolicy: ExecutionBudgetPolicy;
}

export interface StepPolicy {
    discussionMode: DiscussionMode;
    shouldRunDiscussion: boolean;
    modelTier: ModelTier;
    maxSkillRetries: number;
    contextBudget: number;
}

const LOW_RISK_ACTIONS = new Set([
    'read_codebase',
    'list_directory',
    'check_environment',
    'lint_code',
    'typecheck',
]);

const HIGH_IMPACT_ACTIONS = new Set([
    'write_code',
    'refactor_code',
    'run_shell_command',
    'manage_git',
    'verify_final_output',
]);

export function resolveStepPolicy(input: PolicyInput): StepPolicy {
    const isLowRisk = LOW_RISK_ACTIONS.has(input.action);
    const isHighImpact = HIGH_IMPACT_ACTIONS.has(input.action);
    const isTailStep = input.stepIndex >= Math.max(0, input.totalSteps - 2);
    const tokenPressure = input.currentTotalTokens / Math.max(1, input.budgetPolicy.maxTokensPerTask);

    let discussionMode = input.discussionMode;
    let shouldRunDiscussion = input.discussionMode !== 'off';
    let modelTier: ModelTier = isLowRisk ? 'fast' : 'smart';
    let maxSkillRetries = input.maxSkillRetries;
    let contextBudget = 10000;

    if (input.strategyPreset === 'speed_first') {
        if (isLowRisk) discussionMode = 'off';
        shouldRunDiscussion = discussionMode !== 'off' && isHighImpact;
        modelTier = isHighImpact ? 'smart' : 'fast';
        maxSkillRetries = Math.max(0, Math.min(1, input.maxSkillRetries));
        contextBudget = isHighImpact ? 8000 : 5000;
    } else if (input.strategyPreset === 'cost_saver') {
        if (isLowRisk || tokenPressure > 0.7) discussionMode = 'off';
        shouldRunDiscussion = discussionMode !== 'off' && isHighImpact && tokenPressure < 0.85;
        modelTier = tokenPressure > 0.6 ? 'fast' : modelTier;
        maxSkillRetries = Math.max(0, Math.min(1, input.maxSkillRetries));
        contextBudget = tokenPressure > 0.6 ? 4500 : 7000;
    } else if (input.strategyPreset === 'quality_first') {
        discussionMode = input.discussionMode === 'off' ? 'step_handoff' : input.discussionMode;
        shouldRunDiscussion = isHighImpact || isTailStep;
        modelTier = 'smart';
        maxSkillRetries = Math.max(input.maxSkillRetries, 1);
        contextBudget = 12000;
    } else {
        // balanced
        shouldRunDiscussion = discussionMode !== 'off' && (isHighImpact || isTailStep);
        modelTier = isLowRisk ? 'fast' : 'smart';
        maxSkillRetries = input.maxSkillRetries;
        contextBudget = isHighImpact ? 9000 : 7000;
    }

    return {
        discussionMode,
        shouldRunDiscussion,
        modelTier,
        maxSkillRetries,
        contextBudget,
    };
}

export function applyPresetDefaults(preset: StrategyPreset): {
    discussionMode: DiscussionMode;
    maxDiscussionThoughts: number;
    carryDiscussionToPrompt: boolean;
    budgetPolicy: Partial<ExecutionBudgetPolicy>;
} {
    switch (preset) {
        case 'quality_first':
            return {
                discussionMode: 'roundtable',
                maxDiscussionThoughts: 5,
                carryDiscussionToPrompt: true,
                budgetPolicy: {
                    maxTokensPerTask: 60000,
                    maxDiscussionCalls: 18,
                    maxSkillRetries: 2,
                },
            };
        case 'speed_first':
            return {
                discussionMode: 'step_handoff',
                maxDiscussionThoughts: 2,
                carryDiscussionToPrompt: false,
                budgetPolicy: {
                    maxTokensPerTask: 22000,
                    maxDiscussionCalls: 4,
                    maxSkillRetries: 1,
                },
            };
        case 'cost_saver':
            return {
                discussionMode: 'off',
                maxDiscussionThoughts: 1,
                carryDiscussionToPrompt: false,
                budgetPolicy: {
                    maxTokensPerTask: 14000,
                    maxDiscussionCalls: 2,
                    maxSkillRetries: 0,
                },
            };
        default:
            return {
                discussionMode: 'step_handoff',
                maxDiscussionThoughts: 3,
                carryDiscussionToPrompt: true,
                budgetPolicy: {
                    maxTokensPerTask: 50000,
                    maxDiscussionCalls: 10,
                    maxSkillRetries: 1,
                },
            };
    }
}
