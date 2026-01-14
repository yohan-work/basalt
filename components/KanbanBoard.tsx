
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface Task {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'planning' | 'working' | 'testing' | 'review' | 'done';
    created_at: string;
}

const COLUMNS = [
    { id: 'pending', label: 'Backlog / Request' },
    { id: 'planning', label: 'Plan' },
    { id: 'working', label: 'Dev (Working)' },
    { id: 'testing', label: 'Test (Self-healing)' },
    { id: 'review', label: 'Review' },
];

export function KanbanBoard() {
    const [tasks, setTasks] = useState<Task[]>([]);

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
                    } else if (payload.eventType === 'DELETE') {
                        setTasks(prev => prev.filter(t => t.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchTasks = async () => {
        const { data } = await supabase.from('Tasks').select('*').order('created_at');
        if (data) setTasks(data);
    };

    const handleRequestWork = async () => {
        // 1. Create Task in DB
        const newTask = {
            title: `Task ${Date.now()}`,
            description: 'Implement new feature X based on user request.',
            status: 'pending'
        };

        // Optimistic UI? Or wait for DB?
        // Let's insert to DB first
        const { data, error } = await supabase.from('Tasks').insert(newTask).select().single();

        if (data) {
            // Trigger Agent
            await fetch('/api/agent', {
                method: 'POST',
                body: JSON.stringify({ taskId: data.id, description: data.description })
            });
        }
    };

    return (
        <div className="flex flex-col h-full bg-background text-foreground">
            <div className="flex justify-between items-center p-4 border-b border-border">
                <h1 className="text-2xl font-bold tracking-tight">AI Agent Kanban</h1>
                <Button onClick={handleRequestWork} className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90">
                    <Plus className="mr-2 h-4 w-4" /> Request Work
                </Button>
            </div>

            <div className="flex-1 overflow-x-auto p-4">
                <div className="flex gap-4 h-full min-w-[1000px]">
                    {COLUMNS.map((col) => (
                        <div key={col.id} className="flex-1 min-w-[200px] flex flex-col bg-muted/20 border border-border/50">
                            <div className="p-3 border-b border-border bg-muted/50 font-semibold text-sm">
                                {col.label} <span className="ml-2 text-muted-foreground text-xs">({tasks.filter(t => t.status === col.id).length})</span>
                            </div>
                            <div className="p-2 flex-1 space-y-2">
                                {tasks.filter(task => task.status === col.id).map(task => (
                                    <Card key={task.id} className="cursor-pointer hover:border-sidebar-primary rounded-none shadow-none border-border">
                                        <CardHeader className="p-3 pb-1">
                                            <div className="flex justify-between items-start">
                                                <CardTitle className="text-sm font-medium leading-none">{task.title}</CardTitle>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="p-3 pt-2">
                                            <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                                            <div className="mt-2 flex justify-end">
                                                <Badge variant="secondary" className="text-[10px] rounded-sm px-1 py-0 h-5">
                                                    {task.status}
                                                </Badge>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
