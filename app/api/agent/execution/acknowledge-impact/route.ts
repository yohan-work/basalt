import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * 플랜 완료 후 표시된 영향 범위 미리보기를 사용자가 확인했음을 기록합니다. 이후 execute가 허용됩니다.
 */
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

        if (task.status !== 'planning') {
            return NextResponse.json(
                { error: '영향 범위 확인은 planning(플랜 완료) 상태에서만 할 수 있습니다.' },
                { status: 409 }
            );
        }

        const meta = task.metadata || {};
        const wf = meta.workflow as { steps?: unknown[] } | undefined;
        if (!wf?.steps || !Array.isArray(wf.steps) || wf.steps.length === 0) {
            return NextResponse.json({ error: '워크플로가 없습니다. 먼저 플랜을 생성하세요.' }, { status: 409 });
        }

        const preflight = meta.executionPreflight as { requiresImpactAck?: boolean } | undefined;
        if (!preflight?.requiresImpactAck) {
            return NextResponse.json({ success: true, message: '이 태스크는 별도 확인이 필요 없습니다.' });
        }

        const now = new Date().toISOString();
        const executionPreflight = {
            ...(typeof preflight === 'object' && preflight ? preflight : {}),
            requiresImpactAck: true,
            impactAcknowledgedAt: now,
        };

        const metadata = { ...meta, executionPreflight };
        const { error: updateError } = await supabase.from('Tasks').update({ metadata }).eq('id', taskId);
        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, executionPreflight });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
