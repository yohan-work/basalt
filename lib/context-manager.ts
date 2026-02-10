
import { supabase } from './supabase';

interface ExecutionLog {
    agent: string;
    message: string;
    metadata?: any;
    timestamp: number;
}

interface FileContext {
    path: string;
    content: string;
    lastAccessed: number;
}

export class ContextManager {
    private logs: ExecutionLog[] = [];
    private fileCache: Map<string, FileContext> = new Map();
    private taskId: string;

    constructor(taskId: string) {
        this.taskId = taskId;
    }

    /**
     * Add a log entry to the context history
     */
    public addLog(agent: string, message: string, metadata?: any) {
        this.logs.push({
            agent,
            message,
            metadata,
            timestamp: Date.now()
        });
    }

    /**
     * Store or update file content in memory
     */
    public addFile(path: string, content: string) {
        this.fileCache.set(path, {
            path,
            content,
            lastAccessed: Date.now()
        });
    }

    /**
     * Get a file from memory if it exists
     */
    public getFile(path: string): string | null {
        const file = this.fileCache.get(path);
        if (file) {
            file.lastAccessed = Date.now(); // Update access time
            return file.content;
        }
        return null;
    }

    /**
     * Prepare a prompt-friendly context string.
     * Strategies:
     * 1. Recent Logs (last 10)
     * 2. Recently Accessed Files (prioritize relevance)
     * 3. Task Metadata
     */
    public getOptimizedContext(maxChars: number = 8000): string {
        let context = '';

        // 1. Add File Context (Most important for coding)
        // Sort files by last accessed desc
        const sortedFiles = Array.from(this.fileCache.values())
            .sort((a, b) => b.lastAccessed - a.lastAccessed);

        context += "### Loaded Files Content:\n";
        let currentChars = context.length;

        for (const file of sortedFiles) {
            const fileBlock = `\n--- File: ${file.path} ---\n${file.content}\n`;
            // Simple heuristic check
            if (currentChars + fileBlock.length < maxChars * 0.7) { // Reserve 30% for logs/instructions
                context += fileBlock;
                currentChars += fileBlock.length;
            } else {
                context += `\n--- File: ${file.path} (Content truncated) ---\n`;
            }
        }

        // 2. Add Execution Logs
        context += "\n### Execution History:\n";
        // Take last 10 logs
        const recentLogs = this.logs.slice(-10);
        for (const log of recentLogs) {
            context += `[${log.agent}] ${log.message}\n`;
        }

        return context;
    }

    /**
     * Sync state to Supabase metadata for persistence across restarts.
     * Merges with existing metadata to avoid overwriting other fields (workflow, progress, etc.)
     */
    public async saveState() {
        try {
            const { data: current } = await supabase
                .from('Tasks')
                .select('metadata')
                .eq('id', this.taskId)
                .single();

            const contextState = {
                contextLogs: this.logs,
                contextFiles: Array.from(this.fileCache.entries())
            };

            const newMetadata = {
                ...(current?.metadata || {}),
                ...contextState
            };

            await supabase.from('Tasks').update({ metadata: newMetadata }).eq('id', this.taskId);
        } catch (e) {
            console.error('Failed to save context state:', e);
        }
    }

    /**
     * Restore state from Supabase metadata.
     * Used when retrying a failed task to recover file cache and logs from previous execution.
     */
    public async restoreState() {
        try {
            const { data } = await supabase
                .from('Tasks')
                .select('metadata')
                .eq('id', this.taskId)
                .single();

            if (!data?.metadata) return;

            // Restore logs
            if (Array.isArray(data.metadata.contextLogs)) {
                this.logs = data.metadata.contextLogs;
                console.log(`Restored ${this.logs.length} context logs.`);
            }

            // Restore file cache: stored as [key, FileContext] entries
            if (Array.isArray(data.metadata.contextFiles)) {
                for (const [key, fileCtx] of data.metadata.contextFiles) {
                    if (key && fileCtx?.path && fileCtx?.content) {
                        this.fileCache.set(key, {
                            path: fileCtx.path,
                            content: fileCtx.content,
                            lastAccessed: fileCtx.lastAccessed || Date.now()
                        });
                    }
                }
                console.log(`Restored ${this.fileCache.size} cached files.`);
            }
        } catch (e) {
            console.error('Failed to restore context state:', e);
        }
    }

    /**
     * Generate context for a specific agent in a team setting.
     * Includes:
     * 1. Shared Task Board (Kanban)
     * 2. Recent Team Messages (Chat)
     * 3. Agent's Private File Context (what they read)
     */
    public getTeamContext(
        teamState: import('./team-types').TeamState,
        agentName: string,
        maxChars: number = 10000
    ): string {
        let context = '';

        // 1. Team Messages (The Chat Room)
        context += "### Team Discussion Channel:\n";
        // Show last 15 messages to keep context relevant but manageable
        const recentMessages = teamState.messages.slice(-15);
        if (recentMessages.length === 0) {
            context += "(No messages yet)\n";
        } else {
            for (const msg of recentMessages) {
                const time = new Date(msg.timestamp).toLocaleTimeString();
                context += `[${time}] ${msg.sender}: ${msg.content}\n`;
            }
        }
        context += "\n";

        // 2. Shared Task Board (The Plan)
        context += "### Shared Task Board:\n";

        const renderItems = (items: import('./team-types').TaskBoardItem[]) => {
            if (items.length === 0) return "  (Empty)";
            return items.map(t =>
                `  - [${t.id}] ${t.description} (Assignee: ${t.assignee || 'None'})`
            ).join('\n');
        };

        context += `TODO:\n${renderItems(teamState.board.todo)}\n`;
        context += `IN PROGRESS:\n${renderItems(teamState.board.in_progress)}\n`;
        context += `REVIEW:\n${renderItems(teamState.board.review)}\n`;
        context += `DONE:\n${renderItems(teamState.board.done)}\n\n`;

        // 3. Relevant File Content (Private Memory)
        // Re-use logic from getOptimizedContext but focused on files
        const sortedFiles = Array.from(this.fileCache.values())
            .sort((a, b) => b.lastAccessed - a.lastAccessed);

        if (sortedFiles.length > 0) {
            context += "### Your Loaded Files:\n";
            let currentChars = context.length;

            for (const file of sortedFiles) {
                const fileBlock = `\n--- File: ${file.path} ---\n${file.content}\n`;
                // Heuristic: Reserve space for agent instructions
                if (currentChars + fileBlock.length < maxChars * 0.9) {
                    context += fileBlock;
                    currentChars += fileBlock.length;
                } else {
                    context += `\n--- File: ${file.path} (Content truncated) ---\n`;
                }
            }
        }

        return context;
    }
}

