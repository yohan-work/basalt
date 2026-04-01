/**
 * Central skill metadata for orchestration: risk surface, arg tier, execution quirks.
 * Phase A: read-only registry; handlers still resolved in Orchestrator.getSkillFunction.
 */

export type SkillFsAccess = 'none' | 'read' | 'write';

export type SkillRiskSurface = {
    fs: SkillFsAccess;
    network: boolean;
    shell: boolean;
    git: boolean;
};

/** fast | smart: default LLM tier for generateSkillArguments. orchestrator_special: write_code path only */
export type SkillArgModelTier = 'fast' | 'smart' | 'orchestrator_special';

export type SkillHandlerKind = 'native' | 'dynamic';

export type SkillRegistryEntry = {
    name: string;
    kind: SkillHandlerKind;
    description: string;
    risk: SkillRiskSurface;
    /** Orchestrator pushes project root as last arg (filesystem-scoped skills) */
    appendProjectPathLast: boolean;
    argModelTier: SkillArgModelTier;
    /** analyze_task / create_workflow: emitter appended for step execution */
    injectEmitterForExecution: boolean;
};

/** Same key as `getSkillRegistryEntry` / `SKILL_ARG_SCHEMAS` lookups (`lib/skills/arg-schemas.ts`). */
export function normalizeSkillRegistryName(skillName: string): string {
    return String(skillName || '')
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .trim();
}

function e(
    row: Omit<SkillRegistryEntry, 'kind'> & { kind?: SkillHandlerKind }
): SkillRegistryEntry {
    return {
        kind: 'native',
        ...row,
    };
}

const ENTRIES: SkillRegistryEntry[] = [
    e({
        name: 'analyze_task',
        description: 'LLM task analysis and agent roster',
        risk: { fs: 'none', network: false, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'smart',
        injectEmitterForExecution: true,
    }),
    e({
        name: 'create_workflow',
        description: 'LLM workflow JSON for execution steps',
        risk: { fs: 'none', network: false, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'smart',
        injectEmitterForExecution: true,
    }),
    e({
        name: 'consult_agents',
        description: 'Multi-agent discussion / thoughts',
        risk: { fs: 'none', network: false, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'read_codebase',
        description: 'Read file contents under project',
        risk: { fs: 'read', network: false, shell: false, git: false },
        appendProjectPathLast: true,
        argModelTier: 'fast',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'write_code',
        description: 'Validate and write file; heavy codegen in Orchestrator',
        risk: { fs: 'write', network: false, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'orchestrator_special',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'verify_final_output',
        description: 'LLM + deterministic QA on task output',
        risk: { fs: 'read', network: false, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'run_shell_command',
        description: 'Run shell command in repo',
        risk: { fs: 'none', network: false, shell: true, git: false },
        appendProjectPathLast: true,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'lint_code',
        description: 'Run linter',
        risk: { fs: 'read', network: false, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'fast',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'typecheck',
        description: 'TypeScript check',
        risk: { fs: 'read', network: false, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'fast',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'refactor_code',
        description: 'LLM refactor of snippet',
        risk: { fs: 'none', network: false, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'check_responsive',
        description: 'Viewport / responsive capture via browser',
        risk: { fs: 'read', network: true, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'fast',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'visual_test',
        description: 'Visual regression style check',
        risk: { fs: 'read', network: true, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'e2e_test',
        description: 'End-to-end test runner hook',
        risk: { fs: 'read', network: true, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'browse_web',
        description: 'Fetch or browse external URLs',
        risk: { fs: 'none', network: true, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'screenshot_page',
        description: 'Capture page screenshot',
        risk: { fs: 'read', network: true, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'fast',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'check_environment',
        description: 'Environment diagnostics',
        risk: { fs: 'read', network: false, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'fast',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'list_directory',
        description: 'List directory under project',
        risk: { fs: 'read', network: false, shell: false, git: false },
        appendProjectPathLast: true,
        argModelTier: 'fast',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'apply_design_system',
        description: 'Apply design tokens / component patterns',
        risk: { fs: 'write', network: false, shell: false, git: false },
        appendProjectPathLast: true,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'generate_scss',
        description: 'Generate SCSS module',
        risk: { fs: 'write', network: false, shell: false, git: false },
        appendProjectPathLast: true,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'search_npm_package',
        description: 'Search npm registry',
        risk: { fs: 'read', network: true, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'analyze_error_logs',
        description: 'LLM error explanation',
        risk: { fs: 'none', network: false, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'scan_project',
        description: 'Scan tree structure',
        risk: { fs: 'read', network: false, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'extract_patterns',
        description: 'Extract code patterns from project',
        risk: { fs: 'read', network: false, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'find_similar_components',
        description: 'Find similar components by query',
        risk: { fs: 'read', network: false, shell: false, git: false },
        appendProjectPathLast: false,
        argModelTier: 'smart',
        injectEmitterForExecution: false,
    }),
    e({
        name: 'manage_git',
        description: 'Git operations',
        risk: { fs: 'read', network: false, shell: false, git: true },
        appendProjectPathLast: true,
        argModelTier: 'fast',
        injectEmitterForExecution: false,
    }),
];

const byNormalizedName = new Map<string, SkillRegistryEntry>();
for (const entry of ENTRIES) {
    byNormalizedName.set(normalizeSkillRegistryName(entry.name), entry);
}

export function getSkillRegistryEntry(skillName: string): SkillRegistryEntry | undefined {
    return byNormalizedName.get(normalizeSkillRegistryName(skillName));
}

export function listSkillRegistryEntries(): readonly SkillRegistryEntry[] {
    return ENTRIES;
}

/** Skills where generateSkillArguments uses the fast model by default */
export const FAST_ARG_SKILL_NAMES: readonly string[] = ENTRIES.filter(
    (x) => x.argModelTier === 'fast'
).map((x) => x.name);

export function shouldAppendProjectPathLast(skillName: string): boolean {
    const row = getSkillRegistryEntry(skillName);
    if (row) return row.appendProjectPathLast;
    return false;
}

export function shouldInjectEmitterForExecution(skillName: string): boolean {
    const row = getSkillRegistryEntry(skillName);
    if (row) return row.injectEmitterForExecution;
    return false;
}

/** Env `BASALT_SKILL_RISK_MODE`: unset or other = no extra behavior (default). */
export type SkillRiskGateMode = 'off' | 'warn' | 'deny';

export function resolveSkillRiskGateMode(): SkillRiskGateMode {
    const raw = String(process.env.BASALT_SKILL_RISK_MODE ?? '').trim().toLowerCase();
    if (raw === 'deny') return 'deny';
    if (raw === 'warn') return 'warn';
    return 'off';
}

/** True when registry lists shell, git, or network risk. Unregistered skills = false. */
export function hasElevatedRisk(skillName: string): boolean {
    const entry = getSkillRegistryEntry(skillName);
    if (!entry) return false;
    const r = entry.risk;
    return Boolean(r.shell || r.git || r.network);
}
