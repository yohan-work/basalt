import { NextRequest, NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase';
import { generateText } from '@/lib/llm';
import { MODEL_CONFIG } from '@/lib/model-config';
import { ProjectProfiler } from '@/lib/profiler';

export const maxDuration = 120;

/** Route 등록·포트·프로젝트 루트 진단용. 본 기능은 POST만 사용. */
export async function GET() {
    return NextResponse.json({
        ok: true,
        service: 'spec-expand',
        usage: 'POST with JSON body { taskId } (pending/planning tasks only)',
    });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const taskId = body?.taskId as string | undefined;

        if (!taskId) {
            return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        }

        const { data: task, error } = await supabase.from('Tasks').select('*').eq('id', taskId).single();
        if (error || !task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        if (!['pending', 'planning'].includes(task.status)) {
            return NextResponse.json(
                { error: '스펙 확장은 pending 또는 planning 상태에서만 사용할 수 있습니다.' },
                { status: 409 }
            );
        }

        let stackSummary = '';
        if (task.project_id) {
            const { data: project } = await supabase.from('Projects').select('path').eq('id', task.project_id).single();
            if (project?.path) {
                try {
                    const profiler = new ProjectProfiler(project.path);
                    stackSummary = await profiler.getStackSummary();
                    if (stackSummary.length > 12_000) stackSummary = `${stackSummary.slice(0, 12_000)}\n...[truncated]`;
                } catch {
                    stackSummary = '';
                }
            }
        }

        const system = `당신은 시니어 프로덕트 오너이자 QA입니다. 짧은 태스크 설명을 개발 에이전트가 실수 없이 구현할 수 있도록 한국어 Markdown으로 확장합니다.

포함할 섹션:
## 수용 기준 (Acceptance Criteria)
## 엣지 케이스 / 예외
## 수동 스모크 시나리오 (단계별)
## 금지 사항 (하지 말 것)
## 가정

기술 스택 제약이 주어지면 설치되지 않은 패키지를 요구하지 마세요.`;

        const user = `제목: ${task.title || ''}

설명:
${task.description || '(없음)'}

프로젝트 스택 요약:
${stackSummary || '(프로젝트 없음 또는 조회 실패)'}`;

        const markdown = await generateText(system, user, MODEL_CONFIG.SMART_MODEL);
        const generatedAt = new Date().toISOString();

        const prevMeta = (task.metadata && typeof task.metadata === 'object' ? task.metadata : {}) as Record<
            string,
            unknown
        >;
        const metadata = {
            ...prevMeta,
            specExpansion: { markdown, generatedAt },
        };

        const { error: upErr } = await supabase.from('Tasks').update({ metadata }).eq('id', taskId);
        if (upErr) {
            return NextResponse.json({ error: upErr.message }, { status: 500 });
        }

        return NextResponse.json({ markdown, generatedAt });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error('spec-expand:', e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
