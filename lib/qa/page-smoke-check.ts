import { AgentBrowser, isAgentBrowserAvailable } from '@/lib/browser/agent-browser';

/** Matched case-insensitively against page snapshot / body text */
export const PAGE_ERROR_SIGNALS = [
    'unhandled runtime error',
    'application error',
    'chunkloaderror',
    'failed to compile',
    "module not found",
    "can't resolve",
    'invalid-new-link',
    'extra anchor',
    'attempting to export "metadata"',
    'must be resolved on the server before the page',
    'marked with "use client"',
    'cannot export both metadata',
    'viewport field in metadata',
    'without configuring a metadata base',
    'minified react error',
    'an error occurred in the server components',
    'error: the default export is not a react component',
    'this page could not be found',
    'internal server error',
    'uncaught exception',
    'something went wrong',
    'digest:', // Next.js error digest line
] as const;

export type QaPageCheckResult = {
    url: string;
    checkedAt: string;
    httpReachable: boolean;
    httpStatus: number | null;
    httpError?: string;
    browserUsed: boolean;
    browserError?: string;
    pageErrorSignals: string[];
    passed: boolean;
    summary: string;
};

const HTTP_TIMEOUT_MS = 12_000;

async function httpProbe(url: string): Promise<Pick<QaPageCheckResult, 'httpReachable' | 'httpStatus' | 'httpError'>> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
        const res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: { Accept: 'text/html,application/xhtml+xml,*/*' },
        });
        clearTimeout(timer);
        return { httpReachable: true, httpStatus: res.status, httpError: undefined };
    } catch (e: any) {
        const msg = e?.name === 'AbortError' ? `Timeout after ${HTTP_TIMEOUT_MS}ms` : e?.message || String(e);
        return { httpReachable: false, httpStatus: null, httpError: msg };
    }
}

function collectErrorSignals(haystack: string): string[] {
    const lower = haystack.toLowerCase();
    const found: string[] = [];
    for (const sig of PAGE_ERROR_SIGNALS) {
        if (lower.includes(sig)) {
            found.push(sig);
        }
    }
    return Array.from(new Set(found));
}

/**
 * HTTP reachability + optional agent-browser snapshot/body scan for obvious error UI.
 */
export async function runQaPageSmokeCheck(baseUrl: string): Promise<QaPageCheckResult> {
    const checkedAt = new Date().toISOString();
    const http = await httpProbe(baseUrl);

    let browserUsed = false;
    let browserError: string | undefined;
    let pageErrorSignals: string[] = [];
    let combinedText = '';

    const available = await isAgentBrowserAvailable();
    if (available) {
        browserUsed = true;
        const sessionId = `qa-smoke-${Date.now()}`;
        const browser = new AgentBrowser(sessionId);
        try {
            const openResult = await browser.open(baseUrl);
            if (!openResult.success) {
                browserError = openResult.error || 'open failed';
            } else {
                await browser.waitForLoad('networkidle');
                const snap = await browser.snapshot({ interactive: true, compact: true });
                if (snap.success && snap.snapshot) {
                    combinedText += snap.snapshot;
                }
                const title = await browser.getTitle();
                const titleText = title.success ? String(title.raw || '') : '';
                if (titleText) {
                    combinedText += `\n${titleText}`;
                }
                const inner = await browser.evaluateExpression(
                    "document.body && document.body.innerText ? document.body.innerText.slice(0,15000) : ''"
                );
                if (inner.success && inner.value) {
                    combinedText += `\n${inner.value}`;
                }
                pageErrorSignals = collectErrorSignals(combinedText);
            }
        } catch (e: any) {
            browserError = e?.message || String(e);
        } finally {
            await browser.close().catch(() => {});
        }
    } else {
        pageErrorSignals = [];
    }

    const statusBad = http.httpStatus !== null && http.httpStatus >= 400;
    const passed =
        http.httpReachable &&
        !statusBad &&
        pageErrorSignals.length === 0 &&
        !browserError;

    const parts: string[] = [];
    if (!http.httpReachable) parts.push(`HTTP 실패: ${http.httpError || 'unknown'}`);
    else if (statusBad) parts.push(`HTTP ${http.httpStatus}`);
    if (browserError) parts.push(`브라우저: ${browserError}`);
    if (pageErrorSignals.length) parts.push(`페이지 오류 신호: ${pageErrorSignals.join(', ')}`);
    if (passed) parts.push('스모크 통과');

    return {
        url: baseUrl,
        checkedAt,
        httpReachable: http.httpReachable,
        httpStatus: http.httpStatus,
        httpError: http.httpError,
        browserUsed,
        browserError,
        pageErrorSignals,
        passed,
        summary: parts.join(' | '),
    };
}
