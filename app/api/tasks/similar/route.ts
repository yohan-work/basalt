import { NextRequest, NextResponse } from 'next/server';

import { supabase } from '@/lib/supabase';

function tokenize(s: string): Set<string> {
    return new Set(
        s
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter((w) => w.length > 1)
    );
}

function scoreTokens(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 || b.size === 0) return 0;
    let hit = 0;
    for (const w of a) {
        if (b.has(w)) hit++;
    }
    return hit / Math.sqrt(a.size * b.size);
}

/**
 * 같은 프로젝트의 완료 태스크 중 제목·설명 토큰 유사도로 상위 후보를 반환합니다.
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const projectId = searchParams.get('projectId');
        const excludeId = searchParams.get('excludeId');
        const title = searchParams.get('title') || '';
        const description = searchParams.get('description') || '';

        if (!projectId) {
            return NextResponse.json({ error: 'projectId required' }, { status: 400 });
        }

        const queryText = `${title}\n${description}`.trim();
        if (!queryText) {
            return NextResponse.json({ similar: [] });
        }

        const qTokens = tokenize(queryText);

        const { data: rows, error } = await supabase
            .from('Tasks')
            .select('id, title, description, status, created_at')
            .eq('project_id', projectId)
            .eq('status', 'done')
            .order('created_at', { ascending: false })
            .limit(80);

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const scored = (rows || [])
            .filter((r) => r.id !== excludeId)
            .map((r) => {
                const blob = `${r.title || ''}\n${r.description || ''}`;
                const t = tokenize(blob);
                const s = scoreTokens(qTokens, t);
                return { id: r.id, title: r.title, description: r.description, score: s };
            })
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 8);

        return NextResponse.json({ similar: scored });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
