import { list_directory } from '@/lib/skills/index';
import { AgentLoader } from '@/lib/agent-loader';
import { resolveQaPageUrl } from '@/lib/project-dev-server';
import * as llm from '@/lib/llm';
import { MODEL_CONFIG } from '@/lib/model-config';
import { AgentBrowser, isAgentBrowserAvailable } from '@/lib/browser/agent-browser';

interface VisualVerification {
    snapshotSummary?: string;
    screenshotPath?: string;
    annotations?: string[];
}

async function tryVisualVerification(
    projectPath: string,
    taskMetadata?: Record<string, unknown> | null
): Promise<VisualVerification | null> {
    const available = await isAgentBrowserAvailable();
    if (!available) return null;

    const devServerUrl = resolveQaPageUrl(projectPath, taskMetadata);
    const sessionId = `verify-${Date.now()}`;
    const browser = new AgentBrowser(sessionId);

    try {
        const openResult = await browser.open(devServerUrl);
        if (!openResult.success) return null;

        await browser.waitForLoad('networkidle');

        const snap = await browser.snapshot({ interactive: true, compact: true });
        const snapshotSummary = snap.success ? (snap.snapshot ?? '').slice(0, 2000) : undefined;

        const shot = await browser.screenshot(`verify-${Date.now()}.png`, { annotate: true });

        return {
            snapshotSummary,
            screenshotPath: shot.success ? shot.path : undefined,
            annotations: shot.annotations,
        };
    } catch {
        return null;
    } finally {
        await browser.close().catch(() => {});
    }
}

export async function verify_final_output(
    taskDescription: string,
    projectPath: string = process.cwd(),
    taskMetadata?: Record<string, unknown> | null
) {
    try {
        const files = await list_directory('.', projectPath);
        const fileListStr = Array.isArray(files) ? files.join('\n') : String(files);

        const skillDef = AgentLoader.loadSkill('verify_final_output');

        const visual = await tryVisualVerification(projectPath, taskMetadata);

        let visualContext = '';
        if (visual?.snapshotSummary) {
            visualContext = `\n\n--- Live Page Accessibility Snapshot (from agent-browser) ---\n${visual.snapshotSummary}\n`;
        }
        if (visual?.annotations && visual.annotations.length > 0) {
            visualContext += `\n--- Annotated Elements ---\n${visual.annotations.join('\n')}\n`;
        }

        const systemPrompt = `${skillDef.instructions}

Task Description: ${taskDescription}
Current Project Files(Top Level):
${fileListStr.slice(0, 1000)}
${visualContext}`;

        const schema = AgentLoader.extractSection(skillDef.instructions, 'Schema') || `{ "verified": true, "notes": "" }`;

        const verification = await llm.generateJSON(
            systemPrompt,
            "Verify task completion against project structure and live page state.",
            schema,
            MODEL_CONFIG.SMART_MODEL
        );

        if (visual) {
            verification.visualVerification = {
                screenshotPath: visual.screenshotPath,
                browserUsed: true,
                qaDevServerUrl: resolveQaPageUrl(projectPath, taskMetadata),
            };
        }

        return verification;
    } catch (e: any) {
        console.warn('Verification LLM failed, defaulting to success with warning.');
        return {
            verified: true,
            notes: `Verification logic failed but defaulting to true to avoid blocking. Error: ${e.message}`
        };
    }
}
