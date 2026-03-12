'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Circle, Clock, FileText, Activity, AlertTriangle, RotateCcw, Trash2, GitCompare, Radio, Sparkles, ThumbsUp, Pencil, Search } from 'lucide-react';
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

interface TaskDetailsModalProps {
    task: {
        id: string;
        title: string;
        description: string;
        status: string;
        metadata?: Record<string, unknown>;
    } | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    stream?: EventStreamState & { start: (taskId: string, action: string) => void; stop: () => void; isActive: boolean };
}

export function TaskDetailsModal({ task, open, onOpenChange, stream }: TaskDetailsModalProps) {
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

    if (!task) return null;

    const metadata = (task.metadata || {}) as Record<string, unknown>;
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
    const isStreaming = stream?.isActive;
    const hasBrainstorm = !!metadata.brainstorm; // Check if brainstorm data exists

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
                            <div className="flex-1 flex flex-col p-4 bg-[#020617] rounded-b-lg" style={{ overflow: 'visible' }}>
                                <div className="flex-1 relative" style={{ overflow: 'visible' }}>
                                    <AgentDiscussion
                                        taskId={task.id}
                                        isActive={task.status === 'planning' || task.status === 'working'}
                                    />
                                </div>

                                <div className="mt-3 p-3 bg-[#0f172a] border border-slate-800 shrink-0">
                                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                        <div className="w-0.5 h-2.5 bg-[#3b9eff]" />
                                        Analysis Summary
                                    </h4>
                                    <ScrollArea className="max-h-[80px]">
                                        <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                                            {metadata.analysis ? (metadata.analysis as any).summary : '에이전트들이 현재 요구사항을 분석하고 최적의 구현 방법을 논의 중입니다.'}
                                        </p>
                                    </ScrollArea>
                                </div>
                            </div>
                        ) : view === 'changes' && hasChanges ? (
                            <div className="flex-1 overflow-hidden flex flex-col">
                                {canEditOrReview && (
                                    <div className="shrink-0 p-4 border-b bg-muted/30 space-y-3">
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">특정 요소 수정 요청</h4>
                                        <div className="flex flex-wrap gap-2 items-end">
                                            <div className="flex flex-col gap-1 min-w-[140px]">
                                                <Label className="text-xs">파일</Label>
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
                                                <Label className="text-xs">요소 설명 (선택)</Label>
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
                                                {isModifyingElement ? '수정 중...' : '이 요소 수정 요청'}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                                <div className="flex-1 min-h-0 overflow-hidden">
                                    <CodeDiffViewer fileChanges={fileChanges!} />
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
