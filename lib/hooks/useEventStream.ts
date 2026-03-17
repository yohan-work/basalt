
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { StreamEvent } from '@/lib/stream-emitter';
import type { ExecuteStreamOptions } from '@/lib/types/agent-visualization';

export interface StepInfo {
    step: number;
    total: number;
    action: string;
    agent: string;
    duration?: number;
}

export interface EventStreamState {
    /** All received events */
    events: StreamEvent[];
    /** Current step information */
    currentStep: StepInfo | null;
    /** Completed steps with timings */
    completedSteps: Array<StepInfo & { duration: number }>;
    /** Estimated time remaining in ms */
    eta: number | null;
    /** Overall progress percentage (0-100) */
    percent: number;
    /** Accumulated LLM tokens for live display */
    llmBuffer: string;
    /** Current stream status */
    status: 'idle' | 'connecting' | 'streaming' | 'done' | 'error';
    /** Error message if status is 'error' */
    errorMessage: string | null;
    /** Final status from the done event */
    doneStatus: string | null;
}

interface UseEventStreamOptions {
    /** Called when connection opens */
    onOpen?: () => void;
    /** Called on each event */
    onEvent?: (event: StreamEvent) => void;
    /** Called when stream ends */
    onDone?: (status: string) => void;
    /** Called on error */
    onError?: (message: string) => void;
}

/**
 * Hook to consume an SSE stream from /api/agent/stream.
 *
 * Returns a start() function and the current state.
 * Call start(taskId, action, executeOptions?) to begin streaming.
 * The stream auto-closes on 'done' event or error.
 */
export function useEventStream(options: UseEventStreamOptions = {}) {
    const [state, setState] = useState<EventStreamState>({
        events: [],
        currentStep: null,
        completedSteps: [],
        eta: null,
        percent: 0,
        llmBuffer: '',
        status: 'idle',
        errorMessage: null,
        doneStatus: null,
    });

    const abortRef = useRef<AbortController | null>(null);
    const optionsRef = useRef(options);

    useEffect(() => {
        optionsRef.current = options;
    }, [options]);

    const stop = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
    }, []);

    const start = useCallback((taskId: string, action: string, executeOptions?: ExecuteStreamOptions) => {
        // Cancel any existing stream
        stop();

        const controller = new AbortController();
        abortRef.current = controller;

        // Reset state
        setState({
            events: [],
            currentStep: null,
            completedSteps: [],
            eta: null,
            percent: 0,
            llmBuffer: '',
            status: 'connecting',
            errorMessage: null,
            doneStatus: null,
        });

        // Use fetch instead of EventSource for better abort control
        const params = new URLSearchParams({
            taskId,
            action,
        });
        if (executeOptions?.discussionMode) {
            params.set('discussionMode', executeOptions.discussionMode);
        }
        if (typeof executeOptions?.maxDiscussionThoughts === 'number') {
            params.set('maxDiscussionThoughts', String(executeOptions.maxDiscussionThoughts));
        }
        if (typeof executeOptions?.carryDiscussionToPrompt === 'boolean') {
            params.set('carryDiscussionToPrompt', String(executeOptions.carryDiscussionToPrompt));
        }
        if (executeOptions?.strategyPreset) {
            params.set('strategyPreset', executeOptions.strategyPreset);
        }
        const url = `/api/agent/stream?${params.toString()}`;

        (async () => {
            try {
                const response = await fetch(url, { signal: controller.signal });

                if (!response.ok) {
                    const errBody = await response.text();
                    setState(prev => ({
                        ...prev,
                        status: 'error',
                        errorMessage: `HTTP ${response.status}: ${errBody}`,
                    }));
                    optionsRef.current.onError?.(`HTTP ${response.status}`);
                    return;
                }

                setState(prev => ({ ...prev, status: 'streaming' }));
                optionsRef.current.onOpen?.();

                const reader = response.body?.getReader();
                if (!reader) return;

                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    // Parse SSE messages (data: ...\n\n)
                    const messages = buffer.split('\n\n');
                    buffer = messages.pop() || '';

                    for (const msg of messages) {
                        // Skip heartbeats (lines starting with :)
                        const lines = msg.split('\n').filter(l => !l.startsWith(':'));
                        for (const line of lines) {
                            if (!line.startsWith('data: ')) continue;

                            const jsonStr = line.slice(6); // Remove 'data: '
                            try {
                                const event: StreamEvent = JSON.parse(jsonStr);
                                processEvent(event);
                            } catch {
                                // Malformed JSON
                            }
                        }
                    }
                }

                // Stream ended naturally
                setState(prev => {
                    if (prev.status === 'streaming') {
                        return { ...prev, status: 'done' };
                    }
                    return prev;
                });

            } catch (err: unknown) {
                if (err instanceof DOMException && err.name === 'AbortError') return; // Intentional abort
                const message = err instanceof Error ? err.message : 'Unknown stream error';
                setState(prev => ({
                    ...prev,
                    status: 'error',
                    errorMessage: message,
                }));
                optionsRef.current.onError?.(message);
            }
        })();

        function processEvent(event: StreamEvent) {
            setState(prev => {
                const newEvents = [...prev.events, event];
                const newState = { ...prev, events: newEvents };

                switch (event.type) {
                    case 'step_start':
                        newState.currentStep = {
                            step: event.step,
                            total: event.total,
                            action: event.action,
                            agent: event.agent,
                        };
                        newState.llmBuffer = ''; // Clear buffer for new step
                        break;

                    case 'step_complete':
                        if (newState.currentStep) {
                            newState.completedSteps = [
                                ...prev.completedSteps,
                                { ...newState.currentStep, duration: event.duration },
                            ];
                        }
                        newState.eta = event.eta;
                        break;

                    case 'progress':
                        newState.percent = event.percent;
                        newState.eta = event.eta;
                        break;

                    case 'llm_token':
                        newState.llmBuffer = prev.llmBuffer + event.token;
                        break;

                    case 'llm_complete':
                        // Keep the buffer as-is for display
                        break;

                    case 'error':
                        newState.errorMessage = event.message;
                        break;

                    case 'done':
                        newState.status = 'done';
                        newState.doneStatus = event.status;
                        optionsRef.current.onDone?.(event.status);
                        break;
                }

                optionsRef.current.onEvent?.(event);
                return newState;
            });
        }
    }, [stop]);

    // Cleanup on unmount
    useEffect(() => {
        return () => stop();
    }, [stop]);

    return {
        ...state,
        start,
        stop,
        isActive: state.status === 'connecting' || state.status === 'streaming',
    };
}
