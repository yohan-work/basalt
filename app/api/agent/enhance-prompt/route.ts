import { NextResponse } from 'next/server';

import { MODEL_CONFIG } from '@/lib/model-config';
import { getDesignPresetById, PAGE_TASK_TEMPLATE_ID } from '@/lib/design-preset';
import { supabase } from '@/lib/supabase';
import { ProjectProfiler } from '@/lib/profiler';

export const maxDuration = 120; // 2 minutes

const BASE_SYSTEM_PROMPT = `
You are an expert AI Prompt Engineer and Technical Writer. 
Your goal is to take a rough, vague, or simple user idea and expand it into a highly detailed, extremely clear, and structured developer prompt for an AI agent system.

The target system is an automated AI coding assistant that uses "agents" (like a software engineer, UI designer, etc.) to complete tasks.

### 🚨 MINIMALIST ARCHITECTURE PRINCIPLE (CRITICAL) 🚨
To ensure "perfectly rendered pages" without build errors, you MUST follow these minimalist principles when expanding the prompt:
1. **AVOID COMPLEX LIBRARIES**: DO NOT suggest using complex libraries like **TanStack Table** or **Prisma** by default, even if they are installed in the project. 
2. **PREFER STANDARD HTML**: Explicitly mandate the use of standard semantic HTML tags (e.g., \`<table>\`, \`<thead>\`, \`<tbody>\`, \`<tr>\`, \`<th>\`, \`<td>\`) for all data displays. This avoids complex generic types and version-specific API issues.
3. **MOCK DATA FIRST**: Always mandate the use of local typed mock arrays (e.g., \`const data = [{ id: 1, ... }]\`) inside the component or a local \`lib/mock-data.ts\`. DO NOT suggest querying a real database or using a DB client unless the user specifically and repeatedly asks for "real-time persistence".
4. **STABILITY OVER FEATURES**: A working, visible page using standard HTML is much better than a broken page using advanced libraries.

### Guidelines:
1. Translate or keep the user's intent perfectly intact. If it's written in Korean, your detailed prompt MUST be entirely in Korean (except for coding terms like React, Next.js, API, etc.).
2. The prompt should have clear sections. Use Markdown formatting.
   - **목표 (Objective)**: A clear, single-sentence goal.
   - **맥락 및 요구사항 (Context & Requirements)**: Detailed bullet points on what needs to be built. **Explicitly mention using standard HTML <table> and Mock data here.**
   - **제약 조건 (Constraints)**: STACK_CONSTRAINTS_PLACEHOLDER
     - **CRITICAL**: The constraints section MUST only reference packages and tools that are actually installed in the project.
     - **CRITICAL**: If the requested UI requires interactivity or state (like forms, buttons, animations, fetching data client-side), explicitly add a constraint indicating that the component must be a Client Component using the \`"use client"\` directive.
   - **수락 기준 (Acceptance Criteria)**: How to verify the work is done successfully. **Include a criterion about the page rendering correctly without library-related build errors.**

Make the result sound professional, actionable, and ready to be fed directly into an execution pipeline.
`.trim();

const GENERIC_CONSTRAINTS = 'E.g., Use Tailwind CSS, TypeScript, shadcn/ui.';

async function buildSystemPrompt(
    projectId?: string,
    options?: { templateId?: string; designPreset?: string }
): Promise<string> {
    const presetSummary = getDesignPresetById(options?.designPreset)?.summary;
    if (!projectId) {
        const base = BASE_SYSTEM_PROMPT.replace('STACK_CONSTRAINTS_PLACEHOLDER', GENERIC_CONSTRAINTS);
        if (options?.templateId !== PAGE_TASK_TEMPLATE_ID) {
            return base;
        }
        return `${base}\n\n페이지 생성 태스크이므로 선택된 디자인 프리셋을 따르세요.${presetSummary ? ` 핵심 톤: ${presetSummary}` : ''}`;
    }

    try {
        const { data: project, error } = await supabase
            .from('Projects')
            .select('path')
            .eq('id', projectId)
            .single();

        if (error || !project?.path) {
            return BASE_SYSTEM_PROMPT.replace('STACK_CONSTRAINTS_PLACEHOLDER', GENERIC_CONSTRAINTS);
        }

        const profiler = new ProjectProfiler(project.path);
        const stackSummary = await profiler.getStackSummary();
        const promptContext = await profiler.getContextString({
            taskMetadata: options?.templateId
                ? {
                    taskTemplateId: options.templateId,
                    designPreset: options.designPreset,
                }
                : null,
        });

        const dynamicConstraints =
            `아래는 이 프로젝트의 실제 기술 스택입니다. 제약 조건은 반드시 이 스택에 맞게 작성하세요:\n${stackSummary}\n\n${promptContext}`;

        return BASE_SYSTEM_PROMPT.replace('STACK_CONSTRAINTS_PLACEHOLDER', dynamicConstraints);
    } catch (e) {
        console.error('Failed to build dynamic system prompt:', e);
        return BASE_SYSTEM_PROMPT.replace('STACK_CONSTRAINTS_PLACEHOLDER', GENERIC_CONSTRAINTS);
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { title, description, projectId, templateId, designPreset } = body;

        if (!title && !description) {
            return NextResponse.json(
                { error: 'Title or description is required to enhance the prompt.' },
                { status: 400 }
            );
        }

        const systemPrompt = await buildSystemPrompt(projectId, { templateId, designPreset });
        const userDraft = `Title: ${title}\nDescription: ${description}`;
        
        const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

        const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_CONFIG.SMART_MODEL,
                system: systemPrompt,
                prompt: `Enhance this exact draft into a detailed developer task prompt:\n\n${userDraft}`,
                stream: false
            })
        });

        if (!ollamaRes.ok) {
            throw new Error(`Ollama API error: ${ollamaRes.status} ${ollamaRes.statusText}`);
        }

        const data = await ollamaRes.json();
        
        if (!data || !data.response) {
            throw new Error('Failed to generate enhanced prompt from LLM (No response field)');
        }

        return NextResponse.json({ enhancedPrompt: data.response.trim() });

    } catch (error: any) {
        console.error('Enhance Prompt Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to enhance prompt' },
            { status: 500 }
        );
    }
}
