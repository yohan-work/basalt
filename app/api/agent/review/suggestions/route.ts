import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import * as llm from '@/lib/llm';
import type { ReviewSuggestionFile, ReviewSuggestionSet } from '@/lib/types/review-actions';

type TaskFileChange = {
    filePath: string;
    before: string | null;
    after: string;
};

function isEligibleCodeFile(filePath: string): boolean {
    const lowerPath = filePath.toLowerCase();
    const isCodeExt = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|kt|rb|php|rs|swift|css|scss|less|html)$/i.test(lowerPath);
    const isTestFile = /(^|\/)__tests__(\/|$)|\.(test|spec)\./i.test(lowerPath);
    const isDocFile = /\.(md|mdx|txt)$/i.test(lowerPath) || /readme/i.test(lowerPath);
    return isCodeExt && !isTestFile && !isDocFile;
}

function normalizeTaskFileChanges(raw: unknown): TaskFileChange[] {
    if (!Array.isArray(raw)) return [];
    const normalized: TaskFileChange[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const filePath = typeof row.filePath === 'string' ? row.filePath.trim() : '';
        const after = typeof row.after === 'string' ? row.after : '';
        const before = typeof row.before === 'string' ? row.before : null;
        if (!filePath || !after) continue;
        normalized.push({ filePath, before, after });
    }
    return normalized;
}

function matchPath(targetPath: string, sourcePath: string): boolean {
    return targetPath === sourcePath || targetPath.endsWith(`/${sourcePath}`) || sourcePath.endsWith(`/${targetPath}`);
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { taskId } = body;

        if (!taskId || typeof taskId !== 'string') {
            return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
        }

        const { data: task, error: taskError } = await supabase
            .from('Tasks')
            .select('id, description, project_id, metadata')
            .eq('id', taskId)
            .single();

        if (taskError || !task) {
            return NextResponse.json({ error: 'Task not found' }, { status: 404 });
        }

        const metadata = ((task as { metadata?: Record<string, unknown> }).metadata || {}) as Record<string, unknown>;
        const reviewResult = typeof metadata.reviewResult === 'string' ? metadata.reviewResult.trim() : '';
        if (!reviewResult) {
            return NextResponse.json({ error: 'No reviewResult found. Run Code Review first.' }, { status: 400 });
        }

        const rawFileChanges = normalizeTaskFileChanges(metadata.fileChanges);
        const codeFileChanges = rawFileChanges.filter((file) => isEligibleCodeFile(file.filePath));
        if (codeFileChanges.length === 0) {
            return NextResponse.json(
                { error: 'No eligible code files found in task changes. (tests/docs excluded)' },
                { status: 400 }
            );
        }

        const context = codeFileChanges
            .map((file) => `File: ${file.filePath}\n\`\`\`\n${file.after}\n\`\`\``)
            .join('\n\n');

        const prompt = `
코드 리뷰 결과를 반영해 코드 파일 수정안을 생성하세요.

[리뷰 결과]
${reviewResult}

[요구사항]
- 반드시 "리뷰 결과에서 지적된 항목"만 최소 수정으로 반영하세요.
- 테스트 파일, 문서 파일(README/markdown), 텍스트 파일은 수정하지 마세요.
- 입력으로 제공된 파일 경로만 수정 대상으로 사용하세요.
- 각 파일은 전체 파일 내용을 반환하세요.
- 출력은 File 포맷만 반환하세요.
`.trim();

        const generated = await llm.generateCode(prompt, context);
        if (generated.error || !generated.files?.length) {
            return NextResponse.json(
                { error: generated.content || 'Failed to generate review suggestions.' },
                { status: 500 }
            );
        }

        const suggestions: ReviewSuggestionFile[] = [];
        for (const file of generated.files) {
            const generatedPath = typeof file.path === 'string' ? file.path.trim() : '';
            if (!generatedPath || !isEligibleCodeFile(generatedPath)) continue;

            const matched = codeFileChanges.find((src) => matchPath(generatedPath, src.filePath));
            if (!matched) continue;
            if (matched.after === file.content) continue;

            suggestions.push({
                filePath: matched.filePath,
                before: matched.after,
                after: file.content,
                reason: '코드 리뷰 지적사항 반영',
            });
        }

        if (suggestions.length === 0) {
            return NextResponse.json(
                { error: '리뷰 반영으로 적용 가능한 코드 변경안이 생성되지 않았습니다.' },
                { status: 400 }
            );
        }

        const createdAt = new Date().toISOString();
        const reviewHash = createHash('sha256').update(reviewResult).digest('hex');
        const reviewSuggestions: ReviewSuggestionSet = {
            createdAt,
            sourceReviewHash: reviewHash,
            files: suggestions,
        };

        await supabase
            .from('Tasks')
            .update({
                metadata: {
                    ...metadata,
                    reviewSuggestions,
                    reviewSuggestionsAt: createdAt,
                    reviewSuggestionsAppliedAt: undefined,
                },
            })
            .eq('id', taskId);

        return NextResponse.json({
            success: true,
            suggestionsCount: suggestions.length,
            files: suggestions.map((file) => file.filePath),
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('[review/suggestions]', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
