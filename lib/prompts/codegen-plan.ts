/**
 * Plan phase for multi-step codegen: JSON only, no file bodies.
 */

export const CODEGEN_PLAN_SYSTEM_PROMPT = `You are a senior software architect. The user will describe a coding task for a real repository.
Produce a concise implementation plan as JSON only. Do not output code files, markdown fences, or prose outside JSON.
Prefer concrete paths (e.g. app/foo/page.tsx) when inferrable from the task. If unsure, use short placeholders.
Keep strings short. Use English for technical field values.`;

export const CODEGEN_PLAN_SCHEMA_DESCRIPTION = `{
  "summary": "One-line intent of what to build or change",
  "intendedPaths": ["relative/path/to/file.tsx"],
  "componentOutline": ["short bullet describing a UI or module piece"],
  "constraints": ["e.g. server component for page metadata", "no new npm packages"],
  "risks": ["optional noted risks or unknowns"]
}`;
