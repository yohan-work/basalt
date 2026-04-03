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
