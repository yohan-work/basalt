'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Play, CheckCircle, Search, AlertCircle, Loader2 } from 'lucide-react';
import { CreateTaskModal } from './CreateTaskModal';
import { TaskDetailsModal } from './TaskDetailsModal';
import { ProjectSelector } from './ProjectSelector';

interface Task {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'planning' | 'working' | 'testing' | 'review' | 'done';
    created_at: string;
    project_id?: string;
}

const COLUMNS = [
    { id: 'pending', label: 'Request' },
    { id: 'planning', label: 'Plan' },
    { id: 'working', label: 'Dev (Working)' },
    { id: 'testing', label: 'Test' },
    { id: 'review', label: 'Review' },
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
                                        <Card key={task.id} onClick={() => handleCardClick(task)} className="cursor-pointer rounded-sm shadow-sm border-border hover:border-primary/50 transition-colors">
                                            <CardHeader className="p-3 pb-1">
                                                <div className="flex justify-between items-start">
                                                    <CardTitle className="text-sm font-medium leading-tight">{task.title}</CardTitle>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="p-3 pt-2 space-y-3">
                                                <p className="text-xs text-muted-foreground line-clamp-3">{task.description}</p>
                                                <div className="flex justify-between items-center">
                                                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-5">
                                                        {task.status}
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
