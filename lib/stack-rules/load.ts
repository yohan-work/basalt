import fs from 'fs';
import path from 'path';

import type { StackProfile } from '@/lib/stack-profile';

const DEFAULT_MAX_CHARS = 12_000;
const UNIVERSAL_RULE_FILE = 'universal.md';
const BASALT_REL_RULES = ['lib', 'stack-rules'];

function rulesBaseDir(): string {
    return path.join(process.cwd(), ...BASALT_REL_RULES);
}

export function selectStackRuleFilenames(profile: StackProfile): string[] {
    switch (profile.primary) {
        case 'next':
            if (profile.routerKind === 'pages') return ['next-pages-router.md'];
            if (profile.routerKind === 'app') return ['next-app-router.md'];
            return ['next-app-router.md'];
        case 'angular':
            return ['angular.md'];
        case 'nuxt':
            return ['nuxt3.md'];
        case 'sveltekit':
            return ['sveltekit.md'];
        case 'vue_vite':
            return ['vue-vite.md'];
        case 'react_vite':
            return ['react-vite.md'];
        case 'vite_generic':
            return ['vite-generic.md'];
        case 'static':
            return ['static-html.md'];
        default:
            return ['fallback-unknown.md'];
    }
}

function readRuleFile(baseDir: string, name: string): string | null {
    const full = path.join(baseDir, name);
    if (!fs.existsSync(full)) return null;
    try {
        return fs.readFileSync(full, 'utf-8').trim();
    } catch {
        return null;
    }
}

/**
 * Short line for enhance-prompt / stack summary (saves tokens).
 */
export function formatStackRulesSummary(profile: StackProfile): string {
    const files = [UNIVERSAL_RULE_FILE, ...selectStackRuleFilenames(profile)];
    const majorBits: string[] = [];
    if (profile.majors.next != null) majorBits.push(`Next 메이저 ${profile.majors.next}`);
    if (profile.majors.react != null) majorBits.push(`React 메이저 ${profile.majors.react}`);
    if (profile.majors.vue != null) majorBits.push(`Vue 메이저 ${profile.majors.vue}`);
    const majorStr = majorBits.length > 0 ? ` (${majorBits.join(', ')})` : '';
    return `감지 스택: ${profile.primary}${majorStr}. 적용 규칙 파일: ${files.join(', ')}. 상세 제약은 실행 컨텍스트의 [STACK_RULES]를 따르세요.`;
}

/**
 * Full rules text for [STACK_RULES] block. Truncates to maxChars.
 */
export function loadStackRulesBlock(projectRoot: string, profile: StackProfile, maxChars = DEFAULT_MAX_CHARS): string {
    const baseDir = rulesBaseDir();
    const names = selectStackRuleFilenames(profile);
    const chunks: string[] = [];

    const universalBody = readRuleFile(baseDir, UNIVERSAL_RULE_FILE);
    if (universalBody) {
        chunks.push(`## ${UNIVERSAL_RULE_FILE}\n\n${universalBody}`);
    }

    for (const name of names) {
        const body = readRuleFile(baseDir, name);
        if (body) chunks.push(`## ${name}\n\n${body}`);
    }

    if (chunks.length === 0) {
        const fb = readRuleFile(baseDir, 'fallback-unknown.md');
        if (fb) chunks.push(`## fallback-unknown.md\n\n${fb}`);
    }

    const optionalPath = path.join(projectRoot, '.basalt', 'stack-rules.md');
    if (fs.existsSync(optionalPath)) {
        const extra = readRuleFile(path.dirname(optionalPath), 'stack-rules.md');
        if (extra) chunks.push(`## .basalt/stack-rules.md (프로젝트 전용)\n\n${extra}`);
    }

    let out = chunks.join('\n\n---\n\n');
    if (out.length > maxChars) {
        out = `${out.slice(0, maxChars)}\n\n...[STACK_RULES truncated]`;
    }
    return out;
}
