/** Client-safe: no Node built-ins. Use for UI + types shared with server. */

export const QA_ARTIFACT_SLOTS = ['main', 'mobile', 'tablet', 'desktop'] as const;
export type QaArtifactSlot = (typeof QA_ARTIFACT_SLOTS)[number];

export function isQaArtifactSlot(value: string): value is QaArtifactSlot {
    return (QA_ARTIFACT_SLOTS as readonly string[]).includes(value);
}
