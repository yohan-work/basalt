import * as llm from '@/lib/llm';
import { MODEL_CONFIG } from '@/lib/model-config';

import type { QaArtifactSlot } from '@/lib/qa/artifact-slots';
import type { QaPageCheckResult } from '@/lib/qa/page-smoke-check';

export type QaSignoffIncidentSource = 'smoke' | 'repair' | 'verification';

export type QaSignoffIncident = {
    title: string;
    detailKo: string;
    source: QaSignoffIncidentSource;
};

export type QaSignoffStored = {
    version: 1;
    targetUrl: string;
    checkedAt: string;
    artifactSlots: QaArtifactSlot[];
    qaPageCheck: QaPageCheckResult;
    verification: { verified: boolean; notes?: string };
    incidents: QaSignoffIncident[];
    narrativeKo: string;
    finalVerdictKo: string;
};

type ExecutionRepairRow = {
    step?: number;
    action?: string;
    detail?: string;
    at?: string;
};

function buildIncidents(params: {
    qaPageCheck: QaPageCheckResult;
    verification: { verified?: boolean; notes?: string };
    executionRepairs: ExecutionRepairRow[];
}): QaSignoffIncident[] {
    const out: QaSignoffIncident[] = [];

    if (!params.qaPageCheck.httpReachable) {
        out.push({
            title: 'HTTP 연결 실패',
            detailKo: params.qaPageCheck.httpError || '대상 dev 서버에 연결할 수 없습니다. 서버가 켜져 있는지 확인하세요.',
            source: 'smoke',
        });
    } else if (params.qaPageCheck.httpStatus !== null && params.qaPageCheck.httpStatus >= 400) {
        out.push({
            title: `HTTP ${params.qaPageCheck.httpStatus}`,
            detailKo: '페이지가 4xx/5xx 응답을 반환했습니다.',
            source: 'smoke',
        });
    }

    if (params.qaPageCheck.browserError) {
        out.push({
            title: '브라우저 점검 오류',
            detailKo: params.qaPageCheck.browserError,
            source: 'smoke',
        });
    }

    for (const sig of params.qaPageCheck.pageErrorSignals) {
        out.push({
            title: `페이지 오류 신호: ${sig}`,
            detailKo: '스냅샷/본문에서 알려진 오류 문구가 감지되었습니다. 빌드·런타임 오버레이 여부를 확인하세요.',
            source: 'smoke',
        });
    }

    if (typeof params.verification.notes === 'string' && params.verification.notes.trim()) {
        out.push({
            title: 'LLM 검증 노트',
            detailKo: params.verification.notes.trim(),
            source: 'verification',
        });
    }

    if (params.verification.verified === false) {
        out.push({
            title: '검증 단계 실패',
            detailKo: '최종 검증(verify_final_output 또는 QA 엄격 모드)에서 통과하지 못했습니다.',
            source: 'verification',
        });
    }

    const repairs = params.executionRepairs.slice(-12);
    for (const r of repairs) {
        const step = typeof r.step === 'number' ? `스텝 ${r.step + 1}` : '실행';
        const action = r.action ? ` / ${r.action}` : '';
        out.push({
            title: `실행 중 보정 (${step}${action})`,
            detailKo: r.detail || '(내용 없음)',
            source: 'repair',
        });
    }

    return out;
}

function ruleBasedNarrative(incidents: QaSignoffIncident[], qa: QaPageCheckResult, verified: boolean): string {
    const lines: string[] = [];
    lines.push(`대상 URL: ${qa.url}`);
    lines.push(`HTTP: ${qa.httpReachable ? `연결됨 (상태 ${qa.httpStatus ?? '—'})` : '연결 실패'}`);
    lines.push(`페이지 스모크: ${qa.passed ? '통과' : '이슈 있음'} — ${qa.summary}`);
    lines.push(`검증 결과: ${verified ? '통과' : '미통과'}`);
    if (incidents.length > 0) {
        lines.push('', '주요 기록:');
        for (const i of incidents.slice(0, 8)) {
            lines.push(`- [${i.source}] ${i.title}: ${i.detailKo.slice(0, 200)}${i.detailKo.length > 200 ? '…' : ''}`);
        }
        if (incidents.length > 8) lines.push(`… 외 ${incidents.length - 8}건`);
    }
    return lines.join('\n');
}

function ruleBasedVerdict(qa: QaPageCheckResult, verified: boolean): string {
    if (verified && qa.passed) {
        return 'HTTP·브라우저 스모크·검증이 모두 정상으로 마무리되었습니다. 아래 스크린샷으로 UI 상태를 확인할 수 있습니다.';
    }
    if (!verified) {
        return '검증 단계에서 통과하지 못했습니다. 로그·이슈 목록·스크린샷(있는 경우)을 참고해 수정 후 다시 실행하세요.';
    }
    return '일부 QA 항목에서 경고가 있습니다. 스모크 요약과 기록을 확인하세요.';
}

export async function buildQaSignoffReport(params: {
    targetUrl: string;
    checkedAt: string;
    artifactSlots: QaArtifactSlot[];
    qaPageCheck: QaPageCheckResult;
    verification: { verified?: boolean; notes?: string };
    executionRepairs: ExecutionRepairRow[];
}): Promise<QaSignoffStored> {
    const verification = {
        verified: Boolean(params.verification.verified),
        notes: params.verification.notes,
    };

    const incidents = buildIncidents({
        qaPageCheck: params.qaPageCheck,
        verification,
        executionRepairs: params.executionRepairs,
    });

    let narrativeKo = ruleBasedNarrative(incidents, params.qaPageCheck, verification.verified);
    let finalVerdictKo = ruleBasedVerdict(params.qaPageCheck, verification.verified);

    try {
        const schema = `{
  "narrativeKo": "3~8문장, 한국어, 사용자에게 읽기 쉽게 요약",
  "finalVerdictKo": "1~3문장, 한국어, 최종 판정"
}`;
        const userPayload = JSON.stringify({
            targetUrl: params.targetUrl,
            qaSummary: params.qaPageCheck.summary,
            qaPassed: params.qaPageCheck.passed,
            verificationPassed: verification.verified,
            incidentTitles: incidents.map((i) => i.title),
            repairCount: params.executionRepairs.length,
        });

        const polished = await llm.generateJSON(
            `You are a QA lead writing a short Korean sign-off summary for a developer task.
Use only the JSON facts provided. Do not invent file names or URLs not given.
Keep professional tone.`,
            userPayload,
            schema,
            MODEL_CONFIG.FAST_MODEL
        );

        if (typeof polished.narrativeKo === 'string' && polished.narrativeKo.trim()) {
            narrativeKo = polished.narrativeKo.trim();
        }
        if (typeof polished.finalVerdictKo === 'string' && polished.finalVerdictKo.trim()) {
            finalVerdictKo = polished.finalVerdictKo.trim();
        }
    } catch {
        /* keep rule-based copy */
    }

    return {
        version: 1,
        targetUrl: params.targetUrl,
        checkedAt: params.checkedAt,
        artifactSlots: params.artifactSlots,
        qaPageCheck: params.qaPageCheck,
        verification,
        incidents,
        narrativeKo,
        finalVerdictKo,
    };
}
