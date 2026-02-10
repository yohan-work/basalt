
import { MODEL_CONFIG } from './model-config';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

const TIMEOUT_MS = {
    CODE: 120_000,  // 120s for code generation (longer prompts)
    JSON: 60_000,   // 60s for JSON generation
} as const;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1s → 2s → 4s exponential backoff

export interface LLMResponse {
    content: string;
    files: Array<{ path: string; content: string }>;
    error?: boolean;
}

/**
 * Fetch with timeout using AbortController
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal,
        });
        return response;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Retry wrapper with exponential backoff
 */
async function withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = MAX_RETRIES,
    baseDelay: number = BASE_DELAY_MS
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            // Don't retry on abort (timeout) — it's intentional
            if (error.name === 'AbortError') {
                throw new Error(`LLM request timed out after attempt ${attempt + 1}`);
            }

            // Don't retry on the last attempt
            if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt);
                console.warn(`LLM attempt ${attempt + 1} failed, retrying in ${delay}ms...`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new Error('All LLM retry attempts exhausted');
}

export async function generateCode(prompt: string, context: string, model: string = MODEL_CONFIG.CODING_MODEL): Promise<LLMResponse> {
    const fullPrompt = `
You are an expert AI software engineer.
Context: ${context}
Task: ${prompt}

Return the response in the following JSON format ONLY, without any markdown formatting or explanation:
{
    "explanation": "Brief explanation of what you did",
    "files": [
        { "path": "path/to/file.ext", "content": "file content here" }
    ]
}
`;

    try {
        const parsed = await withRetry(async () => {
            const response = await fetchWithTimeout(
                `${OLLAMA_BASE_URL}/api/generate`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: model,
                        prompt: fullPrompt,
                        stream: false,
                        format: 'json'
                    })
                },
                TIMEOUT_MS.CODE
            );

            if (!response.ok) {
                throw new Error(`Ollama API Error: ${response.statusText}`);
            }

            const data = await response.json();
            return JSON.parse(data.response);
        });

        return {
            content: parsed.explanation,
            files: parsed.files || []
        };

    } catch (error: any) {
        console.error('LLM Generation Failed:', error);
        return {
            content: `Failed to generate code via AI: ${error.message}`,
            files: [],
            error: true
        };
    }
}

export async function generateJSON(
    systemPrompt: string,
    userPrompt: string,
    schemaDescription: string,
    model: string = MODEL_CONFIG.SMART_MODEL
): Promise<any> {
    const fullPrompt = `
${systemPrompt}

Goal: ${userPrompt}

Return the response in the following JSON format ONLY, without any markdown formatting or explanation:
${schemaDescription}
`;

    if (process.env.MOCK_LLM === 'true') {
        console.log('[MockLLM] Generating JSON for prompt:', userPrompt);
        // Simple mock logic for Team Orchestrator
        if (systemPrompt.includes('COLLABORATION PROTOCOL')) {
            return {
                thought: "I will check the board and send a message.",
                actions: [
                    {
                        type: "send_message",
                        payload: { content: "Hello team, I am ready to work." }
                    }
                ]
            };
        }
        return JSON.parse(schemaDescription || '{}');
    }

    return withRetry(async () => {
        const response = await fetchWithTimeout(
            `${OLLAMA_BASE_URL}/api/generate`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: model,
                    prompt: fullPrompt,
                    stream: false,
                    format: 'json'
                })
            },
            TIMEOUT_MS.JSON
        );

        if (!response.ok) {
            throw new Error(`Ollama API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return JSON.parse(data.response);
    });
}
