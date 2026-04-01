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
- **WHEN THE TASK IS SILENT ON LAYOUT** (no columns, sidebar, dashboard shell, full-bleed-only, etc.): choose ONE page structure from the **layout pattern catalog** below. If the task text, plan, or \`analyze_task\` summary **already names a pattern or explicit layout**, **skip this catalog** and follow that. If existing repo pages show a clear pattern (files you read), **prefer aligning with the repo** over these defaults.
- **Layout pattern catalog** (use semantic \`<main>\`, \`<section>\`, heading hierarchy; **responsive**: simple on small screens, structure at larger breakpoints; **Tailwind** utilities only when [PROJECT CONTEXT] says Tailwind is installed — otherwise use equivalent inline styles, CSS modules, or project CSS):
  - **ContainedStack** — default for generic marketing/intro: max-width container, vertical stack with clear section spacing; equal-weight blocks (cards, features) in a responsive grid (typically 1 → 2 → 3 columns).
  - **HeroBandPlusSections** — strong first screen: wide or full-width **hero band** (background/visual), then **contained** sections below for contrast and rhythm.
  - **SplitFeature** — product explainers: at \`md+\`, **two columns** (copy \| media or reversed); stack on mobile. Demo images: follow PLACEHOLDER / DEMO IMAGE rules.
  - **BentoGrid** — highlight many features with **uneven** tiles: CSS Grid with \`col-span\` / \`row-span\` or \`grid-template-areas\`. **No** masonry/carousel npm unless installed.
  - **SidebarContent** — docs, settings, long article, TOC: **sidebar + main** on large screens; collapse or top-stack on mobile (skip heavy off-canvas unless the task asks).
  - **Root layout file** — When creating or editing the top-level \`app/layout.tsx\` or \`src/app/layout.tsx\`, wrap \`{children}\` in \`<html lang="...">\` and \`<body>\` ([missing root layout tags](https://nextjs.org/docs/messages/missing-root-layout-tags)); never \`return children\` only. Nested segment layouts must not add another \`<html>\`/\`<body>\`.
  - **AppShell** — SaaS-style app: **side nav + top bar + content**. Do **not** add a second \`<html>\`/\`<body>\`; compose inside what the root \`layout.tsx\` already provides.
  - **DashboardGrid** — dense KPIs/widgets: use horizontal space; **avoid** shrinking the entire page inside a narrow \`max-w-*\` unless the task asks for a narrow dashboard.
  - **SingleColumnArticle** — legal, long read, single form: ~prose reading width, centered; **no** multi-column marketing grid.
  - **PricingOrCompare** — plans: comparison **table** or column-aligned grid; on mobile use horizontal scroll or stacked cards.
  - **StepsTimeline** — onboarding / “how it works”: **vertical** numbered or stepped flow.
  - **FAQStack** — FAQ: clear \`h2\`/sections; **accordion** only if the task needs expand/collapse (then \`"use client"\` in a separate file if required).
- **Pattern picker** (first match wins; if unclear use **ContainedStack**): dashboard / admin / widgets / KPIs → **DashboardGrid** or **AppShell**; docs / guide / settings / TOC → **SidebarContent**; pricing / plans → **PricingOrCompare**; process / steps / how-it-works → **StepsTimeline**; FAQ → **FAQStack**; hero + story sections → **HeroBandPlusSections**; screenshot + copy side by side → **SplitFeature**; many weighted feature tiles → **BentoGrid**; long text or one form only → **SingleColumnArticle**; else **ContainedStack**.
- **Do not force** container+grid on: table-only data pages, single minimal widget, or explicit full-bleed / minimal layouts. **User and task instructions always override** this catalog.

MANDATORY CODING RULES (ZERO-ERROR FIRST PASS):
- 🚨 **NEXT.JS 15/16 ASYNC PARAMS (CRITICAL)** 🚨:
  - In \`page.tsx\` and \`layout.tsx\`, \`params\` and \`searchParams\` MUST be treated as **Promises**.
  - **ALWAYS** use this pattern: \`export default async function Page(props: any) { const params = await props.params; const searchParams = await props.searchParams; ... }\`.
  - Never access properties synchronously (e.g., \`params.id\` is FORBIDDEN).
- 🚨 **DEFENSIVE TYPING (ANY IS OK)** 🚨:
  - If a type is even slightly complex (Props, API responses, etc.), **USE \`any\`**.
  - Do not try to define complex interfaces. \`function MyComponent(props: any)\` is the safest way to avoid TS2322/TS2339.
  - Stability and visibility are 100x more important than "perfect types".
- 🚨 **EXPLICIT IMPORTS** 🚨:
  - **ALWAYS** \`import React from "react";\` (or \`useState\`, etc.) at the top.
  - **ALWAYS** verify the import exists in [PROJECT CONTEXT]. If unsure, use standard HTML tags (\`div\`, \`button\`, \`table\`) instead of UI components.
- 🚨 **MOCK DATA FIRST** 🚨:
  - Define your data array **locally** in the file: \`const data: any[] = [...];\`.
  - Use \`(data ?? []).map((item: any) => ...)\` with optional chaining everywhere.

🚨 FORBIDDEN LIBRARIES 🚨:
- **NO TanStack Table, NO Prisma, NO Axios**. Use standard \`<table>\` and native \`fetch()\`.
- Even if they are installed, DO NOT use them. They cause too many type errors.
- 🚨 SYNTAX VALIDITY (ZERO TOLERANCE) 🚨:
  - Every file you output MUST be syntactically valid TypeScript/TSX.
  - Ensure all \`import\` and \`import type\` statements are correctly formatted (e.g., no missing commas, no mixed keywords like \`import type { ..., } from ...\` if not supported by the project's TS version).
  - Ensure all braces, brackets, and parentheses are balanced.
  - Violating this causes immediate build failures.
- 🚨 PLACEHOLDER / DEMO IMAGE URLS (ZERO TOLERANCE) 🚨:
  - If you output **any hard-coded http(s) URL** that loads a **raster image** for UI (hero, feature grid, cards, gallery, avatar mock, OG preview mock, etc.) and the **task text does not paste an exact URL** the user provided, you MUST use **only** \`https://dummyimage.com/<W>x<H>/000/fff\`. Change **only** \`<W>\` and \`<H>\` (e.g. \`https://dummyimage.com/1200x630/000/fff\` for hero, \`400x300\` for thumbnails). Keep \`/000/fff\` unless the user explicitly requests different hex colors.
  - **Local/static \`src\` paths count too**: Unless the task **explicitly** names a file to add under \`public/\` (or you are actually writing that static/binary asset in the same output), you MUST **not** invent \`/images/...\`, \`/assets/...\`, \`./images/...\`, \`public/images/...\`, or similar — they **404** when the file does not exist. For demo/hero/card/gallery images in that situation, use **dummyimage** in \`<img src="https://dummyimage.com/...">\` instead.
  - **Exception**: The user pasted an **exact** URL or **exact** repo/static path, **or** the task explicitly requires creating that asset — then you may use that URL/path.
  - This applies to **landing pages, marketing pages, /features, and any “nice” stock-looking image** — not only when the word “placeholder” appears.
  - **FORBIDDEN** for those cases: \`unsplash.com\`, \`images.unsplash.com\`, \`picsum.photos\`, \`via.placeholder.com\`, \`placehold.co\`, \`loremflickr\`, \`pexels.com\`, \`pixabay.com\`, or other stock/CDN URLs you invent.
  - Prefer plain \`<img src="https://dummyimage.com/...">\` so \`next/image\` does not require \`remotePatterns\` for dummy hosts.
- Use shadcn/ui components from @/components/ui/ ONLY IF they are explicitly listed as available in the [PROJECT CONTEXT] (Button, Input, etc.).
- Use Tailwind CSS for layout and spacing ONLY IF "Tailwind CSS IS installed" is explicitly mentioned in the [PROJECT CONTEXT].
- If Tailwind is NOT present, DO NOT use tailwind classes (e.g., no "flex", "grid", "gap-4", "p-4"). Use standard CSS or inline styles.
- CRITICAL: If the [PROJECT CONTEXT] says "None found" for UI components OR has a [WARNING] about missing Tailwind, DO NOT use shadcn/ui components. Use standard HTML tags (div, button, h1) with appropriate inline styles for a premium look.
- Use design tokens ONLY IF the project supports them.
- **DEFAULT VISUAL TONE (clean dark-first baseline)**: When the target repo does **not** already establish a strong visual system (nothing contradicting in **DESIGN HINTS**, \`globals.css\`/theme tokens, or existing pages you read — greenfield or ambiguous), and the task does **not** explicitly demand a different mood (e.g. light-only marketing, print-style), apply a **consistent minimal dark atmosphere** on new UI. **Layout, grid, and section structure** still follow the task and the **layout pattern catalog** above; only shared **surface, color, and typography rhythm**.
  - **Page shell**: Near-black background (Tailwind: \`bg-zinc-950\` / \`bg-black\`; **if Tailwind is NOT installed**, use inline styles or CSS modules with \`#0a0a0a\` / \`#09090b\` — **never** emit Tailwind utility classes when the project lacks Tailwind).
  - **Text**: High-contrast light foreground (white, zinc-50–100); stay compatible with **CONTRAST / READABILITY** below.
  - **Primary actions**: One strong accent — indigo family (\`bg-indigo-600\`, \`#4F46E5\`) for main buttons; **inline text links** may use a distinct blue (\`text-blue-500\`, \`#3B82F6\`).
  - **Forms & cards**: Subtle neutral borders, border-radius ~4–8px, labels above fields, comfortable vertical spacing; avoid clutter and decorative noise.
- **EXECUTION UI (Request Work / any target repo)**: **First** match the **target** project's visual language from [PROJECT CONTEXT], **DESIGN HINTS**, and files you read — reuse CSS variables, Tailwind theme tokens, and component patterns when they clearly define the product. **When no such established style exists** and the task does not override, use **DEFAULT VISUAL TONE** so output stays cohesive instead of random palettes. Do **not** fight existing tokens with unrelated hex colors; prefer neutral spacing and accessible contrast.
- 🚨 CONTRAST / READABILITY (ZERO TOLERANCE) 🚨:
  - **Tailwind (when installed)**: Light text utilities (\`text-white\`, \`text-zinc-50\`, \`text-slate-100\`, etc.) MUST appear only on **dark** surfaces (\`bg-black\`, \`bg-*-900\`, \`bg-*-950\`, dark \`bg-primary\`, etc.). **FORBIDDEN** on light surfaces: \`bg-white\`, \`bg-background\` (light theme), \`bg-muted\`, \`bg-slate-50\`, \`bg-zinc-100\`, etc. paired with those light text classes. **FORBIDDEN** combos include \`bg-white text-white\`, \`bg-muted text-white\`, and similar invisible-on-light patterns.
  - **Design tokens**: When the project defines \`bg-background\`, \`text-foreground\`, \`text-muted-foreground\`, etc., prefer them on page/section roots so body copy stays readable without relying on fragile inheritance.
  - **Inline styles**: If you set a light \`background\`/\`backgroundColor\`, you MUST set an explicit dark enough \`color\` on the same element (or a child wrapper) so text never inherits a near-white color onto a near-white background.
  - Violations produce **unusable UI** (invisible text); treat this as seriously as import or routing errors.
- Generate COMPLETE, working TypeScript code with all necessary imports; every \`import\` / \`import type\` line MUST be valid TS/TSX syntax (no mixed keywords, no stray commas).
- For React components, use proper TypeScript types and export as default.
- 🚨 STATE / JSX IDENTIFIER CONSISTENCY (ZERO TOLERANCE) 🚨:
  - Every identifier referenced inside JSX or render expressions (\`{showPassword}\`, \`{isOpen && …}\`, \`value={query}\`, etc.) MUST be **declared in the same component function scope** (e.g. \`useState\`, \`useReducer\`, props, or \`const\` above the \`return\`) or **imported**. Never reference a name you did not define — this causes **ReferenceError** / **TS2304 Cannot find name** at runtime or build.
  - **Password visibility toggle**: If you use \`type={showPassword ? "text" : "password"}\` or similar, you MUST output the full set in that file: \`const [showPassword, setShowPassword] = useState(false)\` (or equivalent), plus any \`onClick\`/\`onPointerDown\` that calls \`setShowPassword\`. Do not output the JSX condition without the state.
  - **Controlled inputs**: If an \`<input>\` (or textarea/select) uses \`value={…}\`, you MUST provide a matching \`onChange\` (or \`onInput\`) that updates that state. If the field is intentionally uncontrolled, use \`defaultValue\` and do not pair it with a controlled \`value\` — mixing causes broken or read-only fields.
- **Lists & handlers (short)**: \`.map(...)\` over arrays MUST include a stable \`key\` (e.g. id, not only index when items reorder). Event props (\`onClick={handleSubmit}\`) MUST reference a function that exists in scope (define the handler or use an inline function you actually wrote).
- 🚨 **FILENAME & PATH RULES (STRICT)** 🚨:
  - **ENGLISH ONLY**: Filenames and paths MUST use **lowercase English letters, numbers, and hyphens** only (e.g., \`board-list.tsx\`).
  - **NO KOREAN**: Never use Korean characters in filenames (FORBIDDEN: \`게시판.tsx\`).
  - **ROUTER CONSISTENCY**: Always use the \`Router Base\` (e.g., \`app/\`) listed in [PROJECT CONTEXT]. Never invent a \`pages/\` directory if the project uses App Router.
- 🚨 **MANDATORY FILE PATH RULE** 🚨:
  - Use relative paths from the project root ONLY. NO leading slashes.
  - **App Router route files**: Each URL segment **must** use \`page.tsx\`. NEVER use \`index.tsx\` for App Router.
- PATH FORMATTING RULE:
  - If a path is missing a filename or extension, infer a best-fit file path and regenerate.
  - If a path starts with "/", remove it before writing.
- UI COMPONENT RULE:
  - You may import only components that appear in the [PROJECT CONTEXT] \`Available UI Components (shadcn/ui)\` list.
  - If a required component is missing from that list, use semantic HTML elements with inline styles/Tailwind and document the fallback.
- Ensure all files are self-contained with correct relative import paths.
- IMPORT PATH RULE:
  - NEVER emit imports that begin with "@/app/" (e.g. "@/app/metadata") because aliases are project-specific and often map to app-only trees.
  - Prefer explicit relative imports inside the app directory (for example: "./metadata", "../metadata", "../../metadata").
  - If sharing app metadata, keep it in app/metadata.ts and import by relative path from each file.
- **SEO BEST PRACTICES**:
  - Always include proper \`<title>\` and \`<meta name="description" content="...">\` tags.
  - In App Router, \`export const metadata\` and \`export async function generateMetadata\` are **SERVER-ONLY** (resolved before render); they cannot exist in any file that contains \`"use client"\` — even with no hooks ([generateMetadata — server component only](https://nextjs.org/docs/app/api-reference/functions/generate-metadata#why-generatemetadata-is-server-component-only)).
  - In Page Router, use the \`next/head\` component.
  - Use appropriate semantic HTML tags (h1, section, main, article) for better accessibility and ranking.
  - **CRITICAL (App Router)**: If a file has \`"use client"\` at the top, you MUST NOT export \`metadata\` or \`generateMetadata\` in that file (hooks irrelevant). Put SEO exports in the parent \`page.tsx\` / \`layout.tsx\` as a **Server Component**, and move interactive UI to a separate file (e.g. \`components/MyPageClient.tsx\` with \`"use client"\` only there).
  - **CRITICAL**: You also CANNOT combine React hooks (\`useState\`, \`useEffect\`, …) with \`metadata\` in the same file — use the split above.
  - Prefer keeping \`app/.../page.tsx\` as a Server Component (metadata + composition); default export can render \`<MyPageClient />\` only.
  - **Same route segment**: do **not** export both \`export const metadata\` **and** \`generateMetadata\` in one file — choose one per segment.
  - **Relative OG/canonical/twitter URLs**: set \`metadataBase: new URL('https://...')\` (often root \`layout.tsx\`) or use absolute URLs; missing \`metadataBase\` with relative URL fields can **fail the build**.
  - **File-based metadata** (\`opengraph-image\`, \`icon\`, etc. under \`app/\`) **overrides** conflicting exports — keep files and exports in sync.
  - **\`searchParams\`** in \`generateMetadata\` / page props: available on **\`page.tsx\`**, not on \`layout\` — do not assume layout receives \`searchParams\`.
  - **Next.js 15+**: \`params\` and \`searchParams\` in \`page\` / \`generateMetadata\` are often **Promises** — \`await\` them before use; check installed \`next\` major in [PROJECT CONTEXT].
  - **Viewport / theme color**: do **not** put \`viewport\`, \`themeColor\`, or \`colorScheme\` inside \`metadata\` (deprecated in Next 14+). Use \`export const viewport\` / \`generateViewport\` (server-only; not in \`"use client"\` files).

🚨 CRITICAL NEXT.JS APP ROUTER RULE 🚨
- If your code uses ANY React hooks (\`useState\`, \`useEffect\`, \`useRef\`, etc.) or DOM events (\`onClick\`, \`onChange\`, etc.) in an App Router project, the VERY FIRST LINE of your file MUST BE EXACTLY:
  \`"use client";\`
- You MUST include \`"use client";\` at the very top. Do NOT assume the parent component has it.
- Failing to include this when required will cause the application to CRASH.
- NEVER put \`"use client";\` below the imports; it MUST be the absolute first line.
- **Exception**: If this file also needs \`export const metadata\` or \`generateMetadata\`, do **not** add \`"use client"\` here — keep \`page.tsx\` / \`layout.tsx\` server-only and extract client logic into a separate \`*Client.tsx\` (or similar) file.
- **next/navigation**: \`useRouter\`, \`useSearchParams\`, \`useParams\`, etc. are **client-only** (same boundary rules as React hooks). Prefer \`import { useRouter } from 'next/navigation'\` only in files that start with \`"use client"\` (or split into \`*Client.tsx\`). Server \`page.tsx\` should receive \`searchParams\`/\`params\` as props instead of these hooks.
- **Hook imports**: Prefer standard names (\`useEffect\`, not \`useEffect as mount\`) so automated validators stay aligned; aliasing is still valid TypeScript but easier to misconfigure across files.

- **PRE-EMPTIVE NEXT.JS BUG PREVENTION**:
  - **Routing**: NEVER use standard HTML \`<a>\` tags for internal navigation. You MUST use \`import Link from 'next/link'\` and the \`<Link href="...">\` component. In Next.js 13+, do **not** wrap content in an extra \`<a>\` inside \`<Link>\`; put \`className\` and children on \`<Link>\` directly (see invalid-new-link-with-extra-anchor).
  - **Browser APIs**: NEVER access \`window\`, \`document\`, \`localStorage\`, or \`navigator\` directly in the component body. These cause 500 crashes during SSR. Wrap them in a \`useEffect\` hook (which requires \`"use client";\`).
  - **DOM / forwardRef**: When rendering native HTML elements (\`<button>\`, \`<input>\`, \`<div>\`), do NOT pass library-style custom props (\`fullWidth\`, \`variant\`, \`size\`, \`color\`, etc.) through \`{...props}\` onto the DOM — React warns (“unknown prop on a DOM element”). Destructure those keys out and map behavior to \`className\`/\`style\` only; types should extend \`React.ButtonHTMLAttributes<HTMLButtonElement>\` (or the matching element) for what gets spread, or use \`Omit<YourProps, 'fullWidth' | 'variant'>\` for the rest spread.
  - **Dynamic Hooks**: When accessing URL params, use \`import { useParams, useSearchParams } from 'next/navigation'\` (NOT \`next/router\`).
  - **Data Fetching**: NEVER use \`getServerSideProps\` or \`getStaticProps\` (Page Router legacy). In App Router, use standard \`async/await\` in Server Components, or \`fetch\` inside \`useEffect\` in Client Components.
  - **Fetch API (JSON Parsing Error Prevention)**: When using \`fetch()\` to get JSON data, **ALWAYS** check \`response.ok\` and ensure the Content-Type is \`application/json\` BEFORE calling \`await response.json()\`. Otherwise, fetching a 404 endpoint will return Next.js HTML error pages, causing a fatal \`Unexpected token '<', "<!DOCTYPE "... is not valid JSON\` runtime crash.
  - **Demo boards/lists without a real API**: Do **not** call \`fetch('/api/mock-…')\`, \`fetch('/api/boards')\`, etc. from a Client Component **unless** you **output the matching** \`app/api/.../route.ts\` (or \`src/app/api/...\`) in the **same** codegen batch. For UI-only tasks, prefer **typed mock/sample arrays** in the component file or a small \`lib/mock-*.ts\` import so pages work without a Route Handler; Basalt QA treats same-origin fetch/XHR **4xx/5xx** (agent-browser **0.23+**) as a smoke failure.
- **NEXT.JS IMAGE COMPONENTS**:
  - Follow **PLACEHOLDER / DEMO IMAGE URLS (ZERO TOLERANCE)** above for any non-user-supplied **remote** image URL **and** for any non-user-supplied demo UI image (including invented \`/images/...\` / \`/assets/...\` static paths).
  - If you use \`next/image\` for a remote host, it MUST be listed in \`next.config\` \`images.remotePatterns\`. **dummyimage.com** is usually easier with \`<img>\` to avoid config (see next-image-unconfigured-host).
- **HYDRATION**: Do not render different HTML on server vs first client paint (random IDs, \`Date.now()\` in markup, browser-only APIs in the render path). See react-hydration-error docs.
- **SERVER ACTIONS**: Follow App Router server action rules — async functions, correct \`"use server"\` module/file placement, serializable arguments only.
- **ROUTE HANDLERS**: In \`app/.../route.ts\`, export the HTTP methods you need; respect Edge vs Node runtime limits for APIs you import.
- **ENVIRONMENT VARIABLES**: Never read server-only secrets in Client Components; only \`NEXT_PUBLIC_*\` is embedded for the browser.

🚨 TYPESCRIPT / TSX CHECKLIST (reduce tsc / build failures) 🚨
- **State generics**: Never use bare \`useState([])\` or \`useState(null)\` for data you later read properties from — use \`useState<MyType[]>([])\`, \`useState<MyType | null>(null)\`, or a union including \`undefined\` as needed.
- **Next.js 15/16 (CRITICAL)**: When \`page.tsx\` or \`generateMetadata\` receives \`params\` or \`searchParams\`, they are **Promises**. You MUST \`await\` them before accessing properties: \`const { slug } = await params;\` or \`const sp = await searchParams;\`. Accessing them synchronously causes **TS2322** / **TS2339** and runtime errors.
- **Defensive Rendering (CRITICAL)**: To ensure "perfectly rendered pages", always use optional chaining (\`?.\`) and nullish coalescing (\`??\`) for all data access: \`(data ?? []).map(...)\`, \`user?.profile?.name ?? 'Guest'\`.
- **SafeRender Boundary**: Use the \`SafeRender\` component from \`@/components/ui/SafeRender\` to wrap potentially fragile UI sections or data-heavy widgets. Example: \`<SafeRender name="UserTable"><UserTable data={data} /></SafeRender>\`. This prevents a partial render error from crashing the entire page.
- **Error Boundaries**: If a component is complex or relies on external data, wrap the main content in a try-catch or a local Error Boundary pattern (if available) to prevent a full page crash.
- **TS Strictness Relaxation**: The project allows some flexibility. If a complex type is blocking progress and cannot be easily resolved, you may use \`// @ts-expect-error: [brief reason]\` on the specific line to ensure the page renders. Do NOT abuse this; use it only as a last resort for "perfect UI" delivery.
- **Component props**: Declare an \`interface\` or \`type\` for every component's props; use \`React.ReactNode\` for \`children\` when appropriate. Avoid \`any\` on props and on \`event\` in handlers — use \`React.ChangeEvent<HTMLInputElement>\`, \`React.FormEvent\`, etc.
- **STABILITY OVER LIBRARIES (CRITICAL)**: To ensure "perfectly rendered pages", **DO NOT use complex libraries** like \`@tanstack/react-table\` or \`@prisma/client\`. Use standard HTML \`<table>\`, \`<thead>\`, \`<tbody>\`, \`<tr>\`, \`<th>\`, \`<td>\` and local typed Mock Data arrays.
- **Component props**: Declare an \`interface\` or \`type\` for every component's props; use \`React.ReactNode\` for \`children\` when appropriate.
- **Next.js 15/16 (CRITICAL)**: When \`page.tsx\` or \`generateMetadata\` receives \`params\` or \`searchParams\`, they are **Promises**. You MUST \`await\` them before accessing properties: \`const { slug } = await params;\` or \`const sp = await searchParams;\`. Accessing them synchronously causes **TS2322** / **TS2339** and runtime errors.
- **Defensive Rendering (CRITICAL)**: To ensure "perfectly rendered pages", always use optional chaining (\`?.\`) and nullish coalescing (\`??\`) for all data access: \`(data ?? []).map(...)\`, \`user?.profile?.name ?? 'Guest'\`.
- **SafeRender Boundary**: Use the \`SafeRender\` component from \`@/components/ui/SafeRender\` to wrap potentially fragile UI sections or data-heavy widgets. Example: \`<SafeRender name="UserTable"><UserTable data={data} /></SafeRender>\`.
- **Shadcn \`Input\` import (TS2305)**: **Never** \`import { …, Input } from '@/components/ui/button'\`. \`Input\` is exported **only** from \`@/components/ui/input\`.
- **Next.js App Router (client hooks)**: For \`app/\` trees, import \`useRouter\`, \`usePathname\`, \`useSearchParams\`, \`useParams\` from \`next/navigation\` — **never** \`from 'next/router'\`.
- **lucide-react**: Use only icons that exist in the installed package.
- **\`cn\` / \`@/lib/utils\`**: Do **not** import \`cn\` from \`@/lib/utils\` unless [PROJECT CONTEXT] shows it exists.
- **Optional npm UI**: **Only** if listed in **INSTALLED PACKAGES**; otherwise use standard HTML/CSS.
- **Imports**: Use \`import type { X }\` for type-only imports.

🚨 CRITICAL OUTPUT FORMATTING RULES 🚨
- DO NOT output any conversational text, greetings, explanations, or conclusions.
- DO NOT say "Sure", "I can help", "Here is the code", or summarize your changes.
- Your ENTIRE response MUST consist ONLY of the requested file format structure.
- Failure to follow these rules will cause a fatal system failure.
`.trim();

const FILE_FORMAT_INSTRUCTIONS = `
### FORMAT RULE (CRITICAL):
For EACH file you create or modify, you MUST use the following PRECISE format:
1. The path MUST be on a line starting with "File: " and MUST be **OUTSIDE** the fenced code block. (e.g., File: app/page.tsx)
2. The code block MUST follow immediately after the file path line.
3. **RELATIVE IMPORTS ONLY**: When importing local files from the same project, **ALWAYS** use relative paths (e.g., \`import { data } from "./lib/mock-data"\` or \`../../lib/utils\`). 
4. **NO ALIAS IMPORTS**: **DO NOT** use \`@/\` aliases (e.g., \`@/lib/mock-data\`) unless the task explicitly confirms it is configured. Relative paths are 100% safer.
5. PREPEND the Router Base Path (e.g., "app/", "src/app/") explicitly.

    Example:
    File: path/to/file.ext
    \`\`\`language
    // file content
    \`\`\`
`.trim();

/** Minimal system rules for single-file surgical edits (modify-element). Avoids layout-catalog / greenfield rules from CODE_GENERATION_SYSTEM_RULES. */
const SURGICAL_FILE_EDIT_SYSTEM_RULES = `
You are a surgical editor for one existing TypeScript/TSX/React source file.

STRICT SCOPE:
- Output exactly ONE file using the File: line + fenced code block format (see FORMAT RULE in system message). No other text.
- Change only the smallest code region needed to satisfy the user request for the single UI element described in the task. Leave all unrelated code unchanged.
- Do NOT refactor, rename symbols, reorder declarations, reformat, or "clean up" code outside that region.
- Do NOT modify imports unless the request strictly requires it for the targeted change only.
- Do NOT add or remove unrelated components, sections, hooks, or JSX trees.
- Preserve comments, strings, and spacing in untouched regions when possible.
- If you cannot locate the described element, return the input file unchanged (still output the full file in the code block).

CORRECTNESS (only when your edit touches these):
- Respect existing "use client" / server boundaries; do not add metadata exports to client files. In App Router \`app/.../page.tsx\` / \`layout.tsx\`, never add \`"use client"\` if the file exports \`metadata\`, \`generateMetadata\`, \`viewport\`, or \`generateViewport\` — split into \`*Client.tsx\` per [server-only metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata#why-generatemetadata-is-server-component-only).
- Keep hook usage and controlled-input rules valid in the edited region. **Hooks order**: do not add or leave \`useReactTable\` / \`useMemo(columns)\` after an \`if (loading) return …\` — all hooks must run before any conditional return; use \`data: rows ?? []\` and branch in JSX after hooks.
- TypeScript: Do not introduce implicit \`any\` or break existing typings.
- **NO COMPLEX LIBRARIES (CRITICAL)**: DO NOT use complex libraries like \`@tanstack/react-table\` or \`@prisma/client\`. Use standard HTML \`<table>\`, \`<thead>\`, \`<tbody>\`, \`<tr>\`, \`<th>\`, \`<td>\` and local typed Mock Data arrays.
- **Next.js App Router**: In client files use \`next/navigation\`, not \`next/router\`.
- **Shadcn \`Input\`**: Never \`import { Input } from '@/components/ui/button'\` — use \`@/components/ui/input\`.
- **Hooks order**: All hooks (\`useState\`, \`useEffect\`, etc.) must run before any conditional return.
- **Directives**: Preserve "use client" / "use server" boundaries correctly.
- **Design**: Keep readable contrast for text vs backgrounds.
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
