export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';

export interface TeamMessage {
    id: string;
    sender: string; // agent name or 'user' or 'system'
    content: string;
    timestamp: number;
    mentions?: string[]; // e.g., ['@security-specialist']
    messageType?: 'chat' | 'discussion' | 'system';
}

export interface TaskBoardItem {
    id: string;
    description: string;
    assignee: string | null; // agent name or null
    status: TaskStatus;
    result?: string; // summary of what was done
    priority?: 'low' | 'medium' | 'high';
    creator: string;
    created_at: number;
    updated_at: number;
}

export interface TaskBoard {
    todo: TaskBoardItem[];
    in_progress: TaskBoardItem[];
    review: TaskBoardItem[];
    done: TaskBoardItem[];
}

export type TeamDiscussionMode = 'enabled' | 'disabled';
export type TeamCollaborationMap = Record<string, Record<string, number>>;

export interface TeamRoundThought {
    agent: string;
    thought: string;
    type?: string;
}

export interface TeamRoundSummary {
    round: number;
    createdAt: number;
    thoughts: TeamRoundThought[];
}

export interface TeamMetadata {
    round: number;
    discussionMode: TeamDiscussionMode;
    collaboration: TeamCollaborationMap;
    roundSummaries: TeamRoundSummary[];
    [key: string]: unknown;
}

export interface TeamState {
    name: string;
    leader: string;
    members: string[]; // list of agent roles/names
    messages: TeamMessage[];
    board: TaskBoard;
    metadata: Partial<TeamMetadata> & Record<string, unknown>;
}

export type AgentAction =
    | {
        type: 'send_message';
        payload: { content: string };
        thought?: string;
    }
    | {
        type: 'create_task';
        payload: { description: string; assignee?: string | null };
        thought?: string;
    }
    | {
        type: 'claim_task';
        payload: { taskId: string };
        thought?: string;
    }
    | {
        type: 'submit_task';
        payload: { taskId: string; result: string };
        thought?: string;
    }
    | {
        type: 'review_task';
        payload: { taskId: string };
        thought?: string;
    }
    | {
        type: 'handoff_task';
        payload: { taskId: string; to: string };
        thought?: string;
    }
    | {
        type: 'call_skill';
        payload: { skill: string; args?: unknown[] };
        thought?: string;
    };
