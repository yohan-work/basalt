import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import matter from 'gray-matter';

export type SessionMemoryKind = 'plan' | 'review' | 'execution' | 'qa' | 'note';

export type SessionMemoryEntryInput = {
    projectPath: string;
    taskId: string;
    kind: SessionMemoryKind;
    title: string;
    summary: string;
    body?: string;
    keywords?: string[];
    source?: string;
    createdAt?: string;
    metadata?: Record<string, unknown>;
};

type SessionMemoryFrontmatter = {
    kind: SessionMemoryKind;
    taskId: string;
    projectKey: string;
    title: string;
    summary: string;
    keywords: string[];
    source?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type SessionMemoryRecord = SessionMemoryFrontmatter & {
    filePath: string;
    body: string;
};

const MAX_CONTEXT_ITEMS = 5;
const MAX_CONTEXT_CHARS = 5000;
const MAX_FILE_SCAN = 120;
const CONSOLIDATION_SCAN_INTERVAL_SECS = 10 * 60;
const CONSOLIDATION_LOCK_STALE_SECS = 60 * 60;

type MemoryConsolidationState = {
    lastConsolidatedAt?: number;
    lastSessionScanAt?: number;
};

function normalizeText(value: string): string {
    return String(value || '').toLowerCase().replace(/[^a-z0-9가-힣\s]/g, ' ');
}

function slugify(value: string): string {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/['"]/g, '')
        .replace(/[^a-z0-9가-힣]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || 'memory';
}

function sanitizeProjectKey(projectPath: string): string {
    return crypto.createHash('sha1').update(path.resolve(projectPath)).digest('hex').slice(0, 12);
}

export function resolveSessionMemoryRoot(projectPath: string): string {
    return path.join(path.resolve(projectPath), '.basalt', 'session-memory', sanitizeProjectKey(projectPath));
}

function resolveConsolidationStatePath(projectPath: string): string {
    return path.join(resolveSessionMemoryRoot(projectPath), '.consolidation-state.json');
}

function resolveConsolidationLockPath(projectPath: string): string {
    return path.join(resolveSessionMemoryRoot(projectPath), '.consolidation.lock');
}

function resolveConsolidationIndexPath(projectPath: string): string {
    return path.join(resolveSessionMemoryRoot(projectPath), 'MEMORY_INDEX.md');
}

function nowSecs(): number {
    return Math.floor(Date.now() / 1000);
}

function resolveMemoryConsolidationEnabled(): boolean {
    const raw = String(process.env.BASALT_MEMORY_CONSOLIDATION_ENABLED ?? '1').trim().toLowerCase();
    return !['0', 'false', 'no', 'off'].includes(raw);
}

function resolveMinConsolidationHours(): number {
    const raw = Number(process.env.BASALT_MEMORY_CONSOLIDATION_MIN_HOURS ?? 24);
    if (!Number.isFinite(raw) || raw <= 0) return 24;
    return raw;
}

function resolveMinConsolidationSessions(): number {
    const raw = Number(process.env.BASALT_MEMORY_CONSOLIDATION_MIN_SESSIONS ?? 5);
    if (!Number.isFinite(raw) || raw <= 0) return 5;
    return Math.round(raw);
}

async function loadConsolidationState(projectPath: string): Promise<MemoryConsolidationState> {
    const p = resolveConsolidationStatePath(projectPath);
    try {
        const raw = await fs.promises.readFile(p, 'utf8');
        const parsed = JSON.parse(raw) as MemoryConsolidationState;
        return {
            lastConsolidatedAt: Number.isFinite(parsed.lastConsolidatedAt) ? Number(parsed.lastConsolidatedAt) : undefined,
            lastSessionScanAt: Number.isFinite(parsed.lastSessionScanAt) ? Number(parsed.lastSessionScanAt) : undefined,
        };
    } catch {
        return {};
    }
}

async function saveConsolidationState(projectPath: string, state: MemoryConsolidationState): Promise<void> {
    const p = resolveConsolidationStatePath(projectPath);
    await fs.promises.mkdir(path.dirname(p), { recursive: true });
    await fs.promises.writeFile(p, JSON.stringify(state, null, 2), 'utf8');
}

function timeGatePasses(state: MemoryConsolidationState): boolean {
    if (!state.lastConsolidatedAt) return true;
    const elapsedHours = (nowSecs() - state.lastConsolidatedAt) / 3600;
    return elapsedHours >= resolveMinConsolidationHours();
}

async function countNewSessionFiles(projectPath: string, sinceSecs: number): Promise<number> {
    const root = resolveSessionMemoryRoot(projectPath);
    if (!fs.existsSync(root)) return 0;

    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.md')) continue;
        if (entry.name === 'MEMORY_INDEX.md') continue;
        const full = path.join(root, entry.name);
        try {
            const stat = await fs.promises.stat(full);
            const mtimeSecs = Math.floor(stat.mtimeMs / 1000);
            if (mtimeSecs > sinceSecs) {
                count += 1;
                if (count >= resolveMinConsolidationSessions()) {
                    return count;
                }
            }
        } catch {
            continue;
        }
    }
    return count;
}

async function lockGatePasses(projectPath: string): Promise<boolean> {
    const lockPath = resolveConsolidationLockPath(projectPath);
    if (!fs.existsSync(lockPath)) return true;
    try {
        const stat = await fs.promises.stat(lockPath);
        const lockAgeSecs = Math.floor((Date.now() - stat.mtimeMs) / 1000);
        return lockAgeSecs > CONSOLIDATION_LOCK_STALE_SECS;
    } catch {
        return true;
    }
}

async function acquireConsolidationLock(projectPath: string): Promise<void> {
    const lockPath = resolveConsolidationLockPath(projectPath);
    await fs.promises.mkdir(path.dirname(lockPath), { recursive: true });
    await fs.promises.writeFile(lockPath, String(nowSecs()), 'utf8');
}

async function releaseConsolidationLock(projectPath: string): Promise<void> {
    const lockPath = resolveConsolidationLockPath(projectPath);
    try {
        await fs.promises.unlink(lockPath);
    } catch {
        // best effort
    }
}

async function buildMemoryIndex(projectPath: string): Promise<void> {
    const root = resolveSessionMemoryRoot(projectPath);
    if (!fs.existsSync(root)) return;
    const entries = (await fs.promises.readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'MEMORY_INDEX.md')
        .slice(0, MAX_FILE_SCAN);

    const records: SessionMemoryRecord[] = [];
    for (const entry of entries) {
        const filePath = path.join(root, entry.name);
        try {
            const raw = await fs.promises.readFile(filePath, 'utf8');
            const parsed = matter(raw);
            const fm = (parsed.data || {}) as Partial<SessionMemoryFrontmatter>;
            if (!fm.kind || !fm.taskId || !fm.title || !fm.summary) continue;
            records.push({
                kind: fm.kind,
                taskId: String(fm.taskId),
                projectKey: String(fm.projectKey || ''),
                title: String(fm.title),
                summary: String(fm.summary),
                keywords: Array.isArray(fm.keywords) ? fm.keywords.map((k) => String(k)) : [],
                source: typeof fm.source === 'string' ? fm.source : undefined,
                createdAt: String(fm.createdAt || new Date().toISOString()),
                updatedAt: String(fm.updatedAt || new Date().toISOString()),
                metadata: typeof fm.metadata === 'object' && fm.metadata ? (fm.metadata as Record<string, unknown>) : undefined,
                filePath,
                body: parsed.content || '',
            });
        } catch {
            continue;
        }
    }

    const dedup = new Map<string, SessionMemoryRecord>();
    records
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .forEach((r) => {
            const key = `${r.kind}:${normalizeText(r.title)}:${normalizeText(r.summary).slice(0, 64)}`;
            if (!dedup.has(key)) dedup.set(key, r);
        });

    const top = Array.from(dedup.values()).slice(0, 80);
    const lines: string[] = [
        '# MEMORY_INDEX',
        '',
        `- generatedAt: ${new Date().toISOString()}`,
        `- entries: ${top.length}`,
        '',
    ];
    for (const r of top) {
        lines.push(`- [${r.kind}] ${r.title} — ${r.summary}`);
    }
    lines.push('');
    await fs.promises.writeFile(resolveConsolidationIndexPath(projectPath), lines.join('\n'), 'utf8');
}

export async function maybeConsolidateSessionMemory(projectPath: string): Promise<void> {
    if (!resolveMemoryConsolidationEnabled()) return;

    const state = await loadConsolidationState(projectPath);
    if (!timeGatePasses(state)) return;

    const now = nowSecs();
    const lastScanAt = state.lastSessionScanAt || 0;
    if (now - lastScanAt < CONSOLIDATION_SCAN_INTERVAL_SECS) return;

    const since = state.lastConsolidatedAt || 0;
    const newSessions = await countNewSessionFiles(projectPath, since);
    if (newSessions < resolveMinConsolidationSessions()) {
        await saveConsolidationState(projectPath, { ...state, lastSessionScanAt: now });
        return;
    }

    if (!(await lockGatePasses(projectPath))) return;
    await acquireConsolidationLock(projectPath);
    try {
        await buildMemoryIndex(projectPath);
        await saveConsolidationState(projectPath, {
            lastConsolidatedAt: nowSecs(),
            lastSessionScanAt: nowSecs(),
        });
    } finally {
        await releaseConsolidationLock(projectPath);
    }
}

function resolveMemoryFileName(entry: SessionMemoryEntryInput, createdAt: string): string {
    return `${createdAt.replace(/[:.]/g, '-')}-${entry.kind}-${slugify(entry.taskId)}-${slugify(entry.title)}.md`;
}

function formatFrontmatter(frontmatter: SessionMemoryFrontmatter): string {
    const keywordLines = frontmatter.keywords.length > 0
        ? frontmatter.keywords.map((keyword) => `  - ${JSON.stringify(keyword)}`).join('\n')
        : '  - []';
    const metadataLines = frontmatter.metadata && Object.keys(frontmatter.metadata).length > 0
        ? Object.entries(frontmatter.metadata)
              .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
              .join('\n')
        : '';

    return [
        '---',
        `kind: ${frontmatter.kind}`,
        `taskId: ${JSON.stringify(frontmatter.taskId)}`,
        `projectKey: ${JSON.stringify(frontmatter.projectKey)}`,
        `title: ${JSON.stringify(frontmatter.title)}`,
        `summary: ${JSON.stringify(frontmatter.summary)}`,
        'keywords:',
        keywordLines,
        frontmatter.source ? `source: ${JSON.stringify(frontmatter.source)}` : '',
        `createdAt: ${JSON.stringify(frontmatter.createdAt)}`,
        `updatedAt: ${JSON.stringify(frontmatter.updatedAt)}`,
        metadataLines ? 'metadata:' : '',
        metadataLines ? metadataLines : '',
        '---',
    ].filter(Boolean).join('\n');
}

export async function appendSessionMemoryEntry(input: SessionMemoryEntryInput): Promise<string> {
    const createdAt = input.createdAt || new Date().toISOString();
    const projectKey = sanitizeProjectKey(input.projectPath);
    const root = resolveSessionMemoryRoot(input.projectPath);
    const fileName = resolveMemoryFileName(input, createdAt);
    const fullPath = path.join(root, fileName);
    const frontmatter: SessionMemoryFrontmatter = {
        kind: input.kind,
        taskId: input.taskId,
        projectKey,
        title: input.title,
        summary: input.summary,
        keywords: Array.from(new Set((input.keywords || []).map((k) => String(k).trim()).filter(Boolean))).slice(0, 24),
        source: input.source,
        createdAt,
        updatedAt: createdAt,
        metadata: input.metadata,
    };

    const body = (input.body || '').trim();
    const content = `${formatFrontmatter(frontmatter)}\n\n${body}\n`;
    await fs.promises.mkdir(root, { recursive: true });
    await fs.promises.writeFile(fullPath, content, 'utf8');
    await maybeConsolidateSessionMemory(input.projectPath).catch(() => {});
    return fullPath;
}

function scoreRecord(record: SessionMemoryRecord, query: string): number {
    const queryTokens = normalizeText(query).split(/\s+/).filter(Boolean);
    const haystack = normalizeText([
        record.title,
        record.summary,
        record.keywords.join(' '),
        record.body.slice(0, 2000),
    ].join(' '));

    let score = 0;
    for (const token of queryTokens) {
        if (token.length < 2) continue;
        if (haystack.includes(token)) score += 3;
    }

    const ageMs = Date.now() - new Date(record.updatedAt || record.createdAt).getTime();
    if (Number.isFinite(ageMs)) {
        if (ageMs < 1000 * 60 * 60 * 24) score += 4;
        else if (ageMs < 1000 * 60 * 60 * 24 * 7) score += 2;
    }

    if (record.kind === 'plan') score += 1;
    if (record.kind === 'review') score += 1;
    return score;
}

function serializeRecord(record: SessionMemoryRecord): string {
    const header = `- [${record.kind}] ${record.title}`;
    const meta = `  - task: ${record.taskId}\n  - updated: ${record.updatedAt}`;
    const summary = `  - summary: ${record.summary}`;
    const keywords = record.keywords.length > 0 ? `  - keywords: ${record.keywords.join(', ')}` : '';
    const body = record.body.trim() ? `  - body:\n${record.body.trim().split('\n').map((line) => `    ${line}`).join('\n')}` : '';
    return [header, meta, summary, keywords, body].filter(Boolean).join('\n');
}

export async function loadRelevantSessionMemory(
    projectPath: string,
    query: string,
    options?: { limit?: number; maxChars?: number }
): Promise<string> {
    const root = resolveSessionMemoryRoot(projectPath);
    const expectedProjectKey = sanitizeProjectKey(projectPath);
    if (!fs.existsSync(root)) {
        return '';
    }

    const entries = fs.readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .slice(0, MAX_FILE_SCAN);

    const records: SessionMemoryRecord[] = [];
    for (const entry of entries) {
        try {
            const filePath = path.join(root, entry.name);
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsed = matter(raw);
            const fm = (parsed.data || {}) as Partial<SessionMemoryFrontmatter>;
            if (!fm.kind || !fm.taskId || !fm.title || !fm.summary) continue;
            if (String(fm.projectKey || '') !== expectedProjectKey) continue;
            records.push({
                kind: fm.kind,
                taskId: String(fm.taskId),
                projectKey: String(fm.projectKey || ''),
                title: String(fm.title),
                summary: String(fm.summary),
                keywords: Array.isArray(fm.keywords) ? fm.keywords.map((k) => String(k)) : [],
                source: typeof fm.source === 'string' ? fm.source : undefined,
                createdAt: String(fm.createdAt || parsed.data.createdAt || new Date().toISOString()),
                updatedAt: String(fm.updatedAt || parsed.data.updatedAt || new Date().toISOString()),
                metadata: typeof fm.metadata === 'object' && fm.metadata ? (fm.metadata as Record<string, unknown>) : undefined,
                filePath,
                body: parsed.content || '',
            });
        } catch {
            continue;
        }
    }

    const ranked = records
        .map((record) => ({ record, score: scoreRecord(record, query) }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score || new Date(b.record.updatedAt).getTime() - new Date(a.record.updatedAt).getTime())
        .slice(0, options?.limit ?? MAX_CONTEXT_ITEMS);

    if (ranked.length === 0) {
        return '';
    }

    const maxChars = options?.maxChars ?? MAX_CONTEXT_CHARS;
    let currentChars = 0;
    const lines: string[] = ['## SESSION_MEMORY'];
    for (const { record } of ranked) {
        const block = serializeRecord(record);
        if (currentChars + block.length > maxChars) break;
        lines.push(block);
        currentChars += block.length;
    }

    return lines.join('\n').trim();
}
