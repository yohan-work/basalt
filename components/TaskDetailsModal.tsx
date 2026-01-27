
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, CheckCircle2, Circle, Clock, FileText, Activity } from 'lucide-react';
import { LogViewer } from './LogViewer';

interface TaskDetailsModalProps {
    task: any | null; // using any for flexibility with metadata
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function TaskDetailsModal({ task, open, onOpenChange }: TaskDetailsModalProps) {
    const [view, setView] = useState<'details' | 'logs'>('details');

    if (!open || !task) return null;

    const metadata = task.metadata || {};
    const analysis = metadata.analysis;
    const workflow = metadata.workflow;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in-0">
            <div className="relative z-50 w-full max-w-4xl max-h-[90vh] flex flex-col rounded-lg border bg-background shadow-lg shadow-black/5 animate-in zoom-in-95 sm:rounded-xl overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b shrink-0 bg-muted/10">
                    <div className="flex items-center gap-4">
                        <div>
                            <h2 className="text-xl font-semibold leading-none tracking-tight">{task.title}</h2>
                            <p className="text-sm text-muted-foreground mt-1">Status: <span className="uppercase font-bold text-primary">{task.status}</span></p>
                        </div>
                        <div className="flex bg-muted rounded-md p-1 gap-1 ml-4">
                            <button
                                onClick={() => setView('details')}
                                className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'details' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <FileText className="w-3 h-3 inline mr-1" /> Details
                            </button>
                            <button
                                onClick={() => setView('logs')}
                                className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'logs' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                <Activity className="w-3 h-3 inline mr-1" /> Live Logs
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={() => onOpenChange(false)}
                        className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                    </button>
                </div>

                {/* Body (Scrollable) */}
                <div className="flex-1 overflow-hidden flex flex-col">
                    {view === 'details' ? (
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Description */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-muted-foreground">Original Request</h3>
                                <div className="p-3 bg-muted/40 rounded-md text-sm whitespace-pre-wrap">
                                    {task.description}
                                </div>
                            </div>

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
                                    <div className="rounded-md border bg-card overflow-hidden">
                                        {workflow.steps.map((step: any, index: number) => (
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
                                </div>
                            )}

                            {/* Verification Section (If Available) */}
                            {metadata.verification && (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium text-muted-foreground">Verification Results</h3>
                                    <div className={`p-3 rounded-md border text-sm ${metadata.verification.verified ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                                        <p className="font-semibold">{metadata.verification.verified ? 'Verified Successfully' : 'Verification Failed'}</p>
                                        <p className="text-xs mt-1">{metadata.verification.notes}</p>
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

                <div className="flex justify-end p-4 bg-muted/20 border-t shrink-0">
                    <Button onClick={() => onOpenChange(false)}>Close</Button>
                </div>
            </div>
        </div>
    );
}
