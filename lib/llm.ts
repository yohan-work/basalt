import { MODEL_CONFIG, validateModels } from './model-config';
import { StreamEmitter } from './stream-emitter';
import { FileExtractor } from './extractor';
import {
    CODE_GENERATION_SYSTEM_RULES,
    FILE_FORMAT_INSTRUCTIONS,
    SURGICAL_FILE_EDIT_SYSTEM_RULES,
} from './prompts';
import http from 'http';
import { URL } from 'url';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

const TIMEOUT_MS = {
    CODE: 180_000,  // 180s (3m) for code generation (Reduced from 600s)
    JSON: 90_000,   // 90s for JSON generation
} as const;

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

export interface LLMResponse {
    content: string;
    files: Array<{ path: string; content: string }>;
    error?: boolean;
    tokens?: {
        prompt_eval_count: number;
        eval_count: number;
    };
}

export interface LLMTelemetryHooks {
    onRequestStart?: (meta: { mode: string; model: string }) => void;
    onTokenUsage?: (meta: {
        mode: string;
        model: string;
        promptTokens: number;
        completionTokens: number;
    }) => void;
    onRequestEnd?: (meta: { mode: string; model: string; latencyMs: number }) => void;
    onError?: (meta: { mode: string; model: string; message: string }) => void;
}

/**
 * Custom HTTP requester to bypass fetch timeout limitations (UND_ERR_HEADERS_TIMEOUT)
 */
async function ollamaRequest(
    urlStr: string,
    body: any,
    timeout: number,
    onResponse: (res: http.IncomingMessage) => Promise<void>
): Promise<void> {
    const url = new URL(urlStr);
    const bodyStr = JSON.stringify(body);
    console.log(`[LLM] Starting request to ${url.hostname}:${url.port}${url.pathname} (Model: ${body.model}, Body: ${Math.round(bodyStr.length / 1024)}KB, Timeout: ${timeout}ms)`);
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: timeout
        }, (res) => {
            console.log(`[LLM] Response status: ${res.statusCode} ${res.statusMessage}`);
            if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`Ollama API Error: ${res.statusCode} ${res.statusMessage}`));
                return;
            }
            onResponse(res).then(resolve).catch(reject);
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            const err = new Error('LLM request timed out (Headers/Body timeout)');
            err.name = 'AbortError';
            reject(err);
        });

        req.write(JSON.stringify(body));
        req.end();
    });
}

/**
 * Custom HTTP requester for streaming with heartbeat support
 */
async function ollamaStreamRequest(
    urlStr: string,
    body: any,
    timeout: number,
    onChunk: (chunk: any) => void,
    onHeartbeat?: () => void
): Promise<void> {
    const url = new URL(urlStr);
    const bodyStr = JSON.stringify(body);
    console.log(`[LLM] Starting STREAM request to ${url.hostname}:${url.port}${url.pathname} (Model: ${body.model}, Body: ${Math.round(bodyStr.length / 1024)}KB, Timeout: ${timeout}ms)`);
    return new Promise((resolve, reject) => {
        let lastHeartbeat = Date.now();
        let hbInterval: NodeJS.Timeout | null = null;

        if (onHeartbeat) {
            hbInterval = setInterval(() => {
                if (Date.now() - lastHeartbeat > 15_000) {
                    onHeartbeat();
                    lastHeartbeat = Date.now();
                }
            }, 5_000);
        }

        const cleanup = () => {
            if (hbInterval) clearInterval(hbInterval);
        };

        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            timeout: timeout
        }, (res) => {
            console.log(`[LLM] Stream response status: ${res.statusCode}`);
            if (res.statusCode && res.statusCode >= 400) {
                cleanup();
                reject(new Error(`Ollama API Error: ${res.statusCode}`));
                return;
            }

            let buffer = '';
            let chunkCount = 0;
            res.on('data', (chunk) => {
                if (chunkCount === 0) console.log(`[LLM] Stream: First chunk received.`);
                chunkCount++;

                // Active streaming updates heartbeat timestamp
                lastHeartbeat = Date.now();

                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            onChunk(JSON.parse(line));
                        } catch (e) {
                            // JSON parse error on partial line
                        }
                    }
                }
            });

            res.on('end', () => {
                if (buffer.trim()) {
                    try { onChunk(JSON.parse(buffer)); } catch (e) { }
                }
                cleanup();
                resolve();
            });
        });

        req.on('error', (err) => {
            cleanup();
            reject(err);
        });

        req.on('timeout', () => {
            req.destroy();
            cleanup();
            const err = new Error('AbortError');
            err.name = 'AbortError';
            reject(err);
        });

        req.write(bodyStr);
        req.end();
    });
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

            if (error.name === 'AbortError') {
                throw new Error(`LLM request timed out after attempt ${attempt + 1}. Consider reducing context.`);
            }

            if (attempt < maxRetries - 1) {
                const delay = baseDelay * Math.pow(2, attempt);
                console.warn(`LLM attempt ${attempt + 1} failed, retrying in ${delay}ms...`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new Error('All LLM retry attempts exhausted');
}

/**
 * Extract files from raw LLM text using FileExtractor
 */
export function extractFilesFromRaw(text: string): Array<{ path: string; content: string }> {
    return FileExtractor.extractAll(text);
}

export async function generateCode(
    prompt: string,
    context: string,
    model: string = MODEL_CONFIG.CODING_MODEL,
    techStack: string = 'nextjs',
    telemetry?: LLMTelemetryHooks
): Promise<LLMResponse> {
    validateModels();

    const systemPromptText = `${CODE_GENERATION_SYSTEM_RULES}\n\n${FILE_FORMAT_INSTRUCTIONS}`;
    
    const userPromptText = `
Task Context: The target tech stack is ${techStack}.

Context:
${context}

Task: ${prompt}
`;

    try {
        const startedAt = Date.now();
        telemetry?.onRequestStart?.({ mode: 'code', model });
        let fullText = '';
        let tokens: LLMResponse['tokens'] = undefined;
        await withRetry(async () => {
            await ollamaRequest(
                `${OLLAMA_BASE_URL}/api/generate`,
                { model, system: systemPromptText, prompt: userPromptText, stream: false },
                TIMEOUT_MS.CODE,
                async (res) => {
                    const chunks: any[] = [];
                    for await (const chunk of res) chunks.push(chunk);
                    const data = JSON.parse(Buffer.concat(chunks).toString());
                    fullText = data.response;
                    if (data.prompt_eval_count || data.eval_count) {
                        tokens = {
                            prompt_eval_count: data.prompt_eval_count || 0,
                            eval_count: data.eval_count || 0
                        };
                    }
                }
            );
        });

        const files = extractFilesFromRaw(fullText);
        const tokenMeta = tokens as { prompt_eval_count: number; eval_count: number } | undefined;
        if (tokenMeta) {
            telemetry?.onTokenUsage?.({
                mode: 'code',
                model,
                promptTokens: tokenMeta.prompt_eval_count,
                completionTokens: tokenMeta.eval_count,
            });
        }
        telemetry?.onRequestEnd?.({ mode: 'code', model, latencyMs: Date.now() - startedAt });
        
        return {
            content: fullText.split('File:')[0].trim(),
            files,
            tokens
        };

    } catch (error: any) {
        telemetry?.onError?.({ mode: 'code', model, message: error.message });
        console.error('LLM Generation Failed:', error);
        return {
            content: `Failed to generate code via AI: ${error.message}`,
            files: [],
            error: true
        };
    }
}

/**
 * Single-file minimal edit path for modify-element: avoids CODE_GENERATION_SYSTEM_RULES.
 */
export async function generateSurgicalFileEdit(
    prompt: string,
    context: string,
    model: string = MODEL_CONFIG.CODING_MODEL,
    techStack: string = 'nextjs',
    telemetry?: LLMTelemetryHooks
): Promise<LLMResponse> {
    validateModels();

    const systemPromptText = `${SURGICAL_FILE_EDIT_SYSTEM_RULES}\n\n${FILE_FORMAT_INSTRUCTIONS}`;

    const userPromptText = `
Task Context: The target tech stack is ${techStack}.

Context:
${context}

Task: ${prompt}
`;

    try {
        const startedAt = Date.now();
        telemetry?.onRequestStart?.({ mode: 'surgical-edit', model });
        let fullText = '';
        let tokens: LLMResponse['tokens'] = undefined;
        await withRetry(async () => {
            await ollamaRequest(
                `${OLLAMA_BASE_URL}/api/generate`,
                { model, system: systemPromptText, prompt: userPromptText, stream: false },
                TIMEOUT_MS.CODE,
                async (res) => {
                    const chunks: any[] = [];
                    for await (const chunk of res) chunks.push(chunk);
                    const data = JSON.parse(Buffer.concat(chunks).toString());
                    fullText = data.response;
                    if (data.prompt_eval_count || data.eval_count) {
                        tokens = {
                            prompt_eval_count: data.prompt_eval_count || 0,
                            eval_count: data.eval_count || 0
                        };
                    }
                }
            );
        });

        const files = extractFilesFromRaw(fullText);
        const tokenMeta = tokens as { prompt_eval_count: number; eval_count: number } | undefined;
        if (tokenMeta) {
            telemetry?.onTokenUsage?.({
                mode: 'surgical-edit',
                model,
                promptTokens: tokenMeta.prompt_eval_count,
                completionTokens: tokenMeta.eval_count,
            });
        }
        telemetry?.onRequestEnd?.({ mode: 'surgical-edit', model, latencyMs: Date.now() - startedAt });

        return {
            content: fullText.split('File:')[0].trim(),
            files,
            tokens
        };
    } catch (error: any) {
        telemetry?.onError?.({ mode: 'surgical-edit', model, message: error.message });
        console.error('[generateSurgicalFileEdit] Failed:', error);
        return {
            content: `Failed to generate surgical edit via AI: ${error.message}`,
            files: [],
            error: true
        };
    }
}

export async function generateText(
    systemPrompt: string,
    userPrompt: string,
    model: string = MODEL_CONFIG.SMART_MODEL,
    emitter: any = null,
    telemetry?: LLMTelemetryHooks
): Promise<string> {
    validateModels();
    const startedAt = Date.now();
    telemetry?.onRequestStart?.({ mode: 'text', model });
    try {
        const result = await withRetry(async () => {
            let fullText = '';
            await ollamaRequest(
                `${OLLAMA_BASE_URL}/api/generate`,
                { model, system: systemPrompt, prompt: userPrompt, stream: false },
                TIMEOUT_MS.JSON, // using JSON timeout as it's a general text task
                async (res) => {
                    const chunks: any[] = [];
                    for await (const chunk of res) chunks.push(chunk);
                    const data = JSON.parse(Buffer.concat(chunks).toString());
                    fullText = data.response;
                    const promptTokens = data.prompt_eval_count || 0;
                    const completionTokens = data.eval_count || 0;
                    if (promptTokens || completionTokens) {
                        telemetry?.onTokenUsage?.({
                            mode: 'text',
                            model,
                            promptTokens,
                            completionTokens,
                        });
                    }
                }
            );
            return fullText.trim();
        });
        telemetry?.onRequestEnd?.({ mode: 'text', model, latencyMs: Date.now() - startedAt });
        return result;
    } catch (error: any) {
        telemetry?.onError?.({ mode: 'text', model, message: error.message });
        throw error;
    }
}

export async function generateJSON(
    systemPrompt: string,
    userPrompt: string,
    schemaDescription: string,
    model: string = MODEL_CONFIG.SMART_MODEL,
    telemetry?: LLMTelemetryHooks
): Promise<any> {
    validateModels();

    const userPromptText = `Goal: ${userPrompt}\n\nReturn the response in the following JSON format ONLY:\n${schemaDescription}`;

    const startedAt = Date.now();
    telemetry?.onRequestStart?.({ mode: 'json', model });
    try {
        const result = await withRetry(async () => {
            let fullText = '';
            let tokens: { prompt_eval_count: number; eval_count: number } | undefined;
            await ollamaRequest(
                `${OLLAMA_BASE_URL}/api/generate`,
                { model, system: systemPrompt, prompt: userPromptText, stream: false },
                TIMEOUT_MS.JSON,
                async (res) => {
                    const chunks: any[] = [];
                    for await (const chunk of res) chunks.push(chunk);
                    const data = JSON.parse(Buffer.concat(chunks).toString());
                    fullText = data.response;
                    if (data.prompt_eval_count || data.eval_count) {
                        tokens = {
                            prompt_eval_count: data.prompt_eval_count || 0,
                            eval_count: data.eval_count || 0
                        };
                    }
                }
            );
            const parsed = JSON.parse(cleanJSON(fullText));
            if (tokens) {
                telemetry?.onTokenUsage?.({
                    mode: 'json',
                    model,
                    promptTokens: tokens.prompt_eval_count,
                    completionTokens: tokens.eval_count,
                });
                // Attach hidden metadata if possible, or we just rely on streaming for detailed tracking
                Object.defineProperty(parsed, '__tokens', {
                    value: tokens,
                    enumerable: false
                });
            }
            return parsed;
        });
        telemetry?.onRequestEnd?.({ mode: 'json', model, latencyMs: Date.now() - startedAt });
        return result;
    } catch (error: any) {
        telemetry?.onError?.({ mode: 'json', model, message: error.message });
        throw error;
    }
}

export function cleanJSON(text: string): string {
    if (!text) return '{}';
    let cleaned = text.trim();

    // 1. Strip markdown code blocks
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '');
    }

    // 2. Basic comment removal (handles // and /* */)
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '$1');

    // 3. SMART JSON RECOVERY & STRING NORMALIZATION
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escaped = false;
    let result = '';
    
    for (let i = 0; i < cleaned.length; i++) {
        const char = cleaned[i];
        
        if (char === '\\' && !escaped) {
            escaped = true;
            result += char;
            continue;
        }

        if (char === '"' && !escaped) {
            inString = !inString;
        }

        if (inString) {
            if (char === '\n') {
                result += '\\n'; // Escape literal newlines
            } else if (char === '\r') {
                // skip
            } else {
                result += char;
            }
        } else {
            if (char === '{') openBraces++;
            if (char === '}') openBraces--;
            if (char === '[') openBrackets++;
            if (char === ']') openBrackets--;
            result += char;
        }
        escaped = false;
    }
    
    cleaned = result;

    // Close open parts in reverse order
    if (inString) cleaned += '"';
    while (openBrackets > 0) { cleaned += ']'; openBrackets--; }
    while (openBraces > 0) { cleaned += '}'; openBraces--; }

    // 4. Remove trailing commas before closing braces/brackets
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

    // 5. Find first and last markers for either Object or Array
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    const lastBrace = cleaned.lastIndexOf('}');
    const lastBracket = cleaned.lastIndexOf(']');

    // Determine the start and end by taking the outermost valid JSON structure
    let start = -1;
    let end = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        // Starts with a brace
        start = firstBrace;
        end = lastBrace;
    } else if (firstBracket !== -1) {
        // Starts with a bracket
        start = firstBracket;
        end = lastBracket;
    }

    if (start !== -1 && end !== -1 && end > start) {
        cleaned = cleaned.substring(start, end + 1);
    }

    return cleaned.trim();
}

export async function generateCodeStream(
    prompt: string,
    context: string,
    emitter: StreamEmitter | null,
    model: string = MODEL_CONFIG.CODING_MODEL,
    techStack: string = 'nextjs',
    onHeartbeat?: () => void,
    telemetry?: LLMTelemetryHooks
): Promise<LLMResponse> {
    if (!emitter) {
        return generateCode(prompt, context, model, techStack);
    }

    validateModels();

    const systemPromptText = `${CODE_GENERATION_SYSTEM_RULES}\n\n${FILE_FORMAT_INSTRUCTIONS}`;

    const userPromptText = `
Task Context: The target tech stack is ${techStack}.

Context:
${context}

Task: ${prompt}
`;

    const startedAt = Date.now();
    try {
        telemetry?.onRequestStart?.({ mode: 'code_stream', model });
        let fullText = '';
        let tokens: LLMResponse['tokens'] = undefined;
        await withRetry(async () => {
            await ollamaStreamRequest(
                `${OLLAMA_BASE_URL}/api/generate`,
                { model, system: systemPromptText, prompt: userPromptText }, // NO format: 'json' here for speed
                TIMEOUT_MS.CODE,
                (chunk) => {
                    const token = chunk.response || '';
                    fullText += token;
                    if (chunk.prompt_eval_count || chunk.eval_count) {
                        tokens = {
                            prompt_eval_count: chunk.prompt_eval_count || 0,
                            eval_count: chunk.eval_count || 0
                        };
                    }
                    if (token && emitter) emitter.emit({ type: 'llm_token', token, context: 'code_generation' });
                },
                onHeartbeat
            );
        });

        if (emitter && typeof (emitter as any).emit === 'function') {
            (emitter as any).emit({ type: 'llm_complete', fullResponse: fullText.slice(0, 200), context: 'code_generation' });
        }

        let files = extractFilesFromRaw(fullText);

        // --- Retry if no files were extracted ---
        if (files.length === 0 && fullText.trim().length > 0) {
            console.warn(
                `[generateCodeStream] First pass produced no files. ` +
                `Raw output (first 500 chars):\n${fullText.slice(0, 500)}\n` +
                `Retrying with an explicit format reminder...`
            );

            const retryPrompt = `${userPromptText}

IMPORTANT: Your previous response did not include any files in the required format.
You MUST output every file using this EXACT format with NO exceptions:

File: path/to/file.ext
\`\`\`language
// file content here
\`\`\`

Do NOT write any explanatory text. Only output files using the format above.`;

            let retryText = '';
            try {
                await ollamaRequest(
                    `${OLLAMA_BASE_URL}/api/generate`,
                    { model, system: systemPromptText, prompt: retryPrompt, stream: false },
                    TIMEOUT_MS.CODE,
                    async (res) => {
                        const chunks: any[] = [];
                        for await (const chunk of res) chunks.push(chunk);
                        const data = JSON.parse(Buffer.concat(chunks).toString());
                        retryText = data.response || '';
                    }
                );
                files = extractFilesFromRaw(retryText);
                if (files.length > 0) {
                    console.log(`[generateCodeStream] Retry succeeded: extracted ${files.length} file(s).`);
                    fullText = retryText;
                } else {
                    console.warn(
                        `[generateCodeStream] Retry also produced no files. ` +
                        `Retry raw output (first 500 chars):\n${retryText.slice(0, 500)}`
                    );
                }
            } catch (retryErr: any) {
                console.error(`[generateCodeStream] Retry request failed: ${retryErr.message}`);
            }
        }

        const streamTokenMeta = tokens as { prompt_eval_count: number; eval_count: number } | undefined;
        if (streamTokenMeta) {
            telemetry?.onTokenUsage?.({
                mode: 'code_stream',
                model,
                promptTokens: streamTokenMeta.prompt_eval_count,
                completionTokens: streamTokenMeta.eval_count,
            });
        }
        return {
            content: fullText.split('File:')[0].trim(),
            files,
            tokens
        };
    } catch (error: any) {
        telemetry?.onError?.({ mode: 'code_stream', model, message: error.message });
        if (emitter && typeof (emitter as any).emit === 'function') {
            (emitter as any).emit({ type: 'error', message: error.message });
        }
        return { content: error.message, files: [], error: true };
    } finally {
        telemetry?.onRequestEnd?.({ mode: 'code_stream', model, latencyMs: Date.now() - startedAt });
    }
}


export async function generateJSONStream(
    systemPrompt: string,
    userPrompt: string,
    schemaDescription: string,
    emitter: StreamEmitter | null,
    model: string = MODEL_CONFIG.SMART_MODEL,
    onHeartbeat?: () => void,
    telemetry?: LLMTelemetryHooks
): Promise<any> {
    if (!emitter) {
        return generateJSON(systemPrompt, userPrompt, schemaDescription, model);
    }

    validateModels();

    const userPromptText = `Goal: ${userPrompt}\n\nReturn the response in the following JSON format ONLY:\n${schemaDescription}`;

    try {
        const startedAt = Date.now();
        telemetry?.onRequestStart?.({ mode: 'json_stream', model });
        let fullText = '';
        let tokens: { prompt_eval_count: number; eval_count: number } | undefined;
        await withRetry(async () => {
            await ollamaStreamRequest(
                `${OLLAMA_BASE_URL}/api/generate`,
                { model, system: systemPrompt, prompt: userPromptText },
                TIMEOUT_MS.JSON,
                (chunk) => {
                    const token = chunk.response || '';
                    fullText += token;
                    if (chunk.prompt_eval_count || chunk.eval_count) {
                        tokens = {
                            prompt_eval_count: chunk.prompt_eval_count || 0,
                            eval_count: chunk.eval_count || 0
                        };
                    }
                    if (token) emitter.emit({ type: 'llm_token', token, context: 'json_generation' });
                },
                onHeartbeat
            );
        });

        if (emitter && typeof (emitter as any).emit === 'function') {
            (emitter as any).emit({ type: 'llm_complete', fullResponse: fullText.slice(0, 200), context: 'json_generation' });
        }
        
        // --- SAFE JSON PARSING ---
        let result = {};
        try {
            result = JSON.parse(cleanJSON(fullText));
        } catch (parseError: any) {
            console.error(`[LLM] JSON Parse Error in generateJSONStream:`, parseError.message);
            console.error(`[LLM] Raw flawed text was:`, fullText.substring(0, 500) + '...');
            
            // In the context of consult_agents or arrays, returning `{ thoughts: [] }` or empty obj
            // Since we don't know the exact schema, returning empty object is safest fallback.
            // Extractor or consumer functions should handle empty or missing properties safely.
            result = {};
            Object.defineProperty(result, '__rawText', {
                value: fullText,
                enumerable: false,
            });
            Object.defineProperty(result, '__parseError', {
                value: parseError?.message || 'JSON parse failed',
                enumerable: false,
            });
        }

        if (tokens) {
            telemetry?.onTokenUsage?.({
                mode: 'json_stream',
                model,
                promptTokens: tokens.prompt_eval_count,
                completionTokens: tokens.eval_count,
            });
            Object.defineProperty(result, '__tokens', {
                value: tokens,
                enumerable: false
            });
        }
        telemetry?.onRequestEnd?.({ mode: 'json_stream', model, latencyMs: Date.now() - startedAt });
        return result;
    } catch (error: any) {
        telemetry?.onError?.({ mode: 'json_stream', model, message: error.message });
        if (emitter && typeof (emitter as any).emit === 'function') {
            (emitter as any).emit({ type: 'error', message: error.message });
        }
        throw error;
    }
}
