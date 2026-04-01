import { AgentLoader } from '@/lib/agent-loader';

const skillBlockByName = new Map<string, string>();

/**
 * Cached skill instructions + inputs (per process). Avoids repeated string assembly in the orchestrator loop.
 */
export function getCachedSkillArgPromptBlock(skillName: string): string {
    const hit = skillBlockByName.get(skillName);
    if (hit !== undefined) {
        return hit;
    }
    const skillDef = AgentLoader.loadSkill(skillName);
    const inputsDef = skillDef.inputs ? `\nInputs Definition:\n${skillDef.inputs}` : '';
    const block = `Skill Name: ${skillName}
Skill Instructions: ${skillDef.instructions}${inputsDef}`;
    skillBlockByName.set(skillName, block);
    return block;
}
