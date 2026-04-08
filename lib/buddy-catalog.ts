export type BuddyAnimationState = 'idle' | 'idea' | 'critique' | 'agreement' | 'warning' | 'celebrate';

import type {
    BuddyCosmeticProfile,
    BuddyRarity,
    BuddyTraitProfile,
    TaskBuddyInstance,
} from '@/lib/types/agent-visualization';

export interface BuddyReaction {
    state: BuddyAnimationState;
    label: string;
    comment: string;
    emote: string;
    severity: 'low' | 'medium' | 'high';
}

export interface BuddyDefinition {
    id: string;
    name: string;
    rarity: BuddyRarity;
    ascii: string;
    hat?: string;
    personaHint: string;
    promptHint: string;
    accentClassName: string;
    frames: Record<BuddyAnimationState, string[]>;
}

export const BUDDY_RARITY_ORDER: BuddyRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const BUDDY_RARITY_LABELS: Record<BuddyRarity, string> = {
    common: 'common',
    uncommon: 'uncommon',
    rare: 'rare',
    epic: 'epic',
    legendary: 'legendary',
};

export const BUDDY_RARITY_COLORS: Record<BuddyRarity, string> = {
    common: 'bg-slate-400',
    uncommon: 'bg-emerald-500',
    rare: 'bg-blue-500',
    epic: 'bg-violet-500',
    legendary: 'bg-amber-400',
};

type BuddyFrameMap = Record<BuddyAnimationState, string[]>;
type BuddySeed = Omit<BuddyDefinition, 'ascii' | 'frames'> & {
    frames: Partial<BuddyFrameMap>;
};

function normalizeFrame(frame: string, width: number, height: number): string {
    const lines = frame.split('\n');
    const padded = lines.map((line) => line.padEnd(width, ' '));
    while (padded.length < height) padded.push(' '.repeat(width));
    return padded.join('\n');
}

function normalizeBuddyFrames(frames: Partial<BuddyFrameMap>): BuddyFrameMap {
    const baseIdle = frames.idle ?? ['(?)'];
    const merged: BuddyFrameMap = {
        idle: baseIdle,
        idea: frames.idea ?? baseIdle,
        critique: frames.critique ?? baseIdle,
        agreement: frames.agreement ?? baseIdle,
        warning: frames.warning ?? frames.critique ?? baseIdle,
        celebrate: frames.celebrate ?? frames.agreement ?? baseIdle,
    };

    let width = 0;
    let height = 0;
    for (const stateFrames of Object.values(merged)) {
        for (const frame of stateFrames) {
            const lines = frame.split('\n');
            height = Math.max(height, lines.length);
            width = Math.max(width, ...lines.map((line) => line.length));
        }
    }

    const normalized = {} as BuddyFrameMap;
    for (const key of Object.keys(merged) as BuddyAnimationState[]) {
        normalized[key] = merged[key].map((frame) => normalizeFrame(frame, width, height));
    }
    return normalized;
}

function createBuddyDefinition(seed: BuddySeed): BuddyDefinition {
    const frames = normalizeBuddyFrames(seed.frames);
    return {
        ...seed,
        ascii: frames.idle[0],
        frames,
    };
}

export const BUDDY_DEFINITIONS: BuddyDefinition[] = [
    createBuddyDefinition({
        id: 'duck',
        name: 'Duck',
        rarity: 'common',
        personaHint: '낙관적이고 부담을 낮추는 안내형 버디',
        promptHint: 'Keep the tone light, concrete, and momentum-oriented.',
        accentClassName: 'border-amber-400/40 bg-amber-50 text-amber-900 dark:bg-amber-950/20 dark:text-amber-100',
        frames: {
            idle: [
                String.raw`<(o )___
 ( ._> /`,
                String.raw`<(o )___
 ( -_> /`,
            ],
            idea: [
                String.raw`<(O )___
 ( ._> /`,
                String.raw`<(o )___
 ( ^_> /`,
            ],
            critique: [
                String.raw`<(> )___
 ( ._> /`,
                String.raw`<(x )___
 ( ._> /`,
            ],
            agreement: [
                String.raw`<(o )___
 ( ^_> /`,
                String.raw`<(o )___
 ( ^-< /`,
            ],
        },
    }),
    createBuddyDefinition({
        id: 'cat',
        name: 'Cat',
        rarity: 'common',
        personaHint: '예민하게 이상 징후를 짚는 리뷰형 버디',
        promptHint: 'Favor precise critique and point out suspicious details early.',
        accentClassName: 'border-sky-400/40 bg-sky-50 text-sky-900 dark:bg-sky-950/20 dark:text-sky-100',
        frames: {
            idle: [
                String.raw` /\_/\\
( o.o )
 > ^ <`,
                String.raw` /\_/\\
( -.- )
 > ^ <`,
            ],
            idea: [
                String.raw` /\_/\\
( 0.0 )
 > ^ <`,
                String.raw` /\_/\\
( o.o )
 > ~ <`,
            ],
            critique: [
                String.raw` /\_/\\
( >.< )
 > ^ <`,
                String.raw` /\_/\\
( o_o )
 > ^ <`,
            ],
            agreement: [
                String.raw` /\_/\\
( ^.^ )
 > ^ <`,
                String.raw` /\_/\\
( ^o^ )
 > ^ <`,
            ],
        },
    }),
    createBuddyDefinition({
        id: 'ghost',
        name: 'Ghost',
        rarity: 'uncommon',
        personaHint: '조용하지만 리스크를 먼저 감지하는 버디',
        promptHint: 'Surface hidden risks, edge cases, and rollback concerns.',
        accentClassName: 'border-violet-400/40 bg-violet-50 text-violet-900 dark:bg-violet-950/20 dark:text-violet-100',
        frames: {
            idle: [
                String.raw` .-.
(o o)
| O \
 \   \
  \`~~~'`,
                String.raw` .-.
(o o)
| - \
 \   \
  \`~~~'`,
            ],
            idea: [
                String.raw` .-.
(O O)
| O \
 \   \
  \`~~~'`,
            ],
            critique: [
                String.raw` .-.
(@ @)
| O \
 \ ! \
  \`~~~'`,
                String.raw` .-.
(! !)
| O \
 \   \
  \`~~~'`,
            ],
            agreement: [
                String.raw` .-.
(^ ^)
| O \
 \   \
  \`~~~'`,
            ],
        },
    }),
    createBuddyDefinition({
        id: 'robot',
        name: 'Robot',
        rarity: 'rare',
        personaHint: '정확성과 구조화를 중시하는 실행형 버디',
        promptHint: 'Prefer explicit structure, exact fields, and low-ambiguity wording.',
        accentClassName: 'border-cyan-400/40 bg-cyan-50 text-cyan-900 dark:bg-cyan-950/20 dark:text-cyan-100',
        frames: {
            idle: [
                `[::::]
|_[]_|
/_||_\\`,
                `[.::.]
|_[]_|
/_||_\\`,
            ],
            idea: [
                `[0::0]
|_[]_|
/_||_\\`,
            ],
            critique: [
                `[>!!<]
|_[]_|
/_||_\\`,
                `[x::x]
|_[]_|
/_||_\\`,
            ],
            agreement: [
                `[^::^]
|_[]_|
/_||_\\`,
            ],
        },
    }),
    createBuddyDefinition({
        id: 'rabbit',
        name: 'Rabbit',
        rarity: 'epic',
        personaHint: '속도감 있게 다음 액션을 밀어주는 버디',
        promptHint: 'Bias toward crisp next steps and short implementation paths.',
        accentClassName: 'border-pink-400/40 bg-pink-50 text-pink-900 dark:bg-pink-950/20 dark:text-pink-100',
        frames: {
            idle: [
                String.raw`(\_/)
(o.o)
(")(")`,
                String.raw`(\_/)
(-.-)
(")(")`,
            ],
            idea: [
                String.raw`(\_/)
(O.O)
(")(")`,
            ],
            critique: [
                String.raw`(\_/)
(>.<)
(")(")`,
                String.raw`(\_/)
(!.!)
(")(")`,
            ],
            agreement: [
                String.raw`(\_/)
(^.^)
(")(")`,
                String.raw`(\_/)
(^o^)
(")(")`,
            ],
        },
    }),
    createBuddyDefinition({
        id: 'dragon',
        name: 'Dragon',
        rarity: 'legendary',
        hat: 'crown',
        personaHint: '난도 높은 작업에서 기준을 높이는 리드형 버디',
        promptHint: 'Raise the quality bar and call out weak assumptions before execution.',
        accentClassName: 'border-rose-400/40 bg-rose-50 text-rose-900 dark:bg-rose-950/20 dark:text-rose-100',
        frames: {
            idle: [
                String.raw` / \\  //\\
((ovo))
 \\_==_/`,
                String.raw` / \\  //\\
((-v-))
 \\_==_/`,
            ],
            idea: [
                String.raw` / \\  //\\
((Ovo))
 \\_==_/`,
            ],
            critique: [
                String.raw` / \\  //\\
((>v<))
 \\_==_/`,
                String.raw` / \\  //\\
((!v!))
 \\_==_/`,
            ],
            agreement: [
                String.raw` / \\  //\\
((^v^))
 \\_==_/`,
            ],
            celebrate: [
                String.raw` / \\  //\\
((*v*))
 \\_==_/`,
                String.raw` / \\  //\\
((^v^))
 \\_==_/`,
            ],
        },
    }),
];

export const DEFAULT_BUDDY_ID = 'duck';

const BUDDY_REACTION_COPY: Record<string, Partial<Record<BuddyAnimationState, Omit<BuddyReaction, 'state'>>>> = {
    duck: {
        idea: { label: '흥미', comment: '이 방향이면 바로 굴려볼 수 있겠는데.', emote: '💡', severity: 'low' },
        critique: { label: '경계', comment: '잠깐, 여기서 삐끗할 여지가 보여.', emote: '⚠️', severity: 'high' },
        agreement: { label: '호응', comment: '좋아, 이건 그대로 밀어도 된다.', emote: '👍', severity: 'low' },
        warning: { label: '주의', comment: '속도보다 안정성을 먼저 챙기자.', emote: '🚧', severity: 'high' },
        celebrate: { label: '완료감', comment: '좋다, 이제 마무리 검증만 남았다.', emote: '✨', severity: 'medium' },
    },
    cat: {
        idea: { label: '스캔', comment: '겉보기는 괜찮지만 디테일을 더 보자.', emote: '👀', severity: 'medium' },
        critique: { label: '집중', comment: '이건 그냥 넘기면 나중에 다시 터진다.', emote: '⚠️', severity: 'high' },
        agreement: { label: '승인', comment: '이 정도면 기준은 넘겼다.', emote: '👌', severity: 'low' },
        warning: { label: '경보', comment: '리스크 냄새가 진하다. 지금 잡는 게 맞다.', emote: '🚨', severity: 'high' },
        celebrate: { label: '안착', comment: '좋다. 이제 깔끔하게 정리만 하자.', emote: '✨', severity: 'medium' },
    },
    ghost: {
        idea: { label: '감지', comment: '보이지 않는 연결고리도 같이 봐야 한다.', emote: '🫥', severity: 'medium' },
        critique: { label: '리스크', comment: '숨은 실패 경로가 보인다. 여기서 멈춰 보자.', emote: '⚠️', severity: 'high' },
        agreement: { label: '조용한 승인', comment: '이 흐름은 큰 충돌 없이 이어질 것 같다.', emote: '✅', severity: 'low' },
        warning: { label: '위험 감지', comment: '롤백 경로를 먼저 확인해야 한다.', emote: '👻', severity: 'high' },
        celebrate: { label: '정리', comment: '좋다. 흔적 없이 잘 닫히고 있다.', emote: '🌫️', severity: 'medium' },
    },
    robot: {
        idea: { label: '구조화', comment: '입력과 출력이 선명해졌다.', emote: '📐', severity: 'low' },
        critique: { label: '불일치', comment: '형식이 흔들린다. 지금 바로 맞춰야 한다.', emote: '🛠️', severity: 'high' },
        agreement: { label: '정합', comment: '좋다. 이건 구조적으로도 안정적이다.', emote: '✅', severity: 'low' },
        warning: { label: '경계선', comment: '애매한 타입이 많다. 명시적으로 좁혀야 한다.', emote: '🤖', severity: 'high' },
        celebrate: { label: '완료', comment: '사양과 구현이 맞물렸다.', emote: '✨', severity: 'medium' },
    },
    rabbit: {
        idea: { label: '가속', comment: '좋아, 다음 액션으로 바로 이어지겠다.', emote: '⚡', severity: 'low' },
        critique: { label: '급제동', comment: '여기서 달리면 사고 난다. 잠깐 멈추자.', emote: '⚠️', severity: 'high' },
        agreement: { label: '탄력', comment: '이건 속도감 있게 밀어도 된다.', emote: '🏁', severity: 'low' },
        warning: { label: '브레이크', comment: '지금은 빠름보다 안전이 먼저다.', emote: '🛑', severity: 'high' },
        celebrate: { label: '스퍼트', comment: '좋아, 끝까지 깔끔하게 가져가자.', emote: '🎉', severity: 'medium' },
    },
    dragon: {
        idea: { label: '점화', comment: '좋다. 이제 기준을 더 높여도 된다.', emote: '🔥', severity: 'medium' },
        critique: { label: '심문', comment: '가정이 약하다. 이 상태론 통과시키기 어렵다.', emote: '⚠️', severity: 'high' },
        agreement: { label: '승인', comment: '이건 품질 기준을 만족한다.', emote: '👑', severity: 'medium' },
        warning: { label: '고위험', comment: '이 구간은 강하게 검수해야 한다.', emote: '🐉', severity: 'high' },
        celebrate: { label: '승전', comment: '좋다. 마감 품질까지 끌어올렸다.', emote: '✨', severity: 'medium' },
    },
};

export function getBuddyDefinition(buddyId?: string | null): BuddyDefinition {
    return (
        BUDDY_DEFINITIONS.find((entry) => entry.id === buddyId) ||
        BUDDY_DEFINITIONS.find((entry) => entry.id === DEFAULT_BUDDY_ID) ||
        BUDDY_DEFINITIONS[0]
    );
}

function clampTrait(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
}

function seedFromString(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function seededUnit(seed: string, salt: string): number {
    const value = seedFromString(`${seed}:${salt}`);
    return value / 0xffffffff;
}

function buildTraitProfile(seed: string, buddyId: string): BuddyTraitProfile {
    const base = seedFromString(`${seed}:${buddyId}:traits`);
    return {
        debugging: clampTrait(35 + (base % 45)),
        patience: clampTrait(30 + (Math.floor(base / 7) % 50)),
        chaos: clampTrait(15 + (Math.floor(base / 17) % 65)),
        wisdom: clampTrait(25 + (Math.floor(base / 29) % 55)),
        snark: clampTrait(10 + (Math.floor(base / 41) % 70)),
    };
}

function pickSeeded<T>(seed: string, salt: string, values: readonly T[]): T | undefined {
    if (!values.length) return undefined;
    const index = Math.floor(seededUnit(seed, salt) * values.length) % values.length;
    return values[index];
}

function buildCosmeticProfile(seed: string, definition: BuddyDefinition): BuddyCosmeticProfile {
    return {
        hat: definition.hat || pickSeeded(seed, 'hat', ['beanie', 'visor', 'crown', 'none']),
        eyes: pickSeeded(seed, 'eyes', ['soft', 'sharp', 'wide', 'sleepy']),
        variant: pickSeeded(seed, 'variant', ['classic', 'mint', 'sunset', 'mono']),
    };
}

function buildBuddyName(seed: string, definition: BuddyDefinition): string {
    const prefixes = ['Nova', 'Pico', 'Miso', 'Rune', 'Toto', 'Nori', 'Luma', 'Byte'];
    const suffixes = ['loop', 'spark', 'dash', 'mint', 'note', 'beam', 'patch', 'watch'];
    const prefix = pickSeeded(seed, `${definition.id}:name:prefix`, prefixes) || definition.name;
    const suffix = pickSeeded(seed, `${definition.id}:name:suffix`, suffixes) || definition.id;
    return `${prefix} ${suffix}`;
}

export function createTaskBuddyInstance(buddyId: string, seedHint?: string): TaskBuddyInstance {
    const definition = getBuddyDefinition(buddyId);
    const personaSeed = seedHint?.trim() || `${definition.id}:${Date.now()}`;
    return {
        instanceId: `${definition.id}-${seedFromString(`${personaSeed}:instance`).toString(36)}`,
        buddyId: definition.id,
        name: buildBuddyName(personaSeed, definition),
        rarity: definition.rarity,
        traits: buildTraitProfile(personaSeed, definition.id),
        cosmetic: buildCosmeticProfile(personaSeed, definition),
        personaSeed,
        selectedAt: new Date().toISOString(),
    };
}

export function resolveTaskBuddySelection(raw: unknown): TaskBuddyInstance | null {
    if (!raw || typeof raw !== 'object') return null;
    const data = raw as Record<string, unknown>;
    const buddyId = typeof data.buddyId === 'string' ? data.buddyId.trim() : '';
    if (!buddyId) return null;
    const definition = getBuddyDefinition(buddyId);
    const personaSeed = typeof data.personaSeed === 'string' && data.personaSeed.trim()
        ? data.personaSeed.trim()
        : `${buddyId}:${typeof data.selectedAt === 'string' ? data.selectedAt : 'legacy'}`;
    const defaultTraits = buildTraitProfile(personaSeed, buddyId);
    return {
        instanceId: typeof data.instanceId === 'string' && data.instanceId.trim()
            ? data.instanceId.trim()
            : `${buddyId}-${seedFromString(`${personaSeed}:legacy`).toString(36)}`,
        buddyId,
        name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : definition.name,
        rarity:
            data.rarity === 'common'
            || data.rarity === 'uncommon'
            || data.rarity === 'rare'
            || data.rarity === 'epic'
            || data.rarity === 'legendary'
                ? data.rarity
                : definition.rarity,
        traits: {
            debugging: clampTrait(typeof (data.traits as Record<string, unknown> | undefined)?.debugging === 'number' ? (data.traits as Record<string, number>).debugging : defaultTraits.debugging),
            patience: clampTrait(typeof (data.traits as Record<string, unknown> | undefined)?.patience === 'number' ? (data.traits as Record<string, number>).patience : defaultTraits.patience),
            chaos: clampTrait(typeof (data.traits as Record<string, unknown> | undefined)?.chaos === 'number' ? (data.traits as Record<string, number>).chaos : defaultTraits.chaos),
            wisdom: clampTrait(typeof (data.traits as Record<string, unknown> | undefined)?.wisdom === 'number' ? (data.traits as Record<string, number>).wisdom : defaultTraits.wisdom),
            snark: clampTrait(typeof (data.traits as Record<string, unknown> | undefined)?.snark === 'number' ? (data.traits as Record<string, number>).snark : defaultTraits.snark),
        },
        cosmetic: typeof data.cosmetic === 'object' && data.cosmetic
            ? (data.cosmetic as BuddyCosmeticProfile)
            : buildCosmeticProfile(personaSeed, definition),
        personaSeed,
        selectedAt: typeof data.selectedAt === 'string' ? data.selectedAt : new Date(0).toISOString(),
        lastReactedAt: typeof data.lastReactedAt === 'string' ? data.lastReactedAt : undefined,
    };
}

export function buildBuddyPromptContext(selection: TaskBuddyInstance | null | undefined): string {
    if (!selection?.buddyId) return '';
    const buddy = getBuddyDefinition(selection.buddyId);
    const sortedTraits = Object.entries(selection.traits || {})
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 2)
        .map(([key, value]) => `${key}:${value}`)
        .join(', ');
    return [
        '[TASK BUDDY]',
        `id: ${buddy.id}`,
        `species: ${buddy.name}`,
        `instance_name: ${selection.name}`,
        `rarity: ${buddy.rarity}`,
        `persona: ${buddy.personaHint}`,
        `prompt_hint: ${buddy.promptHint}`,
        `dominant_traits: ${sortedTraits || 'none'}`,
        `cosmetic: ${selection.cosmetic?.hat || 'none'} / ${selection.cosmetic?.eyes || 'default'} / ${selection.cosmetic?.variant || 'classic'}`,
        'Use this only as a light tone/personality cue. Do not change core technical decisions because of it.',
    ].join('\n');
}

export function resolveBuddyAnimationState(input?: {
    thoughtType?: string | null;
    isHighlighted?: boolean;
    isComplete?: boolean;
    isWarning?: boolean;
}): BuddyAnimationState {
    if (input?.isComplete) return 'celebrate';
    if (input?.isWarning) return 'warning';
    if (input?.thoughtType === 'critique') return input?.isHighlighted ? 'warning' : 'critique';
    if (input?.thoughtType === 'agreement') return input?.isHighlighted ? 'celebrate' : 'agreement';
    if (input?.thoughtType === 'idea') return 'idea';
    return 'idle';
}

export function getBuddyReaction(
    buddyId?: string | null,
    options?: {
        thoughtType?: string | null;
        isHighlighted?: boolean;
        isComplete?: boolean;
        isWarning?: boolean;
    }
): BuddyReaction {
    const buddy = getBuddyDefinition(buddyId);
    const state = resolveBuddyAnimationState(options);
    const copy = BUDDY_REACTION_COPY[buddy.id]?.[state] ?? {
        label: '대기',
        comment: buddy.personaHint,
        emote: '... ',
        severity: 'low' as const,
    };
    return {
        state,
        label: copy.label,
        comment: copy.comment,
        emote: copy.emote,
        severity: copy.severity,
    };
}
