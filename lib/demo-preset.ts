import fs from 'fs/promises';
import path from 'path';

export type DemoPresetApplyPhase = 'after_execute_before_test';

export interface DemoPresetConfig {
    enabled?: boolean;
    templateId?: string;
    artifactId?: string;
    applyPhase?: DemoPresetApplyPhase;
    appliedAt?: string;
    appliedFiles?: string[];
    manifestPath?: string;
    lastError?: string | null;
}

interface DemoArtifactFileEntry {
    source: string;
    target: string;
}

interface DemoArtifactManifest {
    artifactId: string;
    version?: string;
    files: DemoArtifactFileEntry[];
}

export interface AppliedDemoArtifactResult {
    artifactId: string;
    manifestPath: string;
    appliedFiles: string[];
}

function ensurePathInside(baseDir: string, candidate: string, label: string): void {
    const rel = path.relative(baseDir, candidate);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new Error(`${label} is outside allowed root: ${candidate}`);
    }
}

function parseManifest(raw: string, expectedArtifactId: string): DemoArtifactManifest {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(`Invalid manifest JSON: ${(error as Error).message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Manifest must be a JSON object');
    }

    const candidate = parsed as Partial<DemoArtifactManifest>;
    if (typeof candidate.artifactId !== 'string' || candidate.artifactId.trim() === '') {
        throw new Error('Manifest missing required field: artifactId');
    }
    if (candidate.artifactId !== expectedArtifactId) {
        throw new Error(`Manifest artifactId mismatch: expected "${expectedArtifactId}", got "${candidate.artifactId}"`);
    }
    if (!Array.isArray(candidate.files)) {
        throw new Error('Manifest missing required field: files[]');
    }

    const files: DemoArtifactFileEntry[] = candidate.files.map((entry, index) => {
        if (!entry || typeof entry !== 'object') {
            throw new Error(`Manifest files[${index}] must be an object`);
        }
        const source = (entry as { source?: unknown }).source;
        const target = (entry as { target?: unknown }).target;
        if (typeof source !== 'string' || !source.trim()) {
            throw new Error(`Manifest files[${index}].source must be a non-empty string`);
        }
        if (typeof target !== 'string' || !target.trim()) {
            throw new Error(`Manifest files[${index}].target must be a non-empty string`);
        }
        return { source, target };
    });

    return {
        artifactId: candidate.artifactId,
        version: typeof candidate.version === 'string' ? candidate.version : undefined,
        files,
    };
}

export async function applyDemoArtifactSnapshot(params: {
    projectPath: string;
    artifactId: string;
}): Promise<AppliedDemoArtifactResult> {
    const artifactId = String(params.artifactId || '').trim();
    if (!artifactId) {
        throw new Error('artifactId is required');
    }

    const repoRoot = process.cwd();
    const artifactRoot = path.resolve(repoRoot, 'demo-artifacts', artifactId);
    const manifestPath = path.join(artifactRoot, 'manifest.json');

    let manifestRaw: string;
    try {
        manifestRaw = await fs.readFile(manifestPath, 'utf8');
    } catch (error) {
        throw new Error(
            `Demo artifact manifest not found: ${manifestPath}. ` +
            `Create demo-artifacts/${artifactId}/manifest.json first.`
        );
    }

    const manifest = parseManifest(manifestRaw, artifactId);
    const appliedFiles: string[] = [];

    for (const entry of manifest.files) {
        const src = path.resolve(artifactRoot, entry.source);
        ensurePathInside(artifactRoot, src, `artifact source (${entry.source})`);

        const target = path.resolve(params.projectPath, entry.target);
        ensurePathInside(params.projectPath, target, `artifact target (${entry.target})`);

        await fs.access(src);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(src, target);
        appliedFiles.push(entry.target);
    }

    return {
        artifactId,
        manifestPath: path.relative(repoRoot, manifestPath),
        appliedFiles,
    };
}
