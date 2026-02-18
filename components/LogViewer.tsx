
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, Copy, Check, Search, X } from 'lucide-react';

interface LogMetadata {
    type?: string;
    args?: unknown;
    result?: unknown;
    [key: string]: unknown;
}

interface LogEntry {
    id: string;
    task_id?: string;
    agent_role: string;
    message: string;
    created_at: string;
    metadata?: LogMetadata;
}

const LOG_TYPES = ['THOUGHT', 'ACTION', 'RESULT', 'ERROR'] as const;
type LogTypeFilter = typeof LOG_TYPES[number];

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <button
            onClick={handleCopy}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="클립보드에 복사"
        >
            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
        </button>
    );
}

export function LogViewer({ taskId }: { taskId?: string }) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTypes, setActiveTypes] = useState<Set<LogTypeFilter>>(new Set());
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

    const toggleType = (type: LogTypeFilter) => {
        setActiveTypes((prev) => {
            const next = new Set(prev);
            next.has(type) ? next.delete(type) : next.add(type);
            return next;
        });
    };

    const filteredLogs = logs.filter((log) => {
        const type = (log.metadata?.type || 'DEFAULT') as string;
        const matchesType = activeTypes.size === 0 || activeTypes.has(type as LogTypeFilter);
        const matchesSearch =
            searchQuery.trim() === '' ||
            log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
            log.agent_role.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesType && matchesSearch;
    });

    const TYPE_STYLES: Record<LogTypeFilter, string> = {
        THOUGHT: 'border-muted-foreground/50 text-muted-foreground hover:border-muted-foreground',
        ACTION:  'border-blue-400 text-blue-500 hover:bg-blue-500/10',
        RESULT:  'border-green-500 text-green-600 hover:bg-green-500/10',
        ERROR:   'border-red-400 text-red-500 hover:bg-red-500/10',
    };

    return (
        <div className="border border-border p-4 h-full bg-background flex flex-col" role="log" aria-label="시스템 로그">
            <h2 className="text-xl font-bold mb-3 font-mono tracking-tight">SYSTEM LOGS</h2>

            {/* 검색 + 타입 필터 */}
            <div className="mb-3 flex flex-col gap-2">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <input
                        type="text"
                        placeholder="메시지 또는 에이전트 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-8 py-1.5 text-xs font-mono border border-border bg-background rounded-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                    {LOG_TYPES.map((type) => (
                        <button
                            key={type}
                            onClick={() => toggleType(type)}
                            className={`px-2 py-0.5 text-[10px] font-mono border rounded-sm transition-colors ${
                                activeTypes.has(type)
                                    ? TYPE_STYLES[type] + ' bg-current/10'
                                    : 'border-border text-muted-foreground hover:border-muted-foreground/70'
                            } ${activeTypes.has(type) ? 'opacity-100' : 'opacity-60'}`}
                        >
                            {type}
                        </button>
                    ))}
                    {activeTypes.size > 0 && (
                        <button
                            onClick={() => setActiveTypes(new Set())}
                            className="px-2 py-0.5 text-[10px] font-mono text-muted-foreground hover:text-foreground border border-transparent hover:border-border rounded-sm transition-colors"
                        >
                            초기화
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="mb-3 p-3 border border-red-300 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm rounded-sm">
                    {error}
                    <button onClick={fetchLogs} className="ml-2 underline hover:no-underline text-xs">
                        다시 시도
                    </button>
                </div>
            )}

            <ScrollArea className="min-h-[200px] max-h-[600px] w-full rounded-none border border-border p-4 font-mono text-sm bg-black/5">
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
                {!isLoading && logs.length > 0 && filteredLogs.length === 0 && (
                    <div className="text-muted-foreground text-center py-8 text-xs">
                        검색 결과가 없습니다.
                    </div>
                )}
                {filteredLogs.map((log) => {
                    const type = log.metadata?.type || 'DEFAULT';
                    const copyText = [
                        `[${new Date(log.created_at).toLocaleTimeString()}] ${log.agent_role} (${type})`,
                        log.message,
                        log.metadata?.result ? `Result: ${JSON.stringify(log.metadata.result)}` : '',
                    ].filter(Boolean).join('\n');

                    return (
                        <div key={log.id} className="group mb-4 grid grid-cols-[100px_1fr] gap-4 items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                                    <CopyButton text={copyText} />
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
                                        {log.metadata.args != null && (
                                            <div className="bg-black/10 overflow-hidden text-xs rounded-sm p-2 mb-1">
                                                <span className="opacity-50 block mb-1">Input Arguments:</span>
                                                <pre className="overflow-x-auto">{JSON.stringify(log.metadata.args, null, 2)}</pre>
                                            </div>
                                        )}
                                        {log.metadata.result != null && (
                                            <div className="bg-green-500/10 border-l-2 border-green-500 text-xs rounded-sm p-2">
                                                <span className="text-green-600 block mb-1 font-bold">Output:</span>
                                                <pre className="overflow-x-auto text-green-700 dark:text-green-400">
                                                    {typeof log.metadata.result === 'string'
                                                        ? (log.metadata.result as string).slice(0, 300) + ((log.metadata.result as string).length > 300 ? '...' : '')
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
