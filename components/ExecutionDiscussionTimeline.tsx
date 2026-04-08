'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getBuddyDefinition, getBuddyReaction } from '@/lib/buddy-catalog';
import type { ExecutionDiscussionEntry, TaskBuddyInstance } from '@/lib/types/agent-visualization';
import { BuddyAscii } from './BuddyAscii';

interface ExecutionDiscussionTimelineProps {
    entries: ExecutionDiscussionEntry[];
    carryDiscussionToPrompt: boolean;
    buddy?: TaskBuddyInstance | null;
}

export function ExecutionDiscussionTimeline({
    entries,
    carryDiscussionToPrompt,
    buddy = null,
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
            {entries.map((entry, index) => {
                const buddyId = entry.buddyId || buddy?.buddyId;
                const dominantThought =
                    entry.thoughts.find((thought) => thought.type === 'critique')
                    || entry.thoughts.find((thought) => thought.type === 'agreement')
                    || entry.thoughts[0];
                const reaction = getBuddyReaction(buddyId, {
                    thoughtType: dominantThought?.type,
                    isHighlighted: dominantThought?.type === 'critique',
                    isWarning: dominantThought?.type === 'critique',
                    isComplete: dominantThought?.type === 'agreement' && index === entries.length - 1,
                });

                return (
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
                                {entry.buddyId || buddy?.buddyId ? (
                                    <Badge variant="outline" className="text-[10px]">
                                        Buddy: {buddy?.name || getBuddyDefinition(entry.buddyId || buddy?.buddyId).name}
                                    </Badge>
                                ) : null}
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
                        {buddyId ? (
                            <div className="flex items-start gap-3 rounded-md border bg-slate-950/95 p-3 text-slate-100">
                                <BuddyAscii
                                    buddyId={buddyId}
                                    thoughtType={dominantThought?.type}
                                    isHighlighted={dominantThought?.type === 'critique'}
                                    isWarning={dominantThought?.type === 'critique'}
                                    isComplete={dominantThought?.type === 'agreement' && index === entries.length - 1}
                                    compact
                                    active={false}
                                    className="min-w-[120px] border-slate-700 shadow-none"
                                />
                                <div className="pt-1 text-xs">
                                    <div className="mb-1 font-semibold text-slate-100">
                                        {buddy?.name || getBuddyDefinition(buddyId).name} reaction
                                    </div>
                                    <div className="text-slate-300">{reaction.comment}</div>
                                </div>
                            </div>
                        ) : null}
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
            )})}
        </div>
    );
}
