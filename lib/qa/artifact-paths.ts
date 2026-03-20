import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

import type { ResponsiveResult } from '@/lib/skills/check_responsive/execute';

import type { QaArtifactSlot } from './artifact-slots';

export function getQaArtifactDir(projectPath: string, taskId: string): string {
    return path.join(projectPath, '.basalt', 'basalt-qa', taskId);
}

export function getQaArtifactFilePath(projectPath: string, taskId: string, slot: QaArtifactSlot): string {
    return path.join(getQaArtifactDir(projectPath, taskId), `${slot}.png`);
}

export async function ensureDir(dir: string): Promise<void> {
    await fsPromises.mkdir(dir, { recursive: true });
}

async function copyIfExists(sourceAbsolutePath: string | undefined, destFile: string): Promise<boolean> {
    if (!sourceAbsolutePath || !fs.existsSync(sourceAbsolutePath)) return false;
    await ensureDir(path.dirname(destFile));
    await fsPromises.copyFile(sourceAbsolutePath, destFile);
    return true;
}

/**
 * Copies screenshot_page + check_responsive outputs into target project for UI serving.
 */
export async function persistQaArtifactsFromCapture(
    projectPath: string,
    taskId: string,
    mainScreenshotPath: string | undefined,
    responsive: ResponsiveResult | null | undefined
): Promise<QaArtifactSlot[]> {
    const dir = getQaArtifactDir(projectPath, taskId);
    const saved: QaArtifactSlot[] = [];

    if (await copyIfExists(mainScreenshotPath, path.join(dir, 'main.png'))) {
        saved.push('main');
    }

    const pairs: Array<[QaArtifactSlot, string | undefined]> = [
        ['mobile', responsive?.mobile?.screenshotPath],
        ['tablet', responsive?.tablet?.screenshotPath],
        ['desktop', responsive?.desktop?.screenshotPath],
    ];

    for (const [slot, src] of pairs) {
        if (await copyIfExists(src, path.join(dir, `${slot}.png`))) {
            saved.push(slot);
        }
    }

    return saved;
}
