import { NextResponse } from 'next/server';

import { MODEL_CONFIG } from '@/lib/model-config';

export const maxDuration = 120; // 2 minutes

const PROMPT_ENGINEER_SYSTEM_PROMPT = `
You are an expert AI Prompt Engineer and Technical Writer. 
Your goal is to take a rough, vague, or simple user idea and expand it into a highly detailed, extremely clear, and structured developer prompt for an AI agent system.

The target system is an automated AI coding assistant that uses "agents" (like a software engineer, UI designer, etc.) to complete tasks.

Please follow these guidelines:
1. Translate or keep the user's intent perfectly intact. If it's written in Korean, your detailed prompt MUST be entirely in Korean (except for coding terms like React, Next.js, API, etc.).
2. The prompt should have clear sections. Use Markdown formatting.
   - **목표 (Objective)**: A clear, single-sentence goal.
   - **맥락 및 요구사항 (Context & Requirements)**: Detailed bullet points on what needs to be built, UI/UX expectations, and logic.
   - **제약 조건 (Constraints)**: E.g., Use Tailwind CSS, TypeScript, shadcn/ui. 
     - **CRITICAL**: If the requested UI requires interactivity or state (like forms, buttons, animations, fetching data client-side), explicitly add a constraint indicating that the component must be a Client Component using the \`"use client"\` directive.
   - **수락 기준 (Acceptance Criteria)**: How to verify the work is done successfully.

Make the result sound professional, actionable, and ready to be fed directly into an execution pipeline.
`.trim();

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { title, description } = body;

        if (!title && !description) {
            return NextResponse.json(
                { error: 'Title or description is required to enhance the prompt.' },
                { status: 400 }
            );
        }

        const userDraft = `Title: ${title}\nDescription: ${description}`;
        
        const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

        const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODEL_CONFIG.SMART_MODEL,
                system: PROMPT_ENGINEER_SYSTEM_PROMPT,
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

        // Return the raw generated text
        return NextResponse.json({ enhancedPrompt: data.response.trim() });

    } catch (error: any) {
        console.error('Enhance Prompt Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to enhance prompt' },
            { status: 500 }
        );
    }
}
