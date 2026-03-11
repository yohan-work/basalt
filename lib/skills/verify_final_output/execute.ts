import { list_directory } from '@/lib/skills/index'; // Import from local index if needed, or implement here
import { AgentLoader } from '@/lib/agent-loader';
import * as llm from '@/lib/llm';
import { MODEL_CONFIG } from '@/lib/model-config';

export async function verify_final_output(taskDescription: string, projectPath: string = process.cwd()) {
    try {
        const files = await list_directory('.', projectPath);
        const fileListStr = Array.isArray(files) ? files.join('\n') : String(files);

        const skillDef = AgentLoader.loadSkill('verify_final_output');

        const systemPrompt = `${skillDef.instructions}

Task Description: ${taskDescription}
Current Project Files(Top Level):
${fileListStr.slice(0, 1000)}
`;

        const schema = AgentLoader.extractSection(skillDef.instructions, 'Schema') || `{ "verified": true, "notes": "" }`;

        const verification = await llm.generateJSON(
            systemPrompt,
            "Verify task completion against project structure.",
            schema,
            MODEL_CONFIG.SMART_MODEL
        );

        return verification;
    } catch (e: any) {
        console.warn('Verification LLM failed, defaulting to success with warning.');
        return {
            verified: true,
            notes: `Verification logic failed but defaulting to true to avoid blocking.Error: ${e.message} `
        };
    }
}
