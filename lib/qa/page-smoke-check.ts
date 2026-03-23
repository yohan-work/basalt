import { AgentBrowser, isAgentBrowserAvailable } from '@/lib/browser/agent-browser';

/** Matched case-insensitively against page snapshot / body text / HTTP HTML snippet */
export const PAGE_ERROR_SIGNALS = [
    'unhandled runtime error',
    'application error',
    'chunkloaderror',
    'failed to compile',
    'module not found',
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
    'digest:',
    'hydration failed',
    'hydration mismatch',
    'there was an error while hydrating',
    'text content does not match',
    'suppresshydrationwarning',
    'hostname is not configured',
    'invalid src prop',
    'has not been configured under images',
    'params is a promise',
    'params should be awaited',
    'searchparams is a promise',
    'search params should be awaited',
    'prerender error',
    'error occurred prerendering',
    'static generation failed',
    'client-side exception occurred',
    'server actions must',
    'edge runtime',
    'failed to fetch rsc payload',
    '__next_error__',
    'nextjs-original-stack-frame',
] as const;

export type QaPageCheckResult = {
    url: string;
    checkedAt: string;
    httpReachable: boolean;
    httpStatus: number | null;
    httpError?: string;
    /** True when HTML body was scanned for signals (no browser required) */
    httpBodyScanned: boolean;
    browserUsed: boolean;
    browserError?: string;
    pageErrorSignals: string[];
    /** Truncated diagnostic text for LLM repair (masked) */
    errorExcerpt?: string;
    /** Dev overlay / nextjs portal text when available */
    nextOverlayExcerpt?: string;
    passed: boolean;
    summary: string;
};

const HTTP_TIMEOUT_MS = 12_000;
const HTTP_BODY_MAX_CHARS = 120_000;
const DIAGNOSTIC_EXCERPT_MAX = 6000;
const OVERLAY_EVAL_MAX = 10_000;

function maskLikelySecrets(s: string): string {
    return s
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[redacted-email]')
        .replace(/\bBearer\s+[A-Za-z0-9._-]+\b/gi, 'Bearer [redacted]')
        .replace(/\bsk_live_[A-Za-z0-9]+\b/g, 'sk_live_[redacted]')
        .replace(/\bsk_test_[A-Za-z0-9]+\b/g, 'sk_test_[redacted]');
}

function buildDiagnosticExcerpt(haystack: string, signals: string[], maxLen: number): string {
    const raw = haystack.slice(0, 200_000);
    if (!raw.trim()) {
        return '';
    }
    const lower = raw.toLowerCase();
    const chunks: string[] = [];
    const windowHalf = 380;

    for (const sig of signals) {
        const sigLower = sig.toLowerCase();
        let pos = 0;
        for (let i = 0; i < 4; i++) {
            const idx = lower.indexOf(sigLower, pos);
            if (idx === -1) break;
            const start = Math.max(0, idx - windowHalf);
            const end = Math.min(raw.length, idx + sig.length + windowHalf);
            chunks.push(raw.slice(start, end));
            pos = idx + sig.length;
        }
    }

    let merged = chunks.length > 0 ? chunks.join('\n---\n') : raw.slice(0, Math.min(raw.length, maxLen));
    merged = maskLikelySecrets(merged);
    if (merged.length > maxLen) {
        merged = `${merged.slice(0, maxLen)}\n…(truncated)`;
    }
    return merged.trim();
}

async function httpProbeWithBody(
    url: string
): Promise<Pick<QaPageCheckResult, 'httpReachable' | 'httpStatus' | 'httpError'> & { bodySnippet?: string }> {
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
        const text = await res.text();
        const bodySnippet = text.slice(0, HTTP_BODY_MAX_CHARS);
        return { httpReachable: true, httpStatus: res.status, httpError: undefined, bodySnippet };
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

const NEXT_OVERLAY_EVAL = `(() => {
  var out = '';
  var sels = ['[data-nextjs-dialog]','[data-nextjs-toast]','nextjs-portal','[class*="nextjs-container-errors"]','[class*="error-overlay"]'];
  for (var i = 0; i < sels.length; i++) {
    var nodes = document.querySelectorAll(sels[i]);
    for (var j = 0; j < nodes.length; j++) {
      var n = nodes[j];
      if (n && n.textContent) { out += n.textContent + '\\n'; }
    }
  }
  try {
    var pre = document.querySelector('body nextjs-portal pre, [data-nextjs-terminal]');
    if (pre && pre.textContent) out += pre.textContent;
  } catch (e) {}
  return out.slice(0, 10000);
})()`;

/**
 * HTTP reachability + HTML scan + optional agent-browser snapshot/body/overlay for obvious error UI.
 */
export async function runQaPageSmokeCheck(baseUrl: string): Promise<QaPageCheckResult> {
    const checkedAt = new Date().toISOString();
    const http = await httpProbeWithBody(baseUrl);

    let browserUsed = false;
    let browserError: string | undefined;
    let pageErrorSignals: string[] = [];
    let combinedText = '';
    let nextOverlayExcerpt: string | undefined;

    if (http.bodySnippet) {
        combinedText += http.bodySnippet;
    }

    const available = await isAgentBrowserAvailable();
    if (available) {
        browserUsed = true;
        const sessionId = `qa-smoke-${Date.now()}`;
        const browser = new AgentBrowser(sessionId);
        try {
            const openResult = await browser.open(baseUrl);
            if (!openResult.success) {
                browserError = openResult.error || 'open failed';
                pageErrorSignals = collectErrorSignals(combinedText);
            } else {
                await browser.waitForLoad('networkidle');
                const snap = await browser.snapshot({ interactive: true, compact: true });
                if (snap.success && snap.snapshot) {
                    combinedText += `\n${snap.snapshot}`;
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
                const overlay = await browser.evaluateExpression(NEXT_OVERLAY_EVAL);
                if (overlay.success && overlay.value && overlay.value.trim()) {
                    nextOverlayExcerpt = maskLikelySecrets(overlay.value.trim().slice(0, OVERLAY_EVAL_MAX));
                    combinedText += `\n${overlay.value}`;
                }
                pageErrorSignals = collectErrorSignals(combinedText);
            }
        } catch (e: any) {
            browserError = e?.message || String(e);
        } finally {
            await browser.close().catch(() => {});
        }
    } else {
        pageErrorSignals = collectErrorSignals(combinedText);
    }

    const statusBad = http.httpStatus !== null && http.httpStatus >= 400;
    const passed =
        http.httpReachable &&
        !statusBad &&
        pageErrorSignals.length === 0 &&
        !browserError;

    let errorExcerpt: string | undefined;
    if (!passed) {
        if (pageErrorSignals.length > 0) {
            errorExcerpt = buildDiagnosticExcerpt(combinedText, pageErrorSignals, DIAGNOSTIC_EXCERPT_MAX);
        } else {
            const raw = combinedText.slice(0, DIAGNOSTIC_EXCERPT_MAX);
            errorExcerpt =
                maskLikelySecrets(raw) + (combinedText.length > DIAGNOSTIC_EXCERPT_MAX ? '\n…(truncated)' : '');
        }
    }

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
        httpBodyScanned: Boolean(http.bodySnippet),
        browserUsed,
        browserError,
        pageErrorSignals,
        errorExcerpt: errorExcerpt || undefined,
        nextOverlayExcerpt,
        passed,
        summary: parts.join(' | '),
    };
}
