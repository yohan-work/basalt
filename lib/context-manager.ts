
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
     * Sync state to Supabase metadata for persistence across restarts (optional)
     */
    public async saveState() {
        try {
            await supabase.from('Tasks').update({
                metadata: {
                    logs: this.logs,
                    files: Array.from(this.fileCache.entries())
                }
            }).eq('id', this.taskId);
        } catch (e) {
            console.error('Failed to save context state:', e);
        }
    }
}
