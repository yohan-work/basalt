import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as skills from '@/lib/skills';
import { generateSurgicalFileEdit } from '@/lib/llm';
import { lineEditCostBetweenFiles, maxAllowedLineEditCost } from '@/lib/modify-element-line-cost';
import {
    type PickExtractedResult,
    normalizeFileContentForCompare,
    pickExtractedFileContent,
} from '@/lib/modify-element-pick-extracted';

const MODIFY_LOCK_KEY = 'modifyElementInProgress';

const HTML_SNIPPET_MAX = 4000;
const SELECTOR_MAX = 500;

function parseOptionalLineColumn(v: unknown): number | undefined {
    if (v == null || v === '') return undefined;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    if (!Number.isFinite(n) || n < 1) return undefined;
    return Math.floor(n);
}

function trimBounded(s: unknown, max: number): string | undefined {
    if (typeof s !== 'string') return undefined;
    const t = s.trim();
    if (!t) return undefined;
    return t.length > max ? `${t.slice(0, max)}\n…[truncated]` : t;
}

function isPickExtractedFailure(result: PickExtractedResult): result is Extract<PickExtractedResult, { ok: false }> {
    return !result.ok;
}

function buildAnchorSection(
    line: number | undefined,
    column: number | undefined,
    selector: string | undefined,
    htmlSnippet: string | undefined
): string {
    const parts: string[] = [];
    if (line != null) {
        parts.push(
            `Source anchor: prefer the JSX subtree whose compiled output maps near line ${line}${
                column != null ? `, column ${column}` : ''
            } in this file.`
        );
    }
    if (selector) {
        parts.push(`DOM/CSS selector hint: ${selector}`);
    }
    if (htmlSnippet) {
        parts.push(`Rendered HTML snippet (may differ slightly from JSX): ${htmlSnippet}`);
    }
    if (!parts.length) return '';
    return `\n\nAnchors — use only to locate the single target element; do not change unrelated markup:\n${parts.map((p) => `- ${p}`).join('\n')}`;
}

function buildPrompt(params: {
    targetPath: string;
    currentContent: string;
    descriptor: string;
    requestText: string;
    anchorSection: string;
    retryConstraint?: string;
}): string {
    const { targetPath, currentContent, descriptor, requestText, anchorSection, retryConstraint } = params;
    const retry = retryConstraint ? `\n\n${retryConstraint}` : '';
    return `You are modifying a single file. Change ONLY the one UI element described below; leave the rest of the file identical.

Element to locate (component / region): ${descriptor || 'the single element the user selected in the preview'}

User request: ${requestText}
${anchorSection}
${retry}

Current file (path: ${targetPath}):

\`\`\`
${currentContent}
\`\`\`

Return the COMPLETE file: apply the request only inside the smallest matching JSX/TS region. Output in this exact format and nothing else:

File: ${targetPath}
\`\`\`tsx
<entire modified file content>
\`\`\``;
}

function buildNoopRetryConstraint(
    requestText: string,
    line: number | undefined,
    column: number | undefined,
    targetPath: string
): string {
    const lineHint =
        line != null
            ? `Anchor line in ${targetPath}: ${line}${column != null ? `, column ${column}` : ''}.`
            : '';
    return [
        'AUTOMATED CHECK FAILED: Your previous answer was identical to the input file (no edits).',
        'You MUST apply the user request so the returned file content differs from the input.',
        'If you cannot match the described element exactly, make the smallest visible change near the anchor line (see Anchors above).',
        `User request: ${requestText}`,
        lineHint,
    ]
        .filter(Boolean)
        .join('\n');
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const {
            taskId,
            filePath,
            elementDescriptor,
            request: userRequest,
            line: bodyLine,
            column: bodyColumn,
            selector: bodySelector,
            htmlSnippet: bodyHtmlSnippet,
        } = body;

        if (!taskId || typeof taskId !== 'string') {
            return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
        }
        const descriptor = typeof elementDescriptor === 'string'
            ? elementDescriptor.trim()
            : (elementDescriptor?.text ?? '').trim() || String(elementDescriptor ?? '').trim();
        const requestText = typeof userRequest === 'string' ? userRequest.trim() : '';
        if (!requestText) {
            return NextResponse.json({ error: 'request is required (e.g. "component 요소를 제거해줘")' }, { status: 400 });
        }

        const line = parseOptionalLineColumn(bodyLine);
        const column = parseOptionalLineColumn(bodyColumn);
        const selector = trimBounded(bodySelector, SELECTOR_MAX);
        const htmlSnippet = trimBounded(bodyHtmlSnippet, HTML_SNIPPET_MAX);

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
                { error: `Task must be testing, review, or done to modify element (current: ${status})` },
                { status: 400 }
            );
        }

        const metadata = ((task as { metadata?: Record<string, unknown> }).metadata || {}) as Record<string, unknown>;
        if (metadata[MODIFY_LOCK_KEY]) {
            return NextResponse.json(
                { error: 'Another element modification is already in progress for this task' },
                { status: 409 }
            );
        }

        let projectPath = process.cwd();
        const projectId = (task as { project_id?: string }).project_id;
        if (projectId) {
            const { data: project, error: projError } = await supabase
                .from('Projects')
                .select('path')
                .eq('id', projectId)
                .single();
            if (!projError && project?.path) {
                projectPath = (project as { path: string }).path;
            }
        }

        const fileChanges = metadata.fileChanges as Array<{ filePath: string; after: string }> | undefined;
        let targetPath: string;
        let currentContent: string;

        if (filePath && typeof filePath === 'string' && filePath.trim()) {
            const trimmedFilePath = filePath.trim();
            const readResult = await skills.read_codebase(trimmedFilePath, projectPath);
            if (typeof readResult !== 'string' || readResult.startsWith('File "')) {
                return NextResponse.json({ error: `File not found: ${trimmedFilePath}` }, { status: 400 });
            }
            currentContent = readResult;
            targetPath = skills.resolvePathRelativeToProject(trimmedFilePath, projectPath);
        } else if (fileChanges?.length) {
            targetPath = skills.resolvePathRelativeToProject(fileChanges[0].filePath, projectPath);
            currentContent = fileChanges[0].after;
        } else {
            return NextResponse.json({ error: 'No file to modify. Provide filePath or ensure task has file changes.' }, { status: 400 });
        }

        const anchorSection = buildAnchorSection(line, column, selector, htmlSnippet);
        const lineCount = currentContent.split('\n').length;
        const lineEditLimit = maxAllowedLineEditCost(lineCount);

        const contextParts = [
            `File path: ${targetPath}.`,
            descriptor ? `Element: ${descriptor}.` : 'Element: unspecified.',
            line != null ? `Line: ${line}${column != null ? `, column: ${column}` : ''}.` : '',
            selector ? `Selector: ${selector}.` : '',
            htmlSnippet ? 'HTML snippet: provided.' : '',
            `Request: ${requestText}.`,
        ].filter(Boolean);
        const context = contextParts.join(' ');

        await supabase
            .from('Tasks')
            .update({ metadata: { ...metadata, [MODIFY_LOCK_KEY]: true } })
            .eq('id', taskId);

        try {
            let codeResult = await generateSurgicalFileEdit(
                buildPrompt({
                    targetPath,
                    currentContent,
                    descriptor,
                    requestText,
                    anchorSection,
                }),
                context
            );

            let noopRetries = 0;
            let lastLineEditCost = 0;

            for (let attempt = 0; attempt < 2; attempt++) {
                inner: while (true) {
                    if (codeResult.error || !codeResult.files?.length) {
                        throw new Error(codeResult.content || 'No modified file generated');
                    }

                    const picked = pickExtractedFileContent(codeResult.files, targetPath);
                    if (isPickExtractedFailure(picked)) {
                        const listed = picked.pathsReturned.length ? picked.pathsReturned.join(', ') : '(none)';
                        const msg =
                            picked.reason === 'ambiguous'
                                ? `Ambiguous model output for target "${targetPath}": ${listed}`
                                : picked.reason === 'no_files'
                                  ? 'Model returned no file blocks.'
                                  : `Model File path(s) do not match target "${targetPath}". Got: ${listed}. Use exactly File: ${targetPath} (or the same path under src/).`;
                        return NextResponse.json({ error: msg }, { status: 422 });
                    }

                    const normPicked = normalizeFileContentForCompare(picked.content);
                    const normCurrent = normalizeFileContentForCompare(currentContent);
                    if (normPicked === normCurrent) {
                        if (noopRetries < 1) {
                            noopRetries += 1;
                            codeResult = await generateSurgicalFileEdit(
                                buildPrompt({
                                    targetPath,
                                    currentContent,
                                    descriptor,
                                    requestText,
                                    anchorSection,
                                    retryConstraint: buildNoopRetryConstraint(
                                        requestText,
                                        line,
                                        column,
                                        targetPath
                                    ),
                                }),
                                `${context} RETRY_AFTER_NOOP=true`
                            );
                            continue inner;
                        }
                        return NextResponse.json(
                            {
                                error:
                                    'The model did not change the file after a retry. Try a clearer request and react-grab anchors (line, HTML snippet).',
                            },
                            { status: 422 }
                        );
                    }

                    lastLineEditCost = lineEditCostBetweenFiles(currentContent, picked.content);

                    if (lastLineEditCost <= lineEditLimit) {
                        const writeResult = await skills.write_code(targetPath, picked.content, projectPath);
                        if (!writeResult || typeof writeResult !== 'object' || !('filePath' in writeResult)) {
                            throw new Error('Failed to write modified file');
                        }
                        if ('success' in writeResult && writeResult.success === false) {
                            const msg =
                                typeof (writeResult as { message?: string }).message === 'string'
                                    ? (writeResult as { message: string }).message
                                    : 'Write rejected by validation';
                            throw new Error(msg);
                        }

                        const wr = writeResult as {
                            filePath: string;
                            before: string | null;
                            after: string;
                            isNew: boolean;
                        };
                        const existingChanges = (metadata.fileChanges || []) as Array<{
                            filePath: string;
                            before: string | null;
                            after: string;
                            isNew: boolean;
                            agent: string;
                            stepIndex: number;
                        }>;
                        existingChanges.push({
                            filePath: wr.filePath,
                            before: wr.before,
                            after: wr.after,
                            isNew: wr.isNew,
                            agent: 'user-edit-element',
                            stepIndex: -1
                        });

                        await supabase
                            .from('Tasks')
                            .update({
                                metadata: {
                                    ...metadata,
                                    fileChanges: existingChanges,
                                    [MODIFY_LOCK_KEY]: undefined
                                }
                            })
                            .eq('id', taskId);

                        return NextResponse.json({
                            success: true,
                            message: `Modified element in ${wr.filePath}`,
                            filePath: wr.filePath
                        });
                    }

                    break inner;
                }

                if (attempt === 1) {
                    return NextResponse.json(
                        {
                            error:
                                `The model changed too much of the file (line-edit cost ${lastLineEditCost}, max ${lineEditLimit}). ` +
                                'Try a more specific element description, HTML snippet, and line anchor from react-grab, or a narrower request.'
                        },
                        { status: 422 }
                    );
                }

                const retryConstraint = `AUTOMATED CHECK FAILED: The last answer changed too much of the file (line-edit cost ${lastLineEditCost}, allowed at most ${lineEditLimit}). You MUST return the input file again with ONLY the minimal edit: change the fewest possible lines inside the target element’s JSX subtree. Do not reformat, reorder imports, rename variables, or touch sibling components.`;

                noopRetries = 0;
                codeResult = await generateSurgicalFileEdit(
                    buildPrompt({
                        targetPath,
                        currentContent,
                        descriptor,
                        requestText,
                        anchorSection,
                        retryConstraint,
                    }),
                    `${context} RETRY_AFTER_BROAD_EDIT=true`
                );
            }

            throw new Error('Unexpected modify-element loop exit');
        } finally {
            const { data: current } = await supabase.from('Tasks').select('metadata').eq('id', taskId).single();
            const meta = (current?.metadata || {}) as Record<string, unknown>;
            if (meta[MODIFY_LOCK_KEY]) {
                await supabase
                    .from('Tasks')
                    .update({ metadata: { ...meta, [MODIFY_LOCK_KEY]: undefined } })
                    .eq('id', taskId);
            }
        }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[modify-element]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
