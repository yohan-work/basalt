
export const MODEL_CONFIG = {
    // Used for simple summaries, status updates, or quick classifications
    FAST_MODEL: 'llama3.2:latest',

    // Used for complex planning, reasoning, and argument generation
    // 'gemma3' is often good for reasoning, or we can swap this if needed
    SMART_MODEL: 'gemma3:latest',

    // Used for writing code
    // 'gpt-oss' likely refers to a code-specialized model or a strong generalist
    CODING_MODEL: 'gpt-oss:20b',

    // Default fallback
    DEFAULT: 'llama3.2:latest'
} as const;

export type ModelType = keyof typeof MODEL_CONFIG;

export function getModel(type: ModelType): string {
    return MODEL_CONFIG[type];
}
