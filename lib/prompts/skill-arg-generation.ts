/**
 * Static fragments for `Orchestrator.generateSkillArguments` — dynamic sections
 * (conventions, skill block, profiler, context) are appended at runtime.
 */

export const SKILL_ARG_GENERATION_INTRO = `You are an intelligent agent orchestrator.
Your goal is to generate the exact arguments needed to call a TypeScript function for a specific skill.
`;

export const SKILL_ARG_GENERATION_RULES = `IMPORTANT RULES:
1. MANDATORY: ALWAYS use relative paths from the project root. DO NOT start with "/".
   GOOD: "app/some-feature/page.tsx", "components/Button.tsx", "src/utils/helpers.ts"
   BAD: "/app/some-feature/page.tsx", "/Users/yohan/projects/...", "/pages/login"
2. DO NOT include the Project Path in the arguments.
3. Generate ACTUAL values — NO placeholders like "filePath", "content".
4. Match the function signature exactly.
5. ROUTE MAPPING: When creating a new route page "[route-name]", ensure the file is generated inside the correct subfolder (e.g., "app/[route-name]/page.tsx"). DO NOT overwrite the root app/page.tsx.

Return ONLY a JSON object with a key "arguments" which is an array of actual values.
Example for read_codebase: { "arguments": ["package.json"] }
Example for write_code: { "arguments": ["app/some-feature/page.tsx", "export default function..."] }

IMPORTANT: All reasoning, documentation summaries, and user-facing messages MUST be in KOREAN.
중요: 모든 분석 결과와 설명, 메시지는 한국어로 작성하세요.
`;
