'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Trash2, Clock } from 'lucide-react';
import { TaskDetailsModal } from './TaskDetailsModal';
import { useEventStream } from '@/lib/hooks/useEventStream';

interface Task {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'planning' | 'working' | 'testing' | 'review' | 'done' | 'failed';
    created_at: string;
    project_id?: string;
    metadata?: Record<string, any>;
}

export function DoneTasksArchive() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const stream = useEventStream({});

    useEffect(() => {
        fetchDoneTasks();

        const channel = supabase
            .channel('done-tasks')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'Tasks' },
                (payload) => {
                    if (payload.eventType === 'INSERT' && (payload.new as Task).status === 'done') {
                        setTasks(prev => [payload.new as Task, ...prev]);
                    } else if (payload.eventType === 'UPDATE') {
                        const updated = payload.new as Task;
                        if (updated.status === 'done') {
                            setTasks(prev => {
                                const exists = prev.find(t => t.id === updated.id);
                                if (exists) return prev.map(t => t.id === updated.id ? updated : t);
                                return [updated, ...prev];
                            });
                        } else {
                            // done이 아닌 상태로 변경되면 목록에서 제거
                            setTasks(prev => prev.filter(t => t.id !== updated.id));
                        }
                        setSelectedTask(prev => prev && prev.id === updated.id ? updated : prev);
                    } else if (payload.eventType === 'DELETE') {
                        setTasks(prev => prev.filter(t => t.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const fetchDoneTasks = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('Tasks')
                .select('*')
                .eq('status', 'done')
                .order('created_at', { ascending: false });
            if (!error && data) setTasks(data);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        if (!confirm(`"${task.title}" 태스크를 삭제하시겠습니까?\n(관련 로그도 함께 삭제됩니다)`)) return;
        await supabase.from('Execution_Logs').delete().eq('task_id', task.id);
        await supabase.from('Tasks').delete().eq('id', task.id);
    };

    const formatDate = (iso: string) => {
        return new Date(iso).toLocaleDateString('ko-KR', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    return (
        <>
            <TaskDetailsModal
                task={selectedTask}
                open={isDetailsOpen}
                onOpenChange={setIsDetailsOpen}
                stream={stream}
            />

            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="border border-border/30 p-4 space-y-3 animate-pulse rounded-sm">
                            <div className="h-4 bg-muted/60 rounded w-3/4" />
                            <div className="h-3 bg-muted/40 rounded w-full" />
                            <div className="h-3 bg-muted/40 rounded w-1/2" />
                        </div>
                    ))}
                </div>
            ) : tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
                    <CheckCircle2 className="h-12 w-12 opacity-20" />
                    <p className="text-sm">완료된 태스크가 없습니다.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {tasks.map(task => (
                        <Card
                            key={task.id}
                            onClick={() => { setSelectedTask(task); setIsDetailsOpen(true); }}
                            className="cursor-pointer rounded-sm shadow-sm hover:border-emerald-500/50 transition-colors border-emerald-500/20 bg-emerald-50/5"
                        >
                            <CardHeader className="p-3 pb-1">
                                <div className="flex justify-between items-start gap-1">
                                    <CardTitle className="text-sm font-medium leading-tight flex-1 flex items-center gap-2">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                        {task.title}
                                    </CardTitle>
                                    <button
                                        onClick={(e) => handleDelete(e, task)}
                                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                        title="삭제"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-3 pt-2 space-y-2">
                                <p className="text-xs text-muted-foreground line-clamp-3">{task.description}</p>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
                                    <Clock className="h-3 w-3" />
                                    {formatDate(task.created_at)}
                                </div>
                                <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                                    완료
                                </Badge>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </>
    );
}
