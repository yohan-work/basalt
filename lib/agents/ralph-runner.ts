/**
 * Ralph 이벤트 모드: Orchestrator의 plan / execute / verify를 외부 루프로 묶되
 * Orchestrator 본문 분기는 추가하지 않는다.
 */

import fs from 'fs';
import path from 'path';
import { supabase } from '@/lib/supabase';
import { Orchestrator } from '@/lib/agents/Orchestrator';
import type { StreamEmitter, StreamEvent } from '@/lib/stream-emitter';

/** Ralph 루프 중에는 내부 Orchestrator의 done 이벤트가 스트림을 끊지 않도록 억제 */
function wrapEmitterSuppressInnerDone(emitter: StreamEmitter): StreamEmitter {
    const proxy = Object.create(emitter) as StreamEmitter;
    proxy.emit = (e: StreamEvent) => {
        if (e.type === 'done') return;
        emitter.emit(e);
    };
    return proxy;
}

/** Orchestrator.execute와 동일한 옵션 형태 */
export type RalphExecutionOptions = {
    discussionMode?: 'off' | 'step_handoff' | 'roundtable';
    maxDiscussionThoughts?: number;
    carryDiscussionToPrompt?: boolean;
    strategyPreset?: 'quality_first' | 'balanced' | 'speed_first' | 'cost_saver';
};

export type RalphSessionState = {
    active: boolean;
    startedAt: string;
    endedAt?: string;
    maxRounds: number;
    currentRound: number;
    outcome?: 'completed' | 'max_rounds' | 'error' | 'cancelled';
    lastMessage?: string;
};

function readGuardrailsFile(projectPath: string, taskId: string): string {
    const file = path.join(projectPath, '.basalt', 'ralph', taskId, 'guardrails.md');
    try {
        if (fs.existsSync(file)) {
            return fs.readFileSync(file, 'utf8').trim();
        }
    } catch {
        /* ignore */
    }
    return '';
}

export function appendRalphGuardrail(projectPath: string, taskId: string, line: string): void {
    const dir = path.join(projectPath, '.basalt', 'ralph', taskId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'guardrails.md');
    const stamp = new Date().toISOString();
    fs.appendFileSync(file, `\n- [${stamp}] ${line.replace(/\s+/g, ' ').trim()}\n`, 'utf8');
}

async function mergeTaskMetadata(taskId: string, patch: Record<string, unknown>): Promise<void> {
    const { data, error } = await supabase.from('Tasks').select('metadata').eq('id', taskId).single();
    if (error) throw new Error(error.message);
    const meta = { ...(data?.metadata || {}), ...patch };
    const { error: upErr } = await supabase.from('Tasks').update({ metadata: meta }).eq('id', taskId);
    if (upErr) throw new Error(upErr.message);
}

async function resolveProjectPath(taskId: string): Promise<string> {
    const { data: task, error } = await supabase.from('Tasks').select('project_id').eq('id', taskId).single();
    if (error || !task) return process.cwd();
    const pid = (task as { project_id?: string }).project_id;
    if (!pid) return process.cwd();
    const { data: project } = await supabase.from('Projects').select('path').eq('id', pid).single();
    if (project?.path && typeof project.path === 'string') return project.path;
    return process.cwd();
}

async function acknowledgeImpactPreflight(taskId: string): Promise<void> {
    const { data, error } = await supabase.from('Tasks').select('metadata').eq('id', taskId).single();
    if (error) throw new Error(error.message);
    const meta = (data?.metadata || {}) as Record<string, unknown>;
    const preflight = (meta.executionPreflight || {}) as Record<string, unknown>;
    await mergeTaskMetadata(taskId, {
        executionPreflight: {
            ...preflight,
            requiresImpactAck: true,
            impactAcknowledgedAt: new Date().toISOString(),
        },
    });
}

async function getTaskRow(taskId: string) {
    const { data, error } = await supabase.from('Tasks').select('*').eq('id', taskId).single();
    if (error) throw new Error(error.message);
    return data;
}

function resolveMaxRounds(): number {
    const raw = process.env.BASALT_RALPH_MAX_ROUNDS;
    const n = raw ? Number(raw) : 3;
    if (!Number.isFinite(n)) return 3;
    return Math.min(12, Math.max(1, Math.round(n)));
}

/**
 * Ralph 세션: plan → impact 자동 승인 → execute → (testing이면) verify → 성공 시 종료, 실패 시 가드레일 후 재기획.
 */
export async function runRalphSession(
    taskId: string,
    emitter: StreamEmitter | null,
    executionOptions?: RalphExecutionOptions
): Promise<void> {
    const maxRounds = resolveMaxRounds();
    const startedAt = new Date().toISOString();

    await mergeTaskMetadata(taskId, {
        ralphSession: {
            active: true,
            startedAt,
            maxRounds,
            currentRound: 0,
        } satisfies RalphSessionState,
    });

    emitter?.emit({ type: 'phase_start', phase: 'ralph_session', taskId });

    try {
        const projectPath = await resolveProjectPath(taskId);

        for (let round = 1; round <= maxRounds; round++) {
            emitter?.emit({ type: 'phase_start', phase: `ralph_round_${round}`, taskId });
            await mergeTaskMetadata(taskId, {
                ralphSession: {
                    active: true,
                    startedAt,
                    maxRounds,
                    currentRound: round,
                },
            });

            const taskRow = await getTaskRow(taskId);
            const description =
                (taskRow as { description?: string; title?: string }).description ||
                (taskRow as { title?: string }).title ||
                'No description provided';
            const guardrails = readGuardrailsFile(projectPath, taskId);
            const effectiveDescription =
                guardrails.length > 0
                    ? `${description}\n\n---\n[Ralph 가드레일 — 라운드 ${round}]\n${guardrails}`
                    : description;

            const orchestrator = new Orchestrator(taskId, emitter ? wrapEmitterSuppressInnerDone(emitter) : undefined);
            await orchestrator.plan(effectiveDescription);

            await acknowledgeImpactPreflight(taskId);

            await orchestrator.execute(undefined, executionOptions);

            let t = await getTaskRow(taskId);
            const status = (t as { status: string }).status;

            if (status === 'failed') {
                const lastError = String(
                    (t as { metadata?: { lastError?: string } }).metadata?.lastError || 'unknown'
                );
                appendRalphGuardrail(projectPath, taskId, `실행 실패: ${lastError.slice(0, 500)}`);
                continue;
            }

            if (status === 'testing') {
                await orchestrator.verify();
                t = await getTaskRow(taskId);
            }

            const finalStatus = (t as { status: string }).status;
            const meta = ((t as { metadata?: Record<string, unknown> }).metadata || {}) as Record<string, unknown>;
            const verification = meta.verification as { verified?: boolean } | undefined;

            if (finalStatus === 'review') {
                await mergeTaskMetadata(taskId, {
                    ralphSession: {
                        active: false,
                        startedAt,
                        endedAt: new Date().toISOString(),
                        maxRounds,
                        currentRound: round,
                        outcome: 'completed',
                        lastMessage: '검증·Git 단계까지 완료되었습니다.',
                    },
                });
                emitter?.emit({ type: 'done', status: 'ralph_completed' });
                return;
            }

            if (finalStatus === 'failed' && meta.failedAction === 'verify') {
                const err = String(meta.lastError || 'verify failed');
                appendRalphGuardrail(projectPath, taskId, `검증 실패: ${err.slice(0, 500)}`);
                continue;
            }

            if (verification?.verified === true && finalStatus === 'testing') {
                await mergeTaskMetadata(taskId, {
                    ralphSession: {
                        active: false,
                        startedAt,
                        endedAt: new Date().toISOString(),
                        maxRounds,
                        currentRound: round,
                        outcome: 'completed',
                        lastMessage: '검증 통과(리뷰 단계 전).',
                    },
                });
                emitter?.emit({ type: 'done', status: 'ralph_completed' });
                return;
            }

            const note =
                verification?.verified === false
                    ? '검증 스킬이 통과하지 못함'
                    : `상태 ${finalStatus}에서 목표 미달`;
            appendRalphGuardrail(projectPath, taskId, note);
        }

        await mergeTaskMetadata(taskId, {
            ralphSession: {
                active: false,
                startedAt,
                endedAt: new Date().toISOString(),
                maxRounds,
                currentRound: maxRounds,
                outcome: 'max_rounds',
                lastMessage: `최대 라운드(${maxRounds})에 도달했습니다.`,
            },
        });
        emitter?.emit({ type: 'done', status: 'ralph_max_rounds' });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        await mergeTaskMetadata(taskId, {
            ralphSession: {
                active: false,
                startedAt,
                endedAt: new Date().toISOString(),
                maxRounds: resolveMaxRounds(),
                currentRound: 0,
                outcome: 'error',
                lastMessage: message,
            },
        });
        emitter?.emit({ type: 'error', message });
        emitter?.emit({ type: 'done', status: 'ralph_error' });
        throw e;
    }
}
