
'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface LogEntry {
    id: string;
    agent_role: string;
    message: string;
    created_at: string;
    metadata?: any;
}

export function LogViewer({ taskId }: { taskId?: string }) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Initial fetch
        const fetchLogs = async () => {
            const { data } = await supabase
                .from('Execution_Logs')
                .select('*')
                .order('created_at', { ascending: true })
                .limit(100);

            if (data) setLogs(data);
        };

        fetchLogs();

        // Subscribe
        const channel = supabase
            .channel('logs')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'Execution_Logs' },
                (payload) => {
                    setLogs((prev) => [...prev, payload.new as LogEntry]);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [taskId]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    return (
        <div className="border border-border p-4 h-full bg-background flex flex-col">
            <h2 className="text-xl font-bold mb-4 font-mono tracking-tight">SYSTEM LOGS</h2>
            <ScrollArea className="h-[400px] w-full rounded-none border border-border p-4 font-mono text-sm bg-black/5">
                {logs.length === 0 && <div className="text-muted-foreground">Waiting for activity...</div>}
                {logs.map((log) => {
                    const type = log.metadata?.type || 'DEFAULT';

                    return (
                        <div key={log.id} className="mb-4 grid grid-cols-[100px_1fr] gap-4 items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <span className="text-xs text-muted-foreground pt-1">
                                {new Date(log.created_at).toLocaleTimeString()}
                            </span>
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={`rounded-none font-normal uppercase text-[10px] tracking-wider
                                    ${log.agent_role === 'main-agent' ? 'border-primary text-primary' : 'border-muted-foreground text-muted-foreground'}
                                `}>
                                        {log.agent_role}
                                    </Badge>
                                    {type === 'THOUGHT' && <span className="text-xs text-muted-foreground italic">💭 Thinking...</span>}
                                    {type === 'ACTION' && <span className="text-xs text-blue-500 font-bold">⚡ Acting</span>}
                                    {type === 'RESULT' && <span className="text-xs text-green-600 font-bold">✅ Result</span>}
                                    {type === 'ERROR' && <span className="text-xs text-red-500 font-bold">❌ Error</span>}
                                </div>

                                {/* Message Rendering Logic */}
                                {type === 'THOUGHT' ? (
                                    <p className="text-muted-foreground italic text-xs pl-2 border-l-2 border-muted">
                                        {log.message}
                                    </p>
                                ) : type === 'ACTION' ? (
                                    <p className="text-foreground font-medium">
                                        {log.message}
                                    </p>
                                ) : (
                                    <p className="text-foreground">
                                        {log.message}
                                    </p>
                                )}

                                {/* Metadata/Args/Result Rendering */}
                                {log.metadata && (
                                    <div className="mt-1">
                                        {log.metadata.args && (
                                            <div className="bg-black/10 overflow-hidden text-xs rounded-sm p-2 mb-1">
                                                <span className="opacity-50 block mb-1">Input Arguments:</span>
                                                <pre className="overflow-x-auto">{JSON.stringify(log.metadata.args, null, 2)}</pre>
                                            </div>
                                        )}
                                        {log.metadata.result && (
                                            <div className="bg-green-500/10 border-l-2 border-green-500 text-xs rounded-sm p-2">
                                                <span className="text-green-600 block mb-1 font-bold">Output:</span>
                                                <pre className="overflow-x-auto text-green-700 dark:text-green-400">
                                                    {typeof log.metadata.result === 'string'
                                                        ? log.metadata.result.slice(0, 300) + (log.metadata.result.length > 300 ? '...' : '')
                                                        : JSON.stringify(log.metadata.result, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                        {/* Show other metadata if not args/result/thought */}
                                        {Object.keys(log.metadata || {}).filter(k => k !== 'args' && k !== 'result' && k !== 'type').length > 0 && (
                                            <pre className="text-[10px] text-muted-foreground">{JSON.stringify(log.metadata, null, 2)}</pre>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
                <div ref={scrollRef} />
            </ScrollArea>
        </div>
    );
}
