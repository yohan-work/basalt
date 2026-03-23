/**
 * Maps `PAGE_ERROR_SIGNALS` entries (exact substring keys) to short repair hints + official docs.
 * Keep keys in sync with `lib/qa/page-smoke-check.ts` `PAGE_ERROR_SIGNALS`.
 */
export const SIGNAL_DOC_HINTS: Partial<Record<string, string>> = {
    'unhandled runtime error': 'https://nextjs.org/docs/messages/client-side-exception-occurred — 클라이언트 예외: 원인 스택·해당 컴포넌트 파일부터 수정.',
    'application error': '런타임 오류 오버레이 — 스택에 나온 파일 경로를 우선 수정.',
    chunkloaderror: 'https://nextjs.org/docs/messages/module-not-found — 청크/동적 import 경로·빌드 캐시(.next) 불일치 가능.',
    'failed to compile': '컴파일 실패 — 터미널/빌드 로그의 첫 에러 파일부터 수정.',
    'module not found': 'https://nextjs.org/docs/messages/module-not-found — 패키지 설치 여부, 경로 대소문자, `@/*` tsconfig paths.',
    "can't resolve": 'https://nextjs.org/docs/messages/module-not-found — 동일.',
    'invalid-new-link': 'https://nextjs.org/docs/messages/invalid-new-link-with-extra-anchor — `<Link>` 안에 `<a>` 금지.',
    'extra anchor': 'https://nextjs.org/docs/messages/invalid-new-link-with-extra-anchor — 동일.',
    'attempting to export "metadata"': 'https://nextjs.org/docs/app/api-reference/functions/generate-metadata#why-generatemetadata-is-server-component-only — metadata는 서버 전용; `"use client"` 파일에서 분리.',
    'must be resolved on the server before the page': 'Server Component 전용 API — 클라이언트 파일로 옮긴 훅/컴포넌트와 분리.',
    'marked with "use client"': 'RSC 경계 — metadata/route handler 규칙과 충돌 시 서버/클라이언트 파일 분리.',
    'cannot export both metadata': 'https://nextjs.org/docs/app/api-reference/functions/generate-metadata — 같은 세그먼트에서 `metadata`와 `generateMetadata` 동시 export 금지.',
    'viewport field in metadata': 'https://nextjs.org/docs/app/api-reference/functions/generate-viewport — `viewport`/`themeColor`는 `generateViewport` / `export const viewport` 사용.',
    'without configuring a metadata base': 'https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase — 루트 layout에 `metadataBase` 또는 절대 URL.',
    'minified react error': 'React 런타임 에러 — 개발 모드에서 재현해 전체 스택 확인.',
    'an error occurred in the server components': 'https://nextjs.org/docs/app/building-your-application/rendering/server-components — 서버 컴포넌트 트리에서 예외; async/데이터 페치·동기 API 사용처 확인.',
    'error: the default export is not a react component': 'page/layout/route default export가 React 컴포넌트인지 확인.',
    'this page could not be found': '404 — `notFound()` 또는 존재하지 않는 경로; 라우트 파일 위치 확인.',
    'internal server error': '서버 500 — 서버 컴포넌트·Route Handler·환경 변수 로그 확인.',
    'uncaught exception': '예외 스택의 소스 파일부터 수정.',
    'something went wrong': '일반 오류 UI — 스모크 발췌·오버레이 텍스트 참고.',
    'digest:': 'https://nextjs.org/docs/app/api-reference/file-conventions/error — Next error digest; 서버 로그와 대조.',
    'hydration failed': 'https://nextjs.org/docs/messages/react-hydration-error — 서버/클라이언트 마크업 불일치; `Date`/`Math.random`/브라우저 전용 값을 렌더에서 제거.',
    'hydration mismatch': 'https://nextjs.org/docs/messages/react-hydration-error — 동일.',
    'there was an error while hydrating': 'https://nextjs.org/docs/messages/react-hydration-error — 하이드레이션 실패.',
    'text content does not match': 'https://nextjs.org/docs/messages/react-hydration-error — 하이드레이션 불일치.',
    'suppresshydrationwarning': '하이드레이션 경고 — 근본 원인(클라이언트 전용 값) 제거 우선.',
    'hostname is not configured': 'https://nextjs.org/docs/messages/next-image-unconfigured-host — `next.config` `images.remotePatterns` 또는 `<img>`로 대체.',
    'has not been configured under images': 'https://nextjs.org/docs/messages/next-image-unconfigured-host — `images` 설정에 호스트 추가.',
    'invalid src prop': 'https://nextjs.org/docs/messages/next-image-unconfigured-host — `next/image` src·도메인 설정.',
    'params is a promise': 'https://nextjs.org/docs/messages/sync-dynamic-apis — Next 15+ `await params` / `await searchParams`.',
    'params should be awaited': 'https://nextjs.org/docs/messages/sync-dynamic-apis — 동일.',
    'searchparams is a promise': 'https://nextjs.org/docs/messages/sync-dynamic-apis — `await searchParams`.',
    'search params should be awaited': 'https://nextjs.org/docs/messages/sync-dynamic-apis — `await searchParams`.',
    'prerender error': 'https://nextjs.org/docs/messages/prerender-error — 빌드 시 정적 생성 실패; 브라우저 전용 API·fetch 실패 여부.',
    'error occurred prerendering': 'https://nextjs.org/docs/messages/prerender-error — 동일.',
    'static generation failed': 'https://nextjs.org/docs/messages/prerender-error — `export const dynamic` / 데이터 소스 확인.',
    'client-side exception occurred': 'https://nextjs.org/docs/messages/client-side-exception-occurred — 클라이언트 경계·error boundary.',
    'prop on a dom element':
        'https://react.dev/warnings/unknown-prop — `fullWidth`·`variant` 등 커스텀 prop을 `<button>`/`<input>`에 `{...props}`로 넘기지 말고 구조 분해 후 DOM 허용 속성만 전달.',
    'server actions must': 'https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations — Server Action은 async·직렬화 가능한 인자만.',
    'server action': 'https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations — 폼 `action`/직렬화 가능 인자.',
    'edge runtime': 'https://nextjs.org/docs/app/api-reference/file-conventions/route#runtime — Route/Edge에서 Node API 제한.',
    'failed to fetch rsc payload': 'https://nextjs.org/docs/messages/failed-to-fetch-rsc-payload — 네트워크·프록시·rewrite; dev 서버 재시작.',
    '__next_error__': 'Next 개발 오버레이 — 본문 발췌의 스택·파일 경로 우선.',
    'nextjs-original-stack-frame': '개발 스택 프레임 — 발췌에 나온 소스 경로·라인을 우선 수정.',
};

/**
 * Human-readable block for Dev QA `repairGoal` (Korean labels + links).
 */
export function formatRepairDocHints(signals: string[]): string {
    if (!signals.length) {
        return '(페이지 오류 신호 없음 — HTTP/브라우저 진단·발췌를 우선 참고)';
    }
    const lines: string[] = [];
    for (const s of signals) {
        const hint = SIGNAL_DOC_HINTS[s];
        if (hint) {
            lines.push(`- 신호 "${s}": ${hint}`);
        } else {
            lines.push(
                `- 신호 "${s}": https://nextjs.org/docs/messages 및 https://nextjs.org/docs/app 에서 유사 오류 검색`
            );
        }
    }
    return lines.join('\n');
}
