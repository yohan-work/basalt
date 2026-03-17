
import { NextRequest, NextResponse } from 'next/server';
import { Orchestrator } from '@/lib/agents/Orchestrator';

type ExecuteOptions = {
    discussionMode?: 'off' | 'step_handoff' | 'roundtable';
    maxDiscussionThoughts?: number;
    carryDiscussionToPrompt?: boolean;
};

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { taskId, options } = body as { taskId?: string; options?: ExecuteOptions };

        if (!taskId) {
            return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        }

        const orchestrator = new Orchestrator(taskId);
        await orchestrator.execute(undefined, options);

        return NextResponse.json({ success: true, message: 'Execution started' });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Execute Error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
