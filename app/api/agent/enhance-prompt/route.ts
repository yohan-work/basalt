import { NextResponse } from 'next/server';

import { MODEL_CONFIG } from '@/lib/model-config';
import { supabase } from '@/lib/supabase';
import { ProjectProfiler } from '@/lib/profiler';

export const maxDuration = 120; // 2 minutes

const BASE_SYSTEM_PROMPT = `
You are an expert AI Prompt Engineer and Technical Writer. 
Your goal is to take a rough, vague, or simple user idea and expand it into a highly detailed, extremely clear, and structured developer prompt for an AI agent system.

The target system is an automated AI coding assistant that uses "agents" (like a software engineer, UI designer, etc.) to complete tasks.

Please follow these guidelines:
1. Translate or keep the user's intent perfectly intact. If it's written in Korean, your detailed prompt MUST be entirely in Korean (except for coding terms like React, Next.js, API, etc.).
2. The prompt should have clear sections. Use Markdown formatting.
   - **목표 (Objective)**: A clear, single-sentence goal.
   - **맥락 및 요구사항 (Context & Requirements)**: Detailed bullet points on what needs to be built, UI/UX expectations, and logic.
   - **제약 조건 (Constraints)**: STACK_CONSTRAINTS_PLACEHOLDER
     - **CRITICAL**: The constraints section MUST only reference packages and tools that are actually installed in the project. Never suggest using packages like axios, lodash, moment, etc. unless they are explicitly listed in the project's installed packages. If a feature needs HTTP requests, specify native fetch(). If a feature needs date formatting, specify native Intl.DateTimeFormat or Date.
     - **CRITICAL**: If the requested UI requires interactivity or state (like forms, buttons, animations, fetching data client-side), explicitly add a constraint indicating that the component must be a Client Component using the \`"use client"\` directive.
   - **수락 기준 (Acceptance Criteria)**: How to verify the work is done successfully.

Make the result sound professional, actionable, and ready to be fed directly into an execution pipeline.
`.trim();

const GENERIC_CONSTRAINTS = 'E.g., Use Tailwind CSS, TypeScript, shadcn/ui.';

async function buildSystemPrompt(projectId?: string): Promise<string> {
    if (!projectId) {
        return BASE_SYSTEM_PROMPT.replace('STACK_CONSTRAINTS_PLACEHOLDER', GENERIC_CONSTRAINTS);
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

        const dynamicConstraints =
            `아래는 이 프로젝트의 실제 기술 스택입니다. 제약 조건은 반드시 이 스택에 맞게 작성하세요:\n${stackSummary}`;

        return BASE_SYSTEM_PROMPT.replace('STACK_CONSTRAINTS_PLACEHOLDER', dynamicConstraints);
    } catch (e) {
        console.error('Failed to build dynamic system prompt:', e);
        return BASE_SYSTEM_PROMPT.replace('STACK_CONSTRAINTS_PLACEHOLDER', GENERIC_CONSTRAINTS);
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { title, description, projectId } = body;

        if (!title && !description) {
            return NextResponse.json(
                { error: 'Title or description is required to enhance the prompt.' },
                { status: 400 }
            );
        }

        const systemPrompt = await buildSystemPrompt(projectId);
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
