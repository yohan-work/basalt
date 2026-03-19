import { AgentBrowser, isAgentBrowserAvailable } from '@/lib/browser/agent-browser';

type ExtractMode = 'text' | 'snapshot' | 'full';

interface BrowseWebResult {
    success: boolean;
    url: string;
    title?: string;
    content?: string;
    snapshot?: string;
    screenshotPath?: string;
    error?: string;
    browserUsed: boolean;
}

export async function browse_web(
    url: string,
    extractMode: ExtractMode = 'full',
    selector?: string,
): Promise<BrowseWebResult> {
    const available = await isAgentBrowserAvailable();
    if (!available) {
        return {
            success: false,
            url,
            error: 'agent-browser not available; cannot browse external pages.',
            browserUsed: false,
        };
    }

    const sessionId = `browse-${Date.now()}`;
    const browser = new AgentBrowser(sessionId);

    try {
        const openResult = await browser.open(url);
        if (!openResult.success) {
            return { success: false, url, error: openResult.error, browserUsed: true };
        }

        await browser.waitForLoad('networkidle');

        const titleResult = await browser.getTitle();
        const title = titleResult.data?.title || titleResult.raw || '';

        let content: string | undefined;
        let snapshot: string | undefined;
        let screenshotPath: string | undefined;

        if (extractMode === 'text' || extractMode === 'full') {
            const textTarget = selector || 'body';
            const textResult = await browser.evaluateExpression(
                `document.querySelector('${textTarget.replace(/'/g, "\\'")}')?.innerText?.slice(0, 50000) || ''`
            );
            content = textResult.success ? (textResult.value ?? '').slice(0, 50000) : undefined;
        }

        if (extractMode === 'snapshot' || extractMode === 'full') {
            const snapResult = await browser.snapshot({
                interactive: true,
                compact: true,
                selector: selector,
            });
            snapshot = snapResult.success ? (snapResult.snapshot ?? '').slice(0, 30000) : undefined;
        }

        if (extractMode === 'full') {
            const shot = await browser.screenshot(`browse-${Date.now()}.png`);
            screenshotPath = shot.success ? shot.path : undefined;
        }

        return {
            success: true,
            url,
            title,
            content,
            snapshot,
            screenshotPath,
            browserUsed: true,
        };
    } catch (err: any) {
        return { success: false, url, error: err.message, browserUsed: true };
    } finally {
        await browser.close().catch(() => {});
    }
}
