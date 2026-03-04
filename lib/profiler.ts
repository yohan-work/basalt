
import fs from 'fs';
import path from 'path';

/**
 * Scans the project to identify the tech stack and available UI components.
 * This prevents LLM hallucinations by providing factual context.
 */
export class ProjectProfiler {
    private projectRoot: string;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
    }

    /**
     * Gets summary of the project environment.
     */
    public async getProfileData() {
        const packageInfo = this.getPackageInfo();
        const componentsInfo = await this.getAvailableComponentsInfo();
        const hasTailwind = packageInfo.deps.some(d => d.includes('tailwind')) ||
            fs.existsSync(path.join(this.projectRoot, 'tailwind.config.ts')) ||
            fs.existsSync(path.join(this.projectRoot, 'tailwind.config.js'));

        return {
            techStack: packageInfo.stack,
            dependencies: packageInfo.deps,
            availableUIComponents: componentsInfo.names,
            hasNamedExports: componentsInfo.hasNamedExports,
            hasDefaultExports: componentsInfo.hasDefaultExports,
            hasIndexFile: componentsInfo.hasIndexFile,
            structure: this.detectStructure(),
            hasTailwind
        };
    }

    private getPackageInfo() {
        try {
            const pkgPath = path.join(this.projectRoot, 'package.json');
            if (!fs.existsSync(pkgPath)) return { stack: 'unknown', deps: [] };

            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };

            let stack = 'Next.js';
            if (deps['next']) stack = `Next.js ${deps['next']}`;
            if (deps['vite']) stack = 'Vite';

            return {
                stack,
                deps: Object.keys(deps)
            };
        } catch (e) {
            return { stack: 'unknown', deps: [] };
        }
    }

    private async getAvailableComponentsInfo(): Promise<{
        names: string[],
        hasNamedExports: boolean,
        hasDefaultExports: boolean,
        hasIndexFile: boolean
    }> {
        const componentsPath = path.join(this.projectRoot, 'components', 'ui');
        const result = { names: [] as string[], hasNamedExports: false, hasDefaultExports: false, hasIndexFile: false };
        if (!fs.existsSync(componentsPath)) return result;

        try {
            const files = fs.readdirSync(componentsPath);
            result.hasIndexFile = files.includes('index.ts') || files.includes('index.js');

            const componentFiles = files
                .filter(f => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.startsWith('index.'));

            for (const file of componentFiles) {
                const name = file.replace(/\.(tsx|ts)$/, '');
                result.names.push(name);

                // Sample a few files to detect export style if not already determined
                if (result.names.length <= 5) {
                    const content = fs.readFileSync(path.join(componentsPath, file), 'utf-8');
                    if (content.includes('export default')) result.hasDefaultExports = true;
                    // Look for "export function" or "export const" to identify named exports
                    if (/export\s+(function|const|class|type|interface|enum)/.test(content)) result.hasNamedExports = true;
                }
            }
            return result;
        } catch (e) {
            return result;
        }
    }

    private detectStructure() {
        if (fs.existsSync(path.join(this.projectRoot, 'app'))) return 'app-router';
        if (fs.existsSync(path.join(this.projectRoot, 'pages'))) return 'pages-router';
        return 'unknown';
    }

    /**
     * Formats the profile into a string for LLM prompts.
     */
    public async getContextString(): Promise<string> {
        const data = await this.getProfileData();
        const shadcnWarning = (data.availableUIComponents.length > 0 && !data.hasTailwind)
            ? '\n[WARNING] Project has shadcn/ui components but Tailwind CSS is NOT installed. These components may NOT render correctly without Tailwind. Prefer standard HTML tags or inline styles.'
            : '';

        let importStyleInfo = 'Standard imports.';
        if (data.hasNamedExports && !data.hasDefaultExports) {
            importStyleInfo = 'MANDATORY: Use NAMED imports for UI components (e.g., `import { Button } from "@/components/ui/button"`). Components do NOT have default exports.';
        } else if (data.hasDefaultExports && !data.hasNamedExports) {
            importStyleInfo = 'Use DEFAULT imports for UI components (e.g., `import Button from "@/components/ui/button"`).';
        }

        const barrelInfo = data.hasIndexFile
            ? '\n- Barrel Imports: `components/ui/index.ts` exists. You CAN use `import { Button, Card } from "@/components/ui"`.'
            : '\n- MANDATORY: NO barrel imports found in `@/components/ui`. You MUST import each component from its own file (e.g., `import { Button } from "@/components/ui/button"`). NEVER use `import { ... } from "@/components/ui"`.';

        const clientDirectiveInfo = data.structure === 'app-router'
            ? '\n- Next.js Client Components: If you use React hooks (useState, useEffect, etc.) in files under `app/`, you MUST add `"use client"` at the very top of the file.'
            : '';

        return `
[PROJECT CONTEXT]
- Tech Stack: ${data.techStack}
- Router Type: ${data.structure}${clientDirectiveInfo}
- Styling: ${data.hasTailwind ? 'Tailwind CSS IS installed. Use Tailwind classes.' : 'Tailwind CSS IS NOT installed. DO NOT use tailwind classes. Use standard CSS or inline styles.'}${shadcnWarning}
- UI Component Import Style: ${importStyleInfo}${barrelInfo}
- Available UI Components (shadcn/ui): ${data.availableUIComponents.join(', ') || 'None found'}
- Important Dependencies: ${data.dependencies.filter(d => ['lucide', 'framer-motion', 'clsx'].some(k => d.includes(k))).join(', ')}
`.trim();
    }
}
