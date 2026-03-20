import { ExecutionBudgetPolicy, StrategyPreset } from './metrics';

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
                    maxTokensPerTask: 42000,
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
                    maxTokensPerTask: 32000,
                    maxDiscussionCalls: 10,
                    maxSkillRetries: 1,
                },
            };
    }
}
