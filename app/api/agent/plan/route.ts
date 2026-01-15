
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { Orchestrator } from '@/lib/agents/Orchestrator';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { taskId } = body;

        if (!taskId) {
            return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        }

        // Fetch the task to get the latest description
        const { data: task, error: taskError } = await supabase
            .from('Tasks')
            .select('*')
            .eq('id', taskId)
            .single();

        if (taskError || !task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        const orchestrator = new Orchestrator(taskId);

        // Trigger planning with the task description
        // Use a default description if somehow missing
        const description = task.description || task.title || 'No description provided';
        await orchestrator.plan(description);

        return NextResponse.json({ success: true, message: 'Planning completed' });
    } catch (error: any) {
        console.error('Plan Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
