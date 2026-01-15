
import { NextRequest, NextResponse } from 'next/server';
import { Orchestrator } from '@/lib/agents/Orchestrator';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { taskId } = body;

        if (!taskId) {
            return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        }

        const orchestrator = new Orchestrator(taskId);
        await orchestrator.verify();

        return NextResponse.json({ success: true, message: 'Verification started' });
    } catch (error: any) {
        console.error('Verify Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
