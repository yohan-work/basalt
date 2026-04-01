const LOG_SUMMARY_MAX = 2000;

function isEmptyStringish(value: unknown): boolean {
    return typeof value === 'string' && value.trim() === '';
}

/**
 * Stable, non-empty summaries for execution logs / model context (empty tool outputs confuse models).
 */
export function formatSkillResultForExecutionLog(skillName: string, result: unknown): string {
    const tag = `[basalt:skill:${skillName}]`;
    if (result === undefined) {
        return `${tag} (no output — undefined)\n`;
    }
    if (result === null) {
        return `${tag} (no output — null)\n`;
    }
    if (isEmptyStringish(result)) {
        return `${tag} (empty string)\n`;
    }
    if (typeof result === 'string') {
        const body = result.length > LOG_SUMMARY_MAX ? `${result.slice(0, LOG_SUMMARY_MAX)}…` : result;
        return `${tag}\n${body}`;
    }
    if (typeof result === 'object') {
        try {
            const raw = JSON.stringify(result);
            const body = raw.length > LOG_SUMMARY_MAX ? `${raw.slice(0, LOG_SUMMARY_MAX)}…` : raw;
            return `${tag}\n${body}`;
        } catch {
            return `${tag} (object — could not serialize)\n`;
        }
    }
    return `${tag}\n${String(result)}`;
}
