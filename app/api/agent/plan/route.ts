
import { NextRequest, NextResponse } from 'next/server';
import { Orchestrator } from '@/lib/agents/Orchestrator';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { taskId, description } = body;

        if (!taskId || !description) {
            return NextResponse.json({ error: 'taskId and description required' }, { status: 400 });
        }

        const orchestrator = new Orchestrator(taskId);
        await orchestrator.plan(description);

        return NextResponse.json({ success: true, message: 'Plan created' });
    } catch (error: any) {
        console.error('Plan Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
