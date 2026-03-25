/** Typical API JSON body; use `apiErrorText` for safe `error` field reads. */
export type ApiJsonObject = Record<string, unknown>;

export function apiErrorText(data: ApiJsonObject, fallback: string): string {
    const e = data.error;
    return typeof e === 'string' && e.trim() ? e : fallback;
}

/**
 * Parse fetch Response bodies as JSON with clear errors when the server returns
 * HTML, images, or other non-JSON (avoids opaque "Unexpected token … is not valid JSON" / PNG crashes).
 */
export async function parseResponseAsJson<T extends ApiJsonObject = ApiJsonObject>(res: Response): Promise<T> {
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const text = await res.text();

    if (contentType.startsWith('image/')) {
        throw new Error(
            `JSON이 필요한데 응답이 이미지입니다 (${contentType}, HTTP ${res.status}). fetch URL이 API가 아니라 정적 이미지를 가리키는지 확인하세요.`
        );
    }

    const trimmed = text.trimStart();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
        throw new Error(
            `JSON이 필요한데 HTML이 왔습니다 (HTTP ${res.status}). 미리보기: ${trimmed.slice(0, 120).replace(/\s+/g, ' ')}`
        );
    }

    try {
        return JSON.parse(text) as T;
    } catch {
        const preview = text.slice(0, 160).replace(/\s+/g, ' ').replace(/[\u0000-\u001F]/g, '·');
        const nonJsonStart =
            trimmed.length > 0 && trimmed[0] !== '{' && trimmed[0] !== '[' && trimmed[0] !== '"';
        const pngHint =
            /PNG/.test(trimmed.slice(0, 32)) && nonJsonStart
                ? ' 응답이 PNG 등 바이너리일 수 있습니다. API 경로·프록시·베이스 URL을 확인하세요.'
                : '';
        const hint = nonJsonStart
            ? ` 본문이 { 또는 [ 로 시작하지 않습니다.${pngHint}`
            : '';
        throw new Error(
            `유효한 JSON이 아닙니다 (HTTP ${res.status}, Content-Type: ${contentType || '없음'}).${hint} 미리보기: ${preview}`
        );
    }
}

export async function fetchJson<T extends ApiJsonObject = ApiJsonObject>(
    input: RequestInfo | URL,
    init?: RequestInit
): Promise<T> {
    const res = await fetch(input, init);
    return parseResponseAsJson<T>(res);
}
