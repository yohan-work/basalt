
'use client';

import { useEffect, useState } from 'react';
import { getTeamState } from '@/lib/analytics';
import { TeamState } from '@/lib/team-types';
import { ChatChannel } from './ChatChannel';
import { KanbanBoard } from './KanbanBoard';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CollaborationMatrix } from './CollaborationMatrix';

export function TeamActivityView() {
    const [teamState, setTeamState] = useState<TeamState | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchState = async () => {
        try {
            const data = await getTeamState(); // Fetches latest active task's team state
            if (data) {
                setTeamState(data);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchState();
        // Poll every 3 seconds for near real-time updates during simulation
        const interval = setInterval(fetchState, 3000);
        return () => clearInterval(interval);
    }, []);

    if (loading && !teamState) {
        return (
            <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin mr-2" />
                Loading Team State...
            </div>
        );
    }

    if (!teamState) {
        return (
            <Card className="p-8 text-center text-muted-foreground border-dashed">
                No active Agent Team sessions found. Run a simulation to see activity here.
            </Card>
        );
    }

    const roundSummaries = Array.isArray(teamState.metadata?.roundSummaries)
        ? (teamState.metadata.roundSummaries as Array<{
            round: number;
            createdAt: number;
            thoughts: Array<{ agent: string; thought: string }>;
        }>)
        : [];
    const collaboration = (teamState.metadata?.collaboration || undefined) as
        | Record<string, Record<string, number>>
        | undefined;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[560px]">
            {/* Left: Chat */}
            <div className="h-full min-h-0">
                <ChatChannel messages={teamState.messages} />
            </div>

            {/* Right: Board + Summaries + Collaboration */}
            <div className="h-full min-h-0">
                <Tabs defaultValue="board" className="h-full flex flex-col">
                    <TabsList className="grid grid-cols-3 w-full">
                        <TabsTrigger value="board">Board</TabsTrigger>
                        <TabsTrigger value="rounds">Rounds</TabsTrigger>
                        <TabsTrigger value="collaboration">Collaboration</TabsTrigger>
                    </TabsList>
                    <TabsContent value="board" className="flex-1 min-h-0 mt-3">
                        <KanbanBoard board={teamState.board} />
                    </TabsContent>
                    <TabsContent value="rounds" className="flex-1 min-h-0 mt-3">
                        <Card className="h-full overflow-y-auto p-4 space-y-3">
                            {roundSummaries.length === 0 && (
                                <div className="text-sm text-muted-foreground">
                                    아직 저장된 round summary가 없습니다.
                                </div>
                            )}
                            {roundSummaries
                                .slice()
                                .reverse()
                                .map((round) => (
                                    <div key={`${round.round}-${round.createdAt}`} className="rounded-md border p-3 space-y-2">
                                        <div className="text-xs text-muted-foreground">
                                            Round {round.round} · {new Date(round.createdAt).toLocaleString()}
                                        </div>
                                        <div className="space-y-1.5">
                                            {round.thoughts.map((thought, idx) => (
                                                <div key={`${round.round}-${idx}`} className="text-sm">
                                                    <span className="font-semibold">{thought.agent}</span>: {thought.thought}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                        </Card>
                    </TabsContent>
                    <TabsContent value="collaboration" className="flex-1 min-h-0 mt-3">
                        <CollaborationMatrix
                            title="Team Collaboration Matrix"
                            collaboration={collaboration}
                            emptyMessage="팀 협업 관계 데이터가 아직 없습니다."
                        />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
