import { generateJSON } from '@/lib/llm';
import { MODEL_CONFIG } from '@/lib/model-config';

export type ClarifyingQuestion = { id: string; prompt: string };

export type ClarifyingGateState = {
    version: 1;
    status: 'empty' | 'awaiting_answers' | 'answered' | 'skipped';
    questions: ClarifyingQuestion[];
    answers: Record<string, string>;
    generatedAt?: string;
    submittedAt?: string;
    note?: string;
};

export type ImpactPreview = {
    summary: string;
    likelyTouchedPaths: string[];
    riskLevel: 'low' | 'medium' | 'high';
    assumptions: string[];
    outOfScopeNote?: string;
    generatedAt: string;
    parseError?: boolean;
};

/** DB·병합용 (generatedAt은 Orchestrator에서 붙임) */
export type ImpactPreviewPayload = Omit<ImpactPreview, 'generatedAt'>;

export type ExecutionPreflight = {
    requiresImpactAck: boolean;
    impactAcknowledgedAt: string | null;
    impactPreviewGeneratedAt?: string;
};

/** 플랜 LLM에 붙일 사용자 Q&A 블록 */
export function formatClarificationForPlan(gate: unknown): string {
    if (!gate || typeof gate !== 'object') return '';
    const g = gate as Partial<ClarifyingGateState>;
    if (g.status !== 'answered' || !g.questions?.length) return '';
    const parts: string[] = ['\n\n[사용자 명확화 답변]'];
    for (const q of g.questions) {
        const a = (g.answers && g.answers[q.id])?.trim() || '(답변 없음)';
        parts.push(`- Q: ${q.prompt}\n  A: ${a}`);
    }
    return parts.join('\n');
}

const CLARIFY_SCHEMA = `{
  "needMoreDetail": boolean,
  "questions": [ { "id": "q1", "prompt": "한국어 질문, 구체적으로" } ],
  "note": "짧은 이유 (한국어)"
}
needMoreDetail가 false이면 questions는 빈 배열. 최대 4개 질문만.`;

const IMPACT_SCHEMA = `{
  "summary": "예상 변경 요약 (한국어 2~4문장)",
  "likelyTouchedPaths": ["app/...", "src/..."],
  "riskLevel": "low" | "medium" | "high",
  "assumptions": ["에이전트가 가정한 것"],
  "outOfScopeNote": "드리지 않을 것 (선택)"
}`;

export async function generateClarifyingQuestionsJson(params: {
    taskTitle: string;
    taskDescription: string;
    codebaseSnippet: string;
}): Promise<{ needMoreDetail: boolean; questions: ClarifyingQuestion[]; note: string }> {
    const system =
        'You help refine software task specs. Output valid JSON only. Questions must be in Korean, short, actionable.';
    const user = `제목: ${params.taskTitle}\n\n설명:\n${params.taskDescription}\n\n프로젝트 맥락(발췌):\n${params.codebaseSnippet || '(없음)'}\n\n애매한 요구사항이 있으면 needMoreDetail true와 질문 목록을 주세요. 이미 충분하면 needMoreDetail false.`;

    const raw = await generateJSON(system, user, CLARIFY_SCHEMA, MODEL_CONFIG.FAST_MODEL);
    const needMoreDetail = Boolean(raw.needMoreDetail);
    const questions: ClarifyingQuestion[] = Array.isArray(raw.questions)
        ? raw.questions
              .filter((q: unknown) => q && typeof q === 'object' && typeof (q as { id?: unknown }).id === 'string')
              .map((q: { id: string; prompt?: string }) => ({
                  id: String(q.id).slice(0, 64),
                  prompt: typeof q.prompt === 'string' ? q.prompt.slice(0, 500) : '',
              }))
              .filter((q: ClarifyingQuestion) => q.prompt.length > 0)
              .slice(0, 4)
        : [];
    const note = typeof raw.note === 'string' ? raw.note.slice(0, 500) : '';
    return { needMoreDetail, questions: needMoreDetail ? questions : [], note };
}

export async function generateImpactPreviewJson(params: {
    taskDescription: string;
    analysisSummary: string;
    workflowSteps: string;
    codebaseSnippet: string;
}): Promise<ImpactPreviewPayload> {
    const system =
        'You predict which parts of a codebase an AI coding agent will likely touch based on a planned workflow. JSON only. Korean text in summary/assumptions.';
    const user = `태스크:\n${params.taskDescription}\n\n분석 요약:\n${params.analysisSummary}\n\n워크플로 단계:\n${params.workflowSteps}\n\n코드베이스 맥락 발췌:\n${params.codebaseSnippet || '(없음)'}`;

    const raw = await generateJSON(system, user, IMPACT_SCHEMA, MODEL_CONFIG.SMART_MODEL);
    const summary = typeof raw.summary === 'string' ? raw.summary : '요약을 생성하지 못했습니다.';
    const likelyTouchedPaths = Array.isArray(raw.likelyTouchedPaths)
        ? raw.likelyTouchedPaths.filter((p: unknown) => typeof p === 'string').map((p: string) => p.slice(0, 256)).slice(0, 24)
        : [];
    const risk = raw.riskLevel === 'low' || raw.riskLevel === 'high' ? raw.riskLevel : 'medium';
    const assumptions = Array.isArray(raw.assumptions)
        ? raw.assumptions.filter((a: unknown) => typeof a === 'string').map((a: string) => a.slice(0, 400)).slice(0, 8)
        : [];
    const outOfScopeNote =
        typeof raw.outOfScopeNote === 'string' ? raw.outOfScopeNote.slice(0, 500) : undefined;

    return { summary, likelyTouchedPaths, riskLevel: risk, assumptions, outOfScopeNote };
}

export function buildDefaultImpactPreview(message: string): ImpactPreviewPayload {
    return {
        summary: message,
        likelyTouchedPaths: [],
        riskLevel: 'medium',
        assumptions: [],
        parseError: true,
    };
}
