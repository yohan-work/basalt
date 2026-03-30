'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { StreamEvent } from '@/lib/stream-emitter';
import type { EventStreamState } from '@/lib/hooks/useEventStream';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sparkles, Square } from 'lucide-react';

function formatEventLine(e: StreamEvent): string | null {
    switch (e.type) {
        case 'phase_start':
            return `[phase] ${e.phase}`;
        case 'step_start':
            return `[step ${e.step + 1}/${e.total}] ${e.agent} · ${e.action}`;
        case 'step_complete':
            return `[step 완료] ${e.duration}ms`;
        case 'skill_execute':
            return `[실행] ${e.skill}`;
        case 'skill_result':
            return `[결과] ${e.skill}: ${(e.summary || '').slice(0, 140)}`;
        case 'progress':
            return `[진행] ${e.percent}%`;
        case 'error':
            return `[오류] ${e.message}`;
        case 'done':
            return `[완료] ${e.status}`;
        default:
            return null;
    }
}

type TaskLike = {
    id: string;
    title: string;
    metadata?: {
        ralphSession?: { currentRound?: number; maxRounds?: number; outcome?: string };
        [key: string]: unknown;
    };
};

type RalphStream = EventStreamState & {
    streamAction: string | null;
    streamTaskId: string | null;
    clearStreamSession: () => void;
    stop: () => void;
};

export interface RalphModeDialogProps {
    stream: RalphStream;
    task: TaskLike | null;
    tasks: TaskLike[];
}

/**
 * Ralph 이벤트 전용 오버레이: 루프 영상 + 하단 요약 로그.
 */
export function RalphModeDialog({ stream, task, tasks }: RalphModeDialogProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [videoLoadError, setVideoLoadError] = useState(false);
    const open = stream.streamAction === 'ralph' && stream.status !== 'idle';

    const resolvedTask = useMemo(() => {
        if (task && stream.streamTaskId && task.id === stream.streamTaskId) return task;
        if (stream.streamTaskId) {
            return tasks.find((t) => t.id === stream.streamTaskId) ?? null;
        }
        return null;
    }, [task, tasks, stream.streamTaskId]);

    const ralphMeta = resolvedTask?.metadata?.ralphSession;

    useEffect(() => {
        if (!open) {
            setVideoLoadError(false);
            return;
        }
        if (!videoRef.current) return;
        const v = videoRef.current;
        v.muted = true;
        v.playsInline = true;
        v.loop = true;
        const p = v.play();
        if (p !== undefined) {
            p.catch(() => {
                /* autoplay 정책 — 사용자가 이미 버튼으로 연 경우 대부분 성공 */
            });
        }
    }, [open]);

    const logLines = useMemo(() => {
        const lines: string[] = [];
        for (const ev of stream.events) {
            const line = formatEventLine(ev);
            if (line) lines.push(line);
        }
        if (stream.errorMessage) {
            lines.push(`[스트림] ${stream.errorMessage}`);
        }
        return lines.slice(-80);
    }, [stream.events, stream.errorMessage]);

    if (!open) return null;

    const busy = stream.status === 'connecting' || stream.status === 'streaming';
    const doneLabel =
        stream.status === 'done'
            ? stream.doneStatus || 'done'
            : stream.status === 'error'
              ? 'error'
              : null;

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ralph-dialog-title"
        >
            <div
                className="absolute inset-0 bg-black/75 backdrop-blur-[2px]"
                aria-hidden
            />
            <div className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-violet-500/30 bg-background shadow-2xl">
                <div className="border-b border-border bg-gradient-to-r from-violet-600/15 to-transparent px-4 py-3">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 shrink-0 text-violet-500" aria-hidden />
                        <div>
                            <h2 id="ralph-dialog-title" className="text-sm font-semibold">
                                Ralph 이벤트 실행 중
                            </h2>
                            <p className="text-[11px] text-muted-foreground truncate">
                                {resolvedTask?.title ?? '태스크'}
                                {ralphMeta?.currentRound != null && ralphMeta?.maxRounds != null
                                    ? ` · 라운드 ${ralphMeta.currentRound}/${ralphMeta.maxRounds}`
                                    : null}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="relative aspect-video w-full bg-black/90">
                    <video
                        ref={videoRef}
                        className="h-full w-full object-contain"
                        src="/ralph.mp4"
                        muted
                        playsInline
                        loop
                        autoPlay
                        preload="auto"
                        onError={() => setVideoLoadError(true)}
                    />
                    {videoLoadError && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-[11px] text-muted-foreground">
                            <code className="text-muted-foreground">public/ralph.mp4</code>를 찾을 수 없습니다.
                        </div>
                    )}
                    {busy && (
                        <div className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
                            <span className="rounded-full bg-black/55 px-3 py-1 text-[10px] font-medium text-white/95">
                                작업 중…
                            </span>
                        </div>
                    )}
                </div>

                <div className="space-y-2 border-t border-border bg-muted/30 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[10px] text-muted-foreground">
                            {busy
                                ? '플랜 → 실행 → 검증 루프가 돌고 있습니다.'
                                : doneLabel
                                  ? `상태: ${doneLabel}`
                                  : '종료됨'}
                        </p>
                        <div className="flex gap-1">
                            {busy && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[10px]"
                                    onClick={() => stream.stop()}
                                >
                                    <Square className="mr-1 h-3 w-3" />
                                    중단
                                </Button>
                            )}
                            <Button
                                type="button"
                                size="sm"
                                className="h-7 text-[10px]"
                                variant="secondary"
                                onClick={() => stream.clearStreamSession()}
                            >
                                닫기
                            </Button>
                        </div>
                    </div>
                    <ScrollArea className="h-[88px] rounded-md border border-border/60 bg-background/80">
                        <pre className="whitespace-pre-wrap break-all p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
                            {logLines.length > 0 ? logLines.join('\n') : '이벤트 대기 중…'}
                        </pre>
                    </ScrollArea>
                </div>
            </div>
        </div>
    );
}
