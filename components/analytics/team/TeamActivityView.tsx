
import { useEffect, useState } from 'react';
import { getTeamState } from '@/lib/analytics';
import { TeamState } from '@/lib/team-types';
import { ChatChannel } from './ChatChannel';
import { KanbanBoard } from './KanbanBoard';
import { Card } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

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

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[500px]">
            {/* Left: Chat */}
            <div className="h-full min-h-0">
                <ChatChannel messages={teamState.messages} />
            </div>

            {/* Right: Board */}
            <div className="h-full min-h-0">
                <KanbanBoard board={teamState.board} />
            </div>
        </div>
    );
}
