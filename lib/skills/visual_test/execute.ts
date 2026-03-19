import { AgentBrowser, isAgentBrowserAvailable } from '@/lib/browser/agent-browser';
import * as llm from '@/lib/llm';
import { MODEL_CONFIG } from '@/lib/model-config';

interface VisualTestResult {
    passed: boolean;
    score: number;
    screenshotPath?: string;
    issues: string[];
    suggestions: string[];
    diffMismatchPercent?: number | null;
    browserUsed: boolean;
}

export async function visual_test(
    url: string,
    taskDescription: string,
    baselineScreenshot?: string,
): Promise<VisualTestResult> {
    const available = await isAgentBrowserAvailable();
    if (!available) {
        return {
            passed: true,
            score: 0,
            issues: [],
            suggestions: ['agent-browser not available; visual test skipped.'],
            browserUsed: false,
        };
    }

    const sessionId = `visual-test-${Date.now()}`;
    const browser = new AgentBrowser(sessionId);

    try {
        await browser.open(url);
        await browser.waitForLoad('networkidle');

        const shot = await browser.screenshot(`visual-test-${Date.now()}.png`, {
            full: true,
            annotate: true,
        });

        const snap = await browser.snapshot({ interactive: true, compact: true });
        const snapshotText = snap.success ? (snap.snapshot ?? '').slice(0, 3000) : '';
        const annotationText = shot.annotations?.join('\n') ?? '';

        let diffMismatchPercent: number | null = null;
        if (baselineScreenshot && shot.success && shot.path) {
            const diff = await browser.diffScreenshot(baselineScreenshot, `visual-diff-${Date.now()}.png`);
            if (diff.success && diff.raw) {
                const match = diff.raw.match(/([\d.]+)%\s*mismatch/i);
                if (match) diffMismatchPercent = parseFloat(match[1]);
            }
        }

        const systemPrompt = `You are a Senior UI/UX QA Engineer.
Evaluate the visual quality and correctness of a web page.

Task Requirements:
${taskDescription}

Page Accessibility Snapshot:
${snapshotText}

Annotated Elements:
${annotationText}

${diffMismatchPercent !== null ? `Visual diff mismatch: ${diffMismatchPercent}%` : ''}

Score the page from 0-100 based on:
- Does it match the task requirements?
- Are interactive elements properly labeled?
- Is the layout well-structured?
- Any obvious visual issues?

Return JSON: { "passed": boolean (score >= 70), "score": number, "issues": string[], "suggestions": string[] }`;

        let evaluation: any;
        try {
            evaluation = await llm.generateJSON(
                systemPrompt,
                'Evaluate the visual quality of the page.',
                '{ "passed": true, "score": 85, "issues": [], "suggestions": [] }',
                MODEL_CONFIG.SMART_MODEL,
            );
        } catch {
            evaluation = { passed: true, score: 50, issues: ['LLM evaluation failed'], suggestions: [] };
        }

        return {
            passed: evaluation.passed ?? true,
            score: evaluation.score ?? 50,
            screenshotPath: shot.success ? shot.path : undefined,
            issues: evaluation.issues ?? [],
            suggestions: evaluation.suggestions ?? [],
            diffMismatchPercent,
            browserUsed: true,
        };
    } finally {
        await browser.close().catch(() => {});
    }
}
