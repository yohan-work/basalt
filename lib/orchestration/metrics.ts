export type StrategyPreset = 'quality_first' | 'balanced' | 'speed_first' | 'cost_saver';

export interface ExecutionBudgetPolicy {
    maxTokensPerTask: number;
    maxDiscussionCalls: number;
    maxSkillRetries: number;
    maxDbWritesPerTask: number;
}

export interface BudgetEvent {
    type: 'tokens' | 'discussion' | 'db_writes' | 'retries';
    message: string;
    createdAt: string;
}

export interface StepExecutionMetric {
    stepIndex: number;
    action: string;
    agent: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
    startedAt?: string;
    endedAt?: string;
    llmCalls: number;
    promptTokens: number;
    completionTokens: number;
    skillCalls: number;
    skillLatencyMs: number;
    dbUpdates: number;
}

export interface ExecutionMetrics {
    startedAt: string;
    endedAt?: string;
    profile: StrategyPreset;
    llmCalls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    skillCalls: number;
    skillLatencyMs: number;
    dbUpdates: number;
    discussionCalls: number;
    budgetEvents: BudgetEvent[];
    stepMetrics: Record<number, StepExecutionMetric>;
}

export interface TeamExecutionMetrics {
    startedAt: number;
    endedAt?: number;
    rounds: number;
    discussionRounds: number;
    agentTurns: number;
    llmCalls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    actionsProcessed: number;
    skillCalls: number;
    skillLatencyMs: number;
    dbUpdates: number;
}

export const DEFAULT_BUDGET_POLICY: ExecutionBudgetPolicy = {
    maxTokensPerTask: 18000,
    maxDiscussionCalls: 10,
    maxSkillRetries: 1,
    maxDbWritesPerTask: 200,
};
