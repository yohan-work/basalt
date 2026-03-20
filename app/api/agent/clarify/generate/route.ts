import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCodebaseSnippetForTask } from '@/lib/pre-execution/task-context';
import { generateClarifyingQuestionsJson, type ClarifyingGateState } from '@/lib/pre-execution/gates';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const taskId = body?.taskId as string | undefined;
        if (!taskId) {
            return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        }

        const { data: task, error: fetchError } = await supabase.from('Tasks').select('*').eq('id', taskId).single();
        if (fetchError || !task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        if (task.status !== 'pending') {
            return NextResponse.json(
                { error: '명확화 질문 생성은 pending(요청) 상태에서만 할 수 있습니다.' },
                { status: 409 }
            );
        }

        const title = task.title || 'Untitled';
        const description = task.description || '';
        const { snippet } = await getCodebaseSnippetForTask(taskId);

        const result = await generateClarifyingQuestionsJson({
            taskTitle: title,
            taskDescription: description,
            codebaseSnippet: snippet,
        });

        const gate: ClarifyingGateState = {
            version: 1,
            status: result.needMoreDetail && result.questions.length > 0 ? 'awaiting_answers' : 'empty',
            questions: result.questions,
            answers: {},
            generatedAt: new Date().toISOString(),
            note: result.note,
        };

        const metadata = { ...(task.metadata || {}), clarifyingGate: gate };
        const { error: updateError } = await supabase.from('Tasks').update({ metadata }).eq('id', taskId);
        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, clarifyingGate: gate });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
