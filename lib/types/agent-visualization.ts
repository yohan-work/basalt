export type DiscussionMode = 'off' | 'step_handoff' | 'roundtable';
export type StrategyPreset = 'quality_first' | 'balanced' | 'speed_first' | 'cost_saver';

export interface ExecuteStreamOptions {
    discussionMode?: DiscussionMode;
    maxDiscussionThoughts?: number;
    carryDiscussionToPrompt?: boolean;
    strategyPreset?: StrategyPreset;
}

export interface DiscussionThought {
    agent: string;
    thought: string;
    type?: 'idea' | 'critique' | 'agreement' | string;
}

export interface ExecutionDiscussionEntry {
    step: number;
    action: string;
    createdAt: string;
    participants: string[];
    thoughts: DiscussionThought[];
}

export interface CollaborationEdge {
    weight: number;
    reasons?: string[];
    updatedAt?: string;
}

export type OrchestratorCollaborationMap = Record<string, Record<string, CollaborationEdge>>;
export type NumericCollaborationMap = Record<string, Record<string, number>>;
