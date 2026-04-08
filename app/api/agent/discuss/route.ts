
import { NextRequest, NextResponse } from 'next/server';
import { buildBuddyPromptContext, getBuddyDefinition, resolveTaskBuddySelection } from '@/lib/buddy-catalog';
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
import { AgentLoader } from '@/lib/agent-loader';
import { ProjectProfiler } from '@/lib/profiler';

export async function POST(req: NextRequest) {
    try {
        const { taskId, message } = await req.json();

        if (!taskId || !message) {
            return NextResponse.json({ error: 'Missing taskId or message' }, { status: 400 });
        }

        // 1. Fetch task and buddy context
        const { data: task } = await supabase.from('Tasks').select('*').eq('id', taskId).single();
        if (!task) throw new Error('Task not found');
        const buddy = resolveTaskBuddySelection(task.metadata?.buddy);

        // 2. Log the user's message
        await supabase.from('Execution_Logs').insert({
            task_id: taskId,
            agent_role: 'user',
            message: message,
            metadata: { type: 'THOUGHT', thought_type: 'idea', buddyId: buddy?.buddyId },
            created_at: new Date().toISOString()
        });

        const { data: logs } = await supabase
            .from('Execution_Logs')
            .select('*')
            .eq('task_id', taskId)
            .order('created_at', { ascending: true });

        const pastThoughts = logs?.filter(l => l.metadata?.type === 'THOUGHT') || [];

        // 3. Prepare agents and codebase context
        const availableAgents = AgentLoader.listAgents();
        let codebaseContext = '';
        if (task.project_id) {
            const { data: project } = await supabase.from('Projects').select('path').eq('id', task.project_id).single();
            if (project?.path) {
                const profiler = new ProjectProfiler(project.path);
                codebaseContext = await profiler.getContextString();
            }
        }

        const analysis = task.metadata?.analysis || { required_agents: ['software-engineer'], summary: 'Discussion context' };

        // 4. Generate AI response (consult_agents)
        const newThoughts = await skills.consult_agents(
            analysis,
            availableAgents,
            [codebaseContext, buildBuddyPromptContext(buddy)].filter(Boolean).join('\n\n'),
            null,
            pastThoughts,
            { extraHintText: typeof message === 'string' ? message : '', buddy }
        );

        // 5. Save AI responses
        for (const item of newThoughts) {
            if (!item.agent || !item.thought) continue;
            await supabase.from('Execution_Logs').insert({
                task_id: taskId,
                agent_role: item.agent,
                message: item.thought,
                metadata: {
                    type: 'THOUGHT',
                    thought_type: item.type || 'idea',
                    buddyId: buddy?.buddyId,
                    buddyInstanceId: buddy?.instanceId,
                    buddyName: buddy ? (buddy.name || getBuddyDefinition(buddy.buddyId).name) : undefined,
                },
                created_at: new Date().toISOString()
            });
        }

        return NextResponse.json({ success: true, thoughts: newThoughts });
    } catch (error: any) {
        console.error('[Discuss API] Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
