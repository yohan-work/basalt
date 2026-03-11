
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { taskId } = body;

        if (!taskId) {
            return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        }

        // 태스크 존재 및 review 상태 확인
        const { data: task, error: fetchError } = await supabase
            .from('Tasks')
            .select('id, status')
            .eq('id', taskId)
            .single();

        if (fetchError || !task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        if (task.status !== 'review') {
            return NextResponse.json(
                { error: `Task is in '${task.status}' status, not 'review'` },
                { status: 400 }
            );
        }

        // 상태를 done으로 업데이트
        const { error: updateError } = await supabase
            .from('Tasks')
            .update({ status: 'done' })
            .eq('id', taskId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Task approved and marked as done' });
    } catch (error: any) {
        console.error('Approve Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
