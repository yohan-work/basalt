import { NextRequest, NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase';
import { generateText } from '@/lib/llm';
import { MODEL_CONFIG } from '@/lib/model-config';

export const maxDuration = 120;

const DISC_MAX = 12_000;

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

        const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
        const discussions = Array.isArray((meta as { executionDiscussions?: unknown }).executionDiscussions)
            ? (meta as { executionDiscussions: unknown[] }).executionDiscussions
            : [];
        const collab = (meta as { agentCollaboration?: unknown }).agentCollaboration;
        const workflow = (meta as { workflow?: { steps?: unknown[] } }).workflow;
        const fileChanges = (meta as { fileChanges?: unknown[] }).fileChanges;

        let discText = JSON.stringify(discussions, null, 0);
        if (discText.length > DISC_MAX) discText = `${discText.slice(0, DISC_MAX)}...[truncated]`;

        const system = `당신은 기술 PM입니다. 에이전트 실행 기록을 바탕으로 팀 인수인계용 한국어 요약을 작성합니다.

다음 Markdown 구조를 따르세요:
## 한 줄 요약
## 핵심 결정·합의
## 변경된 파일 (경로 위주)
## 남은 리스크 / 열린 질문
## 다음 담당자 액션

추측은 "추정"이라고 표시하세요.`;

        const user = `제목: ${task.title || ''}
상태: ${task.status}
요청 설명:
${task.description || '(없음)'}

워크플로 단계 요약:
${JSON.stringify(workflow?.steps || [], null, 0).slice(0, 4000)}

파일 변경 요약:
${JSON.stringify(fileChanges || [], null, 0).slice(0, 4000)}

에이전트 협업 메트릭(발췌):
${JSON.stringify(collab || {}, null, 0).slice(0, 4000)}

실행 토론 로그:
${discText}`;

        const markdown = await generateText(system, user, MODEL_CONFIG.SMART_MODEL);

        return NextResponse.json({ markdown });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        console.error('handoff-summary:', e);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
