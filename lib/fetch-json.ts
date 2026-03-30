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
        const preview = trimmed.slice(0, 120).replace(/\s+/g, ' ');
        const urlNote = res.url?.trim() ? ` 요청 URL: ${res.url}.` : '';
        const isLocalDevUrl = /localhost|127\.0\.0\.1/i.test(res.url || '');
        let hint404 = '';
        if (res.status === 404) {
            hint404 =
                ' HTTP 404이면 Basalt의 `app/api/...` 라우트에 닿기 전에 Next/HTML 404가 온 경우가 많습니다. Basalt와 **같은 오리진**에서 UI를 열었는지(로컬은 `npm run dev` 주소), 리버스 프록시가 **`/api`를 Basalt로 전달**하는지, 배포본에 해당 API가 **포함됐는지** 확인하세요.';
            if (isLocalDevUrl) {
                hint404 +=
                    ' **로컬 URL이 맞는데도 HTML 404면:** `npm run dev`를 **Basalt 저장소 루트**에서 실행 중인지, 해당 포트에 다른 Next 앱이 붙어 있지 않은지 확인하세요. `.next`를 삭제한 뒤 dev를 재기동해 보세요. `GET /api/agent/spec-expand`가 JSON(`ok`, `service`)을 주면 라우트는 등록된 것입니다.';
            }
        } else if (res.status >= 400) {
            hint404 = ' 서버가 JSON 대신 HTML 오류 페이지를 반환했을 수 있습니다.';
        }
        throw new Error(
            `JSON이 필요한데 HTML이 왔습니다 (HTTP ${res.status}).${urlNote} 미리보기: ${preview}${hint404}`
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
