import fs from 'fs';
import path from 'path';
import { list_directory } from '@/lib/skills/index';
import { AgentLoader } from '@/lib/agent-loader';
import { resolveQaPageUrl } from '@/lib/project-dev-server';
import * as llm from '@/lib/llm';
import { MODEL_CONFIG } from '@/lib/model-config';
import { AgentBrowser, isAgentBrowserAvailable } from '@/lib/browser/agent-browser';
import { sampleProjectDirectoryTree } from '@/lib/qa/project-tree-sample';
import { collectAppRoutePageSanityIssues, isAppRouterPagePath } from '@/lib/qa/app-route-page-sanity';

interface VisualVerification {
    snapshotSummary?: string;
    screenshotPath?: string;
    annotations?: string[];
}

const MAX_TREE_ENTRIES = 200;
const TREE_MAX_DEPTH = 6;
const MAX_SNIPPET_FILES = 14;
const MAX_LINES_PER_FILE = 160;
const MAX_CHARS_PER_FILE = 14_000;
const MAX_TOTAL_SNIPPET_CHARS = 42_000;

function isVerifyFailOpen(): boolean {
    const v = String(process.env.VERIFY_FAIL_OPEN ?? 'true').toLowerCase();
    if (['false', '0', 'no'].includes(v)) return false;
    return true;
}

function extractFileChangePaths(taskMetadata?: Record<string, unknown> | null): string[] {
    const fc = taskMetadata?.fileChanges;
    if (!Array.isArray(fc)) return [];
    const out: string[] = [];
    for (const e of fc) {
        if (e && typeof e === 'object' && typeof (e as { filePath?: string }).filePath === 'string') {
            out.push((e as { filePath: string }).filePath);
        }
    }
    return [...new Set(out.map((p) => p.replace(/\\/g, '/')))];
}

function sortPathsForVerify(paths: string[]): string[] {
    return [...paths].sort((a, b) => {
        const pa = isAppRouterPagePath(a) ? 0 : 1;
        const pb = isAppRouterPagePath(b) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return a.localeCompare(b);
    });
}

function readFileSnippet(projectRoot: string, relPath: string): string | null {
    const full = path.join(projectRoot, relPath);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
    let raw: string;
    try {
        raw = fs.readFileSync(full, 'utf8');
    } catch {
        return null;
    }
    const lines = raw.split(/\r?\n/);
    const head = lines.slice(0, MAX_LINES_PER_FILE).join('\n');
    const clipped = head.length > MAX_CHARS_PER_FILE ? `${head.slice(0, MAX_CHARS_PER_FILE)}\n… [truncated]` : head;
    return clipped;
}

function buildChangeFileSnippetsBlock(projectPath: string, paths: string[]): string {
    const sorted = sortPathsForVerify(paths).slice(0, MAX_SNIPPET_FILES);
    const parts: string[] = [];
    let total = 0;
    for (const rel of sorted) {
        if (total >= MAX_TOTAL_SNIPPET_CHARS) break;
        const snip = readFileSnippet(projectPath, rel);
        if (!snip) continue;
        const block = `### ${rel}\n\`\`\`\n${snip}\n\`\`\`\n`;
        if (total + block.length > MAX_TOTAL_SNIPPET_CHARS) break;
        parts.push(block);
        total += block.length;
    }
    if (parts.length === 0) return '(변경 파일 스니펫 없음 — disk에 없거나 fileChanges 비어 있음)';
    return parts.join('\n');
}

async function tryVisualVerification(
    projectPath: string,
    taskMetadata?: Record<string, unknown> | null
): Promise<VisualVerification | null> {
    const available = await isAgentBrowserAvailable();
    if (!available) return null;

    const devServerUrl = resolveQaPageUrl(projectPath, taskMetadata);
    const sessionId = `verify-${Date.now()}`;
    const browser = new AgentBrowser(sessionId);

    try {
        const openResult = await browser.open(devServerUrl);
        if (!openResult.success) return null;

        await browser.waitForLoad('networkidle');

        const snap = await browser.snapshot({ interactive: true, compact: true });
        const snapshotSummary = snap.success ? (snap.snapshot ?? '').slice(0, 2000) : undefined;

        const shot = await browser.screenshot(`verify-${Date.now()}.png`, { annotate: true });

        return {
            snapshotSummary,
            screenshotPath: shot.success ? shot.path : undefined,
            annotations: shot.annotations,
        };
    } catch {
        return null;
    } finally {
        await browser.close().catch(() => {});
    }
}

function mergeVerificationWithSanity(
    verification: Record<string, unknown> & { verified?: boolean; notes?: string; suggestedFix?: string },
    sanityIssues: string[]
): Record<string, unknown> & { verified?: boolean; notes?: string; suggestedFix?: string } {
    if (sanityIssues.length === 0) return verification;
    const sanityBlock = sanityIssues.map((s) => `[sanity] ${s}`).join('\n');
    const notes = [verification.notes, sanityBlock].filter(Boolean).join('\n\n');
    return {
        ...verification,
        verified: false,
        notes,
        suggestedFix:
            typeof verification.suggestedFix === 'string' && verification.suggestedFix.trim()
                ? verification.suggestedFix
                : 'App Router의 page 파일은 mock 데이터 모듈이 아니라 UI 컴포넌트를 export default 해야 합니다. 데이터는 lib/ 등 별도 파일로 분리하세요.',
    };
}

export async function verify_final_output(
    taskDescription: string,
    projectPath: string = process.cwd(),
    taskMetadata?: Record<string, unknown> | null
) {
    const root = path.resolve(projectPath);
    let sanityIssues: string[] = [];

    try {
        const changePaths = extractFileChangePaths(taskMetadata);
        sanityIssues = collectAppRoutePageSanityIssues(root, changePaths);

        const files = await list_directory('.', projectPath);
        const fileListStr = Array.isArray(files) ? files.join('\n') : String(files);

        const treeList = sampleProjectDirectoryTree(root, TREE_MAX_DEPTH, MAX_TREE_ENTRIES);
        const treeBlock = treeList.length > 0 ? treeList.join('\n') : '(no subdirs sampled)';

        const snippetsBlock = buildChangeFileSnippetsBlock(root, changePaths);

        const skillDef = AgentLoader.loadSkill('verify_final_output');

        const visual = await tryVisualVerification(projectPath, taskMetadata);

        let visualContext = '';
        if (visual?.snapshotSummary) {
            visualContext = `\n\n--- Live Page Accessibility Snapshot (from agent-browser) ---\n${visual.snapshotSummary}\n`;
        }
        if (visual?.annotations && visual.annotations.length > 0) {
            visualContext += `\n--- Annotated Elements ---\n${visual.annotations.join('\n')}\n`;
        }

        const systemPrompt = `${skillDef.instructions}

Task Description: ${taskDescription}

Current Project Files (repo root, one level):
${fileListStr.slice(0, 1200)}

Sample directory tree (depth ≤${TREE_MAX_DEPTH}, max ${MAX_TREE_ENTRIES} dirs, excludes dot/node_modules):
${treeBlock.slice(0, 12_000)}

Task fileChanges snippets (recent writes; truncated per file):
${snippetsBlock}
${visualContext}`;

        const schema = AgentLoader.extractSection(skillDef.instructions, 'Schema') || `{ "verified": true, "notes": "" }`;

        const verification = (await llm.generateJSON(
            systemPrompt,
            'Verify task completion against project structure, changed file contents, and live page state.',
            schema,
            MODEL_CONFIG.SMART_MODEL
        )) as Record<string, unknown> & { verified?: boolean; notes?: string; suggestedFix?: string };

        if (visual) {
            verification.visualVerification = {
                screenshotPath: visual.screenshotPath,
                browserUsed: true,
                qaDevServerUrl: resolveQaPageUrl(projectPath, taskMetadata),
            };
        }

        return mergeVerificationWithSanity(verification, sanityIssues);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        const failOpen = isVerifyFailOpen();
        const verified = failOpen && sanityIssues.length === 0;
        console.warn(
            verified
                ? 'Verification LLM failed, defaulting to success with warning (VERIFY_FAIL_OPEN=true).'
                : 'Verification LLM failed; failing closed (VERIFY_FAIL_OPEN=false or sanity issues present).'
        );
        return {
            verified,
            notes: `Verification LLM error: ${message}${sanityIssues.length ? `\n\n[sanity]\n${sanityIssues.join('\n')}` : ''}`,
            suggestedFix:
                sanityIssues.length > 0
                    ? 'page.* 파일이 컴포넌트 기본보내기인지 확인하고 mock 데이터는 별도 모듈로 옮기세요.'
                    : undefined,
        };
    }
}
