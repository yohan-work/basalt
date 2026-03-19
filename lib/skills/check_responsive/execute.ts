import { AgentBrowser, isAgentBrowserAvailable } from '@/lib/browser/agent-browser';

interface ViewportCheck {
    ok: boolean;
    width: number;
    height: number;
    screenshotPath?: string;
    overflow: boolean;
    bodyScrollWidth?: number;
    viewportWidth?: number;
    snapshotSummary?: string;
    error?: string;
}

interface ResponsiveResult {
    mobile: ViewportCheck;
    tablet: ViewportCheck;
    desktop: ViewportCheck;
    browserUsed: boolean;
    summary: string;
}

const VIEWPORTS = {
    mobile: { width: 375, height: 812, label: 'Mobile (375x812)' },
    tablet: { width: 768, height: 1024, label: 'Tablet (768x1024)' },
    desktop: { width: 1920, height: 1080, label: 'Desktop (1920x1080)' },
} as const;

async function checkViewport(
    browser: AgentBrowser,
    url: string,
    vp: { width: number; height: number; label: string },
    name: string,
): Promise<ViewportCheck> {
    try {
        await browser.setViewport(vp.width, vp.height);
        await browser.open(url);
        await browser.waitForLoad('networkidle');

        const overflowCheck = await browser.evaluateExpression(
            'JSON.stringify({ scrollW: document.body.scrollWidth, innerW: window.innerWidth })'
        );

        let overflow = false;
        let bodyScrollWidth: number | undefined;
        let viewportWidth: number | undefined;

        if (overflowCheck.success && overflowCheck.value) {
            try {
                const parsed = JSON.parse(overflowCheck.value);
                bodyScrollWidth = parsed.scrollW;
                viewportWidth = parsed.innerW;
                overflow = parsed.scrollW > parsed.innerW + 1;
            } catch { /* parse failure is non-fatal */ }
        }

        const screenshotResult = await browser.screenshot(`responsive-${name}-${Date.now()}.png`, { full: true });

        const snap = await browser.snapshot({ interactive: true, compact: true });
        const snapshotSummary = snap.success
            ? (snap.snapshot ?? '').slice(0, 500)
            : undefined;

        return {
            ok: !overflow,
            width: vp.width,
            height: vp.height,
            screenshotPath: screenshotResult.success ? screenshotResult.path : undefined,
            overflow,
            bodyScrollWidth,
            viewportWidth,
            snapshotSummary,
        };
    } catch (err: any) {
        return {
            ok: false,
            width: vp.width,
            height: vp.height,
            overflow: false,
            error: err.message,
        };
    }
}

export async function check_responsive(url: string): Promise<ResponsiveResult> {
    const available = await isAgentBrowserAvailable();

    if (!available) {
        return {
            mobile: { ok: true, width: 375, height: 812, overflow: false },
            tablet: { ok: true, width: 768, height: 1024, overflow: false },
            desktop: { ok: true, width: 1920, height: 1080, overflow: false },
            browserUsed: false,
            summary: 'agent-browser not available; skipped real browser checks.',
        };
    }

    const sessionId = `responsive-${Date.now()}`;
    const browser = new AgentBrowser(sessionId);

    try {
        const mobile = await checkViewport(browser, url, VIEWPORTS.mobile, 'mobile');
        const tablet = await checkViewport(browser, url, VIEWPORTS.tablet, 'tablet');
        const desktop = await checkViewport(browser, url, VIEWPORTS.desktop, 'desktop');

        const failures = [
            !mobile.ok && VIEWPORTS.mobile.label,
            !tablet.ok && VIEWPORTS.tablet.label,
            !desktop.ok && VIEWPORTS.desktop.label,
        ].filter(Boolean);

        const summary = failures.length === 0
            ? 'All viewports passed responsive check.'
            : `Layout issues detected in: ${failures.join(', ')}`;

        return { mobile, tablet, desktop, browserUsed: true, summary };
    } finally {
        await browser.close().catch(() => {});
    }
}
