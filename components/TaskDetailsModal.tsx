'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Circle, Clock, FileText, Activity, AlertTriangle, RotateCcw, Trash2, GitCompare, Radio, Sparkles, ThumbsUp, Pencil, Search, ClipboardPaste, ExternalLink, ChevronDown } from 'lucide-react';
import { LogViewer } from './LogViewer';
import { StepProgress, type ProgressInfo } from './StepProgress';
import { WorkflowFlowchart } from './WorkflowFlowchart';
import { AgentStatusDashboard } from './AgentStatusDashboard';
import { FileActivityTree } from './FileActivityTree';
import { CodeDiffViewer, type FileChange } from './CodeDiffViewer';
import { LiveProgressPanel } from './LiveProgressPanel';
import { AgentDiscussion } from './AgentDiscussion'; // Added import
import { supabase } from '@/lib/supabase';
import type { EventStreamState } from '@/lib/hooks/useEventStream';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogHeader,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { parseReactGrabClipboard } from '@/lib/parse-react-grab-clipboard';
import { useIncomingReactGrab } from './IncomingReactGrabProvider';
import { Badge } from '@/components/ui/badge';
import { ExecutionDiscussionTimeline } from './ExecutionDiscussionTimeline';
import { CollaborationMatrix } from './analytics/team/CollaborationMatrix';
import { getTaskPerformanceBenchmark, type TaskPerformanceBenchmark } from '@/lib/analytics';
import type {
    ExecuteStreamOptions,
    ExecutionDiscussionEntry,
    OrchestratorCollaborationMap,
} from '@/lib/types/agent-visualization';

interface TaskDetailsModalProps {
    task: {
        id: string;
        title: string;
        description: string;
        status: string;
        project_id?: string;
        metadata?: Record<string, unknown>;
    } | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    stream?: EventStreamState & {
        start: (taskId: string, action: string, executeOptions?: ExecuteStreamOptions) => void;
        stop: () => void;
        isActive: boolean;
    };
    executionOptions?: ExecuteStreamOptions;
    onExecutionOptionsChange?: (taskId: string, options: ExecuteStreamOptions) => void;
    onExecute?: (taskId: string, options: ExecuteStreamOptions) => void;
}

const DEFAULT_EXECUTION_OPTIONS: Required<ExecuteStreamOptions> = {
    discussionMode: 'step_handoff',
    maxDiscussionThoughts: 3,
    carryDiscussionToPrompt: true,
    strategyPreset: 'balanced',
};

function normalizeExecutionOptions(raw?: ExecuteStreamOptions): Required<ExecuteStreamOptions> {
    const discussionMode =
        raw?.discussionMode === 'off' || raw?.discussionMode === 'step_handoff' || raw?.discussionMode === 'roundtable'
            ? raw.discussionMode
            : DEFAULT_EXECUTION_OPTIONS.discussionMode;
    const maxDiscussionThoughts =
        typeof raw?.maxDiscussionThoughts === 'number' && Number.isFinite(raw.maxDiscussionThoughts)
            ? Math.min(6, Math.max(1, Math.round(raw.maxDiscussionThoughts)))
            : DEFAULT_EXECUTION_OPTIONS.maxDiscussionThoughts;
    const carryDiscussionToPrompt =
        typeof raw?.carryDiscussionToPrompt === 'boolean'
            ? raw.carryDiscussionToPrompt
            : DEFAULT_EXECUTION_OPTIONS.carryDiscussionToPrompt;
    const strategyPreset =
        raw?.strategyPreset === 'quality_first'
            || raw?.strategyPreset === 'balanced'
            || raw?.strategyPreset === 'speed_first'
            || raw?.strategyPreset === 'cost_saver'
            ? raw.strategyPreset
            : DEFAULT_EXECUTION_OPTIONS.strategyPreset;

    return {
        discussionMode,
        maxDiscussionThoughts,
        carryDiscussionToPrompt,
        strategyPreset,
    };
}

export function TaskDetailsModal({
    task,
    open,
    onOpenChange,
    stream,
    executionOptions,
    onExecutionOptionsChange,
    onExecute,
}: TaskDetailsModalProps) {
    const [view, setView] = useState<'details' | 'logs' | 'changes' | 'live' | 'brainstorm'>('details'); // Updated state type
    const [isRetrying, setIsRetrying] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editInstructions, setEditInstructions] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [modifyElementFilePath, setModifyElementFilePath] = useState('');
    const [modifyElementDescriptor, setModifyElementDescriptor] = useState('');
    const [modifyElementRequest, setModifyElementRequest] = useState('');
    const [isModifyingElement, setIsModifyingElement] = useState(false);
    const [isReviewing, setIsReviewing] = useState(false);
    const [isDiscussionAccordionOpen, setIsDiscussionAccordionOpen] = useState(false);
    const [isBenchmarkLoading, setIsBenchmarkLoading] = useState(false);
    const [taskBenchmark, setTaskBenchmark] = useState<TaskPerformanceBenchmark | null>(null);
    const [draftExecutionOptions, setDraftExecutionOptions] = useState<Required<ExecuteStreamOptions>>(
        DEFAULT_EXECUTION_OPTIONS
    );

    const { payload: incomingReactGrabPayload, clearPayload: clearIncomingReactGrab } = useIncomingReactGrab();

    useEffect(() => {
        if (!incomingReactGrabPayload || !task || !open) return;
        const allowed = ['testing', 'review', 'done'].includes(task.status);
        if (!allowed) return;
        const p = incomingReactGrabPayload;
        if (p.filePath) setModifyElementFilePath(p.filePath);
        const descriptor =
            p.elementDescriptor ??
            ([p.componentName, p.filePath && (p.line != null ? `${p.filePath}:${p.line}` : p.filePath)].filter(Boolean).join(' ').trim() || p.stackString || '');
        setModifyElementDescriptor(descriptor);
        setView('changes');
        clearIncomingReactGrab();
    }, [incomingReactGrabPayload, task, open, clearIncomingReactGrab]);

    useEffect(() => {
        if (!task) return;

        const metadataExecutionOptions =
            typeof task.metadata === 'object' && task.metadata !== null
                ? ((task.metadata as Record<string, unknown>).executionOptions as ExecuteStreamOptions | undefined)
                : undefined;

        const next = normalizeExecutionOptions(executionOptions || metadataExecutionOptions);
        setDraftExecutionOptions(next);
    }, [task, executionOptions, open]);

    useEffect(() => {
        if (!open) return;
        setIsDiscussionAccordionOpen(false);
    }, [open, task?.id]);

    useEffect(() => {
        if (!open || !task?.id) return;

        let active = true;
        setIsBenchmarkLoading(true);

        void getTaskPerformanceBenchmark(task.id, task.project_id ?? null)
            .then((result) => {
                if (!active) return;
                setTaskBenchmark(result);
            })
            .catch((error) => {
                console.error('Failed to load task benchmark:', error);
                if (!active) return;
                setTaskBenchmark(null);
            })
            .finally(() => {
                if (!active) return;
                setIsBenchmarkLoading(false);
            });

        return () => {
            active = false;
        };
    }, [open, task?.id, task?.project_id]);

    if (!task) return null;

    const metadata = (task.metadata || {}) as Record<string, unknown> & {
        executionOptions?: ExecuteStreamOptions;
        executionDiscussions?: ExecutionDiscussionEntry[];
        agentCollaboration?: OrchestratorCollaborationMap;
    };
    const reviewResult = metadata.reviewResult as string | undefined;
    const analysis = metadata.analysis as { complexity?: string; required_agents?: string[]; summary?: string } | undefined;
    const workflow = metadata.workflow as { steps: Array<{ action: string; agent: string }> } | undefined;
    const verification = metadata.verification as { verified: boolean; notes: string } | undefined;
    const progress = metadata.progress as ProgressInfo | undefined;
    const fileChanges = metadata.fileChanges as FileChange[] | undefined;
    const isFailed = task.status === 'failed';
    const isReview = task.status === 'review';
    const canEditOrReview = ['testing', 'review', 'done'].includes(task.status);
    const hasChanges = fileChanges && fileChanges.length > 0;
    const persistedExecutionOptions = normalizeExecutionOptions(metadata.executionOptions);
    const executionDiscussions = Array.isArray(metadata.executionDiscussions)
        ? metadata.executionDiscussions
        : [];
    const collaboration = metadata.agentCollaboration;
    const canRunExecuteFromModal =
        (task.status === 'planning' || task.status === 'working')
        && Array.isArray(workflow?.steps)
        && workflow.steps.length > 0;

    const handleEditCompleted = async () => {
        if (!editInstructions.trim()) return;
        setIsEditing(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/edit-completed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id, instructions: editInstructions.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Edit request failed');
            setIsEditModalOpen(false);
            setEditInstructions('');
            setView('changes');
        } catch (error) {
            console.error('Edit completed failed', error);
            setActionError(error instanceof Error ? error.message : '코드 수정 요청에 실패했습니다.');
        } finally {
            setIsEditing(false);
        }
    };

    const handlePasteElementContext = async () => {
        setActionError(null);
        try {
            const text = await navigator.clipboard.readText();
            const parsed = parseReactGrabClipboard(text);
            if (!parsed) {
                setActionError('react-grab으로 복사한 내용이 아닙니다. 미리보기에서 요소에 포커스 후 Cmd+C(또는 Ctrl+C)로 복사한 뒤 다시 시도하세요.');
                return;
            }
            if (parsed.filePath) setModifyElementFilePath(parsed.filePath);
            setModifyElementDescriptor(parsed.elementDescriptor);
        } catch (e) {
            console.error('Paste element context failed', e);
            setActionError('클립보드를 읽을 수 없습니다. 브라우저에서 클립보드 접근을 허용해 주세요.');
        }
    };

    const handleOpenPreviewForGrab = async () => {
        const projectId = task?.project_id;
        if (!projectId) {
            setActionError('이 태스크에 연결된 프로젝트가 없어 미리보기를 열 수 없습니다.');
            return;
        }
        setActionError(null);
        try {
            const res = await fetch(`/api/project/dev-server-info?projectId=${encodeURIComponent(projectId)}`);
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || 'Failed to get dev server URL');
            const url = data.url || `http://localhost:${data.port ?? 3001}`;
            window.open(url, 'basalt-preview', 'noopener,noreferrer');
        } catch (e) {
            console.error('Open preview failed', e);
            setActionError('미리보기 URL을 가져오지 못했습니다. 해당 프로젝트 dev 서버가 실행 중인지 확인하세요.');
        }
    };

    const handleModifyElement = async () => {
        if (!modifyElementRequest.trim()) return;
        setIsModifyingElement(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/modify-element', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId: task.id,
                    filePath: modifyElementFilePath || undefined,
                    elementDescriptor: modifyElementDescriptor.trim() || undefined,
                    request: modifyElementRequest.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Element modify request failed');
            setModifyElementRequest('');
            setModifyElementDescriptor('');
        } catch (error) {
            console.error('Modify element failed', error);
            setActionError(error instanceof Error ? error.message : '요소 수정 요청에 실패했습니다.');
        } finally {
            setIsModifyingElement(false);
        }
    };

    const handleRunReview = async () => {
        setIsReviewing(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Review failed');
            setView('details');
        } catch (error) {
            console.error('Review failed', error);
            setActionError(error instanceof Error ? error.message : '코드 검토 실행에 실패했습니다.');
        } finally {
            setIsReviewing(false);
        }
    };

    const updateExecutionOptions = (patch: Partial<ExecuteStreamOptions>) => {
        if (!task) return;
        const next = normalizeExecutionOptions({ ...draftExecutionOptions, ...patch });
        setDraftExecutionOptions(next);
        onExecutionOptionsChange?.(task.id, next);
    };

    const handleExecuteWithOptions = () => {
        if (!task) return;

        if (onExecute) {
            onExecute(task.id, draftExecutionOptions);
        } else {
            stream?.start(task.id, 'execute', draftExecutionOptions);
        }
        setView('live');
    };

    const isStreaming = stream?.isActive;

    const handleRetry = async () => {
        setIsRetrying(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/retry', {
                method: 'POST',
                body: JSON.stringify({ taskId: task.id })
            });
            if (!res.ok) throw new Error('Retry request failed');
            onOpenChange(false);
        } catch (error) {
            console.error('Retry failed', error);
            setActionError('재시도에 실패했습니다. 다시 시도해주세요.');
        } finally {
            setIsRetrying(false);
        }
    };

    const handleApprove = async () => {
        setIsApproving(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Approve request failed');
            }
            onOpenChange(false);
        } catch (error) {
            console.error('Approve failed', error);
            setActionError('승인에 실패했습니다. 다시 시도해주세요.');
        } finally {
            setIsApproving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm(`"${task.title}" 태스크를 삭제하시겠습니까?\n(관련 로그도 함께 삭제됩니다)`)) return;

        setIsDeleting(true);
        setActionError(null);
        try {
            const { error: logsError } = await supabase
                .from('Execution_Logs')
                .delete()
                .eq('task_id', task.id);

            if (logsError) {
                console.error('Logs delete failed:', logsError);
            }

            const { error } = await supabase.from('Tasks').delete().eq('id', task.id);
            if (error) {
                console.error('Delete failed:', error);
                setActionError('삭제 실패: ' + error.message);
            } else {
                onOpenChange(false);
            }
        } catch (error) {
            console.error('Delete error:', error);
            setActionError('삭제 중 오류가 발생했습니다.');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={`sm:max-w-5xl h-[85vh] flex flex-col p-0 gap-0 transition-all duration-300 ${view === 'brainstorm' ? 'overflow-visible !translate-x-[calc(-50%-190px)]' : 'overflow-hidden !translate-x-[-50%]'}`}
                style={{ overflow: view === 'brainstorm' ? 'visible' : 'hidden' }}
            >
                <div className="flex flex-col h-full w-full overflow-hidden sm:rounded-lg bg-background">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b shrink-0 bg-muted/10">
                        <div className="flex items-center gap-4">
                            <div>
                                <DialogTitle className="text-xl font-semibold leading-none tracking-tight">
                                    {task.title}
                                </DialogTitle>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Status: <span className={`uppercase font-bold ${isFailed ? 'text-red-500' : 'text-primary'}`}>{task.status}</span>
                                    {metadata.retryCount ? <span className="text-xs ml-2">(Retry #{String(metadata.retryCount)})</span> : ''}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    <Badge variant="outline" className="text-[10px]">
                                        Preset: {draftExecutionOptions.strategyPreset}
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px]">
                                        Discussion: {draftExecutionOptions.discussionMode}
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px]">
                                        Thoughts: {draftExecutionOptions.maxDiscussionThoughts}
                                    </Badge>
                                    <Badge
                                        variant={draftExecutionOptions.carryDiscussionToPrompt ? 'default' : 'secondary'}
                                        className="text-[10px]"
                                    >
                                        {draftExecutionOptions.carryDiscussionToPrompt ? 'Prompt Carry On' : 'Prompt Carry Off'}
                                    </Badge>
                                </div>
                            </div>
                            <div className="flex bg-muted rounded-md p-1 gap-1 ml-4">
                                <button
                                    onClick={() => setView('details')}
                                    className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'details' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    aria-pressed={view === 'details'}
                                >
                                    <FileText className="w-3 h-3 inline mr-1" /> Details
                                </button>
                                {(isStreaming || (stream && stream.status !== 'idle')) && (
                                    <button
                                        onClick={() => setView('live')}
                                        className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'live' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        aria-pressed={view === 'live'}
                                    >
                                        <Radio className={`w-3 h-3 inline mr-1 ${isStreaming ? 'text-red-500' : ''}`} /> Live
                                        {isStreaming && <span className="ml-1 inline-block w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
                                    </button>
                                )}
                                {hasChanges && (
                                    <button
                                        onClick={() => setView('changes')}
                                        className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'changes' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        aria-pressed={view === 'changes'}
                                    >
                                        <GitCompare className="w-3 h-3 inline mr-1" /> Changes
                                        <span className="ml-1 text-[10px] opacity-60">{fileChanges!.length}</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => setView('brainstorm')}
                                    className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'brainstorm' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    aria-pressed={view === 'brainstorm'}
                                >
                                    <Sparkles className={`w-3 h-3 inline mr-1 text-blue-500`} /> Brainstorm
                                </button>
                                <button
                                    onClick={() => setView('logs')}

                                    className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'logs' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    aria-pressed={view === 'logs'}
                                >
                                    <Activity className="w-3 h-3 inline mr-1" /> Live Logs
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Action Error */}
                    {actionError && (
                        <div className="mx-6 mt-4 p-3 border border-red-300 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm rounded-sm flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {actionError}
                        </div>
                    )}

                    {/* Body (Scrollable) */}
                    <div className={`flex-1 flex flex-col min-h-0 ${view === 'brainstorm' ? 'overflow-visible' : 'overflow-hidden'}`}>
                        {view === 'live' && stream ? (
                            <div className="flex-1 overflow-y-auto p-6">
                                <LiveProgressPanel stream={stream} />
                            </div>
                        ) : view === 'brainstorm' ? (
                            <div className="flex-1 flex flex-col p-4 bg-slate-950 rounded-b-lg" style={{ overflow: 'visible' }}>
                                <div className="flex-1 relative" style={{ overflow: 'visible' }}>
                                    <AgentDiscussion
                                        taskId={task.id}
                                        isActive={task.status === 'planning' || task.status === 'working'}
                                    />
                                </div>

                                <div className="mt-3 p-3 bg-slate-900 border border-slate-700/70 shrink-0">
                                    <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                        <div className="w-0.5 h-2.5 bg-[#3b9eff]" />
                                        Analysis Summary
                                    </h4>
                                    <ScrollArea className="max-h-[80px]">
                                        <p className="text-[11px] text-slate-100/90 leading-relaxed font-medium">
                                            {typeof metadata.analysis === 'object' &&
                                            metadata.analysis !== null &&
                                            'summary' in metadata.analysis
                                                ? String((metadata.analysis as { summary?: unknown }).summary ?? '')
                                                : '에이전트들이 현재 요구사항을 분석하고 최적의 구현 방법을 논의 중입니다.'}
                                        </p>
                                    </ScrollArea>
                                </div>
                            </div>
                        ) : view === 'changes' && hasChanges ? (
                            <div className="flex-1 overflow-hidden flex flex-col">
                                {canEditOrReview && (
                                    <div className="shrink-0 p-4 border-b bg-muted/30 space-y-3">
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">특정 요소 수정 요청</h4>
                                        <p className="text-[11px] text-muted-foreground">
                                            미리보기에서 요소를 선택한 뒤 Cmd+C로 복사 후 붙여넣기하거나, 프로젝트에 react-grab 플러그인을 넣으면 &quot;Basalt로 보내기&quot;로 바로 전송할 수 있습니다.
                                        </p>
                                        <div className="flex flex-wrap gap-3 items-end">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleOpenPreviewForGrab}
                                                disabled={isModifyingElement || !task.project_id}
                                                className="shrink-0"
                                                title="프로젝트 미리보기를 새 창으로 엽니다. 해당 프로젝트에 react-grab + Basalt 플러그인을 넣으면 요소 선택 후 Basalt로 보내기를 사용할 수 있습니다."
                                            >
                                                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                                Select Element Preview
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handlePasteElementContext}
                                                disabled={isModifyingElement}
                                                className="shrink-0"
                                            >
                                                <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" />
                                                Paste Context
                                            </Button>
                                            <div className="flex flex-col gap-1 min-w-[140px]">
                                                <Label className="text-xs">File</Label>
                                                <select
                                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                                    value={modifyElementFilePath}
                                                    onChange={(e) => setModifyElementFilePath(e.target.value)}
                                                    disabled={isModifyingElement}
                                                >
                                                    <option value="">첫 번째 파일</option>
                                                    {fileChanges!.map((fc, idx) => (
                                                        <option key={`${fc.filePath}-${fc.stepIndex ?? ''}-${idx}`} value={fc.filePath}>{fc.filePath}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex flex-col gap-1 min-w-[160px]">
                                                <Label className="text-xs">Element Description (optional)</Label>
                                                <input
                                                    type="text"
                                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                                    placeholder="예: 타이틀, HeroSection"
                                                    value={modifyElementDescriptor}
                                                    onChange={(e) => setModifyElementDescriptor(e.target.value)}
                                                    disabled={isModifyingElement}
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                                                <Label className="text-xs">수정 요청</Label>
                                                <input
                                                    type="text"
                                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                                    placeholder="EX) component 요소를 제거해줘"
                                                    value={modifyElementRequest}
                                                    onChange={(e) => setModifyElementRequest(e.target.value)}
                                                    disabled={isModifyingElement}
                                                />
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={handleModifyElement}
                                                disabled={isModifyingElement || !modifyElementRequest.trim()}
                                            >
                                                {isModifyingElement ? 'Modifying...' : 'Request Modify Element'}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                                <div className="flex-1 min-h-0 overflow-hidden">
                                    <CodeDiffViewer
                                        fileChanges={fileChanges!}
                                        taskId={canEditOrReview ? task.id : null}
                                    />
                                </div>
                            </div>
                        ) : view === 'details' ? (
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {/* Description */}
                                <div className="space-y-2">
                                    <h3 className="text-sm font-medium text-muted-foreground">Original Request</h3>
                                    <div className="p-3 bg-muted/40 rounded-md text-sm whitespace-pre-wrap">
                                        {task.description}
                                    </div>
                                </div>

                                {/* Task Performance Benchmark */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium text-muted-foreground">Task Performance Trend</h3>
                                    <div className="rounded-md border bg-card p-4 space-y-3">
                                        <p className="text-xs text-muted-foreground">
                                            현재 태스크 실행 지표를 같은 프로젝트의 최근 완료/실패 태스크 평균과 비교합니다.
                                        </p>
                                        {isBenchmarkLoading ? (
                                            <div className="text-xs text-muted-foreground">비교 지표를 불러오는 중...</div>
                                        ) : !taskBenchmark ? (
                                            <div className="text-xs text-muted-foreground">비교 가능한 baseline 데이터가 아직 충분하지 않습니다.</div>
                                        ) : (
                                            <>
                                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                                    <div className="rounded-md border p-3">
                                                        <div className="text-[11px] text-muted-foreground">Tokens</div>
                                                        <div className="text-sm font-semibold">
                                                            {taskBenchmark.current.totalTokens.toLocaleString()}
                                                            <span className="ml-1 text-xs text-muted-foreground">
                                                                vs {taskBenchmark.baseline.totalTokens.toLocaleString()}
                                                            </span>
                                                        </div>
                                                        <div className={`text-xs mt-1 ${taskBenchmark.deltaPct.totalTokens <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                            {taskBenchmark.deltaPct.totalTokens > 0 ? '+' : ''}
                                                            {taskBenchmark.deltaPct.totalTokens.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                    <div className="rounded-md border p-3">
                                                        <div className="text-[11px] text-muted-foreground">Lead Time</div>
                                                        <div className="text-sm font-semibold">
                                                            {taskBenchmark.current.leadTimeSeconds}s
                                                            <span className="ml-1 text-xs text-muted-foreground">
                                                                vs {taskBenchmark.baseline.leadTimeSeconds}s
                                                            </span>
                                                        </div>
                                                        <div className={`text-xs mt-1 ${taskBenchmark.deltaPct.leadTimeSeconds <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                            {taskBenchmark.deltaPct.leadTimeSeconds > 0 ? '+' : ''}
                                                            {taskBenchmark.deltaPct.leadTimeSeconds.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                    <div className="rounded-md border p-3">
                                                        <div className="text-[11px] text-muted-foreground">Discussion Calls</div>
                                                        <div className="text-sm font-semibold">
                                                            {taskBenchmark.current.discussionCalls}
                                                            <span className="ml-1 text-xs text-muted-foreground">
                                                                vs {taskBenchmark.baseline.discussionCalls}
                                                            </span>
                                                        </div>
                                                        <div className={`text-xs mt-1 ${taskBenchmark.deltaPct.discussionCalls <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                            {taskBenchmark.deltaPct.discussionCalls > 0 ? '+' : ''}
                                                            {taskBenchmark.deltaPct.discussionCalls.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                    <div className="rounded-md border p-3">
                                                        <div className="text-[11px] text-muted-foreground">LLM Calls</div>
                                                        <div className="text-sm font-semibold">
                                                            {taskBenchmark.current.llmCalls}
                                                            <span className="ml-1 text-xs text-muted-foreground">
                                                                vs {taskBenchmark.baseline.llmCalls}
                                                            </span>
                                                        </div>
                                                        <div className={`text-xs mt-1 ${taskBenchmark.deltaPct.llmCalls <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                            {taskBenchmark.deltaPct.llmCalls > 0 ? '+' : ''}
                                                            {taskBenchmark.deltaPct.llmCalls.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                    <Badge variant="outline" className="text-[10px]">
                                                        Current: {taskBenchmark.current.status}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[10px]">
                                                        Baseline Sample: {taskBenchmark.sampleSize}
                                                    </Badge>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Discussion Controls */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium text-muted-foreground">Discussion Controls</h3>
                                    <div className="rounded-md border bg-card p-4 space-y-4">
                                        <div className="grid gap-3 md:grid-cols-4">
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Preset</Label>
                                                <select
                                                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                                    value={draftExecutionOptions.strategyPreset}
                                                    onChange={(e) =>
                                                        updateExecutionOptions({
                                                            strategyPreset: e.target.value as ExecuteStreamOptions['strategyPreset'],
                                                        })
                                                    }
                                                >
                                                    <option value="quality_first">quality_first</option>
                                                    <option value="balanced">balanced</option>
                                                    <option value="speed_first">speed_first</option>
                                                    <option value="cost_saver">cost_saver</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Mode</Label>
                                                <select
                                                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                                    value={draftExecutionOptions.discussionMode}
                                                    onChange={(e) =>
                                                        updateExecutionOptions({
                                                            discussionMode: e.target.value as ExecuteStreamOptions['discussionMode'],
                                                        })
                                                    }
                                                >
                                                    <option value="off">off</option>
                                                    <option value="step_handoff">step_handoff</option>
                                                    <option value="roundtable">roundtable</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Max Thoughts</Label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={6}
                                                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                                    value={draftExecutionOptions.maxDiscussionThoughts}
                                                    onChange={(e) =>
                                                        updateExecutionOptions({
                                                            maxDiscussionThoughts: Number(e.target.value),
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Prompt Carry</Label>
                                                <button
                                                    type="button"
                                                    className={`h-9 w-full rounded-md border px-2 text-sm transition-colors ${
                                                        draftExecutionOptions.carryDiscussionToPrompt
                                                            ? 'border-emerald-500/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                                                            : 'border-input bg-background text-muted-foreground'
                                                    }`}
                                                    onClick={() =>
                                                        updateExecutionOptions({
                                                            carryDiscussionToPrompt:
                                                                !draftExecutionOptions.carryDiscussionToPrompt,
                                                        })
                                                    }
                                                >
                                                    {draftExecutionOptions.carryDiscussionToPrompt ? 'enabled' : 'disabled'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <Badge variant="outline" className="text-[10px]">
                                                Saved Preset: {persistedExecutionOptions.strategyPreset}
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px]">
                                                Saved: {persistedExecutionOptions.discussionMode}
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px]">
                                                Saved Thoughts: {persistedExecutionOptions.maxDiscussionThoughts}
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px]">
                                                Saved Carry: {persistedExecutionOptions.carryDiscussionToPrompt ? 'on' : 'off'}
                                            </Badge>
                                        </div>
                                        {canRunExecuteFromModal && (
                                            <div className="flex justify-end">
                                                <Button size="sm" onClick={handleExecuteWithOptions}>
                                                    Execute With Discussion Options
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Discussion Timeline */}
                                <div className="space-y-3">
                                    <button
                                        type="button"
                                        className="flex w-full items-center justify-between rounded-md border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/30"
                                        aria-expanded={isDiscussionAccordionOpen}
                                        aria-controls="execution-discussions-panel"
                                        onClick={() => setIsDiscussionAccordionOpen((prev) => !prev)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-muted-foreground">Execution Discussions</span>
                                            <Badge variant="outline" className="text-[10px]">
                                                {executionDiscussions.length} entries
                                            </Badge>
                                        </div>
                                        <ChevronDown
                                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                                                isDiscussionAccordionOpen ? 'rotate-180' : ''
                                            }`}
                                        />
                                    </button>
                                    {isDiscussionAccordionOpen && (
                                        <div id="execution-discussions-panel">
                                            <ExecutionDiscussionTimeline
                                                entries={executionDiscussions}
                                                carryDiscussionToPrompt={draftExecutionOptions.carryDiscussionToPrompt}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Collaboration Matrix */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium text-muted-foreground">Agent Collaboration</h3>
                                    <CollaborationMatrix
                                        title="Execution Collaboration Matrix"
                                        collaboration={collaboration}
                                        emptyMessage="협업 그래프 데이터가 아직 저장되지 않았습니다."
                                    />
                                </div>

                                {/* Error Information Section (If Failed) */}
                                {isFailed && !!metadata.lastError && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-medium text-red-600 flex items-center gap-2">
                                            <span className="bg-red-100 text-red-700 p-1 rounded-sm"><AlertTriangle className="w-3 h-3" /></span>
                                            Error Information
                                        </h3>
                                        <div className="p-4 border border-red-200 rounded-md bg-red-50 dark:bg-red-950/30 dark:border-red-800 space-y-3">
                                            <div className="text-sm">
                                                <span className="font-semibold text-red-700 dark:text-red-400">Error Message:</span>
                                                <p className="mt-1 font-mono text-xs text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-900/50 p-2 rounded">
                                                    {String(metadata.lastError)}
                                                </p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 text-xs">
                                                {!!metadata.failedAction && (
                                                    <div>
                                                        <span className="font-semibold text-red-700 dark:text-red-400">Failed Action:</span>
                                                        <span className="ml-1 font-mono">{String(metadata.failedAction)}</span>
                                                    </div>
                                                )}
                                                {!!metadata.failedAgent && (
                                                    <div>
                                                        <span className="font-semibold text-red-700 dark:text-red-400">Failed Agent:</span>
                                                        <span className="ml-1 font-mono">{String(metadata.failedAgent)}</span>
                                                    </div>
                                                )}
                                                {metadata.failedStep !== undefined && (
                                                    <div>
                                                        <span className="font-semibold text-red-700 dark:text-red-400">Failed at Step:</span>
                                                        <span className="ml-1">{Number(metadata.failedStep) + 1}</span>
                                                    </div>
                                                )}
                                                {!!metadata.failedAt && (
                                                    <div>
                                                        <span className="font-semibold text-red-700 dark:text-red-400">Failed At:</span>
                                                        <span className="ml-1">{new Date(String(metadata.failedAt)).toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Analysis Section (If Available) */}
                                {analysis && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                            <span className="bg-blue-100 text-blue-700 p-1 rounded-sm"><Clock className="w-3 h-3" /></span>
                                            Agent Analysis
                                        </h3>
                                        <div className="p-4 border rounded-md bg-card space-y-2">
                                            <div className="grid grid-cols-2 gap-4 text-xs">
                                                <div>
                                                    <span className="font-semibold text-muted-foreground">Complexity:</span> {analysis.complexity}
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-muted-foreground">Required Agents:</span> {(analysis.required_agents || []).join(', ')}
                                                </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-2 border-t pt-2">
                                                {analysis.summary}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Workflow Section (If Available) */}
                                {workflow && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                            <span className="bg-amber-100 text-amber-700 p-1 rounded-sm"><CheckCircle2 className="w-3 h-3" /></span>
                                            Execution Plan
                                        </h3>

                                        {/* Flowchart Visualization */}
                                        <WorkflowFlowchart
                                            workflow={workflow}
                                            progress={progress}
                                        />

                                        {/* Agent Status Dashboard */}
                                        <AgentStatusDashboard
                                            workflow={workflow}
                                            progress={progress}
                                        />

                                        {/* File Activity Tree */}
                                        <FileActivityTree taskId={task.id} />

                                        {/* Show StepProgress if progress exists, otherwise show static list */}
                                        {progress ? (
                                            <div className="p-4 border rounded-md bg-card">
                                                <StepProgress
                                                    progress={progress}
                                                    workflow={workflow}
                                                />
                                            </div>
                                        ) : (
                                            <div className="rounded-md border bg-card overflow-hidden">
                                                {workflow.steps.map((step, index: number) => (
                                                    <div key={index} className="flex items-center gap-3 p-3 text-sm border-b last:border-0 hover:bg-muted/20">
                                                        <div className="flex h-6 w-6 items-center justify-center rounded-full border bg-background text-xs font-semibold text-muted-foreground shadow-sm shrink-0">
                                                            {index + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium truncate">{step.action}</div>
                                                            <div className="text-xs text-muted-foreground">Assigned to: {step.agent}</div>
                                                        </div>
                                                        <Circle className="h-3 w-3 text-muted-foreground/30" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Verification Section (If Available) */}
                                {verification && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-medium text-muted-foreground">Verification Results</h3>
                                        <div className={`p-3 rounded-md border text-sm ${verification.verified ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                                            <p className="font-semibold">{verification.verified ? 'Verified Successfully' : 'Verification Failed'}</p>
                                            <p className="text-xs mt-1">{verification.notes}</p>
                                        </div>
                                    </div>
                                )}

                                {/* Code Review Result */}
                                {reviewResult && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                            <Search className="w-4 h-4" />
                                            코드 검토 결과
                                        </h3>
                                        <div className="p-4 rounded-md border bg-card text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                                            {reviewResult}
                                        </div>
                                    </div>
                                )}

                                {!analysis && !workflow && (
                                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                        <Clock className="h-8 w-8 mb-2 opacity-20" />
                                        <p className="text-sm">No plan generated yet.</p>
                                        <p className="text-xs">Click &quot;Confirm &amp; Plan&quot; to generate.</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 h-full overflow-hidden">
                                <LogViewer taskId={task.id} />
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between p-4 bg-muted/20 border-t shrink-0">
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={isDeleting}
                        >
                            <Trash2 className={`mr-2 h-4 w-4 ${isDeleting ? 'animate-pulse' : ''}`} />
                            {isDeleting ? 'deleting...' : 'delete task'}
                        </Button>
                        <div className="flex gap-2">
                            {isFailed && (
                                <Button
                                    onClick={handleRetry}
                                    disabled={isRetrying}
                                    className="bg-red-600 hover:bg-red-700"
                                >
                                    <RotateCcw className={`mr-2 h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                                    {isRetrying ? 'Retrying...' : 'Retry Task'}
                                </Button>
                            )}
                            {isReview && (
                                <Button
                                    onClick={handleApprove}
                                    disabled={isApproving}
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                    <ThumbsUp className={`mr-2 h-4 w-4 ${isApproving ? 'animate-pulse' : ''}`} />
                                    {isApproving ? 'Approving...' : 'Approve'}
                                </Button>
                            )}
                            {canEditOrReview && hasChanges && (
                                <Button
                                    variant="outline"
                                    onClick={() => setIsEditModalOpen(true)}
                                    disabled={isEditing}
                                >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Request Code Edit
                                </Button>
                            )}
                            {canEditOrReview && (hasChanges || task.description) && (
                                <Button
                                    variant="outline"
                                    onClick={handleRunReview}
                                    disabled={isReviewing}
                                >
                                    <Search className={`mr-2 h-4 w-4 ${isReviewing ? 'animate-pulse' : ''}`} />
                                    {isReviewing ? '검토 중...' : 'Code Review'}
                                </Button>
                            )}
                            <Button onClick={() => onOpenChange(false)}>Close</Button>
                        </div>
                    </div>
                </div>

                {/* External Portal Target for Brainstorm Chat */}
                {view === 'brainstorm' && (
                    <div id="agent-discussion-chat-portal" className="absolute top-0 -right-[400px] w-[380px] h-full pointer-events-none" />
                )}
            </DialogContent>
        </Dialog>

            {/* Edit completed code modal (sibling to avoid nested dialog issues) */}
            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Request Code Edit</DialogTitle>
                        <DialogDescription>
                            완료된 결과물에 적용할 수정 지시사항을 입력하세요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-instructions">수정 지시사항</Label>
                            <textarea
                                id="edit-instructions"
                                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="EX) Increase the font size of the title"
                                value={editInstructions}
                                onChange={(e) => setEditInstructions(e.target.value)}
                                disabled={isEditing}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditModalOpen(false)} disabled={isEditing}>
                            취소
                        </Button>
                        <Button onClick={handleEditCompleted} disabled={isEditing || !editInstructions.trim()}>
                            {isEditing ? '수정 중...' : '수정 요청'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
