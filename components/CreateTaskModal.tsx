
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { TASK_TEMPLATES, type TaskTemplate } from '@/lib/task-templates';
import {
    LayoutGrid, Globe, Bug, RefreshCw, FileText,
    Paintbrush, TestTube, BookOpen, ChevronDown, ChevronUp, FileEdit,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    LayoutGrid, Globe, Bug, RefreshCw, FileText,
    Paintbrush, TestTube, BookOpen,
};

interface CreateTaskModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (task: { title: string; description: string; priority: string }) => void;
}

export function CreateTaskModal({ open, onOpenChange, onSubmit }: CreateTaskModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('Medium');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showTemplates, setShowTemplates] = useState(true);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

    // 모달이 닫힐 때 폼 초기화
    useEffect(() => {
        if (!open) {
            setTitle('');
            setDescription('');
            setPriority('Medium');
            setIsSubmitting(false);
            setSelectedTemplateId(null);
            setShowTemplates(true);
        }
    }, [open]);

    const handleSelectTemplate = (template: TaskTemplate) => {
        setSelectedTemplateId(template.id);
        setTitle(template.titlePrefix);
        setDescription(template.description);
        setPriority(template.priority);
        setShowTemplates(false);
    };

    const handleSelectBlank = () => {
        setSelectedTemplateId(null);
        setTitle('');
        setDescription('');
        setPriority('Medium');
        setShowTemplates(false);
    };

    const handleSubmit = async () => {
        if (!title.trim()) return;
        setIsSubmitting(true);
        try {
            onSubmit({ title, description, priority });
            onOpenChange(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg" onKeyDown={handleKeyDown}>
                <DialogHeader>
                    <DialogTitle>Create New Task</DialogTitle>
                    <DialogDescription>
                        AI 에이전트가 처리할 새 태스크를 입력하세요.
                    </DialogDescription>
                </DialogHeader>

                {/* Template Selection */}
                <div className="border border-border">
                    <button
                        type="button"
                        onClick={() => setShowTemplates(!showTemplates)}
                        className="flex items-center justify-between w-full p-3 text-sm font-medium text-left hover:bg-muted/50 transition-colors"
                    >
                        <span className="flex items-center gap-2">
                            <FileEdit className="h-4 w-4 text-muted-foreground" />
                            템플릿으로 시작
                            {selectedTemplateId && (
                                <span className="text-xs text-primary font-normal">
                                    ({TASK_TEMPLATES.find(t => t.id === selectedTemplateId)?.name})
                                </span>
                            )}
                        </span>
                        {showTemplates ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>

                    {showTemplates && (
                        <div className="grid grid-cols-3 gap-2 p-3 pt-0">
                            {/* Blank task option */}
                            <button
                                type="button"
                                onClick={handleSelectBlank}
                                className={`flex flex-col items-center gap-1.5 p-3 border text-xs transition-colors hover:border-primary/50 hover:bg-primary/5 ${
                                    selectedTemplateId === null && !showTemplates
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border'
                                }`}
                            >
                                <FileText className="h-5 w-5 text-muted-foreground" />
                                <span className="font-medium text-center leading-tight">빈 태스크</span>
                            </button>

                            {TASK_TEMPLATES.map((template) => {
                                const IconComponent = ICON_MAP[template.icon] || FileText;
                                const isSelected = selectedTemplateId === template.id;
                                return (
                                    <button
                                        key={template.id}
                                        type="button"
                                        onClick={() => handleSelectTemplate(template)}
                                        className={`flex flex-col items-center gap-1.5 p-3 border text-xs transition-colors hover:border-primary/50 hover:bg-primary/5 ${
                                            isSelected
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border'
                                        }`}
                                    >
                                        <IconComponent className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <span className="font-medium text-center leading-tight">{template.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="grid gap-4 py-2">
                    <div className="grid gap-2">
                        <Label htmlFor="task-title">Title</Label>
                        <Input
                            id="task-title"
                            value={title}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
                            placeholder="Enter task title"
                            autoFocus={!showTemplates}
                            required
                            aria-required="true"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="task-description">Description</Label>
                        <textarea
                            id="task-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="flex min-h-[120px] w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Enter detailed task description"
                        />
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="task-priority">Priority</Label>
                        <select
                            id="task-priority"
                            value={priority}
                            onChange={(e) => setPriority(e.target.value)}
                            className="flex h-10 w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                        </select>
                    </div>
                </div>

                <DialogFooter>
                    <span className="text-xs text-muted-foreground mr-auto hidden sm:inline">
                        Cmd+Enter로 바로 생성
                    </span>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!title.trim() || isSubmitting}>
                        {isSubmitting ? 'Creating...' : 'Create Task'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
