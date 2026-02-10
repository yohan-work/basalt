
export const MODEL_CONFIG = {
    // Used for simple summaries, status updates, or quick classifications
    // Override with FAST_MODEL env var
    FAST_MODEL: process.env.FAST_MODEL || 'llama3.2:latest',

    // Used for complex planning, reasoning, and argument generation
    // Override with SMART_MODEL env var
    SMART_MODEL: process.env.SMART_MODEL || 'gemma3:latest',

    // Used for writing code
    // Override with CODING_MODEL env var
    CODING_MODEL: process.env.CODING_MODEL || 'gpt-oss:20b',

    // Default fallback
    DEFAULT: process.env.DEFAULT_MODEL || 'llama3.2:latest'
} as const;

export type ModelType = keyof typeof MODEL_CONFIG;

export function getModel(type: ModelType): string {
    return MODEL_CONFIG[type];
}
