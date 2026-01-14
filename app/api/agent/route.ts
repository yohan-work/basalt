
import { NextRequest, NextResponse } from 'next/server';
import { Orchestrator } from '@/lib/agents/Orchestrator';

export async function POST(req: NextRequest) {
    try {
        const { taskId, description } = await req.json();

        if (!taskId || !description) {
            return NextResponse.json({ error: 'Missing taskId or description' }, { status: 400 });
        }

        // Start Orchestrator (Fire and forget, or await?)
        // For Vercel serverless, we should await or use background jobs.
        // Here we await for simplicity of demo, but technically it might timeout.
        // In a real agent system, this would queue a job.

        const orchestrator = new Orchestrator(taskId);
        await orchestrator.run(description);

        return NextResponse.json({ success: true, message: 'Task processing completed' });
    } catch (error: any) {
        console.error('Agent Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
