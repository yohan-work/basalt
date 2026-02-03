'use client';

import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, Circle, XCircle } from 'lucide-react';

interface ProgressInfo {
    currentStep: number;
    totalSteps: number;
    currentAction: string;
    currentAgent: string;
    completedSteps: string[];
    startedAt?: string;
    stepStatus: 'pending' | 'running' | 'completed' | 'failed';
}

interface StepProgressProps {
    progress?: ProgressInfo;
    workflow?: { steps: Array<{ agent: string; action: string }> };
    compact?: boolean; // 칸반 카드용 간소화 버전
}

export function StepProgress({ progress, workflow, compact = false }: StepProgressProps) {
    if (!progress || !progress.totalSteps) {
        return null;
    }

    const percentage = Math.round(
        ((progress.completedSteps?.length || 0) / progress.totalSteps) * 100
    );

    // 간소화 버전 (칸반 카드용)
    if (compact) {
        return (
            <div className="space-y-1.5">
                {/* Progress Bar */}
                <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-500 ease-out"
                        style={{ width: `${percentage}%` }}
                    />
                </div>

                {/* Current Step Info */}
                <div className="flex items-center justify-between text-[10px]">
                    <span className="text-muted-foreground">
                        Step {(progress.completedSteps?.length || 0) + 1}/{progress.totalSteps}
                    </span>
                    {progress.stepStatus === 'running' && (
                        <div className="flex items-center gap-1 text-primary">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span className="truncate max-w-[100px]">{progress.currentAction}</span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // 상세 버전 (TaskDetailsModal용)
    const steps = workflow?.steps || [];

    return (
        <div className="space-y-4">
            {/* Overall Progress */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">진행률</span>
                    <span className="text-muted-foreground">{percentage}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-500 ease-out"
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            </div>

            {/* Step List */}
            {steps.length > 0 && (
                <div className="space-y-2">
                    <span className="text-sm font-medium">워크플로우 단계</span>
                    <div className="space-y-1">
                        {steps.map((step, index) => {
                            const isCompleted = progress.completedSteps?.includes(step.action);
                            const isCurrent = progress.currentStep === index && progress.stepStatus === 'running';
                            const isFailed = progress.currentStep === index && progress.stepStatus === 'failed';
                            const isPending = !isCompleted && !isCurrent && !isFailed;

                            return (
                                <div
                                    key={index}
                                    className={`flex items-center gap-2 p-2 rounded text-xs transition-colors ${isCurrent ? 'bg-primary/10 border border-primary/30' :
                                            isFailed ? 'bg-destructive/10 border border-destructive/30' :
                                                isCompleted ? 'bg-muted/50' : ''
                                        }`}
                                >
                                    {/* Status Icon */}
                                    {isCompleted && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                                    {isCurrent && <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />}
                                    {isFailed && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                                    {isPending && <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}

                                    {/* Step Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="text-[10px] px-1 py-0">
                                                {step.agent}
                                            </Badge>
                                            <span className={`truncate ${isCurrent ? 'text-primary font-medium' :
                                                    isCompleted ? 'text-muted-foreground' :
                                                        isFailed ? 'text-destructive' : ''
                                                }`}>
                                                {step.action}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Step Number */}
                                    <span className="text-muted-foreground text-[10px]">
                                        #{index + 1}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Current Action Highlight */}
            {progress.stepStatus === 'running' && progress.currentAction && (
                <div className="flex items-center gap-2 p-2 bg-primary/5 border border-primary/20 rounded text-sm">
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    <span className="text-primary">
                        <strong>{progress.currentAgent}</strong>: {progress.currentAction} 실행 중...
                    </span>
                </div>
            )}
        </div>
    );
}
