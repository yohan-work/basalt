import type { StackProfile } from './stack-profile';

/** 플랜·코드 생성 시 API 정합에 자주 쓰이는 의존성(순서 유지). */
const KEY_DEPS_ORDER: readonly string[] = [
    'next',
    'react',
    'react-dom',
    'typescript',
    'tailwindcss',
    '@tailwindcss/postcss',
    'vite',
    'vue',
    'nuxt',
    '@angular/core',
    '@sveltejs/kit',
    'eslint',
    'eslint-config-next',
    '@types/react',
    '@types/react-dom',
    '@types/node',
];

/**
 * package.json semver 범위에서 파싱한 메이저를 한 줄로 요약(플랜 summary 인용용).
 */
export function formatVersionConstraintsLine(profile: StackProfile): string {
    const parts: string[] = [];
    const m = profile.majors;
    if (m.next != null) parts.push(`Next 메이저 ${m.next}`);
    if (m.react != null) parts.push(`React 메이저 ${m.react}`);
    if (m.vue != null) parts.push(`Vue 메이저 ${m.vue}`);
    if (m.nuxt != null) parts.push(`Nuxt 메이저 ${m.nuxt}`);
    if (m.angular != null) parts.push(`Angular 메이저 ${m.angular}`);
    if (m.svelte != null) parts.push(`Svelte 메이저 ${m.svelte}`);

    if (parts.length === 0) {
        return '핵심 프레임워크 메이저를 package.json에서 파싱하지 못했습니다. Tech Stack 줄과 KEY_DEPENDENCY_VERSIONS의 semver를 직접 확인하세요.';
    }
    return `${parts.join('; ')}. 플랜·코드는 이 메이저 범위에 맞는 API·문법만 사용할 것(다른 메이저 문법 가정 금지).`;
}

/**
 * 화이트리스트 우선으로 name → semver 한 줄씩(존재하는 항목만).
 */
export function formatKeyDependencyVersionsBlock(depsWithVersions: Record<string, string>): string {
    const lines: string[] = [];
    for (const name of KEY_DEPS_ORDER) {
        const v = depsWithVersions[name];
        if (v) lines.push(`  - ${name}: ${v}`);
    }
    if (lines.length === 0) {
        return '  _(화이트리스트 패키지가 package.json dependencies/devDependencies에 없음)_';
    }
    return lines.join('\n');
}

/**
 * 감지된 메이저 기준 짧은 문법/API 힌트(확실한 차이만).
 */
export function formatMajorSyntaxHints(profile: StackProfile): string {
    const bullets: string[] = [];
    const { majors, primary, routerKind, structure } = profile;
    const appRouter = structure.includes('app-router');
    const nextM = majors.next;
    const reactM = majors.react;

    if (primary === 'next' && appRouter && typeof nextM === 'number' && nextM < 15) {
        bullets.push(
            'Next.js 14.x 이하(App Router): `page`의 `params`/`searchParams`는 대개 동기 객체입니다. Next 15+처럼 무조건 `await params` 하지 말고, 이 프로젝트 semver에 맞출 것.'
        );
    }

    if (typeof reactM === 'number' && reactM >= 19) {
        bullets.push(
            'React 19: `useActionState` 등 React 19 API 사용 가능. React 18 전용 가정(예. 구식 타입 패턴)과 혼용하지 말 것.'
        );
    } else if (typeof reactM === 'number' && reactM <= 18) {
        bullets.push(
            'React 18: React 19 전용 훅/API(`useActionState` 등) 사용 금지. React 18 문서·기존 코드 패턴만 사용할 것.'
        );
    }

    if (primary === 'next' && routerKind === 'pages' && typeof nextM === 'number' && nextM >= 15) {
        bullets.push(
            'Next.js 15+(Pages Router): 데이터 패칭·라우터 헬퍼 등은 버전별 동작이 다를 수 있음 — `getServerSideProps`/`getStaticProps`는 기존 Pages 문서와 이 프로젝트 next semver를 따를 것.'
        );
    }

    if (bullets.length === 0) return '';
    return bullets.map((b) => `- ${b}`).join('\n');
}
