
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, Clock, FileText, Activity, AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { LogViewer } from './LogViewer';
import { StepProgress } from './StepProgress';
import { WorkflowFlowchart } from './WorkflowFlowchart';
import { AgentStatusDashboard } from './AgentStatusDashboard';
import { FileActivityTree } from './FileActivityTree';
import { supabase } from '@/lib/supabase';
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/components/ui/dialog';

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
}

export function TaskDetailsModal({ task, open, onOpenChange }: TaskDetailsModalProps) {
    const [view, setView] = useState<'details' | 'logs'>('details');
    const [isRetrying, setIsRetrying] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    if (!task) return null;

    const metadata = (task.metadata || {}) as Record<string, unknown>;
    const analysis = metadata.analysis as Record<string, unknown> | undefined;
    const workflow = metadata.workflow as { steps: Array<{ action: string; agent: string }> } | undefined;
    const verification = metadata.verification as { verified: boolean; notes: string } | undefined;
    const progress = metadata.progress as Record<string, unknown> | undefined;
    const isFailed = task.status === 'failed';

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
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
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
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    {view === 'details' ? (
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Description */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-muted-foreground">Original Request</h3>
                                <div className="p-3 bg-muted/40 rounded-md text-sm whitespace-pre-wrap">
                                    {task.description}
                                </div>
                            </div>

                            {/* Error Information Section (If Failed) */}
                            {isFailed && metadata.lastError && (
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
                                            {metadata.failedAction && (
                                                <div>
                                                    <span className="font-semibold text-red-700 dark:text-red-400">Failed Action:</span>
                                                    <span className="ml-1 font-mono">{String(metadata.failedAction)}</span>
                                                </div>
                                            )}
                                            {metadata.failedAgent && (
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
                                            {metadata.failedAt && (
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
                                                <span className="font-semibold text-muted-foreground">Complexity:</span> {String(analysis.complexity)}
                                            </div>
                                            <div>
                                                <span className="font-semibold text-muted-foreground">Required Agents:</span> {(analysis.required_agents as string[] || []).join(', ')}
                                            </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-2 border-t pt-2">
                                            {String(analysis.summary)}
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
                        <Button onClick={() => onOpenChange(false)}>Close</Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
