import type { AgentDefinition } from '@/lib/agent-loader';

export function normalizeAgentKey(value: string): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .trim();
}

/** Case-insensitive substring match on task / summary text */
export const ROLE_KEYWORD_HINTS: { role: string; needles: string[] }[] = [
    {
        role: 'database-administrator',
        needles: [
            'supabase',
            'migration',
            'migrations',
            'schema',
            'postgres',
            'postgresql',
            'sql',
            'prisma',
            'drizzle',
            'rls',
            'row level',
            '마이그레이션',
            '스키마',
            '데이터베이스',
            '디비',
        ],
    },
    {
        role: 'devops-engineer',
        needles: [
            'docker',
            'kubernetes',
            'k8s',
            'ci/cd',
            'ci cd',
            'github actions',
            'deploy',
            'deployment',
            'pipeline',
            'helm',
            'terraform',
            'infra',
            '배포',
            '파이프라인',
            '데브옵스',
        ],
    },
    {
        role: 'git-manager',
        needles: [
            'git',
            'branch',
            'merge',
            'rebase',
            'commit',
            'pull request',
            'pr ',
            'changelog',
            '브랜치',
            '머지',
            '커밋',
            '깃',
        ],
    },
    {
        role: 'qa',
        needles: [
            'e2e',
            'playwright',
            'cypress',
            'jest',
            'vitest',
            'test',
            'testing',
            'regression',
            'bug',
            '품질',
            '테스트',
            'qa',
        ],
    },
    {
        role: 'technical-writer',
        needles: [
            'readme',
            'documentation',
            'docs',
            'doc ',
            'changelog',
            '가이드',
            '문서',
            '위키',
        ],
    },
    {
        role: 'code-mapper',
        needles: [
            'code map',
            'codemap',
            'call chain',
            'call graph',
            'entry point',
            'trace',
            'ownership',
            'where does',
            'which file',
            'refactor plan',
            'before we change',
            '코드 맵',
            '호출',
            '엔트리',
            '흐름',
            '어느 파일',
        ],
    },
    {
        role: 'ui-fixer',
        needles: [
            'ui bug',
            'visual bug',
            'layout bug',
            'misaligned',
            'broken layout',
            'smallest patch',
            'minimal fix',
            'ui fix',
            'css fix',
            '반응형 버그',
            '레이아웃 깨짐',
            '최소 수정',
        ],
    },
    {
        role: 'api-designer',
        needles: [
            'api design',
            'api contract',
            'route handler',
            'rest api',
            'openapi',
            'request schema',
            'response schema',
            'breaking api',
            'versioning api',
            'rpc',
            '서버 액션',
            '계약',
            'api 설계',
        ],
    },
];

export const CONSULT_CORE_ROLES = ['product-manager', 'main-agent', 'software-engineer', 'style-architect'] as const;

export function collectRolesFromKeywordHints(text: string, allowedRoles: Set<string>): string[] {
    const lower = text.toLowerCase();
    const out: string[] = [];
    for (const { role, needles } of ROLE_KEYWORD_HINTS) {
        if (!allowedRoles.has(role)) continue;
        if (needles.some((n) => lower.includes(n.toLowerCase()))) {
            out.push(role);
        }
    }
    return out;
}

function consultMaxParticipants(): number {
    const raw = parseInt(process.env.CONSULT_MAX_PARTICIPANTS || '8', 10);
    if (Number.isFinite(raw) && raw >= 4) return Math.min(16, raw);
    return 8;
}

/**
 * Priority: required_agents (analysis) > keyword hints > high-complexity QA > core UI roles.
 * Only roles present in `availableAgents` are returned.
 */
export function pickConsultParticipantRoles(
    taskAnalysis: unknown,
    availableAgents: AgentDefinition[],
    options?: { extraHintText?: string }
): string[] {
    const max = consultMaxParticipants();
    const allowed = new Set(availableAgents.map((a) => a.role));
    const normToRole = new Map<string, string>();
    for (const a of availableAgents) {
        normToRole.set(normalizeAgentKey(a.role), a.role);
        normToRole.set(normalizeAgentKey(a.name), a.role);
    }

    const ordered: string[] = [];
    const pushRole = (role: string) => {
        if (!allowed.has(role) || ordered.includes(role)) return;
        ordered.push(role);
    };

    const ta = taskAnalysis as Record<string, unknown> | null | undefined;
    const requiredRaw = Array.isArray(ta?.required_agents) ? ta!.required_agents : [];
    for (const c of requiredRaw) {
        if (typeof c !== 'string') continue;
        const resolved = normToRole.get(normalizeAgentKey(c));
        if (resolved) pushRole(resolved);
    }

    const textBlob = [
        typeof ta?.summary === 'string' ? ta.summary : '',
        typeof ta?.overallTask === 'string' ? ta.overallTask : '',
        typeof ta?.objective === 'string' ? ta.objective : '',
        options?.extraHintText || '',
    ].join(' ');

    for (const role of collectRolesFromKeywordHints(textBlob, allowed)) {
        pushRole(role);
    }

    if (ta?.complexity === 'high' && allowed.has('qa')) {
        pushRole('qa');
    }

    for (const r of CONSULT_CORE_ROLES) {
        if (allowed.has(r)) pushRole(r);
    }

    return ordered.slice(0, max);
}

/**
 * Map user's last message to a single agent slug when they address someone by role (Korean/English).
 * Order: more specific phrases first.
 */
export function resolveTargetedConsultRole(lastUserMessage: string): string | null {
    const msg = lastUserMessage.trim();
    if (!msg) return null;
    const lower = msg.toLowerCase();

    const rules: { role: string; needles: string[] }[] = [
        { role: 'technical-writer', needles: ['테크니컬 라이터', 'technical writer', '문서 담당', '문서가', 'readme'] },
        { role: 'git-manager', needles: ['깃 매니저', 'git manager', '브랜치 담당', '머지 담당'] },
        { role: 'database-administrator', needles: ['dba', '데이터베이스 관리', 'db 관리', '디비 관리', '스키마 담당'] },
        { role: 'devops-engineer', needles: ['데브옵스', 'devops', '배포 담당', '인프라'] },
        { role: 'qa', needles: ['qa', '테스터', '품질 보증', '품질담당', '테스트 담당'] },
        { role: 'style-architect', needles: ['디자이너', '스타일 아키텍트', '스타일', '디자인', 'ui ', 'ux '] },
        { role: 'software-engineer', needles: ['엔지니어', '개발자', '개발', '프론트', '백엔드', 'software engineer'] },
        { role: 'product-manager', needles: ['pm', '기획', '피엠', '프로덕트 매니저', 'product manager'] },
        { role: 'main-agent', needles: ['리드', '팀장', '메인 에이전트', '메인', '오케스트레이터', 'main agent'] },
        { role: 'code-mapper', needles: ['코드 매퍼', 'code mapper', '코드맵'] },
        { role: 'ui-fixer', needles: ['ui fixer', 'ui 수정자', 'ui 픽서'] },
        { role: 'api-designer', needles: ['api designer', 'api 설계자', '계약 설계'] },
    ];

    for (const { role, needles } of rules) {
        for (const n of needles) {
            const nl = n.toLowerCase();
            if (n.length <= 3 && /^[a-z]{1,3}$/i.test(n.trim())) {
                const re = new RegExp(`\\b${n.trim()}\\b`, 'i');
                if (re.test(msg)) return role;
            } else if (msg.includes(n) || lower.includes(nl)) {
                return role;
            }
        }
    }
    return null;
}

/** After LLM analysis: widen required_agents using the same keyword rules (deterministic). */
export function augmentRequiredAgentsFromTaskText(
    taskDescription: string,
    requiredAgents: string[],
    availableAgents: AgentDefinition[]
): string[] {
    const allowed = new Set(availableAgents.map((a) => a.role));
    const out: string[] = [];
    const seen = new Set<string>();
    for (const r of requiredAgents) {
        if (typeof r !== 'string' || !allowed.has(r)) continue;
        if (!seen.has(r)) {
            seen.add(r);
            out.push(r);
        }
    }
    for (const role of collectRolesFromKeywordHints(taskDescription, allowed)) {
        if (!seen.has(role)) {
            seen.add(role);
            out.push(role);
        }
    }
    return out;
}
