export type DiscussionMode = 'off' | 'step_handoff' | 'roundtable';
export type StrategyPreset = 'quality_first' | 'balanced' | 'speed_first' | 'cost_saver';
export type PlanningDepth = 'standard' | 'deep';
export type CoordinationMode = 'single' | 'parallel';
export type ProactiveMode = 'off' | 'brief' | 'normal';
export type BuddyRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface BuddyTraitProfile {
    debugging: number;
    patience: number;
    chaos: number;
    wisdom: number;
    snark: number;
}

export interface BuddyCosmeticProfile {
    hat?: string;
    eyes?: string;
    variant?: string;
}

export interface TaskBuddyInstance {
    instanceId: string;
    buddyId: string;
    name: string;
    rarity: BuddyRarity;
    traits: BuddyTraitProfile;
    cosmetic?: BuddyCosmeticProfile;
    personaSeed: string;
    selectedAt: string;
    lastReactedAt?: string;
}

export interface ExecuteStreamOptions {
    discussionMode?: DiscussionMode;
    maxDiscussionThoughts?: number;
    carryDiscussionToPrompt?: boolean;
    strategyPreset?: StrategyPreset;
    /** Matches Orchestrator ExecutionOptions — env BASALT_CODEGEN_MULTI_PHASE overrides when set */
    multiPhaseCodegen?: boolean;
    planningDepth?: PlanningDepth;
    coordinationMode?: CoordinationMode;
    proactiveMode?: ProactiveMode;
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
    buddyId?: string;
    buddyInstanceId?: string;
    thoughts: DiscussionThought[];
}

export interface AgentInboxEntry {
    id: string;
    from: string;
    to: string;
    summary: string;
    actionRequired?: string;
    artifacts?: string[];
    createdAt: string;
    status?: 'open' | 'completed';
    buddyId?: string;
    buddyInstanceId?: string;
    step?: number;
}

export interface CollaborationEdge {
    weight: number;
    reasons?: string[];
    updatedAt?: string;
}

export type OrchestratorCollaborationMap = Record<string, Record<string, CollaborationEdge>>;
export type NumericCollaborationMap = Record<string, Record<string, number>>;
