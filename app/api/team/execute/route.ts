
import { NextRequest, NextResponse } from 'next/server';
import { TeamOrchestrator } from '@/lib/agents/TeamOrchestrator';
import { applyPresetDefaults } from '@/lib/orchestration/policy';
import type { StrategyPreset } from '@/lib/orchestration/metrics';

// Set max duration for Vercel/Next.js (optional, depends on hosting)
export const maxDuration = 300;

type TeamRunStatus = 'running' | 'completed' | 'failed';

interface TeamRunState {
    runId: string;
    taskId: string;
    status: TeamRunStatus;
    maxRounds: number;
    discussionMode: 'enabled' | 'disabled';
    strategyPreset: StrategyPreset;
    startedAt: number;
    endedAt?: number;
    error?: string;
}

const teamRuns = new Map<string, TeamRunState>();
const generateRunId = () => `team-${Math.random().toString(36).slice(2, 10)}`;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            taskId,
            maxRounds = 10,
            discussionMode,
            strategyPreset = 'balanced',
            waitForCompletion = false
        } = body as {
            taskId?: string;
            maxRounds?: number;
            discussionMode?: 'enabled' | 'disabled';
            strategyPreset?: StrategyPreset;
            waitForCompletion?: boolean;
        };

        if (!taskId) {
            return NextResponse.json({ error: 'taskId required' }, { status: 400 });
        }

        console.log(`Starting Team Orchestration for Task ${taskId} (Rounds: ${maxRounds})`);
        const preset = (['quality_first', 'balanced', 'speed_first', 'cost_saver'].includes(strategyPreset)
            ? strategyPreset
            : 'balanced') as StrategyPreset;
        const presetDefaults = applyPresetDefaults(preset);
        const resolvedDiscussionMode = discussionMode
            || (presetDefaults.discussionMode === 'off' ? 'disabled' : 'enabled');

        const orchestrator = new TeamOrchestrator(taskId, {
            name: 'Dev Team',
            leader: 'product-manager',
            members: ['product-manager', 'software-engineer', 'qa'],
            messages: [],
            board: { todo: [], in_progress: [], review: [], done: [] },
            metadata: {
                round: 0,
                discussionMode: resolvedDiscussionMode,
                strategyPreset: preset,
                budgetPolicy: presetDefaults.budgetPolicy,
                collaboration: {},
                roundSummaries: []
            }
        });

        if (waitForCompletion) {
            await orchestrator.runTeamLoop(maxRounds);
            return NextResponse.json({
                success: true,
                message: 'Team execution cycle completed',
                taskId
            });
        }

        const runId = generateRunId();
        teamRuns.set(runId, {
            runId,
            taskId,
            status: 'running',
            maxRounds,
            discussionMode: resolvedDiscussionMode,
            strategyPreset: preset,
            startedAt: Date.now(),
        });

        void (async () => {
            try {
                await orchestrator.runTeamLoop(maxRounds);
                const current = teamRuns.get(runId);
                if (current) {
                    teamRuns.set(runId, {
                        ...current,
                        status: 'completed',
                        endedAt: Date.now(),
                    });
                }
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                const current = teamRuns.get(runId);
                if (current) {
                    teamRuns.set(runId, {
                        ...current,
                        status: 'failed',
                        endedAt: Date.now(),
                        error: message,
                    });
                }
            }
        })();

        return NextResponse.json({
            success: true,
            accepted: true,
            runId,
            taskId,
            statusUrl: `/api/team/execute?runId=${runId}`
        }, { status: 202 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Team Execute Error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const runId = req.nextUrl.searchParams.get('runId');
    if (!runId) {
        return NextResponse.json({ error: 'runId required' }, { status: 400 });
    }
    const state = teamRuns.get(runId);
    if (!state) {
        return NextResponse.json({ error: 'run not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, run: state });
}
