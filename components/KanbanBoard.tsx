'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Play, CheckCircle, Search, AlertCircle, Loader2, RotateCcw, XCircle, Trash2 } from 'lucide-react';
import { CreateTaskModal } from './CreateTaskModal';
import { TaskDetailsModal } from './TaskDetailsModal';
import { ProjectSelector } from './ProjectSelector';
import { StepProgress } from './StepProgress';

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

    useEffect(() => {
        fetchTasks();

        const channel = supabase
            .channel('tasks')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'Tasks' },
                (payload) => {
                    const currentProjectId = selectedProjectId; // Capture closure? 
                    // Better to rely on refetch or filter in memory.
                    // For simplicity, just refetch or handle blindly.
                    if (payload.eventType === 'INSERT') {
                        // Optimistic update? 
                        // Only add if matches current project or if we are showing all
                        setTasks(prev => [...prev, payload.new as Task]);
                    } else if (payload.eventType === 'UPDATE') {
                        setTasks(prev => prev.map(t => t.id === payload.new.id ? payload.new as Task : t));
                        // Update selected task if it's open
                        if (selectedTask && selectedTask.id === payload.new.id) {
                            setSelectedTask(payload.new as Task);
                        }

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
    }, [selectedTask]);
    // Note: dependency on selectedTask to keep it updated is valid but the effect recreates subscription.
    // Ideally subscription should be separate. But keeping it as is for now to avoid large refactor.

    useEffect(() => {
        fetchTasks();
    }, [selectedProjectId]);

    const fetchTasks = async () => {
        let query = supabase.from('Tasks').select('*').order('created_at');
        if (selectedProjectId) {
            query = query.eq('project_id', selectedProjectId);
        }
        const { data } = await query;
        if (data) setTasks(data);
    };

    const handleCreateTask = async (taskData: { title: string; description: string; priority: string }) => {
        const newTask = {
            title: taskData.title,
            description: taskData.description,
            status: 'pending',
            project_id: selectedProjectId
        };

        const { error } = await supabase.from('Tasks').insert(newTask);
        if (error) console.error('Error creating task:', error);
    };

    // --- Action Handlers ---

    const handleConfirmPlan = async (e: React.MouseEvent, task: Task) => {
        e.stopPropagation(); // Prevent opening details modal
        setProcessingTaskIds(prev => new Set(prev).add(task.id));
        try {
            await fetch('/api/agent/plan', {
                method: 'POST',
                body: JSON.stringify({ taskId: task.id, description: task.description })
            });
        } catch (error) {
            console.error('Plan trigger failed', error);
            setProcessingTaskIds(prev => { const n = new Set(prev); n.delete(task.id); return n; });
        }
    };

    const handleStartDev = async (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        setProcessingTaskIds(prev => new Set(prev).add(task.id));
        try {
            await fetch('/api/agent/execute', {
                method: 'POST',
                body: JSON.stringify({ taskId: task.id })
            });
        } catch (error) {
            console.error('Execute trigger failed', error);
            setProcessingTaskIds(prev => { const n = new Set(prev); n.delete(task.id); return n; });
        }
    };

    const handleRunTests = async (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        setProcessingTaskIds(prev => new Set(prev).add(task.id));
        try {
            await fetch('/api/agent/verify', {
                method: 'POST',
                body: JSON.stringify({ taskId: task.id })
            });
        } catch (error) {
            console.error('Verify trigger failed', error);
            setProcessingTaskIds(prev => { const n = new Set(prev); n.delete(task.id); return n; });
        }
    };

    const handleCardClick = (task: Task) => {
        setSelectedTask(task);
        setIsDetailsOpen(true);
    };

    const handleRetry = async (e: React.MouseEvent, task: Task) => {
        e.stopPropagation();
        setProcessingTaskIds(prev => new Set(prev).add(task.id));
        try {
            await fetch('/api/agent/retry', {
                method: 'POST',
                body: JSON.stringify({ taskId: task.id })
            });
        } catch (error) {
            console.error('Retry trigger failed', error);
            setProcessingTaskIds(prev => { const n = new Set(prev); n.delete(task.id); return n; });
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
                        <CheckCircle className="mr-2 h-3 w-3" /> Verify & Git Push
                    </Button>
                );
            case 'review':
                return (
                    <Button size="sm" disabled className="w-full text-xs h-7 bg-green-600">
                        <CheckCircle className="mr-2 h-3 w-3" /> Review Pending
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
            <div className="flex justify-between items-center p-4 border-b border-border">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold tracking-tight">AI Agent Kanban</h1>
                    <ProjectSelector selectedProjectId={selectedProjectId} onProjectSelect={setSelectedProjectId} />
                </div>
                <Button onClick={() => setIsCreateModalOpen(true)} disabled={!selectedProjectId} className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90">
                    <Plus className="mr-2 h-4 w-4" /> Request Work
                </Button>
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
            />

            <div className="flex-1 overflow-x-auto p-4">
                <div className="flex gap-4 h-full min-w-[1000px]">
                    {COLUMNS.map((col) => {
                        // Filter tasks for column (and effectively ensures only current project tasks are shown if we rely on state)
                        // But wait, subscription logic might add tasks from other projects.
                        // We should filter here too to be safe.
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
            </div>
        </div>
    );
}
