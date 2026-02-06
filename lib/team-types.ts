export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';

export interface TeamMessage {
    id: string;
    sender: string; // agent name or 'user' or 'system'
    content: string;
    timestamp: number;
    mentions?: string[]; // e.g., ['@security-specialist']
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

export interface TeamState {
    name: string;
    leader: string;
    members: string[]; // list of agent roles/names
    messages: TeamMessage[];
    board: TaskBoard;
    // Metadata can store round info, etc.
    metadata: Record<string, any>;
}

export interface AgentAction {
    type: 'send_message' | 'create_task' | 'claim_task' | 'submit_task' | 'review_task' | 'call_skill';
    payload: any;
    thought?: string;
}
