'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Play, CheckCircle, Search, AlertCircle, Loader2, RotateCcw, XCircle, Trash2, BarChart3, AlertTriangle, ThumbsUp, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { CreateTaskModal } from './CreateTaskModal';
import { TaskDetailsModal } from './TaskDetailsModal';
import { ProjectSelector } from './ProjectSelector';
import { StepProgress } from './StepProgress';
import { ThemeToggle } from './ThemeToggle';
import { useEventStream } from '@/lib/hooks/useEventStream';

interface Task {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'planning' | 'working' | 'testing' | 'review' | 'done' | 'failed';
    created_at: string;
    project_id?: string;
    metadata?: {
        lastError?: string;
        failedStep?: number;
        failedAction?: string;
        retryCount?: number;
        progress?: {
            currentStep: number;
            totalSteps: number;
            currentAction: string;
            currentAgent: string;
            completedSteps: string[];
            startedAt?: string;
            stepStatus: 'pending' | 'running' | 'completed' | 'failed';
        };
    };
}

const COLUMNS = [
    { id: 'pending', label: 'Request' },
    { id: 'planning', label: 'Plan' },
    { id: 'working', label: 'Dev (Working)' },
    { id: 'testing', label: 'Test' },
    { id: 'review', label: 'Review' },
    { id: 'failed', label: '❌ Failed' },
];

export function KanbanBoard() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [processingTaskIds, setProcessingTaskIds] = useState<Set<string>>(new Set());
    const [selectedTask, setSelectedTask] = useState<Task | null>(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [actionError, setActionError] = useState<string | null>(null);

    // SSE stream for real-time progress
    const stream = useEventStream({
        onError: (msg) => showActionError(`Stream error: ${msg}`),
    });

    // Realtime 구독 — 마운트 시 1회만 생성, selectedTask 변경과 무관
    useEffect(() => {
        fetchTasks();

        const channel = supabase
            .channel('tasks')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'Tasks' },
                (payload) => {
                    if (payload.eventType === 'INSERT') {
                        setTasks(prev => [...prev, payload.new as Task]);
                    } else if (payload.eventType === 'UPDATE') {
                        setTasks(prev => prev.map(t => t.id === payload.new.id ? payload.new as Task : t));
                        setSelectedTask(prev =>
                            prev && prev.id === payload.new.id ? payload.new as Task : prev
                        );
                        setProcessingTaskIds(prev => {
                            const next = new Set(prev);
                            next.delete(payload.new.id);
                            return next;
                        });
                    } else if (payload.eventType === 'DELETE') {
                        setTasks(prev => prev.filter(t => t.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // 프로젝트 변경 시 태스크 재조회 (스켈레톤 없이)
    useEffect(() => {
        fetchTasks(false);
    }, [selectedProjectId]);

    const fetchTasks = async (showSkeleton = true) => {
        if (showSkeleton) setIsLoading(true);
        try {
            let query = supabase.from('Tasks').select('*').order('created_at');
            if (selectedProjectId) {
                query = query.eq('project_id', selectedProjectId);
            }
            const { data, error } = await query;
            if (error) {
                console.error('Error fetching tasks:', error);
                return;
            }
            if (data) setTasks(data);
        } catch (err) {
            console.error('Error fetching tasks:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const showActionError = (msg: string) => {
        setActionError(msg);
        setTimeout(() => setActionError(null), 5000);
    };

    const handleCreateTask = async (taskData: { title: string; description: string; priority: string }) => {
        const newTask = {
            title: taskData.title,
            description: taskData.description,
            status: 'pending',
            project_id: selectedProjectId
        };

        const { error } = await supabase.from('Tasks').insert(newTask);
        if (error) {
            console.error('Error creating task:', error);
            showActionError('태스크 생성에 실패했습니다: ' + error.message);
        }
    };

    // --- Action Handlers (SSE-based) ---

    const startStreamAction = (e: React.MouseEvent, task: Task, action: string) => {
        e.stopPropagation();
        setProcessingTaskIds(prev => new Set(prev).add(task.id));
        // Open task details modal to show live progress
        setSelectedTask(task);
        setIsDetailsOpen(true);
        // Start SSE stream
        stream.start(task.id, action);
    };

    const handleConfirmPlan = (e: React.MouseEvent, task: Task) => {
        startStreamAction(e, task, 'plan');
    };

    const handleStartDev = (e: React.MouseEvent, task: Task) => {
        startStreamAction(e, task, 'execute');
    };

    const handleRunTests = (e: React.MouseEvent, task: Task) => {
        startStreamAction(e, task, 'verify');
    };

    const handleCardClick = (task: Task) => {
        setSelectedTask(task);
        setIsDetailsOpen(true);
    };

    const handleRetry = (e: React.MouseEvent, task: Task) => {
        startStreamAction(e, task, 'retry');
    };

    const handleApprove = async (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        setProcessingTaskIds(prev => new Set(prev).add(task.id));
        try {
            const res = await fetch('/api/agent/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id }),
            });
            if (!res.ok) {
                const data = await res.json();
                showActionError('승인 실패: ' + (data.error || res.statusText));
            }
            // Realtime subscription이 UI를 자동 업데이트
        } catch (err) {
            console.error('Approve error:', err);
            showActionError('승인 중 오류가 발생했습니다.');
        } finally {
            setProcessingTaskIds(prev => {
                const next = new Set(prev);
                next.delete(task.id);
                return next;
            });
        }
    };

    const handleDeleteTask = async (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        if (!confirm(`"${task.title}" 태스크를 삭제하시겠습니까?\n(관련 로그도 함께 삭제됩니다)`)) return;

        try {
            // 1. 먼저 관련 Execution_Logs 삭제
            const { error: logsError } = await supabase
                .from('Execution_Logs')
                .delete()
                .eq('task_id', task.id);

            if (logsError) {
                console.error('Logs delete failed:', logsError);
                // 로그 삭제 실패해도 태스크 삭제 시도
            }

            // 2. 태스크 삭제
            const { error } = await supabase.from('Tasks').delete().eq('id', task.id);
            if (error) {
                console.error('Delete failed:', error);
                alert('삭제 실패: ' + error.message);
            }
            // Realtime subscription will handle UI update
        } catch (error) {
            console.error('Delete error:', error);
        }
    };

    // Helper to render action button based on state
    const renderActionButton = (task: Task) => {
        const isProcessing = processingTaskIds.has(task.id);

        if (isProcessing) {
            return (
                <Button size="sm" disabled className="w-full text-xs h-7">
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Processing
                </Button>
            );
        }

        switch (task.status) {
            case 'pending':
                return (
                    <Button size="sm" onClick={(e) => handleConfirmPlan(e, task)} className="w-full text-xs h-7 bg-blue-600 hover:bg-blue-700">
                        <Search className="mr-2 h-3 w-3" /> Confirm & Plan
                    </Button>
                );
            case 'planning':
                return (
                    <Button size="sm" onClick={(e) => handleStartDev(e, task)} className="w-full text-xs h-7 bg-amber-600 hover:bg-amber-700">
                        <Play className="mr-2 h-3 w-3" /> Start Dev
                    </Button>
                );
            case 'working':
                // Could be auto? But manual for now
                return (
                    <Button size="sm" onClick={(e) => handleRunTests(e, task)} className="w-full text-xs h-7 bg-purple-600 hover:bg-purple-700">
                        <AlertCircle className="mr-2 h-3 w-3" /> Run Tests
                    </Button>
                );
            case 'testing':
                return (
                    <Button size="sm" onClick={(e) => handleRunTests(e, task)} className="w-full text-xs h-7 bg-green-600 hover:bg-green-700">
                        <CheckCircle className="mr-2 h-3 w-3" /> Verify & Request PR
                    </Button>
                );
            case 'review':
                return (
                    <Button size="sm" onClick={(e) => handleApprove(e, task)} className="w-full text-xs h-7 bg-emerald-600 hover:bg-emerald-700">
                        <ThumbsUp className="mr-2 h-3 w-3" /> Approve
                    </Button>
                );
            case 'failed':
                return (
                    <Button size="sm" onClick={(e) => handleRetry(e, task)} className="w-full text-xs h-7 bg-red-600 hover:bg-red-700">
                        <RotateCcw className="mr-2 h-3 w-3" /> Retry
                    </Button>
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col h-full bg-background text-foreground">
            {/* Action Error Toast */}
            {actionError && (
                <div className="fixed top-4 right-4 z-[100] max-w-sm animate-in slide-in-from-top-2 fade-in duration-300">
                    <div className="flex items-center gap-2 p-3 border border-red-300 bg-red-50 dark:bg-red-950/90 dark:border-red-800 text-red-700 dark:text-red-400 text-sm shadow-lg">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span className="flex-1">{actionError}</span>
                        <button onClick={() => setActionError(null)} className="text-red-500 hover:text-red-700 shrink-0">
                            <XCircle className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center p-4 border-b border-border">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold tracking-tight">AI Agent Kanban</h1>
                    <ProjectSelector selectedProjectId={selectedProjectId} onProjectSelect={setSelectedProjectId} />
                </div>
                <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <Link href="/done">
                        <Button variant="outline" className="rounded-none">
                            <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-500" /> Archive
                        </Button>
                    </Link>
                    <Link href="/analytics">
                        <Button variant="outline" className="rounded-none">
                            <BarChart3 className="mr-2 h-4 w-4" /> Analytics
                        </Button>
                    </Link>
                    <Button onClick={() => setIsCreateModalOpen(true)} disabled={!selectedProjectId} className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90">
                        <Plus className="mr-2 h-4 w-4" /> Request Work
                    </Button>
                </div>
            </div>

            <CreateTaskModal
                open={isCreateModalOpen}
                onOpenChange={setIsCreateModalOpen}
                onSubmit={handleCreateTask}
            />

            <TaskDetailsModal
                task={selectedTask}
                open={isDetailsOpen}
                onOpenChange={setIsDetailsOpen}
                stream={stream}
            />

            <div className="flex-1 overflow-x-auto p-4">
                {isLoading ? (
                    <div className="flex gap-4 h-full min-w-[1000px]">
                        {COLUMNS.map((col) => (
                            <div key={col.id} className="flex-1 min-w-[200px] flex flex-col bg-muted/20 border border-border/50">
                                <div className="p-3 border-b border-border bg-muted/50 font-semibold text-sm">
                                    {col.label}
                                </div>
                                <div className="p-2 flex-1 space-y-2">
                                    {[1, 2].map(i => (
                                        <div key={i} className="border border-border/30 p-3 space-y-2 animate-pulse">
                                            <div className="h-4 bg-muted/60 rounded w-3/4" />
                                            <div className="h-3 bg-muted/40 rounded w-full" />
                                            <div className="h-3 bg-muted/40 rounded w-1/2" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex gap-4 h-full min-w-[1000px]">
                        {COLUMNS.map((col) => {
                            const colTasks = tasks.filter(task =>
                                task.status === col.id &&
                                (!selectedProjectId || task.project_id === selectedProjectId)
                            );

                            return (
                                <div key={col.id} className="flex-1 min-w-[200px] flex flex-col bg-muted/20 border border-border/50">
                                    <div className="p-3 border-b border-border bg-muted/50 font-semibold text-sm">
                                        {col.label} <span className="ml-2 text-muted-foreground text-xs">({colTasks.length})</span>
                                    </div>
                                    <div className="p-2 flex-1 space-y-2 overflow-y-auto">
                                        {colTasks.length === 0 && (
                                            <div className="flex items-center justify-center h-20 text-xs text-muted-foreground/50">
                                                비어 있음
                                            </div>
                                        )}
                                        {colTasks.map(task => (
                                            <Card
                                                key={task.id}
                                                onClick={() => handleCardClick(task)}
                                                className={`cursor-pointer rounded-sm shadow-sm transition-colors ${task.status === 'failed'
                                                    ? 'border-red-500 bg-red-50 dark:bg-red-950/20 hover:border-red-400'
                                                    : 'border-border hover:border-primary/50'
                                                    }`}
                                            >
                                                <CardHeader className="p-3 pb-1">
                                                    <div className="flex justify-between items-start gap-1">
                                                        <CardTitle className="text-sm font-medium leading-tight flex-1">{task.title}</CardTitle>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            {task.status === 'failed' && (
                                                                <XCircle className="h-4 w-4 text-red-500" />
                                                            )}
                                                            <button
                                                                onClick={(e) => handleDeleteTask(e, task)}
                                                                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                                                                title="삭제"
                                                                aria-label={`${task.title} 태스크 삭제`}
                                                            >
                                                                <Trash2 className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </CardHeader>
                                                <CardContent className="p-3 pt-2 space-y-3">
                                                    <p className="text-xs text-muted-foreground line-clamp-3">{task.description}</p>
                                                    {task.status === 'failed' && task.metadata?.lastError && (
                                                        <p className="text-xs text-red-600 dark:text-red-400 line-clamp-2 font-mono">
                                                            ⚠️ {task.metadata.lastError}
                                                        </p>
                                                    )}
                                                    {/* Progress for working tasks */}
                                                    {task.status === 'working' && task.metadata?.progress && (
                                                        <StepProgress progress={task.metadata.progress} compact />
                                                    )}
                                                    <div className="flex justify-between items-center">
                                                        <Badge
                                                            variant={task.status === 'failed' ? 'destructive' : 'secondary'}
                                                            className="text-[10px] px-1 py-0 h-5"
                                                        >
                                                            {task.status}
                                                            {task.metadata?.retryCount ? ` (retry: ${task.metadata.retryCount})` : ''}
                                                        </Badge>
                                                    </div>
                                                    <div className="pt-1">
                                                        {renderActionButton(task)}
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
