
/**
 * SSE Stream Emitter
 *
 * Manages a ReadableStream controller for Server-Sent Events (SSE).
 * Tracks step timings for ETA calculation and emits typed events
 * that the frontend can consume via EventSource.
 */

export type StreamEvent =
    | { type: 'phase_start'; phase: string; taskId: string }
    | { type: 'step_start'; step: number; total: number; action: string; agent: string }
    | { type: 'step_complete'; step: number; total: number; duration: number; eta: number }
    | { type: 'llm_token'; token: string; context: string }
    | { type: 'llm_complete'; fullResponse: string; context: string }
    | { type: 'skill_execute'; skill: string; args?: unknown }
    | { type: 'skill_result'; skill: string; summary: string }
    | { type: 'progress'; step: number; total: number; percent: number; eta: number }
    | { type: 'error'; message: string; step?: number }
    | { type: 'llm_token_usage'; tokens: { prompt: number; completion: number; total: number } }
    | { type: 'done'; status: string };

export class StreamEmitter {
    private controller: ReadableStreamDefaultController | null = null;
    private encoder = new TextEncoder();
    private stepTimings: number[] = [];
    private currentStepStart: number = 0;
    private closed = false;

    /**
     * Attach a ReadableStreamDefaultController to send events through.
     */
    attach(controller: ReadableStreamDefaultController) {
        this.controller = controller;
        this.closed = false;
    }

    /**
     * Emit a typed event as an SSE message.
     * Format: `data: <JSON>\n\n`
     */
    emit(event: StreamEvent) {
        if (this.closed || !this.controller) return;

        try {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            this.controller.enqueue(this.encoder.encode(data));
        } catch {
            // Controller may be closed; ignore
        }
    }

    /**
     * Mark the start of a step for timing purposes.
     */
    markStepStart() {
        this.currentStepStart = Date.now();
    }

    /**
     * Mark the end of a step and record its duration.
     * Returns the duration in milliseconds.
     */
    markStepEnd(): number {
        const duration = Date.now() - this.currentStepStart;
        this.stepTimings.push(duration);
        return duration;
    }

    /**
     * Calculate estimated time remaining based on average step duration.
     * @param currentStep - 0-based index of the current step
     * @param totalSteps - total number of steps
     * @returns estimated remaining time in milliseconds
     */
    calculateETA(currentStep: number, totalSteps: number): number {
        if (this.stepTimings.length === 0) return 0;

        const avgDuration = this.stepTimings.reduce((a, b) => a + b, 0) / this.stepTimings.length;
        const remainingSteps = totalSteps - (currentStep + 1);
        return Math.round(avgDuration * remainingSteps);
    }

    /**
     * Emit a progress event with computed ETA.
     */
    emitProgress(step: number, total: number) {
        const percent = Math.round(((step + 1) / total) * 100);
        const eta = this.calculateETA(step, total);
        this.emit({ type: 'progress', step, total, percent, eta });
    }

    /**
     * Send a heartbeat to keep the connection alive.
     */
    heartbeat() {
        if (this.closed || !this.controller) return;
        try {
            this.controller.enqueue(this.encoder.encode(': heartbeat\n\n'));
        } catch {
            // Ignore
        }
    }

    /**
     * Close the stream.
     */
    close() {
        if (this.closed || !this.controller) return;
        this.closed = true;
        try {
            this.controller.close();
        } catch {
            // Already closed
        }
    }

    /**
     * Whether the emitter is still active and attached.
     */
    get isActive(): boolean {
        return !this.closed && this.controller !== null;
    }
}
