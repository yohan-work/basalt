import fs from 'fs';
import path from 'path';

export function ralphSessionDir(projectPath: string, taskId: string): string {
    return path.join(projectPath, '.basalt', 'ralph', taskId);
}

export function readProgressFile(projectPath: string, taskId: string): string {
    const file = path.join(ralphSessionDir(projectPath, taskId), 'progress.md');
    try {
        if (fs.existsSync(file)) {
            return fs.readFileSync(file, 'utf8').trim();
        }
    } catch {
        /* ignore */
    }
    return '';
}

export function appendRalphProgress(
    projectPath: string,
    taskId: string,
    block: string
): void {
    const dir = ralphSessionDir(projectPath, taskId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'progress.md');
    const stamp = new Date().toISOString();
    fs.appendFileSync(file, `\n## [${stamp}]\n${block.trim()}\n`, 'utf8');
}

export function readOptionalRalphScope(projectPath: string, taskId: string): string {
    const dir = ralphSessionDir(projectPath, taskId);
    const parts: string[] = [];
    const scopeMd = path.join(dir, 'scope.md');
    const prdJson = path.join(dir, 'prd.json');
    try {
        if (fs.existsSync(scopeMd)) {
            parts.push(`### scope.md\n\n${fs.readFileSync(scopeMd, 'utf8').trim()}`);
        }
    } catch {
        /* ignore */
    }
    try {
        if (fs.existsSync(prdJson)) {
            const raw = fs.readFileSync(prdJson, 'utf8').trim();
            parts.push(`### prd.json\n\n${raw.length > 12_000 ? `${raw.slice(0, 12_000)}\n… [truncated]` : raw}`);
        }
    } catch {
        /* ignore */
    }
    return parts.join('\n\n');
}

export type RalphRoundProgressSummary = {
    round: number;
    taskStatus: string;
    filePaths?: string[];
    note?: string;
};

export function formatRalphProgressBlock(summary: RalphRoundProgressSummary): string {
    const lines: string[] = [
        `- 라운드: ${summary.round}`,
        `- 태스크 상태: ${summary.taskStatus}`,
    ];
    if (summary.filePaths && summary.filePaths.length > 0) {
        lines.push(`- 변경/기록 파일 (최대 40개): ${summary.filePaths.slice(0, 40).join(', ')}`);
    }
    if (summary.note) {
        lines.push(`- 비고: ${summary.note.slice(0, 1500)}`);
    }
    return lines.join('\n');
}

/**
 * plan() 입력: 선택적 scope → 사용자 설명 → 이전 라운드 진행 로그 → 가드레일.
 */
export function buildRalphPlanInput(
    baseDescription: string,
    projectPath: string,
    taskId: string,
    round: number,
    guardrailsText: string
): string {
    const scope = readOptionalRalphScope(projectPath, taskId);
    const progress = readProgressFile(projectPath, taskId);
    const parts: string[] = [];
    if (scope.trim()) {
        parts.push(`---\n[Ralph 범위/스코프 파일]\n${scope.trim()}`);
    }
    parts.push(baseDescription);
    if (progress.trim()) {
        parts.push(`---\n[Ralph 진행 로그 — 이전 라운드까지]\n${progress.trim()}`);
    }
    if (guardrailsText.trim()) {
        parts.push(`---\n[Ralph 가드레일 — 라운드 ${round}]\n${guardrailsText.trim()}`);
    }
    return parts.join('\n\n');
}
