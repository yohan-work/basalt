import { MODEL_CONFIG, validateModels } from './model-config';
import { StreamEmitter } from './stream-emitter';
import { FileExtractor } from './extractor';
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

const CODE_GENERATION_SYSTEM_RULES = `
You are an expert AI software engineer specializing in Next.js, React, and TypeScript.

GENERAL PRINCIPLE:
- **BE FLEXIBLE**: Follow the exact layout and structure requested in the task. If a specific layout (grid, vertical, etc.) or section ordering is requested, implement it precisely.
- Do NOT stick to a fixed template. Adapt your component choices to the specific requirements.

MANDATORY CODING RULES:
- Use shadcn/ui components from @/components/ui/ as high-quality building blocks (Button, Input, Label, Card, etc.).
- Use Tailwind CSS for layout and spacing ONLY IF "Tailwind CSS IS installed" is explicitly mentioned in the [PROJECT CONTEXT].
- If Tailwind is NOT present, DO NOT use tailwind classes (e.g., no "flex", "grid", "gap-4", "p-4"). Use standard CSS or inline styles.
- CRITICAL: If the [PROJECT CONTEXT] has a [WARNING] about shadcn/ui and missing Tailwind, DO NOT use those UI components if they rely on tailwind. Use standard HTML tags (div, button, h1) with appropriate inline styles for a premium look.
- Use design tokens ONLY IF the project supports them.
- Generate COMPLETE, working TypeScript code with all necessary imports.
- For React components, use proper TypeScript types and export as default.
- MANDATORY: Use relative paths from the project root ONLY. NO leading slashes (e.g. use "app/page.tsx", NOT "/app/page.tsx").
- Respect the existing project structure (app/ vs pages/).
- Ensure all files are self-contained with correct relative import paths.
`.trim();

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
    techStack: string = 'nextjs'
): Promise<LLMResponse> {
    validateModels();

    const fullPrompt = `
${CODE_GENERATION_SYSTEM_RULES}

### FORMAT RULE:
Provide your response as a brief explanation followed by the files. 
For EACH file, you MUST use the following PRECISE format. DO NOT use markdown headers (###) or bolding (**) for the "File:" line:
File: path/to/file.ext
\`\`\`language
file content
\`\`\`

Context:
${context}

Task: ${prompt}
`;

    try {
        let fullText = '';
        await withRetry(async () => {
            await ollamaRequest(
                `${OLLAMA_BASE_URL}/api/generate`,
                { model, prompt: fullPrompt, stream: false },
                TIMEOUT_MS.CODE,
                async (res) => {
                    const chunks: any[] = [];
                    for await (const chunk of res) chunks.push(chunk);
                    const data = JSON.parse(Buffer.concat(chunks).toString());
                    fullText = data.response;
                }
            );
        });

        const files = extractFilesFromRaw(fullText);
        return {
            content: fullText.split('File:')[0].trim(),
            files
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

    const fullPrompt = `${systemPrompt}\n\nGoal: ${userPrompt}\n\nReturn the response in the following JSON format ONLY:\n${schemaDescription}`;

    return withRetry(async () => {
        let fullText = '';
        await ollamaRequest(
            `${OLLAMA_BASE_URL}/api/generate`,
            { model, prompt: fullPrompt, stream: false, format: 'json' },
            TIMEOUT_MS.JSON,
            async (res) => {
                const chunks: any[] = [];
                for await (const chunk of res) chunks.push(chunk);
                const data = JSON.parse(Buffer.concat(chunks).toString());
                fullText = data.response;
            }
        );
        return JSON.parse(cleanJSON(fullText));
    });
}

export function cleanJSON(text: string): string {
    if (!text) return '{}';
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '');
    }
    // Remove potential leading/trailing non-JSON text
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
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
    onHeartbeat?: () => void
): Promise<LLMResponse> {
    if (!emitter) {
        return generateCode(prompt, context, model, techStack);
    }

    validateModels();

    const fullPrompt = `
${CODE_GENERATION_SYSTEM_RULES}

### FORMAT RULE:
Provide your response as a brief explanation followed by the files. 
For EACH file, you MUST use the following PRECISE format. DO NOT use markdown headers (###) or bolding (**) for the "File:" line:
File: path/to/file.ext
\`\`\`language
file content
\`\`\`

Context:
${context}

Task: ${prompt}
`;

    try {
        let fullText = '';
        await withRetry(async () => {
            await ollamaStreamRequest(
                `${OLLAMA_BASE_URL}/api/generate`,
                { model, prompt: fullPrompt }, // NO format: 'json' here for speed
                TIMEOUT_MS.CODE,
                (chunk) => {
                    const token = chunk.response || '';
                    fullText += token;
                    if (token && emitter) emitter.emit({ type: 'llm_token', token, context: 'code_generation' });
                },
                onHeartbeat
            );
        });

        if (emitter) emitter.emit({ type: 'llm_complete', fullResponse: fullText.slice(0, 200), context: 'code_generation' });

        const files = extractFilesFromRaw(fullText);
        return {
            content: fullText.split('File:')[0].trim(),
            files
        };
    } catch (error: any) {
        if (emitter) emitter.emit({ type: 'error', message: error.message });
        return { content: error.message, files: [], error: true };
    }
}

export async function generateJSONStream(
    systemPrompt: string,
    userPrompt: string,
    schemaDescription: string,
    emitter: StreamEmitter | null,
    model: string = MODEL_CONFIG.SMART_MODEL,
    onHeartbeat?: () => void
): Promise<any> {
    if (!emitter) {
        return generateJSON(systemPrompt, userPrompt, schemaDescription, model);
    }

    validateModels();

    const fullPrompt = `${systemPrompt}\n\nGoal: ${userPrompt}\n\nReturn the response in the following JSON format ONLY:\n${schemaDescription}`;

    try {
        let fullText = '';
        await withRetry(async () => {
            await ollamaStreamRequest(
                `${OLLAMA_BASE_URL}/api/generate`,
                { model, prompt: fullPrompt, format: 'json' },
                TIMEOUT_MS.JSON,
                (chunk) => {
                    const token = chunk.response || '';
                    fullText += token;
                    if (token) emitter.emit({ type: 'llm_token', token, context: 'json_generation' });
                },
                onHeartbeat
            );
        });

        if (emitter) emitter.emit({ type: 'llm_complete', fullResponse: fullText.slice(0, 200), context: 'json_generation' });
        return JSON.parse(cleanJSON(fullText));
    } catch (error: any) {
        if (emitter) emitter.emit({ type: 'error', message: error.message });
        throw error;
    }
}
