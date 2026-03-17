import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
import type { ReviewSuggestionFile, ReviewSuggestionSet } from '@/lib/types/review-actions';

const EDIT_LOCK_KEY = 'editInProgress';

type StoredFileChange = {
    filePath: string;
    before: string | null;
    after: string;
    isNew: boolean;
    agent: string;
    stepIndex: number;
};

function normalizeReviewSuggestions(raw: unknown): ReviewSuggestionSet | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const createdAt = typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString();
    const sourceReviewHash = typeof row.sourceReviewHash === 'string' ? row.sourceReviewHash : '';
    const filesRaw = Array.isArray(row.files) ? row.files : [];
    const files: ReviewSuggestionFile[] = [];
    for (const item of filesRaw) {
        if (!item || typeof item !== 'object') continue;
        const fileRow = item as Record<string, unknown>;
        const filePath = typeof fileRow.filePath === 'string' ? fileRow.filePath.trim() : '';
        const before = typeof fileRow.before === 'string' ? fileRow.before : null;
        const after = typeof fileRow.after === 'string' ? fileRow.after : '';
        const reason = typeof fileRow.reason === 'string' ? fileRow.reason : undefined;
        if (!filePath || !after) continue;
        files.push({ filePath, before, after, reason });
    }

    if (files.length === 0) return null;
    return { createdAt, sourceReviewHash, files };
}

function normalizeStoredFileChanges(raw: unknown): StoredFileChange[] {
    if (!Array.isArray(raw)) return [];
    const normalized: StoredFileChange[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const filePath = typeof row.filePath === 'string' ? row.filePath : '';
        const before = typeof row.before === 'string' ? row.before : null;
        const after = typeof row.after === 'string' ? row.after : '';
        const isNew = typeof row.isNew === 'boolean' ? row.isNew : before === null;
        const agent = typeof row.agent === 'string' ? row.agent : 'unknown';
        const stepIndex = typeof row.stepIndex === 'number' && Number.isFinite(row.stepIndex) ? row.stepIndex : -1;
        if (!filePath || !after) continue;
        normalized.push({ filePath, before, after, isNew, agent, stepIndex });
    }
    return normalized;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { taskId, selectedFilePaths } = body as {
            taskId?: string;
            selectedFilePaths?: string[];
        };

        if (!taskId || typeof taskId !== 'string') {
            return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
        }

        const { data: task, error: taskError } = await supabase
            .from('Tasks')
            .select('id, status, project_id, metadata')
            .eq('id', taskId)
            .single();

        if (taskError || !task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        const status = (task as { status: string }).status;
        const allowedStatuses = ['testing', 'review', 'done'];
        if (!allowedStatuses.includes(status)) {
            return NextResponse.json(
                { error: `Task must be testing, review, or done to apply review suggestions (current: ${status})` },
                { status: 400 }
            );
        }

        const metadata = ((task as { metadata?: Record<string, unknown> }).metadata || {}) as Record<string, unknown>;
        if (metadata[EDIT_LOCK_KEY]) {
            return NextResponse.json({ error: 'Another edit is already in progress for this task' }, { status: 409 });
        }

        const suggestionSet = normalizeReviewSuggestions(metadata.reviewSuggestions);
        if (!suggestionSet || suggestionSet.files.length === 0) {
            return NextResponse.json({ error: 'No review suggestions found to apply.' }, { status: 400 });
        }

        const selectedPaths = Array.isArray(selectedFilePaths)
            ? selectedFilePaths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
            : [];
        const filesToApply = selectedPaths.length > 0
            ? suggestionSet.files.filter((file) => selectedPaths.includes(file.filePath))
            : suggestionSet.files;

        if (filesToApply.length === 0) {
            return NextResponse.json({ error: 'No matching suggestion files to apply.' }, { status: 400 });
        }

        let projectPath = process.cwd();
        const projectId = (task as { project_id?: string }).project_id;
        if (projectId) {
            const { data: project } = await supabase
                .from('Projects')
                .select('path')
                .eq('id', projectId)
                .single();
            if (project?.path) projectPath = (project as { path: string }).path;
        }

        await supabase
            .from('Tasks')
            .update({ metadata: { ...metadata, [EDIT_LOCK_KEY]: true } })
            .eq('id', taskId);

        try {
            const updatedChanges = normalizeStoredFileChanges(metadata.fileChanges);
            const appliedPaths = new Set<string>();

            for (const suggestion of filesToApply) {
                const writeResult = await skills.write_code(suggestion.filePath, suggestion.after, projectPath);
                if (!writeResult || typeof writeResult !== 'object' || !('filePath' in writeResult)) {
                    throw new Error(`Failed to apply suggestion for ${suggestion.filePath}`);
                }
                if ('success' in writeResult && writeResult.success === false) {
                    const message = 'message' in writeResult ? String(writeResult.message) : 'Unknown write error';
                    throw new Error(message);
                }

                const wr = writeResult as { filePath: string; before: string | null; after: string; isNew: boolean };
                const nextRow: StoredFileChange = {
                    filePath: wr.filePath,
                    before: wr.before,
                    after: wr.after,
                    isNew: wr.isNew,
                    agent: 'review-apply',
                    stepIndex: -1,
                };

                const idx = updatedChanges.map((item) => item.filePath).lastIndexOf(wr.filePath);
                if (idx >= 0) {
                    updatedChanges[idx] = nextRow;
                } else {
                    updatedChanges.push(nextRow);
                }
                appliedPaths.add(wr.filePath);
            }

            const remainingSuggestions = suggestionSet.files.filter((file) => !appliedPaths.has(file.filePath));
            const appliedAt = new Date().toISOString();

            await supabase
                .from('Tasks')
                .update({
                    metadata: {
                        ...metadata,
                        fileChanges: updatedChanges,
                        reviewSuggestions: remainingSuggestions.length > 0
                            ? { ...suggestionSet, files: remainingSuggestions }
                            : undefined,
                        reviewSuggestionsAppliedAt: appliedAt,
                        [EDIT_LOCK_KEY]: undefined,
                    },
                })
                .eq('id', taskId);

            return NextResponse.json({
                success: true,
                appliedCount: appliedPaths.size,
                files: Array.from(appliedPaths),
            });
        } finally {
            const { data: current } = await supabase.from('Tasks').select('metadata').eq('id', taskId).single();
            const meta = (current?.metadata || {}) as Record<string, unknown>;
            if (meta[EDIT_LOCK_KEY]) {
                await supabase
                    .from('Tasks')
                    .update({ metadata: { ...meta, [EDIT_LOCK_KEY]: undefined } })
                    .eq('id', taskId);
            }
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[review/apply]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
