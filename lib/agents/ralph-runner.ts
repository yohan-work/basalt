/**
 * Ralph 이벤트 모드: Orchestrator의 plan / execute / verify를 외부 루프로 묶되
 * Orchestrator 본문 분기는 추가하지 않는다.
 */

import fs from 'fs';
import path from 'path';
import { supabase } from '@/lib/supabase';
import { Orchestrator } from '@/lib/agents/Orchestrator';
import { getTokenBudgetAbsoluteCeiling, resolveExecutionTokenCap } from '@/lib/orchestration/policy';
import type { StrategyPreset } from '@/lib/orchestration/metrics';
import type { StreamEmitter, StreamEvent } from '@/lib/stream-emitter';
import {
    appendRalphProgress,
    buildRalphPlanInput,
    formatRalphProgressBlock,
} from '@/lib/agents/ralph-artifacts';
import { runRalphFeedbackGate } from '@/lib/agents/ralph-feedback-gate';

/**
 * Orchestrator에만 넘길 래퍼: 내부 `done`은 억제하되 원본 emitter는 수정하지 않는다.
 * (인스턴스의 emit을 덮어쓰면 runRalphSession이 보내는 최종 `done`까지 삼켜진다.)
 */
function wrapEmitterSuppressInnerDone(emitter: StreamEmitter): StreamEmitter {
    const realEmit = emitter.emit.bind(emitter);
    return new Proxy(emitter, {
        get(target, prop, receiver) {
            if (prop === 'emit') {
                return (e: StreamEvent) => {
                    if (e.type === 'done') return;
                    return realEmit(e);
                };
            }
            const value = Reflect.get(target, prop, receiver);
            return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
        },
    }) as StreamEmitter;
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

async function setTaskFailedWithMetadata(taskId: string, lastError: string, failedAction: string): Promise<void> {
    const { data, error } = await supabase.from('Tasks').select('metadata').eq('id', taskId).single();
    if (error) throw new Error(error.message);
    const meta = { ...(data?.metadata || {}), lastError, failedAction, failedAt: new Date().toISOString() };
    const { error: u } = await supabase.from('Tasks').update({ status: 'failed', metadata: meta }).eq('id', taskId);
    if (u) throw new Error(u.message);
}

async function recordRalphRoundProgress(
    projectPath: string,
    taskId: string,
    round: number,
    note?: string
): Promise<void> {
    const t = await getTaskRow(taskId);
    const meta = ((t as { metadata?: Record<string, unknown> }).metadata || {}) as Record<string, unknown>;
    const fc = meta.fileChanges;
    const paths: string[] = [];
    if (Array.isArray(fc)) {
        for (const e of fc) {
            if (e && typeof e === 'object' && typeof (e as { filePath?: string }).filePath === 'string') {
                paths.push((e as { filePath: string }).filePath);
            }
        }
    }
    const status = (t as { status: string }).status;
    appendRalphProgress(
        projectPath,
        taskId,
        formatRalphProgressBlock({
            round,
            taskStatus: status,
            filePaths: paths,
            note,
        })
    );
}

function resolveMaxRounds(): number {
    const raw = process.env.BASALT_RALPH_MAX_ROUNDS;
    const n = raw ? Number(raw) : 3;
    if (!Number.isFinite(n)) return 3;
    return Math.min(12, Math.max(1, Math.round(n)));
}

/** Orchestrator.resolveExecutionOptions과 동일한 프리셋 우선순위 */
function resolveRalphStrategyPreset(
    taskMetadata: Record<string, unknown>,
    executionOptions?: RalphExecutionOptions
): StrategyPreset {
    const saved = (taskMetadata.executionOptions || {}) as Record<string, unknown>;
    const raw = (executionOptions?.strategyPreset ?? saved.strategyPreset ?? 'balanced') as string;
    return ['quality_first', 'balanced', 'speed_first', 'cost_saver'].includes(raw)
        ? (raw as StrategyPreset)
        : 'balanced';
}

function resolveRalphTokenBudgetMult(): number {
    const raw = process.env.BASALT_RALPH_TOKEN_BUDGET_MULT;
    if (raw === undefined || raw === '') return 1;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return n;
}

/**
 * plan 직후 워크플로 스텝 수가 정해졌을 때, Ralph 다라운드·반복 플랜에 맞게 토큰 상한을 올린다.
 * 사용자가 metadata.budgetPolicy.maxTokensPerTask에 더 큰 값을 두었으면 유지한다.
 */
async function ensureRalphTokenBudgetAfterPlan(
    taskId: string,
    maxRounds: number,
    executionOptions?: RalphExecutionOptions
): Promise<void> {
    const task = await getTaskRow(taskId);
    const meta = ((task as { metadata?: Record<string, unknown> }).metadata || {}) as Record<string, unknown>;
    const workflow = meta.workflow as { steps?: unknown[] } | undefined;
    const stepCount = Array.isArray(workflow?.steps) ? workflow!.steps!.length : 0;

    const preset = resolveRalphStrategyPreset(meta, executionOptions);
    const singleRunCap = resolveExecutionTokenCap(meta, preset, stepCount);
    const mult = resolveRalphTokenBudgetMult();
    const ceiling = getTokenBudgetAbsoluteCeiling();
    const proposed = Math.round(singleRunCap * maxRounds * mult);

    const prevBp = { ...((meta.budgetPolicy || {}) as Record<string, unknown>) };
    const existing = Number(prevBp.maxTokensPerTask);
    const fromExplicit = Number.isFinite(existing) && existing > 0 ? existing : 0;
    const newMax = Math.min(ceiling, Math.max(fromExplicit, proposed));

    if (newMax <= fromExplicit) return;

    await mergeTaskMetadata(taskId, {
        budgetPolicy: {
            ...prevBp,
            maxTokensPerTask: newMax,
        },
    });
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
            const effectiveDescription = buildRalphPlanInput(description, projectPath, taskId, round, guardrails);

            const orchestrator = new Orchestrator(taskId, emitter ? wrapEmitterSuppressInnerDone(emitter) : undefined);
            await orchestrator.plan(effectiveDescription);

            await ensureRalphTokenBudgetAfterPlan(taskId, maxRounds, executionOptions);

            await acknowledgeImpactPreflight(taskId);

            await orchestrator.execute(0, executionOptions);

            let t = await getTaskRow(taskId);
            const status = (t as { status: string }).status;

            if (status === 'failed') {
                const lastError = String(
                    (t as { metadata?: { lastError?: string } }).metadata?.lastError || 'unknown'
                );
                appendRalphGuardrail(projectPath, taskId, `실행 실패: ${lastError.slice(0, 500)}`);
                await recordRalphRoundProgress(projectPath, taskId, round, `execute 실패: ${lastError.slice(0, 300)}`);
                continue;
            }

            if (status === 'testing') {
                const gate = await runRalphFeedbackGate(projectPath);
                if (!gate.ok && gate.failure) {
                    appendRalphGuardrail(projectPath, taskId, `피드백 게이트: ${gate.failure.slice(0, 900)}`);
                    await setTaskFailedWithMetadata(taskId, gate.failure.slice(0, 2000), 'ralph_feedback_gate');
                    await recordRalphRoundProgress(projectPath, taskId, round, 'BASALT_RALPH_FEEDBACK_GATE: npm 스크립트 실패');
                    continue;
                }

                await orchestrator.verify();
                t = await getTaskRow(taskId);
            }

            const finalStatus = (t as { status: string }).status;
            const meta = ((t as { metadata?: Record<string, unknown> }).metadata || {}) as Record<string, unknown>;
            const verification = meta.verification as { verified?: boolean } | undefined;

            if (finalStatus === 'review') {
                await recordRalphRoundProgress(projectPath, taskId, round, '검증·Git 완료 → review');
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
                await recordRalphRoundProgress(projectPath, taskId, round, `verify 실패: ${err.slice(0, 300)}`);
                continue;
            }

            if (verification?.verified === true && finalStatus === 'testing') {
                await recordRalphRoundProgress(projectPath, taskId, round, '검증 통과(testing), 리뷰 전 종료');
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
            await recordRalphRoundProgress(projectPath, taskId, round, note);
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
    }
}
