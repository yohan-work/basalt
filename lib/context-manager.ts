
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

const MAX_RECENT_LOGS = 12;
const MAX_RENDERED_FILES = 8;
const MAX_FILE_HEAD_CHARS = 1200;
const MAX_FILE_TAIL_CHARS = 320;
const MAX_METADATA_CHARS = 220;

function summarizeContent(content: string, maxChars: number = MAX_FILE_HEAD_CHARS): { text: string; truncated: boolean } {
    if (!content || content.length <= maxChars) {
        return { text: content, truncated: false };
    }
    const headChars = Math.max(200, Math.floor(maxChars * 0.72));
    const tailChars = Math.max(MAX_FILE_TAIL_CHARS, Math.floor(maxChars * 0.2));
    const head = content.slice(0, headChars);
    const tail = content.slice(-tailChars);
    return {
        text: `${head}\n... (content truncated for context) ...\n${tail}`,
        truncated: true,
    };
}

function summarizeMetadata(metadata: unknown): string {
    if (metadata === null || metadata === undefined) return '';
    if (typeof metadata === 'string') {
        const trimmed = metadata.trim();
        if (!trimmed) return '';
        return trimmed.length > MAX_METADATA_CHARS ? `${trimmed.slice(0, MAX_METADATA_CHARS)}…` : trimmed;
    }
    try {
        const raw = JSON.stringify(metadata);
        if (!raw) return '';
        return raw.length > MAX_METADATA_CHARS ? `${raw.slice(0, MAX_METADATA_CHARS)}…` : raw;
    } catch {
        return '[unserializable metadata]';
    }
}

export class ContextManager {
    private logs: ExecutionLog[] = [];
    private fileCache: Map<string, FileContext> = new Map();
    private taskId: string;
    private logsDirty = false;
    private filesDirty = false;
    private lastSavedAt = 0;
    private readonly SAVE_INTERVAL_MS = 10_000;

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
        this.logsDirty = true;
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
        this.filesDirty = true;
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
        const allFiles = Array.from(this.fileCache.values());
        const sortedFiles = [...allFiles].sort((a, b) => b.lastAccessed - a.lastAccessed);
        const lines: string[] = [];
        const fileBudget = Math.max(1200, Math.floor(maxChars * 0.72));
        let currentChars = 0;

        lines.push('### Available Files in Context Cache:');
        if (sortedFiles.length === 0) {
            lines.push('- (none)');
        } else {
            for (const file of sortedFiles.slice(0, MAX_RENDERED_FILES)) {
                const ageMs = Date.now() - file.lastAccessed;
                lines.push(`- ${file.path} (last accessed ${Math.max(1, Math.round(ageMs / 1000))}s ago)`);
            }
            if (sortedFiles.length > MAX_RENDERED_FILES) {
                lines.push(`- ... ${sortedFiles.length - MAX_RENDERED_FILES} more file(s) omitted from the summary`);
            }
        }

        lines.push('');
        lines.push('### Loaded Files Content:');

        for (const file of sortedFiles) {
            if (currentChars >= fileBudget) {
                lines.push(`--- File: ${file.path} (Omitted/Too many files) ---`);
                continue;
            }

            const fileHeader = `--- File: ${file.path} ---`;
            const { text } = summarizeContent(file.content, Math.min(MAX_FILE_HEAD_CHARS, Math.max(300, fileBudget - currentChars - fileHeader.length - 32)));
            const fileBlock = `${fileHeader}\n${text}`;
            currentChars += fileBlock.length;
            lines.push(fileBlock);
            lines.push('');
        }

        lines.push('### Recent Execution History:');
        const recentLogs = this.logs.slice(-MAX_RECENT_LOGS);
        if (recentLogs.length === 0) {
            lines.push('(No logs recorded yet)');
        } else {
            for (const log of recentLogs) {
                const metadata = summarizeMetadata(log.metadata);
                const suffix = metadata ? ` | metadata=${metadata}` : '';
                lines.push(`[${log.agent}] ${log.message}${suffix}`);
            }
        }

        return lines.join('\n').trim();
    }

    /**
     * Sync state to Supabase metadata for persistence across restarts.
     * Merges with existing metadata to avoid overwriting other fields (workflow, progress, etc.)
     */
    private compressContent(content: string, maxChars: number = 4000): string {
        if (!content || content.length <= maxChars) return content;
        const head = content.slice(0, Math.floor(maxChars * 0.7));
        const tail = content.slice(-Math.floor(maxChars * 0.2));
        return `${head}\n\n... (content truncated for persistence) ...\n\n${tail}`;
    }

    public async saveState(force: boolean = false) {
        try {
            if (!force && !this.logsDirty && !this.filesDirty) return;
            if (!force && Date.now() - this.lastSavedAt < this.SAVE_INTERVAL_MS) return;

            const { data: current } = await supabase
                .from('Tasks')
                .select('metadata')
                .eq('id', this.taskId)
                .single();

            const contextState = {
                contextLogs: this.logs,
                contextFiles: Array.from(this.fileCache.entries()).map(([key, value]) => [
                    key,
                    {
                        ...value,
                        content: this.compressContent(value.content),
                    },
                ])
            };
            const contextSnapshot = {
                generatedAt: new Date().toISOString(),
                fileCount: this.fileCache.size,
                recentFiles: Array.from(this.fileCache.values())
                    .sort((a, b) => b.lastAccessed - a.lastAccessed)
                    .slice(0, MAX_RENDERED_FILES)
                    .map((file) => ({
                        path: file.path,
                        contentLength: file.content.length,
                        lastAccessed: file.lastAccessed,
                    })),
                recentLogs: this.logs.slice(-MAX_RECENT_LOGS).map((log) => ({
                    agent: log.agent,
                    message: log.message,
                    timestamp: log.timestamp,
                    metadata: summarizeMetadata(log.metadata) || undefined,
                })),
            };

            const newMetadata = {
                ...(current?.metadata || {}),
                ...contextState,
                contextSnapshot,
            };

            await supabase.from('Tasks').update({ metadata: newMetadata }).eq('id', this.taskId);
            this.logsDirty = false;
            this.filesDirty = false;
            this.lastSavedAt = Date.now();
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
            this.logsDirty = false;
            this.filesDirty = false;
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
                const { text } = summarizeContent(file.content, MAX_FILE_HEAD_CHARS);
                const fileBlock = `\n--- File: ${file.path} ---\n${text}\n`;
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
