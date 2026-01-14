
import { NextRequest, NextResponse } from 'next/server';
import { Orchestrator } from '@/lib/agents/Orchestrator';
import { v4 as uuidv4 } from 'uuid'; // we might need uuid if not available, falling back to random string

// Simple UUID generator if uuid package is not installed
function generateId() {
    return Math.random().toString(36).substring(2, 15);
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { task } = body;

        if (!task) {
            return NextResponse.json({ error: 'Task description is required' }, { status: 400 });
        }

        // Generate a task ID (in a real app, this would be created in DB first)
        const taskId = generateId();

        // Instantiate Orchestrator
        const orchestrator = new Orchestrator(taskId);

        // Run the agent (Note: In a serverless env, long running tasks might time out. 
        // Ideally this should be a background job, but for demo we await it or start it floaty)

        // For demonstration, we await it to see the logs in the server console immediately
        await orchestrator.run(task);

        return NextResponse.json({
            success: true,
            taskId,
            message: 'Agent finished execution. Check server logs or database.'
        });

    } catch (error: any) {
        console.error('Agent Execution Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
