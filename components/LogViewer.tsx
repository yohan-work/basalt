
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface LogEntry {
    id: string;
    task_id?: string;
    agent_role: string;
    message: string;
    created_at: string;
    metadata?: Record<string, unknown>;
}

export function LogViewer({ taskId }: { taskId?: string }) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchLogs = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            let query = supabase
                .from('Execution_Logs')
                .select('*')
                .order('created_at', { ascending: true })
                .limit(100);

            if (taskId) {
                query = query.eq('task_id', taskId);
            }

            const { data, error: fetchError } = await query;

            if (fetchError) {
                setError('로그를 불러오는 중 오류가 발생했습니다.');
                console.error('Error fetching logs:', fetchError);
                return;
            }
            setLogs(data || []);
        } catch (err) {
            setError('로그를 불러오는 중 오류가 발생했습니다.');
            console.error('Error fetching logs:', err);
        } finally {
            setIsLoading(false);
        }
    }, [taskId]);

    useEffect(() => {
        fetchLogs();

        // Subscribe — taskId가 있으면 해당 태스크 로그만, 없으면 전체 구독
        const channelName = taskId ? `logs-${taskId}` : 'logs-global';
        const filter = taskId
            ? { event: 'INSERT' as const, schema: 'public', table: 'Execution_Logs', filter: `task_id=eq.${taskId}` }
            : { event: 'INSERT' as const, schema: 'public', table: 'Execution_Logs' };

        const channel = supabase
            .channel(channelName)
            .on('postgres_changes', filter, (payload) => {
                setLogs((prev) => [...prev, payload.new as LogEntry]);
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [taskId, fetchLogs]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    return (
        <div className="border border-border p-4 h-full bg-background flex flex-col" role="log" aria-label="시스템 로그">
            <h2 className="text-xl font-bold mb-4 font-mono tracking-tight">SYSTEM LOGS</h2>

            {error && (
                <div className="mb-3 p-3 border border-red-300 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm rounded-sm">
                    {error}
                    <button onClick={fetchLogs} className="ml-2 underline hover:no-underline text-xs">
                        다시 시도
                    </button>
                </div>
            )}

            <ScrollArea className="h-[400px] w-full rounded-none border border-border p-4 font-mono text-sm bg-black/5">
                {isLoading && (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        <span>로그를 불러오는 중...</span>
                    </div>
                )}
                {!isLoading && logs.length === 0 && !error && (
                    <div className="text-muted-foreground text-center py-8">
                        {taskId ? '이 태스크의 로그가 아직 없습니다.' : '활동 대기 중...'}
                    </div>
                )}
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
