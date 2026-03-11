
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
     * Lists brief info (name, description) for all skills for Progressive Disclosure
     */
    static listSkillsBrief(): { name: string; description: string }[] {
        try {
            const skillsDir = path.join(BASE_DIR, 'lib', 'skills');
            if (!fs.existsSync(skillsDir)) return [];

            const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
            const skillsBrief: { name: string; description: string }[] = [];

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    try {
                        const filePath = path.join(skillsDir, entry.name, 'SKILL.md');
                        if (fs.existsSync(filePath)) {
                            // Level 1: Meta-data loading only to save token processing
                            const fileContent = fs.readFileSync(filePath, 'utf-8');
                            
                            // We only need the YAML frontmatter
                            const endOfMatter = fileContent.indexOf('---', 3);
                            const matterContent = endOfMatter !== -1 ? fileContent.substring(0, endOfMatter + 3) : fileContent;
                            
                            const { data } = matter(matterContent);
                            skillsBrief.push({
                                name: data.name || entry.name,
                                description: data.description || 'No description provided.'
                            });
                        }
                    } catch (e) {
                        console.warn(`Skipping invalid skill directory: ${entry.name}`);
                    }
                }
            }
            return skillsBrief;
        } catch (error) {
            console.error('Failed to list skills brief:', error);
            return [];
        }
    }

    /**
     * Loads a Skill configuration from lib/skills/[skillName]/SKILL.md
     * Progressively loads only basic metadata first, unless full loading is required by executor.
     */
    static loadSkill(skillName: string): SkillDefinition {
        try {
            // First check global/local directories
            const localPath = path.join(BASE_DIR, 'lib', 'skills', skillName, 'SKILL.md');
            // We can also check a global ~/.gemini/antigravity/skills path if needed later.
            
            if (!fs.existsSync(localPath)) {
                console.warn(`Skill configuration not found for: ${skillName}, falling back to minimal config`);
                return {
                    name: skillName,
                    description: 'No description provided.',
                    instructions: ''
                };
            }

            const fileContent = fs.readFileSync(localPath, 'utf-8');
            const { data, content } = matter(fileContent);

            // Extract "Inputs" section if it exists
            const inputsSection = this.extractSection(content, 'Inputs');

            return {
                name: data.name || skillName,
                description: data.description || '',
                instructions: content.trim(),
                inputs: inputsSection
            };
        } catch (error: any) {
            console.error(`Failed to load skill ${skillName}:`, error);
            throw error;
        }
    }

    /**
     * Helper to extract a full section content by header
     */
    public static extractSection(markdown: string, sectionHeading: string): string | undefined {
        const regex = new RegExp(`^##\\s+${sectionHeading}\\s*\\n([^#]*)(?:\\n#|$)`, 'im');
        // Simple manual parsing since JS RegExp no-overlap can be tricky
        const lines = markdown.split('\n');
        let inSection = false;
        let content = '';

        for (const line of lines) {
            if (line.match(new RegExp(`^#{1,3}\\s+${sectionHeading}`))) {
                inSection = true;
                continue;
            }

            if (inSection && line.match(/^#{1,3}\s/)) {
                break;
            }

            if (inSection) {
                content += line + '\n';
            }
        }
        return content.trim() || undefined;
    }

    /**
     * Helper to extract bullet points from a markdown section
     */
    public static extractListFromSection(markdown: string, header: string): string[] {
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
