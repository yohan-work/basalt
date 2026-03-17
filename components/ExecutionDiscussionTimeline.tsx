'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ExecutionDiscussionEntry } from '@/lib/types/agent-visualization';

interface ExecutionDiscussionTimelineProps {
    entries: ExecutionDiscussionEntry[];
    carryDiscussionToPrompt: boolean;
}

export function ExecutionDiscussionTimeline({
    entries,
    carryDiscussionToPrompt,
}: ExecutionDiscussionTimelineProps) {
    if (!entries.length) {
        return (
            <Card className="border-dashed">
                <CardContent className="py-6 text-sm text-muted-foreground">
                    아직 저장된 step 토론 기록이 없습니다.
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-3">
            {entries.map((entry, index) => (
                <Card key={`${entry.step}-${entry.createdAt}-${index}`}>
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2">
                            <CardTitle className="text-sm">
                                Step {entry.step + 1} · {entry.action}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-[10px]">
                                    {entry.participants.length} participants
                                </Badge>
                                <Badge
                                    variant={carryDiscussionToPrompt ? 'default' : 'outline'}
                                    className="text-[10px]"
                                >
                                    {carryDiscussionToPrompt ? 'Prompt 반영' : '참고 전용'}
                                </Badge>
                            </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {new Date(entry.createdAt).toLocaleString()}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <div className="flex flex-wrap gap-1">
                            {entry.participants.map((participant) => (
                                <Badge key={participant} variant="outline" className="text-[10px]">
                                    {participant}
                                </Badge>
                            ))}
                        </div>
                        <div className="space-y-1.5">
                            {entry.thoughts.map((thought, thoughtIndex) => (
                                <div
                                    key={`${thought.agent}-${thoughtIndex}`}
                                    className="rounded-md border bg-muted/30 p-2 text-xs"
                                >
                                    <div className="mb-1 flex items-center gap-2">
                                        <span className="font-semibold">{thought.agent}</span>
                                        <Badge variant="secondary" className="text-[10px]">
                                            {thought.type || 'idea'}
                                        </Badge>
                                    </div>
                                    <p className="whitespace-pre-wrap text-foreground/90">{thought.thought}</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
