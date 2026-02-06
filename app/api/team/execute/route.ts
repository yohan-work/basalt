
import { NextRequest, NextResponse } from 'next/server';
import { TeamOrchestrator } from '@/lib/agents/TeamOrchestrator';

// Set max duration for Vercel/Next.js (optional, depends on hosting)
export const maxDuration = 300;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { taskId, maxRounds = 10 } = body;

        if (!taskId) {
            return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        }

        console.log(`Starting Team Orchestration for Task ${taskId} (Rounds: ${maxRounds})`);

        const orchestrator = new TeamOrchestrator(taskId);

        // Run the loop in background? Or await? 
        // For now, await it to see logs in response or until timeout. 
        // In production, this should always be backgrounded.
        await orchestrator.runTeamLoop(maxRounds);

        return NextResponse.json({
            success: true,
            message: 'Team execution cycle completed',
            taskId
        });
    } catch (error: any) {
        console.error('Team Execute Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
