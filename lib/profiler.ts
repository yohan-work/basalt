import fs from 'fs';
import path from 'path';

interface AvailableUiComponent {
    name: string;
    absolutePath: string;
}

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
        const structure = this.detectStructure();
        const routerBase = this.getRouteBaseFromStructure(structure);
        const pageCandidates = routerBase ? this.getPageCandidates(routerBase) : [];

        return {
            techStack: packageInfo.stack,
            dependencies: packageInfo.deps,
            availableUIComponents: componentsInfo.names,
            availableUIComponentsByPath: componentsInfo.components,
            hasNamedExports: componentsInfo.hasNamedExports,
            hasDefaultExports: componentsInfo.hasDefaultExports,
            hasIndexFile: componentsInfo.hasIndexFile,
            structure,
            routerBase,
            pageCandidates,
            rootPageOverwriteAllowed: structure.includes('pages-router') || structure === 'unknown' ? true : false,
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
        hasIndexFile: boolean,
        components: AvailableUiComponent[]
    }> {
        let componentsPath = path.join(this.projectRoot, 'components', 'ui');
        if (!fs.existsSync(componentsPath)) {
            componentsPath = path.join(this.projectRoot, 'src', 'components', 'ui');
        }
        const result = {
            names: [] as string[],
            components: [] as AvailableUiComponent[],
            hasNamedExports: false,
            hasDefaultExports: false,
            hasIndexFile: false,
        };
        if (!fs.existsSync(componentsPath)) return result;

        try {
            const files = fs.readdirSync(componentsPath);
            result.hasIndexFile = files.includes('index.ts') || files.includes('index.js') || files.includes('index.tsx');

            const componentFiles = files
                .filter(f => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.startsWith('index.'));

            for (const file of componentFiles) {
                const name = file.replace(/\.(tsx|ts)$/, '');
                result.names.push(name);
                result.components.push({
                    name,
                    absolutePath: path.join(componentsPath, file),
                });

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
        if (fs.existsSync(path.join(this.projectRoot, 'app'))) return 'app-router (Base: app/)';
        if (fs.existsSync(path.join(this.projectRoot, 'src', 'app'))) return 'app-router (Base: src/app/)';
        if (fs.existsSync(path.join(this.projectRoot, 'pages'))) return 'pages-router (Base: pages/)';
        if (fs.existsSync(path.join(this.projectRoot, 'src', 'pages'))) return 'pages-router (Base: src/pages/)';
        return 'unknown';
    }

    private getRouteBaseFromStructure(structure: string): string | null {
        if (structure.includes('src/app')) return 'src/app';
        if (structure.includes('app/')) return 'app';
        if (structure.includes('src/pages')) return 'src/pages';
        if (structure.includes('pages/')) return 'pages';
        return null;
    }

    private getPageCandidates(routerBase: string): string[] {
        const baseDir = path.join(this.projectRoot, routerBase);
        if (!fs.existsSync(baseDir)) return [];

        const candidates = new Set<string>();
        const hasPageFile = (targetDir: string) => {
            const pageExts = ['page.tsx', 'page.ts', 'page.jsx', 'page.js'];
            return pageExts.some((ext) => fs.existsSync(path.join(targetDir, ext)));
        };

        const collectCandidates = (entryName: string, targetDir: string, depth: number) => {
            if (hasPageFile(targetDir)) {
                if (routerBase.includes('app')) {
                    if (entryName && entryName !== 'app') {
                        candidates.add(entryName);
                    }
                    return;
                }

                if (routerBase.includes('pages')) {
                    if (entryName) {
                        candidates.add(entryName);
                    }
                    return;
                }
            }

            if (depth >= 2) return;

            try {
                const entries = fs.readdirSync(targetDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory()) continue;
                    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
                    collectCandidates(
                        entryName ? `${entryName}/${entry.name}` : entry.name,
                        path.join(targetDir, entry.name),
                        depth + 1
                    );
                }
            } catch {
                return;
            }
        };

        try {
            const entries = fs.readdirSync(baseDir, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
                if (routerBase.includes('app') && entry.name === 'api') continue;

                const absoluteDir = path.join(baseDir, entry.name);
                collectCandidates(entry.name, absoluteDir, 0);
            }

            if (routerBase.includes('pages')) {
                if (['index.tsx', 'index.ts', 'index.jsx', 'index.js'].some((file) => fs.existsSync(path.join(baseDir, file)))) {
                    candidates.add('index');
                }
            }
        } catch {
            return [];
        }

        return Array.from(candidates).sort();
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

        const clientDirectiveInfo = data.structure.includes('app-router')
            ? '\n- Next.js Client Components: If you use React hooks (useState, useEffect, etc.), you MUST add `"use client"` at the very top of the file. CRITICAL: You CANNOT export `metadata` in a Client Component file.'
            : '';

        const routePolicyHint = this.getRoutePolicyHint(data);
        const availableComponentNames = data.availableUIComponents.join(', ') || 'None found';
        const availableComponentFiles = data.availableUIComponentsByPath && data.availableUIComponentsByPath.length > 0
            ? data.availableUIComponentsByPath.map((entry: AvailableUiComponent) => path.basename(entry.absolutePath)).join(', ')
            : availableComponentNames;

        return `
[PROJECT CONTEXT]
- Tech Stack: ${data.techStack}
- Router Type: ${data.structure}${clientDirectiveInfo}
- Styling: ${data.hasTailwind ? 'Tailwind CSS IS installed. Use Tailwind classes.' : 'Tailwind CSS IS NOT installed. Do NOT use tailwind classes. Use standard CSS or inline styles.'}${shadcnWarning}
- UI Component Import Style: ${importStyleInfo}${barrelInfo}
- Router Base: ${data.routerBase || 'unknown'}
- Root Page Rewrite: ${data.rootPageOverwriteAllowed ? 'Explicitly allowed' : 'NOT allowed by default. Create under non-root route.'}
- Route Policy Hint: ${routePolicyHint}
- Available UI Components (shadcn/ui): ${availableComponentNames}
- Available UI Component Files: ${availableComponentFiles}
- Important Dependencies: ${data.dependencies.filter(d => ['lucide', 'framer-motion', 'clsx'].some(k => d.includes(k))).join(', ')}
`.trim();
    }

    private getRoutePolicyHint(data: any): string {
        const base = data.routerBase;
        if (!base) {
            return 'Unknown router base. Use explicit file path under app/ or pages/ tree.';
        }

        if (!Array.isArray(data.pageCandidates) || data.pageCandidates.length === 0) {
            return `No confirmed non-root route candidates found. For new feature, prefer "${base}/<feature>/page.tsx".`;
        }

        const examples = data.pageCandidates
            .slice(0, 8)
            .map((name: string) => `${base}/${name}/page.tsx`)
            .join(', ');
        return `Prefer non-root routes first. Example candidates: ${examples}`;
    }
}
