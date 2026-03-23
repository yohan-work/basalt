import { NextRequest, NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase';
import { generateText } from '@/lib/llm';
import { MODEL_CONFIG } from '@/lib/model-config';

export const maxDuration = 120;

const META_MAX = 14_000;

function truncateJson(obj: unknown): string {
    const s = JSON.stringify(obj, null, 0);
    if (s.length <= META_MAX) return s;
    return `${s.slice(0, META_MAX)}\n...[truncated]`;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const taskId = body?.taskId as string | undefined;
        const userNote = typeof body?.note === 'string' ? body.note.trim() : '';

        if (!taskId) {
            return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        }

        const { data: task, error } = await supabase.from('Tasks').select('*').eq('id', taskId).single();
        if (error || !task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
        const metaPick = {
            lastError: (meta as { lastError?: string }).lastError,
            failedStep: (meta as { failedStep?: number }).failedStep,
            failedAction: (meta as { failedAction?: string }).failedAction,
            qaPageCheck: (meta as { qaPageCheck?: unknown }).qaPageCheck,
            devQaNextBuild: (meta as { devQaNextBuild?: unknown }).devQaNextBuild,
            executionRepairs: (meta as { executionRepairs?: unknown }).executionRepairs,
            qaSignoff: (meta as { qaSignoff?: unknown }).qaSignoff,
            verification: (meta as { verification?: unknown }).verification,
            progress: (meta as { progress?: unknown }).progress,
        };

        const system = `당신은 시니어 개발자입니다. Basalt AI 에이전트 워크플로에서 태스크가 실패했거나 QA/검증에 걸렸을 때, 사용자가 다음 시도에 쓸 수 있는 한국어 가이드를 작성합니다.

반드시 다음 Markdown 섹션을 포함하세요:
## 원인 가설 (2~3개)
- 짧은 불릿

## 다음에 시도할 프롬프트 초안
- 태스크 설명에 붙여넣기 좋은 한 문단(구체적 지시)

## 확인 체크리스트
- [ ] 형식의 실행 가능한 항목 4~7개

추측은 명시하고, 확실하지 않은 것은 "확인 필요"라고 적으세요.`;

        const user = `태스크 제목: ${task.title || ''}
상태: ${task.status}
설명:
${task.description || '(없음)'}

사용자 추가 메모: ${userNote || '(없음)'}

metadata (발췌):
${truncateJson(metaPick)}`;

        const markdown = await generateText(system, user, MODEL_CONFIG.SMART_MODEL);

        return NextResponse.json({ markdown });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error('recovery-suggestions:', e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
