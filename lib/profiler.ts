import fs from 'fs';
import path from 'path';

import { formatTechStackDisplay, inferStackProfile } from './stack-profile';
import { formatExportStylePolicySection, resolveRouteExportStyle } from './component-export-style';
import {
    formatKeyDependencyVersionsBlock,
    formatMajorSyntaxHints,
    formatVersionConstraintsLine,
} from './stack-version-context';
import { formatStackRulesSummary, loadStackRulesBlock } from './stack-rules/load';
import { inferComponentsUiRelativeDirFromConfig } from './tsconfig-paths';

interface AvailableUiComponent {
    name: string;
    absolutePath: string;
}

/** Relative paths (POSIX) checked when `@prisma/client` is installed — hint only. */
const PRISMA_SINGLETON_FILE_CANDIDATES = [
    'lib/prisma.ts',
    'lib/prisma.js',
    'src/lib/prisma.ts',
    'src/lib/prisma.js',
] as const;

function findExistingPrismaSingletonRelPaths(projectRoot: string): string[] {
    const found: string[] = [];
    for (const rel of PRISMA_SINGLETON_FILE_CANDIDATES) {
        const full = path.join(projectRoot, ...rel.split('/'));
        try {
            if (fs.existsSync(full) && fs.statSync(full).isFile()) {
                found.push(rel);
            }
        } catch {
            /* skip */
        }
    }
    return found;
}

/** Default Prisma client output: `node_modules/.prisma/client`. Custom `generator client { output = ... }` may omit this. */
export function isDefaultPrismaGeneratedClientPresent(projectRoot: string): boolean {
    const marker = path.join(projectRoot, 'node_modules', '.prisma', 'client');
    try {
        return fs.existsSync(marker) && fs.statSync(marker).isDirectory();
    } catch {
        return false;
    }
}

const CN_UTILS_CANDIDATES = ['lib/utils.ts', 'lib/utils.tsx', 'src/lib/utils.ts', 'src/lib/utils.tsx'] as const;

/** Returns a project-root-relative POSIX path when a typical `cn()` utils file exists. */
export function findExistingCnUtilsRelPath(projectRoot: string): string | null {
    for (const rel of CN_UTILS_CANDIDATES) {
        const full = path.join(projectRoot, ...rel.split('/'));
        try {
            if (fs.existsSync(full) && fs.statSync(full).isFile()) {
                return rel;
            }
        } catch {
            /* skip */
        }
    }
    return null;
}

/**
 * Scans the project to identify the tech stack and available UI components.
 * This prevents LLM hallucinations by providing factual context.
 */
export class ProjectProfiler {
    private projectRoot: string;
    private profileCache: { at: number; value: any } | null = null;
    private stackSummaryCache: { at: number; value: string } | null = null;
    private contextStringCache: { at: number; value: string } | null = null;
    private readonly CACHE_TTL_MS = 2_500;

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
    }

    public getProjectRoot(): string {
        return this.projectRoot;
    }

    public invalidateCache(): void {
        this.profileCache = null;
        this.stackSummaryCache = null;
        this.contextStringCache = null;
    }

    private isCacheFresh(at: number): boolean {
        return Date.now() - at < this.CACHE_TTL_MS;
    }

    /**
     * Gets summary of the project environment.
     */
    public async getProfileData() {
        if (this.profileCache && this.isCacheFresh(this.profileCache.at)) {
            return this.profileCache.value;
        }
        const stackProfile = inferStackProfile(this.projectRoot);
        const packageInfo = {
            stack: formatTechStackDisplay(stackProfile),
            deps: stackProfile.deps,
            depsWithVersions: stackProfile.depsWithVersions,
        };
        const componentsInfo = await this.getAvailableComponentsInfo();
        const uiKitPresent = componentsInfo.names.length > 0;
        const uiKitRelativePath = componentsInfo.relativePath;
        const hasTailwind = packageInfo.deps.some(d => d.includes('tailwind')) ||
            fs.existsSync(path.join(this.projectRoot, 'tailwind.config.ts')) ||
            fs.existsSync(path.join(this.projectRoot, 'tailwind.config.js'));
        const structure = stackProfile.structure;
        const routerBase = this.getRouteBaseFromStructure(structure);
        const pageCandidates = routerBase ? this.getPageCandidates(routerBase) : [];

        const profile = {
            techStack: packageInfo.stack,
            dependencies: packageInfo.deps,
            depsWithVersions: packageInfo.depsWithVersions,
            availableUIComponents: componentsInfo.names,
            availableUIComponentsByPath: componentsInfo.components,
            /** `components/ui` 등에 실제 컴포넌트 파일이 1개 이상 있음 */
            uiKitPresent,
            /** 스캔된 UI 디렉터리 (없으면 null). 빈 폴더만 있을 수 있음 */
            uiKitRelativePath,
            hasNamedExports: componentsInfo.hasNamedExports,
            hasDefaultExports: componentsInfo.hasDefaultExports,
            hasIndexFile: componentsInfo.hasIndexFile,
            structure,
            routerBase,
            pageCandidates,
            routerDualRoot: stackProfile.routerDualRoot,
            routerResolutionNote: stackProfile.routerResolutionNote ?? null,
            rootPageOverwriteAllowed: structure.includes('pages-router') || structure === 'unknown' ? true : false,
            hasTailwind,
            stackProfile,
        };
        this.profileCache = {
            at: Date.now(),
            value: profile,
        };
        return profile;
    }

    private async getAvailableComponentsInfo(): Promise<{
        names: string[],
        hasNamedExports: boolean,
        hasDefaultExports: boolean,
        hasIndexFile: boolean,
        components: AvailableUiComponent[],
        relativePath: string | null,
    }> {
        const canonicalRel = inferComponentsUiRelativeDirFromConfig(this.projectRoot);
        let componentsPath = path.join(this.projectRoot, ...canonicalRel.split('/'));
        const legacyRel = canonicalRel.startsWith('src/')
            ? 'components/ui'
            : 'src/components/ui';
        const legacyPath = path.join(this.projectRoot, ...legacyRel.split('/'));
        if (!fs.existsSync(componentsPath) && fs.existsSync(legacyPath)) {
            componentsPath = legacyPath;
        }
        const result = {
            names: [] as string[],
            components: [] as AvailableUiComponent[],
            hasNamedExports: false,
            hasDefaultExports: false,
            hasIndexFile: false,
            relativePath: null as string | null,
        };
        if (!fs.existsSync(componentsPath)) return result;

        result.relativePath = path.relative(this.projectRoot, componentsPath).replace(/\\/g, '/');

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
     * Returns a concise, human-readable summary of the project's tech stack
     * suitable for injecting into LLM prompt constraints.
     */
    public async getStackSummary(): Promise<string> {
        if (this.stackSummaryCache && this.isCacheFresh(this.stackSummaryCache.at)) {
            return this.stackSummaryCache.value;
        }
        const data = await this.getProfileData();
        const versions = data.depsWithVersions;

        const KEY_PACKAGES = [
            'next', 'react', 'vue', 'nuxt', 'svelte', '@sveltejs/kit', 'angular',
            'typescript', 'tailwindcss', 'sass', 'styled-components', '@emotion/react',
            'shadcn-ui', '@mui/material', 'antd', 'vuetify', 'chakra-ui',
            'zod', 'prisma', '@supabase/supabase-js', 'drizzle-orm',
            'framer-motion', 'three', 'd3', 'recharts',
        ];

        const detectedPackages = KEY_PACKAGES
            .filter(pkg => versions[pkg])
            .map(pkg => `${pkg} ${versions[pkg]}`);

        const hasShadcnUiOnDisk = data.availableUIComponents.length > 0;
        const radixInDeps = data.dependencies.some(d => d.includes('@radix-ui') || d.includes('radix-ui'));

        const lines: string[] = [];

        lines.push(`프레임워크/런타임: ${data.techStack}`);

        if (versions['react']) lines.push(`React: ${versions['react']}`);
        if (versions['vue']) lines.push(`Vue: ${versions['vue']}`);

        if (versions['typescript']) {
            lines.push(`언어: TypeScript ${versions['typescript']}`);
        } else {
            lines.push('언어: JavaScript');
        }

        if (data.hasTailwind) {
            lines.push(`스타일링: Tailwind CSS ${versions['tailwindcss'] || ''}`);
        } else if (versions['sass']) {
            lines.push(`스타일링: Sass/SCSS ${versions['sass']}`);
        } else if (versions['styled-components']) {
            lines.push(`스타일링: styled-components ${versions['styled-components']}`);
        } else if (versions['@emotion/react']) {
            lines.push(`스타일링: Emotion ${versions['@emotion/react']}`);
        } else {
            lines.push('스타일링: 일반 CSS');
        }

        if (hasShadcnUiOnDisk) {
            const componentList = data.availableUIComponents.slice(0, 15).join(', ');
            lines.push(
                `UI(로컬 components/ui): ${componentList || 'N/A'} (디렉터리: \`${data.uiKitRelativePath || 'components/ui'}\`)`
            );
        } else if (data.uiKitRelativePath) {
            lines.push(
                `UI: \`${data.uiKitRelativePath}\` 폴더는 있으나 컴포넌트 파일이 비어 있거나 스캔되지 않았습니다. 필요 시 추가하거나 시맨틱 HTML을 사용하세요.`
            );
        } else if (radixInDeps) {
            lines.push(
                'UI: package.json에 Radix 관련 의존성은 있으나 `components/ui` 또는 `src/components/ui`에 로컬 컴포넌트가 없습니다.'
            );
        } else if (versions['@mui/material']) {
            lines.push(`UI 라이브러리: MUI ${versions['@mui/material']}`);
        } else if (versions['antd']) {
            lines.push(`UI 라이브러리: Ant Design ${versions['antd']}`);
        } else {
            lines.push(
                'UI: 로컬 shadcn 스타일 `components/ui` 미검출 — `@/components/ui/*` import 금지(생성 전까지). HTML 또는 실행 시 자동 최소 primitives 정책.'
            );
        }

        lines.push(`라우터 구조: ${data.structure}`);

        if (data.stackProfile.primary === 'next' && data.structure.includes('app-router')) {
            lines.push('Client Component: 인터랙티브 요소(hooks, 이벤트 핸들러 등) 사용 시 반드시 "use client" 디렉티브 필요');
        }

        lines.push(formatStackRulesSummary(data.stackProfile));

        const otherNotable = detectedPackages.filter(
            p => !['next', 'react', 'vue', 'typescript', 'tailwindcss', 'sass',
                'styled-components', '@emotion/react', '@mui/material', 'antd'].some(
                    k => p.startsWith(k)
                )
        );
        if (otherNotable.length > 0) {
            lines.push(`주요 의존성: ${otherNotable.join(', ')}`);
        }

        const allDeps = data.dependencies.sort().join(', ');
        if (allDeps) {
            lines.push(`설치된 전체 패키지: ${allDeps}`);
            lines.push('중요: 위 목록에 없는 npm 패키지는 절대 import하지 마세요. 설치되지 않은 패키지를 사용하면 빌드 에러가 발생합니다.');
        }

        const summary = lines.join('\n');
        this.stackSummaryCache = {
            at: Date.now(),
            value: summary,
        };
        return summary;
    }

    /**
     * Formats the profile into a string for LLM prompts.
     */
    public async getContextString(): Promise<string> {
        if (this.contextStringCache && this.isCacheFresh(this.contextStringCache.at)) {
            return this.contextStringCache.value;
        }
        const data = await this.getProfileData();
        const shadcnWarning = (data.availableUIComponents.length > 0 && !data.hasTailwind)
            ? '\n[WARNING] Project has shadcn/ui components but Tailwind CSS is NOT installed. These components may NOT render correctly without Tailwind. Prefer standard HTML tags or inline styles.'
            : '';

        const uiKitPresent = data.uiKitPresent;
        let importStyleInfo = 'Not applicable — no scannable files under components/ui yet.';
        let barrelInfo = '';
        if (uiKitPresent) {
            importStyleInfo = 'Standard imports.';
            if (data.hasNamedExports && !data.hasDefaultExports) {
                importStyleInfo =
                    'MANDATORY: Use NAMED imports for UI components (e.g., `import { Button } from "@/components/ui/button"`). Components do NOT have default exports.';
            } else if (data.hasDefaultExports && !data.hasNamedExports) {
                importStyleInfo =
                    'Use DEFAULT imports for UI components (e.g., `import Button from "@/components/ui/button"`).';
            }

            barrelInfo = data.hasIndexFile
                ? '\n- Barrel Imports: `components/ui/index.ts` exists. You MAY use `import { … } from "@/components/ui"` **only** for symbols that appear in **Known component basenames** below and are actually re-exported from that index.'
                : '\n- MANDATORY: NO barrel imports found in `@/components/ui`. You MUST import each component from its own file (e.g., `import { Button } from "@/components/ui/button"`). NEVER use `import { ... } from "@/components/ui"`.';
        }

        const minimalScaffoldNames = new Set(['button', 'input', 'label']);
        const namesLower = data.availableUIComponents.map((n) => n.toLowerCase());
        const looksLikeMinimalScaffold =
            uiKitPresent &&
            namesLower.length > 0 &&
            namesLower.length <= 3 &&
            namesLower.every((n) => minimalScaffoldNames.has(n));
        const minimalKitNote = looksLikeMinimalScaffold
            ? '\n- **Minimal / auto-scaffold UI kit**: Only the primitives listed above exist. Do **not** import `table`, `card`, `dialog`, `select`, etc. from `@/components/ui` unless you add those files in the **same** codegen batch (they must be written **before** pages that import them) or use semantic HTML instead.'
            : '';

        const uiPolicySection = uiKitPresent
            ? `## UI_COMPONENT_POLICY: USE_EXISTING
- Local UI kit detected under \`${data.uiKitRelativePath || 'components/ui'}\`.
- Import ONLY from files that exist. Known component basenames: ${data.availableUIComponents.join(', ') || '(none — re-scan after adding files)'}
- **FORBIDDEN**: \`@/components/ui/<name>\` where \`<name>\` is **not** in the Known component basenames list (e.g. do not assume \`table\`, \`card\`, or \`dialog\` exist).${minimalKitNote}
- Follow **UI Component Import Style** and barrel rules in this block.`
            : `## UI_COMPONENT_POLICY: ABSENT
- Scan result: **no** \`.ts/.tsx\` component files under \`components/ui\` or \`src/components/ui\` (folder may be missing or empty).
- **Do not** \`import … from "@/components/ui/…"\` until those files exist.
- **Preferred order:** (1) Use semantic HTML + existing project styles. (2) Or add primitives with \`write_code\` **before** pages that need them. (3) For React/Next targets, Basalt may auto-create minimal \`button\`/\`input\`/\`label\` at execute start — see task metadata \`uiKitScaffold.files\` when present; after that, \`USE_EXISTING\` applies on the next context refresh.`;

        const clientDirectiveInfo =
            data.stackProfile.primary === 'next' && data.structure.includes('app-router')
                ? '\n- Next.js Client Components: If you use React hooks (useState, useEffect, etc.), you MUST add `"use client"` at the very top of the file.'
                : '';

        const nextMajor = data.stackProfile.majors?.next;
        const nextParamsHint =
            typeof nextMajor === 'number' && nextMajor >= 15
                ? ' In Next 15+, `params`/`searchParams` in pages and `generateMetadata` are often Promises — await them (e.g. `const { slug } = await params`).'
                : '';
        const nextMetadataRscInfo =
            data.stackProfile.primary === 'next' && data.structure.includes('app-router')
                ? `\n- Next.js metadata: \`export const metadata\` and \`export async function generateMetadata\` are server-only. Never put them in a file that has \`"use client"\` (same for \`viewport\` / \`generateViewport\`); hooks + metadata → server \`page.tsx\` + \`components/*Client.tsx\` ([why server-only](https://nextjs.org/docs/app/api-reference/functions/generate-metadata#why-generatemetadata-is-server-component-only)). Do not export both static \`metadata\` and \`generateMetadata\` in the same segment. Set \`metadataBase\` in root layout when using relative OG/canonical URLs. Use \`generateViewport\` / \`export const viewport\` instead of viewport/themeColor inside \`metadata\`. \`searchParams\` applies to \`page\`, not \`layout\`.${nextParamsHint}\n- **Root layout (\`app/layout.tsx\` or \`src/app/layout.tsx\`)**: must render \`<html lang="...">\` and \`<body>\` and wrap \`{children}\` — not \`return children\` alone ([missing root layout tags](https://nextjs.org/docs/messages/missing-root-layout-tags)). Nested segment layouts must **not** add a second \`<html>\`/\`<body>\`.`
                : '';

        const nextLinkInfo =
            data.stackProfile.primary === 'next' && data.structure.includes('app-router')
                ? '\n- Next.js `Link`: Use `<Link href="...">Label</Link>` directly. Do NOT use `legacyBehavior` or nest `<a>` tags. For link-styled navigation, use `<Link href="..." className="...">` (reuse button-like classes) or a plain `<button type="button">` for actions. **Do not** use `<Button asChild><Link>…</Link></Button>` unless this project’s `Button` actually implements `asChild` (Radix-style); Basalt’s **minimal scaffold `Button` does not** — it causes **TS2322**.'
                : '';

        const cnUtilsRel = findExistingCnUtilsRelPath(this.projectRoot);
        const cnUtilsHint =
            data.stackProfile.primary === 'next'
                ? cnUtilsRel
                    ? `\n- **\`cn\`**: Utility file found at \`${cnUtilsRel}\` (map with tsconfig \`@/*\`, often \`@/lib/utils\`).`
                    : '\n- **\`cn\` / \`@/lib/utils\`**: No \`lib/utils\` or \`src/lib/utils\` found at profile time — **avoid** \`import { cn } from \'@/lib/utils\'\` unless you add that file; use string templates or \`[a, b].filter(Boolean).join(\' \')\` for \`className\`.'
                : '';

        const uiScaffoldContractHint =
            data.stackProfile.primary === 'next'
                ? '\n- **UI auto-scaffold (Basalt)**: Extended templates provide **named exports** for some basenames (e.g. \`table\`, \`card\`, \`tabs\`). Others may auto-create a **single wrapper div** only. **Do not** paste full shadcn compound APIs (\`DialogTrigger\`, \`DropdownMenuItem\`, …) unless those exports exist in the on-disk file or are listed under Available UI — prefer semantic HTML or only import symbols that exist.'
                : '';

        const lucideIconHint = '\n- **Lucide Icons**: If an icon import fails (e.g., `CheckCircle`), check for alternative names like `Check` or `CircleCheck`. Standard names: `Check`, `X`, `AlertCircle`, `Info`, `Settings`.'

        const tsCodegenHint =
            data.stackProfile.primary === 'next' && data.structure.includes('app-router')
                ? '\n- **TypeScript (fewer tsc errors)**: Use explicit generics on `useState` (e.g. `useState<Item[]>([])`); in Next 15+ `await params` / `await searchParams` where they are Promises; type event handlers (`React.ChangeEvent<...>`); avoid `any` on props. See `docs/typescript-best-practices.md`.'
                : '';

        const hasPrismaClientDep = data.dependencies.includes('@prisma/client');
        const prismaSingletonOnDisk = hasPrismaClientDep ? findExistingPrismaSingletonRelPaths(this.projectRoot) : [];
        const prismaGeneratedOk = hasPrismaClientDep ? isDefaultPrismaGeneratedClientPresent(this.projectRoot) : true;
        const prismaGenerateWarning = hasPrismaClientDep && !prismaGeneratedOk
            ? ' **[WARNING]** Default generated client missing (\`node_modules/.prisma/client\` not found at profile time). For **UI-only** tasks, **skip Prisma entirely** (mock data) instead of importing \`@prisma/client\`. For **real DB** code, run \`npx prisma generate\` before importing \`PrismaClient\` or model types — otherwise TypeScript often fails with **TS2305**. Custom \`generator client { output = ... }\` may bypass this path; follow that output instead.'
            : '';
        const prismaClientHint = hasPrismaClientDep
            ? `\n- **Prisma (\`@prisma/client\` listed in deps)**: **Default:** many tasks (boards, lists, dashboards, marketing) need **only UI** — **do not** import \`@prisma/client\` or \`prisma\` unless the user explicitly asked for real DB/persistence; use **typed mock/sample rows** in the page or a small \`lib/mock-*.ts\`. **When the task explicitly requires DB access:** never use an undeclared global \`prisma\`; import the app’s exported client (e.g. \`import { prisma } from '@/lib/prisma'\`) or \`import { PrismaClient } from '@prisma/client'\` plus \`const prisma = new PrismaClient()\`. For \`app/**/page.tsx\` with real queries, prefer the singleton when it exists (still requires \`prisma generate\`).${prismaGenerateWarning}${
                  prismaSingletonOnDisk.length > 0
                      ? ` On-disk singleton candidate(s): \`${prismaSingletonOnDisk.join('`, `')}\` — map via tsconfig \`paths\` (often \`@/lib/prisma\`).`
                      : ' No \`lib/prisma.ts\` / \`src/lib/prisma.ts\` detected at profile time; locate or add a singleton before \`prisma.*\` in route handlers when you implement real DB code.'
              }`
            : '';

        const tanstackTableDepHint = data.dependencies.includes('@tanstack/react-table')
            ? '\n- **TanStack Table (v8)**: Use `useReactTable` + **`getCoreRowModel()`** — pass **`getCoreRowModel: getCoreRowModel()`** in options (invoke the factory — avoids **TS2322**). **Not** `useTable`. Import `ColumnDef`, `flexRender`, `useReactTable`, row models **only** from `@tanstack/react-table` (every file that calls `flexRender` must import it — avoids **TS2552**). **Never** import `flexRender` from `@/components/ui/table` — **TS2614**; UI `table` is for **named** `Table`/`TableRow`/… markup only. Import `Table`, `TableRow`, `TableCell`, `TableHead`, `TableHeader`, `TableBody`, etc. with **named imports** from `@/components/ui/table` — **no default import** (**TS2613**). **`Row`** has no `.column` — use `row.getVisibleCells().map((cell) => …)` then `cell.column` (**TS2339**). **Header API**: use `header.column.columnDef` — **never** `header.columnDef` (**TS2551**). **FORBIDDEN (old TanStack v7-style APIs on table/row)**: `getTableProps`, `getTableBodyProps`, `getHeaderGroupProps`, `getHeaderCellProps`, `getCellProps` — these are not on v8 `Table`/`Row`/`Cell` types and cause **TS2339**. For **TS7006** on `cell`/`header` in `.map`, use `import type { Cell, Header } from \'@tanstack/react-table\'` and e.g. `(cell: Cell<YourRow, unknown>)` or type `useReactTable<YourRow>(…)`. For column width use `size` / `minSize` / `maxSize` on the column def and `header.getSize()` / `column.getSize()` — do not use `meta.width` unless you extend `ColumnMeta` via `declare module \'@tanstack/react-table\'` (**TS2339**). Type `headerGroup` / `row` / `cell` in `.map` callbacks to avoid implicit `any`. **Rules of Hooks**: call `useReactTable` and `useMemo` for `columns` **before** any `if (loading) return …`; use `data: rows ?? []` and handle loading in JSX after all hooks — see https://react.dev/reference/rules/rules-of-components-and-hooks . Intro: https://tanstack.com/table/latest/docs/introduction · sizing: https://tanstack.com/table/latest/docs/guide/column-sizing . **Shadcn Input (TS2305)**: import `Input` only from `@/components/ui/input`, never from `@/components/ui/button`. **Shadcn Table vs TanStack (TS2322)**: never pass `columns=` / `data=` on the visual `Table` component — only on `useReactTable({ … })`. **Minimal `Button`** (Basalt scaffold): **no** `asChild` — use `<Link className="...">` or `<button>`.'
            : '';

        const tableComponentHint = data.availableUIComponents.includes('table')
            ? '\n- **TanStack Table + UI**: When `table` is on disk, extended scaffold exports **named** `Table`, `TableRow`, … from `@/components/ui/table` (**no default export** — **TS2613**). Still: logic only from `@tanstack/react-table`; **`getCoreRowModel()`** invoked in `useReactTable`; body rows via **`row.getVisibleCells()`** + `cell.column`, not `row.column`; always `flexRender` for header/cell; narrow `accessorKey`; avoid `asChild` on minimal `Button`. Call `useReactTable` / `useMemo(columns)` **before** any loading early-`return` (`data: rows ?? []`). **Never** put TanStack `columns` / `data` props on shadcn `Table` JSX (**TS2322**). **Input** only from `@/components/ui/input`, not `button` (**TS2305**).'
            : '';

        const nextGuardrails =
            data.stackProfile.primary === 'next' && data.structure.includes('app-router')
                ? `\n- Next.js guardrails: **Hydration** — avoid non-deterministic values (\`Date.now\`, \`Math.random\`) in server-rendered HTML; **Image** — configure \`images.remotePatterns\` in \`next.config\` for external hosts or use \`<img>\`; **Server Actions** — only \`async function\` actions; place \`"use server"\` per docs; **Route Handlers** — export named functions for HTTP methods (\`GET\`, \`POST\`, …) from \`route.ts\`; **Env** — only \`NEXT_PUBLIC_*\` is exposed to the browser bundle.${lucideIconHint}`
                : '';

        const routePolicyHint = this.getRoutePolicyHint(data);
        const availableComponentNames = data.availableUIComponents.join(', ') || 'None found';
        const availableComponentFiles = data.availableUIComponentsByPath && data.availableUIComponentsByPath.length > 0
            ? data.availableUIComponentsByPath.map((entry: AvailableUiComponent) => path.basename(entry.absolutePath)).join(', ')
            : availableComponentNames;

        const allDeps = data.dependencies.sort().join(', ') || 'None';

        const stackRules = loadStackRulesBlock(this.projectRoot, data.stackProfile);
        const designHints = await this.getDesignHintsBlock();

        const routerConflictWarning =
            data.routerDualRoot && data.routerResolutionNote
                ? `\n- [WARNING] Router root: ${data.routerResolutionNote}`
                : '';

        const majorSyntaxHints = formatMajorSyntaxHints(data.stackProfile);
        const majorSyntaxSection = majorSyntaxHints
            ? `\n- MAJOR_SYNTAX_HINTS (감지된 메이저 기준 — 플랜·코드에 반영):\n${majorSyntaxHints}`
            : '';

        const routeExportResolution = resolveRouteExportStyle(this.projectRoot, data.routerBase, data.structure);
        const exportStylePolicyBlock = formatExportStylePolicySection(routeExportResolution);

        const context = `
[PROJECT CONTEXT]
- Tech Stack: ${data.techStack}
- VERSION_CONSTRAINTS (package.json → 파싱 메이저): ${formatVersionConstraintsLine(data.stackProfile)}
- KEY_DEPENDENCY_VERSIONS (semver; 플랜 summary에 인용 가능):
${formatKeyDependencyVersionsBlock(data.depsWithVersions)}${majorSyntaxSection}
- Router Type: ${data.structure}${routerConflictWarning}${clientDirectiveInfo}${nextMetadataRscInfo}${nextLinkInfo}${cnUtilsHint}${uiScaffoldContractHint}${tsCodegenHint}${prismaClientHint}${tanstackTableDepHint}${tableComponentHint}${nextGuardrails}
- Styling: ${data.hasTailwind ? 'Tailwind CSS IS installed. Use Tailwind classes.' : 'Tailwind CSS IS NOT installed. Do NOT use tailwind classes. Use standard CSS or inline styles.'}${shadcnWarning}
${uiPolicySection}
- UI Component Import Style: ${importStyleInfo}${barrelInfo}

${exportStylePolicyBlock}
- Router Base: ${data.routerBase || 'unknown'}
- Root Page Rewrite: ${data.rootPageOverwriteAllowed ? 'Explicitly allowed' : 'NOT allowed by default. Create under non-root route.'}
- Route Policy Hint: ${routePolicyHint}
- Available UI Components (shadcn/ui): ${availableComponentNames}
- Available UI Component Files: ${availableComponentFiles}
- INSTALLED PACKAGES (package.json): ${allDeps}
- CRITICAL: You MUST ONLY import npm packages that appear in the INSTALLED PACKAGES list above. Do NOT use any package that is not listed. If a package is missing, use built-in alternatives (e.g., use native fetch instead of axios, use URLSearchParams instead of qs).
- CRITICAL: NEVER import files from the \`docs/\` directory (e.g., markdown files) into your code. Documentation files are for your internal reference ONLY. Do NOT attempt to \`import ... from "@docs/..."\` or \`import ... from "@/docs/..."\`.
${designHints}
[STACK_RULES]
${stackRules}
`.trim();
        this.contextStringCache = {
            at: Date.now(),
            value: context,
        };
        return context;
    }

    /**
     * Read-only excerpts from globals / Tailwind config so generated UI matches the target repo.
     */
    public async getDesignHintsBlock(): Promise<string> {
        const chunks: string[] = [];
        const maxCss = 3500;
        const cssCandidates = [
            'app/globals.css',
            'src/app/globals.css',
            'app/global.css',
            'src/app/global.css',
            'src/index.css',
            'app/index.css',
            'styles/globals.css',
            'src/styles/globals.css',
        ];
        for (const rel of cssCandidates) {
            const full = path.join(this.projectRoot, rel);
            if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
            let raw = fs.readFileSync(full, 'utf8');
            if (raw.length > maxCss) {
                raw = `${raw.slice(0, maxCss)}\n/* …truncated… */\n`;
            }
            chunks.push(`### Excerpt: \`${rel}\`\n\`\`\`css\n${raw}\n\`\`\``);
            break;
        }
        const maxTw = 4000;
        const twNames = ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.mjs', 'tailwind.config.cjs'];
        for (const name of twNames) {
            const full = path.join(this.projectRoot, name);
            if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
            let raw = fs.readFileSync(full, 'utf8');
            if (raw.length > maxTw) {
                raw = `${raw.slice(0, maxTw)}\n// …truncated…\n`;
            }
            chunks.push(`### Excerpt: \`${name}\`\n\`\`\`\n${raw}\n\`\`\``);
            break;
        }
        if (chunks.length === 0) {
            return '\n## DESIGN HINTS\n_No `globals.css` / `tailwind.config` found at common paths; infer styling only from files you read._\n_Default until you find evidence otherwise: light pages use dark body text on light backgrounds; do not assume dark mode or light-on-light without files that define it._\n';
        }
        return `\n## DESIGN HINTS (target repo — match this; do not impose an unrelated product theme)\n${chunks.join('\n\n')}\n`;
    }

    private getRoutePolicyHint(data: any): string {
        const base = data.routerBase;
        if (!base) {
            return 'Unknown router base. Use explicit file path under app/ or pages/ tree.';
        }

        const isApp = typeof data.structure === 'string' && data.structure.includes('app-router');

        if (!Array.isArray(data.pageCandidates) || data.pageCandidates.length === 0) {
            return isApp
                ? `No confirmed non-root route candidates found. For new feature, prefer "${base}/<feature>/page.tsx".`
                : `No confirmed non-root route candidates found. For new feature, prefer "${base}/<feature>.tsx" or "${base}/<feature>/index.tsx".`;
        }

        const examples = data.pageCandidates
            .slice(0, 8)
            .map((name: string) =>
                isApp ? `${base}/${name}/page.tsx` : `${base}/${name}.tsx`
            )
            .join(', ');
        return `Prefer non-root routes first. Example candidates: ${examples}`;
    }
}
