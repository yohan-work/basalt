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

const CODE_GENERATION_SYSTEM_RULES = `
You are an expert AI software engineer specializing in Next.js, React, and TypeScript.

GENERAL PRINCIPLE:
- **BE FLEXIBLE**: Follow the exact layout and structure requested in the task. If a specific layout (grid, vertical, etc.) or section ordering is requested, implement it precisely.
- Do NOT stick to a fixed template. Adapt your component choices to the specific requirements.

MANDATORY CODING RULES:
- Use shadcn/ui components from @/components/ui/ ONLY IF they are explicitly listed as available in the [PROJECT CONTEXT] (Button, Input, etc.).
- Use Tailwind CSS for layout and spacing ONLY IF "Tailwind CSS IS installed" is explicitly mentioned in the [PROJECT CONTEXT].
- If Tailwind is NOT present, DO NOT use tailwind classes (e.g., no "flex", "grid", "gap-4", "p-4"). Use standard CSS or inline styles.
- CRITICAL: If the [PROJECT CONTEXT] says "None found" for UI components OR has a [WARNING] about missing Tailwind, DO NOT use shadcn/ui components. Use standard HTML tags (div, button, h1) with appropriate inline styles for a premium look.
- Use design tokens ONLY IF the project supports them.
- Generate COMPLETE, working TypeScript code with all necessary imports.
- For React components, use proper TypeScript types and export as default.
- MANDATORY FILE PATH RULE: Use relative paths from the project root ONLY. NO leading slashes (e.g. use "app/some-feature/page.tsx", NOT "/app/some-feature/page.tsx"). YOU MUST prepend the Router Base Path (e.g., "src/app/", "app/", "src/pages/", "pages/") explicitly mentioned in the [PROJECT CONTEXT].
- CRITICAL PATH MAPPING RULE: If the user explicitly requests to create a new page at a specific route (e.g., "/post"), you MUST place the file at the correct subfolder path (e.g., "app/post/page.tsx" or "src/app/post/page.tsx"). DO NOT override the root "app/page.tsx" or "src/app/page.tsx" unless the user explicitly asks to edit the Home/Root page.
- Ensure all files are self-contained with correct relative import paths.
- **SEO BEST PRACTICES**:
  - Always include proper \`<title>\` and \`<meta name="description" content="...">\` tags.
  - In App Router, use the \`export const metadata = { title: '...', description: '...' }\` pattern.
  - In Page Router, use the \`next/head\` component.
  - Use appropriate semantic HTML tags (h1, section, main, article) for better accessibility and ranking.
  - **CRITICAL**: In App Router, you CANNOT use React hooks (\`useState\`, \`useEffect\`, \`useRef\`) and export \`metadata\` in the same file. Combining them causes a FATAL BUILD ERROR.
  - Prefer keeping pages as Server Components (no hooks) for better SEO and performance.

🚨 CRITICAL NEXT.JS APP ROUTER RULE 🚨
- If your code uses ANY React hooks (\`useState\`, \`useEffect\`, \`useRef\`, etc.) or DOM events (\`onClick\`, \`onChange\`, etc.) in an App Router project, the VERY FIRST LINE of your file MUST BE EXACTLY:
  \`"use client";\`
- You MUST include \`"use client";\` at the very top. Do NOT assume the parent component has it.
- Failing to include this when required will cause the application to CRASH.
- NEVER put \`"use client";\` below the imports; it MUST be the absolute first line.

- **PRE-EMPTIVE NEXT.JS BUG PREVENTION**:
  - **Routing**: NEVER use standard HTML \`<a>\` tags for internal navigation. You MUST use \`import Link from 'next/link'\` and the \`<Link href="...">\` component.
  - **Browser APIs**: NEVER access \`window\`, \`document\`, \`localStorage\`, or \`navigator\` directly in the component body. These cause 500 crashes during SSR. Wrap them in a \`useEffect\` hook (which requires \`"use client";\`).
  - **Dynamic Hooks**: When accessing URL params, use \`import { useParams, useSearchParams } from 'next/navigation'\` (NOT \`next/router\`).
  - **Data Fetching**: NEVER use \`getServerSideProps\` or \`getStaticProps\` (Page Router legacy). In App Router, use standard \`async/await\` in Server Components, or \`fetch\` inside \`useEffect\` in Client Components.
  - **Fetch API (JSON Parsing Error Prevention)**: When using \`fetch()\` to get JSON data, **ALWAYS** check \`response.ok\` and ensure the Content-Type is \`application/json\` BEFORE calling \`await response.json()\`. Otherwise, fetching a 404 endpoint will return Next.js HTML error pages, causing a fatal \`Unexpected token '<', "<!DOCTYPE "... is not valid JSON\` runtime crash.
- **NEXT.JS IMAGE COMPONENTS**:
  - If you need to use placeholder images from external URLs (e.g., \`via.placeholder.com\`, \`unsplash.com\`), **DO NOT** use the Next.js \`<Image>\` component (\`next/image\`). It will cause a runtime error because the hostname is not configured in \`next.config.js\`.
  - Instead, use a standard HTML \`<img>\` tag with appropriate styling for external placeholder images.

🚨 CRITICAL OUTPUT FORMATTING RULES 🚨
- DO NOT output any conversational text, greetings, explanations, or conclusions.
- DO NOT say "Sure", "I can help", "Here is the code", or summarize your changes.
- Your ENTIRE response MUST consist ONLY of the requested file format structure.
- Failure to follow these rules will cause a fatal system failure.
`.trim();

const FILE_FORMAT_INSTRUCTIONS = `
### FORMAT RULE:
For EACH file you create or modify, you MUST use the following PRECISE format.
1. The path MUST be on a line starting with "File: " and MUST NOT contain a leading slash. Target the correct framework directory (e.g. File: src/app/route/page.tsx).
2. The code block MUST follow immediately after the file path line.
3. DO NOT use markdown headers(###) or bolding(**) for the "File:" line.

    Example:
    File: path/to/file.ext
    \`\`\`language
    // file content
    \`\`\`
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
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '');
    }

    // Find first and last markers for either Object or Array
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
