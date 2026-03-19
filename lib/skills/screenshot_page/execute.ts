import { AgentBrowser, isAgentBrowserAvailable } from '@/lib/browser/agent-browser';

interface ScreenshotPageResult {
    success: boolean;
    screenshotPath?: string;
    annotations?: string[];
    pageTitle?: string;
    pageUrl?: string;
    error?: string;
    browserUsed: boolean;
}

export async function screenshot_page(
    url: string,
    annotate = false,
    fullPage = true,
    viewport?: { width: number; height: number },
): Promise<ScreenshotPageResult> {
    const available = await isAgentBrowserAvailable();
    if (!available) {
        return {
            success: false,
            error: 'agent-browser not available; screenshot skipped.',
            browserUsed: false,
        };
    }

    const sessionId = `screenshot-${Date.now()}`;
    const browser = new AgentBrowser(sessionId);

    try {
        if (viewport) {
            await browser.setViewport(viewport.width, viewport.height);
        }

        const openResult = await browser.open(url);
        if (!openResult.success) {
            return { success: false, error: openResult.error, browserUsed: true };
        }

        await browser.waitForLoad('networkidle');

        const titleResult = await browser.getTitle();
        const pageTitle = titleResult.data?.title || titleResult.raw || '';

        const urlResult = await browser.getUrl();
        const pageUrl = urlResult.data?.url || urlResult.raw || '';

        const shot = await browser.screenshot(`page-${Date.now()}.png`, {
            full: fullPage,
            annotate,
        });

        return {
            success: shot.success,
            screenshotPath: shot.path,
            annotations: shot.annotations,
            pageTitle,
            pageUrl,
            error: shot.error,
            browserUsed: true,
        };
    } catch (err: any) {
        return { success: false, error: err.message, browserUsed: true };
    } finally {
        await browser.close().catch(() => {});
    }
}
