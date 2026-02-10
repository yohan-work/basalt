
'use client';

import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Loader2, CheckCircle, XCircle, Clock, Zap, Bot, Timer,
} from 'lucide-react';
import type { EventStreamState, StepInfo } from '@/lib/hooks/useEventStream';

interface LiveProgressPanelProps {
    stream: EventStreamState;
}

function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes}m ${remaining}s`;
}

function formatETA(ms: number | null): string {
    if (!ms || ms <= 0) return '--';
    return `~${formatDuration(ms)}`;
}

export function LiveProgressPanel({ stream }: LiveProgressPanelProps) {
    const {
        currentStep,
        completedSteps,
        eta,
        percent,
        llmBuffer,
        status,
        errorMessage,
    } = stream;

    if (status === 'idle') {
        return null;
    }

    const isActive = status === 'connecting' || status === 'streaming';
    const isDone = status === 'done';
    const isError = status === 'error';

    return (
        <div className="border border-border bg-card overflow-hidden">
            {/* Progress Header */}
            <div className="p-3 border-b border-border bg-muted/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {isActive && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {isDone && <CheckCircle className="h-4 w-4 text-green-500" />}
                    {isError && <XCircle className="h-4 w-4 text-red-500" />}
                    <span className="text-sm font-medium">
                        {status === 'connecting' && 'Connecting...'}
                        {status === 'streaming' && 'Processing...'}
                        {isDone && 'Complete'}
                        {isError && 'Error'}
                    </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {eta !== null && eta > 0 && (
                        <span className="flex items-center gap-1">
                            <Timer className="h-3 w-3" />
                            ETA: {formatETA(eta)}
                        </span>
                    )}
                    <span>{percent}%</span>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="h-1 bg-muted">
                <div
                    className="h-full bg-primary transition-all duration-500 ease-out"
                    style={{ width: `${percent}%` }}
                />
            </div>

            {/* Current Step */}
            {currentStep && isActive && (
                <div className="p-3 border-b border-border bg-primary/5">
                    <div className="flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-primary" />
                        <span className="text-sm font-medium">
                            Step {currentStep.step + 1}/{currentStep.total}
                        </span>
                        <span className="text-xs text-muted-foreground">
                            {currentStep.action}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                        <Bot className="h-3 w-3" />
                        {currentStep.agent}
                    </div>
                </div>
            )}

            {/* LLM Output Stream */}
            {llmBuffer && isActive && (
                <div className="border-b border-border">
                    <div className="px-3 py-1.5 bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        AI Generating...
                    </div>
                    <ScrollArea className="max-h-[150px]">
                        <pre className="p-3 text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all">
                            {llmBuffer}
                            <span className="animate-pulse">|</span>
                        </pre>
                    </ScrollArea>
                </div>
            )}

            {/* Completed Steps */}
            {completedSteps.length > 0 && (
                <div className="p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        Completed Steps
                    </div>
                    <div className="space-y-1">
                        {completedSteps.map((step, idx) => (
                            <CompletedStepRow key={idx} step={step} />
                        ))}
                    </div>
                </div>
            )}

            {/* Error */}
            {isError && errorMessage && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 border-t border-red-200 dark:border-red-800">
                    <p className="text-xs text-red-600 dark:text-red-400 font-mono">
                        {errorMessage}
                    </p>
                </div>
            )}
        </div>
    );
}

function CompletedStepRow({ step }: { step: StepInfo & { duration: number } }) {
    return (
        <div className="flex items-center gap-2 text-xs">
            <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
            <span className="font-medium truncate flex-1">{step.action}</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 shrink-0">
                {step.agent}
            </Badge>
            <span className="text-muted-foreground shrink-0 flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {formatDuration(step.duration)}
            </span>
        </div>
    );
}
