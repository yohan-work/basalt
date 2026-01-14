
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
                {logs.map((log) => (
                    <div key={log.id} className="mb-2 grid grid-cols-[120px_1fr] gap-2 items-start">
                        <span className="text-xs text-muted-foreground">
                            {new Date(log.created_at).toLocaleTimeString()}
                        </span>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline" className="rounded-none font-normal">
                                    {log.agent_role}
                                </Badge>
                            </div>
                            <p className="text-foreground">{log.message}</p>
                            {log.metadata && Object.keys(log.metadata).length > 0 && (
                                <pre className="mt-1 text-xs text-muted-foreground overflow-x-auto">
                                    {JSON.stringify(log.metadata, null, 2)}
                                </pre>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={scrollRef} />
            </ScrollArea>
        </div>
    );
}
