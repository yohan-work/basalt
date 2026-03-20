import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import type { ClarifyingGateState } from '@/lib/pre-execution/gates';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const taskId = body?.taskId as string | undefined;
        const answers = body?.answers as Record<string, string> | undefined;
        const skipped = Boolean(body?.skipped);

        if (!taskId) {
            return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        }

        const { data: task, error: fetchError } = await supabase.from('Tasks').select('*').eq('id', taskId).single();
        if (fetchError || !task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        if (task.status !== 'pending') {
            return NextResponse.json(
                { error: '답변 제출은 pending(요청) 상태에서만 할 수 있습니다.' },
                { status: 409 }
            );
        }

        const prev = (task.metadata?.clarifyingGate || {}) as Partial<ClarifyingGateState>;
        const questions = Array.isArray(prev.questions) ? prev.questions : [];

        let gate: ClarifyingGateState;

        if (skipped) {
            gate = {
                version: 1,
                status: 'skipped',
                questions: [],
                answers: {},
                submittedAt: new Date().toISOString(),
            };
        } else {
            const mergedAnswers: Record<string, string> = {};
            for (const q of questions) {
                const raw = answers && typeof answers[q.id] === 'string' ? answers[q.id].trim() : '';
                mergedAnswers[q.id] = raw;
            }

            gate = {
                version: 1,
                status: 'answered',
                questions,
                answers: mergedAnswers,
                generatedAt: prev.generatedAt,
                submittedAt: new Date().toISOString(),
                note: prev.note,
            };
        }

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
