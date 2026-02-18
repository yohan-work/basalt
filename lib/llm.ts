
import { MODEL_CONFIG, validateModels } from './model-config';
import { StreamEmitter } from './stream-emitter';

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
    validateModels();
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
    validateModels();

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

// ============================================================
// Streaming variants — used when a StreamEmitter is available
// ============================================================

/**
 * Read an NDJSON stream from Ollama (stream: true) and accumulate tokens.
 * Each line is a JSON object with a `response` field containing the token.
 */
async function readOllamaStream(
    response: Response,
    emitter: StreamEmitter | null,
    context: string
): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body to stream');

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines (NDJSON: one JSON object per line)
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const chunk = JSON.parse(line);
                const token = chunk.response || '';
                fullText += token;

                if (emitter && token) {
                    emitter.emit({ type: 'llm_token', token, context });
                }
            } catch {
                // Malformed JSON line; skip
            }
        }
    }

    // Process remaining buffer
    if (buffer.trim()) {
        try {
            const chunk = JSON.parse(buffer);
            const token = chunk.response || '';
            fullText += token;
            if (emitter && token) {
                emitter.emit({ type: 'llm_token', token, context });
            }
        } catch {
            // Ignore
        }
    }

    return fullText;
}

/**
 * Generate code with streaming — emits tokens via StreamEmitter.
 * Falls back to non-streaming generateCode if no emitter provided.
 */
export async function generateCodeStream(
    prompt: string,
    context: string,
    emitter: StreamEmitter | null,
    model: string = MODEL_CONFIG.CODING_MODEL
): Promise<LLMResponse> {
    if (!emitter) {
        return generateCode(prompt, context, model);
    }

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
        const response = await fetchWithTimeout(
            `${OLLAMA_BASE_URL}/api/generate`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    prompt: fullPrompt,
                    stream: true,
                    format: 'json'
                })
            },
            TIMEOUT_MS.CODE
        );

        if (!response.ok) {
            throw new Error(`Ollama API Error: ${response.statusText}`);
        }

        const fullText = await readOllamaStream(response, emitter, 'code_generation');
        emitter.emit({ type: 'llm_complete', fullResponse: fullText.slice(0, 200), context: 'code_generation' });

        const parsed = JSON.parse(fullText);
        return {
            content: parsed.explanation,
            files: parsed.files || []
        };

    } catch (error: any) {
        console.error('LLM Stream Generation Failed:', error);
        emitter.emit({ type: 'error', message: `LLM stream failed: ${error.message}` });
        return {
            content: `Failed to generate code via AI: ${error.message}`,
            files: [],
            error: true
        };
    }
}

/**
 * Generate JSON with streaming — emits tokens via StreamEmitter.
 * Falls back to non-streaming generateJSON if no emitter provided.
 */
export async function generateJSONStream(
    systemPrompt: string,
    userPrompt: string,
    schemaDescription: string,
    emitter: StreamEmitter | null,
    model: string = MODEL_CONFIG.SMART_MODEL
): Promise<any> {
    if (!emitter) {
        return generateJSON(systemPrompt, userPrompt, schemaDescription, model);
    }

    if (process.env.MOCK_LLM === 'true') {
        return generateJSON(systemPrompt, userPrompt, schemaDescription, model);
    }

    const fullPrompt = `
${systemPrompt}

Goal: ${userPrompt}

Return the response in the following JSON format ONLY, without any markdown formatting or explanation:
${schemaDescription}
`;

    const response = await fetchWithTimeout(
        `${OLLAMA_BASE_URL}/api/generate`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt: fullPrompt,
                stream: true,
                format: 'json'
            })
        },
        TIMEOUT_MS.JSON
    );

    if (!response.ok) {
        throw new Error(`Ollama API Error: ${response.statusText}`);
    }

    const fullText = await readOllamaStream(response, emitter, 'json_generation');
    emitter.emit({ type: 'llm_complete', fullResponse: fullText.slice(0, 200), context: 'json_generation' });

    return JSON.parse(fullText);
}
