
import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { Orchestrator } from '@/lib/agents/Orchestrator';
import { runRalphSession } from '@/lib/agents/ralph-runner';
import { StreamEmitter } from '@/lib/stream-emitter';
import { sendDebugIngest } from '@/lib/debug-ingest';

export const dynamic = 'force-dynamic';

/**
 * SSE endpoint for streaming orchestrator progress.
 *
 * GET /api/agent/stream?taskId=xxx&action=plan|execute|verify
 *
 * Returns a text/event-stream with typed events the frontend
 * can consume via EventSource or fetch().
 */
export async function GET(req: NextRequest) {
    const taskId = req.nextUrl.searchParams.get('taskId');
    const action = req.nextUrl.searchParams.get('action');
    const discussionModeParam = req.nextUrl.searchParams.get('discussionMode');
    const maxDiscussionThoughtsParam = req.nextUrl.searchParams.get('maxDiscussionThoughts');
    const carryDiscussionToPromptParam = req.nextUrl.searchParams.get('carryDiscussionToPrompt');
    const strategyPresetParam = req.nextUrl.searchParams.get('strategyPreset');
    const multiPhaseCodegenParam = req.nextUrl.searchParams.get('multiPhaseCodegen');

    if (!taskId || !action) {
        return new Response(
            JSON.stringify({ error: 'taskId and action query params required' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    // Validate action
    const validActions = ['plan', 'execute', 'verify', 'retry', 'ralph'];
    if (!validActions.includes(action)) {
        return new Response(
            JSON.stringify({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }

    const stream = new ReadableStream({
        async start(controller) {
            const emitter = new StreamEmitter();
            emitter.attach(controller);
            const executionOptions = {
                discussionMode: (discussionModeParam as 'off' | 'step_handoff' | 'roundtable' | null) || undefined,
                maxDiscussionThoughts: maxDiscussionThoughtsParam ? Number(maxDiscussionThoughtsParam) : undefined,
                carryDiscussionToPrompt: carryDiscussionToPromptParam
                    ? carryDiscussionToPromptParam === 'true'
                    : undefined,
                strategyPreset: (strategyPresetParam as 'quality_first' | 'balanced' | 'speed_first' | 'cost_saver' | null) || undefined,
                multiPhaseCodegen:
                    multiPhaseCodegenParam === 'true'
                        ? true
                        : multiPhaseCodegenParam === 'false'
                          ? false
                          : undefined,
            };

            // Set up heartbeat to keep connection alive
            const heartbeatInterval = setInterval(() => {
                emitter.heartbeat();
            }, 15_000);

            const orchestrator = new Orchestrator(taskId, emitter);

            try {
                switch (action) {
                    case 'plan': {
                        // Fetch task description for planning
                        const { data: task, error: taskError } = await supabase
                            .from('Tasks')
                            .select('*')
                            .eq('id', taskId)
                            .single();

                        if (taskError || !task) {
                            emitter.emit({ type: 'error', message: 'Task not found' });
                            break;
                        }

                        const description = task.description || task.title || 'No description provided';
                        await orchestrator.plan(description);
                        break;
                    }
                    case 'execute': {
                        await orchestrator.execute(undefined, executionOptions);
                        void sendDebugIngest({
                            sessionId: 'f89f62',
                            hypothesisId: 'H1',
                            location: 'stream/route.ts:execute:after',
                            message: 'sse_execute_handler_returned',
                            data: { taskId },
                        });
                        break;
                    }
                    case 'verify': {
                        await orchestrator.verify();
                        break;
                    }
                    case 'retry': {
                        await orchestrator.retry();
                        break;
                    }
                    case 'ralph': {
                        await runRalphSession(taskId, emitter, executionOptions);
                        break;
                    }
                }
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                console.error(`SSE Stream Error [${action}]:`, error);
                emitter.emit({ type: 'error', message });
                emitter.emit({ type: 'done', status: 'error' });
            } finally {
                clearInterval(heartbeatInterval);
                // Give a short delay so the client can receive the final event
                await new Promise(resolve => setTimeout(resolve, 100));
                emitter.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no', // Disable nginx buffering
        },
    });
}
