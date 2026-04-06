
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
    Paintbrush, TestTube, BookOpen, ChevronDown, ChevronUp, FileEdit, Wand2, Package,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiErrorText, parseResponseAsJson } from '@/lib/fetch-json';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
    LayoutGrid, Globe, Bug, RefreshCw, FileText,
    Paintbrush, TestTube, BookOpen,
};

export interface CreateTaskPayload {
    title: string;
    description: string;
    priority: string;
    attachedComponentPaths?: string[];
    taskTemplateId?: string;
    demoPreset?: {
        enabled: boolean;
        templateId: string;
        artifactId: string;
        applyPhase: 'after_execute_before_test';
    };
}

interface CreateTaskModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (task: CreateTaskPayload) => void;
    selectedProjectId?: string | null;
}

interface ComponentItem {
    filePath: string;
    displayName: string;
}

export function CreateTaskModal({ open, onOpenChange, onSubmit, selectedProjectId }: CreateTaskModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('Medium');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [showTemplates, setShowTemplates] = useState(true);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
    const [components, setComponents] = useState<ComponentItem[]>([]);
    const [selectedComponentPaths, setSelectedComponentPaths] = useState<string[]>([]);
    const [componentsLoading, setComponentsLoading] = useState(false);
    const [similarTasks, setSimilarTasks] = useState<Array<{ id: string; title: string; score: number }>>([]);

    // Fetch components when project is selected
    useEffect(() => {
        if (!open || !selectedProjectId) {
            setComponents([]);
            setSelectedComponentPaths([]);
            return;
        }
        setComponentsLoading(true);
        fetch(`/api/project/components?projectId=${encodeURIComponent(selectedProjectId)}`)
            .then((res) => parseResponseAsJson<{ components?: ComponentItem[] }>(res))
            .then((data) => {
                if (data.components) setComponents(data.components);
            })
            .catch(() => setComponents([]))
            .finally(() => setComponentsLoading(false));
    }, [open, selectedProjectId]);

    // 모달이 닫힐 때 폼 초기화
    useEffect(() => {
        if (!open) {
            setTitle('');
            setDescription('');
            setPriority('Medium');
            setIsSubmitting(false);
            setIsEnhancing(false);
            setSelectedTemplateId(null);
            setShowTemplates(true);
            setSelectedComponentPaths([]);
        }
    }, [open]);

    useEffect(() => {
        if (!open || !selectedProjectId) {
            setSimilarTasks([]);
            return;
        }
        const blob = `${title}\n${description}`.trim();
        if (blob.length < 6) {
            setSimilarTasks([]);
            return;
        }
        const handle = window.setTimeout(() => {
            const params = new URLSearchParams({
                projectId: selectedProjectId,
                title: title.trim(),
                description: description.trim(),
            });
            fetch(`/api/tasks/similar?${params.toString()}`)
                .then((res) =>
                    parseResponseAsJson<{ similar?: Array<{ id: string; title: string; score: number }> }>(res)
                )
                .then((data) => {
                    setSimilarTasks(Array.isArray(data.similar) ? data.similar : []);
                })
                .catch(() => setSimilarTasks([]));
        }, 500);
        return () => window.clearTimeout(handle);
    }, [open, selectedProjectId, title, description]);

    const appendSimilarReference = (t: { id: string; title: string }) => {
        const block = `\n\n---\n[참고 · 동일 프로젝트 완료 태스크]\n제목: ${t.title}\n(id: ${t.id})\n위 태스크와 맥락이 비슷하면 구현 방식을 맞춰 주세요.\n`;
        setDescription((prev) => (prev ? `${prev.trim()}${block}` : block.trim()));
    };

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
            const payload: CreateTaskPayload = { title, description, priority };
            if (selectedTemplateId) {
                payload.taskTemplateId = selectedTemplateId;
            }
            if (selectedTemplateId === 'demo-presentation') {
                payload.demoPreset = {
                    enabled: true,
                    templateId: 'demo-presentation',
                    artifactId: 'presentation-default',
                    applyPhase: 'after_execute_before_test',
                };
            }
            if (selectedComponentPaths.length > 0) {
                payload.attachedComponentPaths = selectedComponentPaths;
                payload.description = `다음 컴포넌트를 import해서 사용해줘: ${selectedComponentPaths.map(p => `@${p}`).join(', ')}.\n\n${description}`;
            }
            onSubmit(payload);
            onOpenChange(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    const toggleComponent = (filePath: string) => {
        setSelectedComponentPaths((prev) =>
            prev.includes(filePath) ? prev.filter((p) => p !== filePath) : [...prev, filePath]
        );
    };

    const handleEnhancePrompt = async () => {
        if (!title.trim() && !description.trim()) return;
        setIsEnhancing(true);
        try {
            const res = await fetch('/api/agent/enhance-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, description, projectId: selectedProjectId })
            });
            const data = await parseResponseAsJson(res);
            if (!res.ok) throw new Error(apiErrorText(data, 'Failed to enhance prompt'));
            if (typeof data.enhancedPrompt === 'string' && data.enhancedPrompt) {
                setDescription(data.enhancedPrompt);
            }
        } catch (err: unknown) {
            console.error('Enhance Prompt Error:', err);
            alert(err instanceof Error ? err.message : 'Error enhancing prompt.');
        } finally {
            setIsEnhancing(false);
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
            <DialogContent
                className="sm:max-w-lg max-h-[min(90dvh,calc(100vh-2rem))] flex flex-col overflow-hidden gap-4"
                onKeyDown={handleKeyDown}
            >
                <DialogHeader className="shrink-0">
                    <DialogTitle>Create New Task</DialogTitle>
                    <DialogDescription>
                        AI 에이전트가 처리할 새 태스크를 입력하세요.
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-1 -mr-1">
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
                        <div className="flex items-center justify-between">
                            <Label htmlFor="task-description">Description</Label>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={handleEnhancePrompt}
                                disabled={isEnhancing || (!title.trim() && !description.trim())}
                                className="h-6 text-xs px-2 text-primary hover:bg-primary/10"
                            >
                                <Wand2 className="w-3 h-3 mr-1" />
                                {isEnhancing ? 'Enhancing...' : 'AI Enhance'}
                            </Button>
                        </div>
                        <textarea
                            id="task-description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="flex min-h-[120px] w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            placeholder="Enter detailed task description"
                        />
                    </div>
                    {selectedProjectId && similarTasks.length > 0 && (
                        <div className="rounded-md border border-dashed p-3 space-y-2 bg-muted/20">
                            <p className="text-xs font-medium text-muted-foreground">유사한 완료 태스크</p>
                            <ul className="space-y-1.5">
                                {similarTasks.map((t) => (
                                    <li key={t.id} className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="truncate flex-1 min-w-0" title={t.title}>
                                            {t.title}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-[10px] shrink-0"
                                            onClick={() => appendSimilarReference(t)}
                                        >
                                            설명에 참고 문구 추가
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
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

                    {selectedProjectId && (
                        <div className="grid gap-2">
                            <Label className="flex items-center gap-2">
                                <Package className="h-4 w-4 text-muted-foreground" />
                                사용할 컴포넌트 (페이지 생성 시 import)
                            </Label>
                            {componentsLoading ? (
                                <p className="text-xs text-muted-foreground">로딩 중...</p>
                            ) : components.length === 0 ? (
                                <p className="text-xs text-muted-foreground">프로젝트에 components 폴더가 없거나 .tsx/.jsx 파일이 없습니다.</p>
                            ) : (
                                <ScrollArea className="h-[120px] rounded-md border border-input bg-background px-3 py-2">
                                    <div className="flex flex-wrap gap-2">
                                        {components.map((c) => (
                                            <label
                                                key={c.filePath}
                                                className="flex items-center gap-1.5 cursor-pointer text-xs"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedComponentPaths.includes(c.filePath)}
                                                    onChange={() => toggleComponent(c.filePath)}
                                                    className="rounded border-input"
                                                />
                                                <span className="truncate max-w-[180px]" title={c.filePath}>
                                                    {c.displayName}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </ScrollArea>
                            )}
                        </div>
                    )}
                </div>
                </div>

                <DialogFooter className="shrink-0 border-t border-border pt-4">
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
