
export const MODEL_CONFIG = {
    // Used for simple summaries, status updates, or quick classifications
    // Override with FAST_MODEL env var
    FAST_MODEL: process.env.FAST_MODEL || 'llama3.2:latest',

    // Used for complex planning, reasoning, and argument generation
    // Override with SMART_MODEL env var
    SMART_MODEL: process.env.SMART_MODEL || 'gemma4:e2b',

    // Used for writing code
    // Override with CODING_MODEL env var
    CODING_MODEL: process.env.CODING_MODEL || 'qwen2.5-coder:7b',

    // Default fallback
    DEFAULT: process.env.DEFAULT_MODEL || 'llama3.2:latest'
} as const;

export type ModelType = keyof typeof MODEL_CONFIG;

export function getModel(type: ModelType): string {
    return MODEL_CONFIG[type];
}

let _validated = false;

/**
 * Ollama /api/tags 엔드포인트로 가용 모델 목록을 조회해
 * MODEL_CONFIG에 정의된 모델이 없으면 경고를 출력합니다.
 * 한 번만 실행되며 실패해도 LLM 호출을 막지 않습니다.
 */
export async function validateModels(): Promise<void> {
    if (_validated) return;
    _validated = true;

    const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

    try {
        const response = await fetch(`${ollamaBaseUrl}/api/tags`, {
            signal: AbortSignal.timeout(5_000),
        });

        if (!response.ok) {
            console.warn(`[ModelConfig] Ollama /api/tags responded with ${response.status} — skipping model validation.`);
            return;
        }

        const data = await response.json() as { models?: Array<{ name: string }> };
        const available = new Set((data.models ?? []).map((m) => m.name));

        const configured = {
            FAST_MODEL: MODEL_CONFIG.FAST_MODEL,
            SMART_MODEL: MODEL_CONFIG.SMART_MODEL,
            CODING_MODEL: MODEL_CONFIG.CODING_MODEL,
            DEFAULT: MODEL_CONFIG.DEFAULT,
        };

        for (const [key, modelName] of Object.entries(configured)) {
            // Ollama may store names with or without the tag suffix (e.g. "llama3.2:latest" vs "llama3.2")
            const found = available.has(modelName) || available.has(modelName.split(':')[0]);
            if (!found) {
                console.warn(
                    `[ModelConfig] ⚠️  ${key}="${modelName}" 이 Ollama에 없습니다. ` +
                    `가용 모델: ${[...available].join(', ') || '(없음)'}`
                );
            }
        }
    } catch (err: unknown) {
        // Ollama 서버가 꺼져있거나 네트워크 오류 — 경고만 출력하고 계속 진행
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[ModelConfig] Ollama 서버에 연결할 수 없어 모델 유효성 검사를 건너뜁니다: ${message}`);
    }
}
