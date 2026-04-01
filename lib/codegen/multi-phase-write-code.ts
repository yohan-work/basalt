/**
 * Multi-phase write_code: optional Plan (JSON) + Implement stream + second pass after project typecheck.
 */

export function resolveMultiPhaseCodegenEnabled(saved?: boolean, runtime?: boolean): boolean {
    const raw = process.env.BASALT_CODEGEN_MULTI_PHASE;
    if (raw !== undefined && String(raw).trim() !== '') {
        const low = String(raw).toLowerCase();
        if (['1', 'true', 'yes', 'on'].includes(low)) return true;
        if (['0', 'false', 'no', 'off'].includes(low)) return false;
    }
    return Boolean(runtime ?? saved);
}

/** Total generateCodeStream passes = 1 + clamp(extra retries, 0..2). */
export function resolveMaxImplementPasses(multiPhaseEnabled: boolean): number {
    if (!multiPhaseEnabled) return 1;
    const n = Number(process.env.BASALT_CODEGEN_MULTI_PHASE_MAX_RETRIES ?? 1);
    const extra = Number.isFinite(n) ? Math.min(2, Math.max(0, Math.round(n))) : 1;
    return 1 + extra;
}

export function appendCodegenAttachments(
    basePrompt: string,
    opts: {
        planJson?: string | null;
        typecheckFeedback?: string | null;
        affectedPaths?: string[];
    }
): string {
    const parts: string[] = [basePrompt];
    const plan = opts.planJson?.trim();
    if (plan) {
        parts.push(
            '[IMPLEMENTATION PLAN — follow this structure; do not contradict it with your file outputs]\n' + plan
        );
    }
    const fb = opts.typecheckFeedback?.trim();
    if (fb) {
        const paths =
            Array.isArray(opts.affectedPaths) && opts.affectedPaths.length > 0
                ? opts.affectedPaths.join(', ')
                : '(see diagnostics below)';
        parts.push(
            `[PROJECT TYPECHECK FAILED — fix in your File: outputs. Prefer editing: ${paths}]\n${fb}`
        );
    }
    return parts.join('\n\n');
}
