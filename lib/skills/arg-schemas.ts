import { z } from 'zod';

import { normalizeSkillRegistryName } from './registry';

const GIT_ACTIONS = ['checkout', 'commit', 'merge', 'add', 'push', 'status', 'create_pr'] as const;
const GIT_ACTION_SET = new Set<string>(GIT_ACTIONS);

function asTrimmedString(x: unknown): string {
    if (x === null || x === undefined) return '';
    return String(x).trim();
}

function formatZodIssues(err: z.ZodError): string {
    return err.issues.map((i) => i.message).join('; ');
}

/** Models often append project root as a 2nd arg despite prompts; orchestrator adds it later. */
const readCodebaseArgsSchema = z.preprocess(
    (v) => {
        if (!Array.isArray(v) || v.length === 0) return v;
        return [v[0]];
    },
    z
        .array(z.unknown())
        .length(1)
        .superRefine((arr, ctx) => {
            const s = asTrimmedString(arr[0]);
            if (!s) {
                ctx.addIssue({ code: 'custom', message: 'path must be a non-empty string' });
            }
        })
        .transform((arr) => [asTrimmedString(arr[0])])
);

const listDirectoryArgsSchema = z.preprocess(
    (v) => {
        if (!Array.isArray(v)) return v;
        if (v.length === 0) return ['.'];
        return [v[0]];
    },
    z
        .array(z.unknown())
        .length(1)
        .transform((arr) => {
            const s = asTrimmedString(arr[0]);
            return [s || '.'];
        })
);

const runShellCommandArgsSchema = z.preprocess(
    (v) => {
        if (!Array.isArray(v) || v.length === 0) return v;
        return [v[0]];
    },
    z
        .array(z.unknown())
        .length(1)
        .superRefine((arr, ctx) => {
            const s = asTrimmedString(arr[0]);
            if (!s) {
                ctx.addIssue({ code: 'custom', message: 'command string must be non-empty' });
            }
        })
        .transform((arr) => [asTrimmedString(arr[0])])
);

const manageGitArgsSchema = z
    .array(z.unknown())
    .min(1)
    .max(2)
    .superRefine((arr, ctx) => {
        const action = asTrimmedString(arr[0]);
        if (!GIT_ACTION_SET.has(action)) {
            ctx.addIssue({
                code: 'custom',
                message: `invalid manage_git action "${action}"; expected one of: ${GIT_ACTIONS.join(', ')}`,
            });
        }
    })
    .transform((arr) => {
        const action = asTrimmedString(arr[0]);
        if (arr.length === 1) return [action];
        return [action, asTrimmedString(arr[1])];
    });

/**
 * Zod schemas for LLM-produced `args` **before** `projectPath` / emitter injection.
 * Keys use `normalizeSkillRegistryName` (same as `getSkillRegistryEntry`).
 */
const SKILL_ARG_SCHEMAS: Record<string, z.ZodType<unknown[]>> = {
    'read-codebase': readCodebaseArgsSchema,
    'list-directory': listDirectoryArgsSchema,
    'run-shell-command': runShellCommandArgsSchema,
    'manage-git': manageGitArgsSchema,
};

/**
 * Validates and normalizes orchestrator skill args when a schema exists.
 * Unregistered skills or skills without a schema: returns `args` unchanged.
 */
export function validateSkillArgsBeforeExecution(skillName: string, args: unknown): unknown[] {
    if (!Array.isArray(args)) {
        throw new Error(`Skill "${skillName}" argument validation failed: expected an array`);
    }
    const key = normalizeSkillRegistryName(skillName);
    const schema = SKILL_ARG_SCHEMAS[key];
    if (!schema) {
        return args;
    }
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
        throw new Error(`Skill "${skillName}" argument validation failed: ${formatZodIssues(parsed.error)}`);
    }
    return parsed.data as unknown[];
}
