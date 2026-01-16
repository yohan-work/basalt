
export interface LLMResponse {
    content: string;
    files: Array<{ path: string; content: string }>;
}

export async function generateCode(prompt: string, context: string): Promise<LLMResponse> {
    const fullPrompt = `
You are an expert AI software engineer.
Context: ${context}
Task: ${prompt}

Return the response in the following JSON format ONLY, without any markdown formatting or explanation:
{
    "explanation": "Brief explanation of what you did",
    "files": [
        { "path": "path/to/file.ext", "content": "file content here" }
    ]
}
`;

    try {
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3:latest',
                prompt: fullPrompt,
                stream: false,
                format: 'json'
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const parsed = JSON.parse(data.response);

        return {
            content: parsed.explanation,
            files: parsed.files || []
        };

    } catch (error: any) {
        console.error('LLM Generation Failed:', error);
        // Fallback to a safe error message if LLM fails
        return {
            content: `Failed to generate code via AI: ${error.message}`,
            files: []
        };
    }
}

export async function generateJSON(systemPrompt: string, userPrompt: string, schemaDescription: string): Promise<any> {
    const fullPrompt = `
${systemPrompt}

Goal: ${userPrompt}

Return the response in the following JSON format ONLY, without any markdown formatting or explanation:
${schemaDescription}
`;

    try {
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3:latest',
                prompt: fullPrompt,
                stream: false,
                format: 'json'
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama API Error: ${response.statusText}`);
        }

        const data = await response.json();
        return JSON.parse(data.response);

    } catch (error: any) {
        console.error('LLM JSON Generation Failed:', error);
        throw error;
    }
}
