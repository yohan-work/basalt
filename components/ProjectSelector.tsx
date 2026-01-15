
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FolderPlus, Folder } from 'lucide-react';

interface Project {
    id: string;
    name: string;
    path: string;
}

interface ProjectSelectorProps {
    selectedProjectId: string | null;
    onProjectSelect: (projectId: string | null) => void;
}

export function ProjectSelector({ selectedProjectId, onProjectSelect }: ProjectSelectorProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [newProject, setNewProject] = useState({ name: '', path: '' });

    useEffect(() => {
        const fetchProjects = async () => {
            const { data, error } = await supabase.from('Projects').select('*').order('created_at', { ascending: false });
            if (error) {
                console.error('Error fetching projects:', error);
                return;
            }
            setProjects(data || []);

            // Auto-select first project if none selected
            if (!selectedProjectId && data && data.length > 0) {
                onProjectSelect(data[0].id);
            }
        };

        fetchProjects();
    }, []);

    const handleCreateProject = async () => {
        if (!newProject.name || !newProject.path) return;

        const { data, error } = await supabase
            .from('Projects')
            .insert([
                { name: newProject.name, path: newProject.path }
            ])
            .select()
            .single();

        if (error) {
            console.error('Error creating project:', error);
            alert('Failed to create project: ' + error.message);
            return;
        }

        setProjects(prev => [data, ...prev]);
        onProjectSelect(data.id);
        setIsDialogOpen(false);
        setNewProject({ name: '', path: '' });
    };

    const handleBrowseFolder = async () => {
        try {
            const res = await fetch('/api/system/dialog', { method: 'POST' });
            const data = await res.json();

            if (data.path) {
                setNewProject(prev => ({ ...prev, path: data.path }));
            } else if (data.error) {
                console.error('Dialog error:', data.error);
                alert('Error opening folder dialog: ' + data.error);
            }
        } catch (err) {
            console.error('Browse failed:', err);
        }
    };

    return (
        <div className="flex items-center gap-2">
            <Select value={selectedProjectId || ''} onValueChange={onProjectSelect}>
                <SelectTrigger className="w-[200px] h-8 text-xs bg-background">
                    <div className="flex items-center gap-2 truncate">
                        <Folder className="w-3 h-3 text-muted-foreground" />
                        <SelectValue placeholder="Select Project" />
                    </div>
                </SelectTrigger>
                <SelectContent>
                    {projects.map(p => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8">
                        <FolderPlus className="h-4 w-4" />
                    </Button>
                </DialogTrigger>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Connect New Project</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Project Name</Label>
                            <Input
                                id="name"
                                value={newProject.name}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewProject({ ...newProject, name: e.target.value })}
                                placeholder="My Awesome App"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="path">Absolute Local Path</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="path"
                                    value={newProject.path}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewProject({ ...newProject, path: e.target.value })}
                                    placeholder="/Users/username/projects/my-app"
                                />
                                <Button type="button" variant="secondary" onClick={handleBrowseFolder}>
                                    Browse
                                </Button>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                                Verify this path exists on your local machine. Agent will read/write files here.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleCreateProject}>Connect Project</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
