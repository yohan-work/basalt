
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// Types for our entities
export interface SkillDefinition {
    name: string;
    description: string;
    instructions: string;
    inputs?: any;
    outputs?: any;
    // We keep the runtime function reference separately or lookup map
}

export interface AgentDefinition {
    name: string;
    role: string;
    description: string;
    systemPrompt: string;
    skills: string[];
    subAgents: string[];
}

const BASE_DIR = process.cwd();

export class AgentLoader {
    /**
     * Loads an Agent configuration from lib/agents/[role]/AGENT.md
     */
    static loadAgent(role: string): AgentDefinition {
        try {
            const filePath = path.join(BASE_DIR, 'lib', 'agents', role, 'AGENT.md');
            if (!fs.existsSync(filePath)) {
                throw new Error(`Agent configuration not found for role: ${role}`);
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const { data, content } = matter(fileContent);

            // Extract skills and sub-agents from the content body using regex
            // Heuristic: Look for bullet points under specific headers
            const skills = this.extractListFromSection(content, 'Available Skills');
            const subAgents = this.extractListFromSection(content, 'Sub-Agents');

            return {
                name: data.name || role,
                role: role,
                description: data.description || '',
                systemPrompt: content.trim(),
                skills,
                subAgents
            };
        } catch (error: any) {
            console.error(`Failed to load agent ${role}:`, error);
            throw error;
        }
    }

    /**
     * Lists all available agents by scanning the lib/agents directory
     */
    static listAgents(): AgentDefinition[] {
        try {
            const agentsDir = path.join(BASE_DIR, 'lib', 'agents');
            if (!fs.existsSync(agentsDir)) return [];

            const entries = fs.readdirSync(agentsDir, { withFileTypes: true });
            const agents: AgentDefinition[] = [];

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    try {
                        const agent = this.loadAgent(entry.name);
                        agents.push(agent);
                    } catch (e) {
                        // Skip invalid agents
                        console.warn(`Skipping invalid agent directory: ${entry.name}`);
                    }
                }
            }
            return agents;
        } catch (error) {
            console.error('Failed to list agents:', error);
            return [];
        }
    }

    /**
     * Loads a Skill configuration from lib/skills/[skillName]/SKILL.md
     */
    static loadSkill(skillName: string): SkillDefinition {
        try {
            const filePath = path.join(BASE_DIR, 'lib', 'skills', skillName, 'SKILL.md');
            if (!fs.existsSync(filePath)) {
                console.warn(`Skill configuration not found for: ${skillName}, falling back to minimal config`);
                return {
                    name: skillName,
                    description: 'No description provided.',
                    instructions: ''
                };
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const { data, content } = matter(fileContent);

            return {
                name: data.name || skillName,
                description: data.description || '',
                instructions: content.trim()
            };
        } catch (error: any) {
            console.error(`Failed to load skill ${skillName}:`, error);
            throw error;
        }
    }

    /**
     * Helper to extract bullet points from a markdown section
     */
    private static extractListFromSection(markdown: string, header: string): string[] {
        const lines = markdown.split('\n');
        let inSection = false;
        const items: string[] = [];

        for (const line of lines) {
            // Check for header (e.g., "## Available Skills")
            if (line.match(new RegExp(`^#{1,3}\\s+${header}`))) {
                inSection = true;
                continue;
            }

            // If we hit another header, stop
            if (inSection && line.match(/^#{1,3}\s/)) {
                break;
            }

            // Extract bullet points
            if (inSection) {
                const match = line.match(/^\s*-\s*`?([\w-]+)`?/);
                if (match) {
                    items.push(match[1]);
                }
            }
        }
        return items;
    }
}
