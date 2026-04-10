export const PAGE_TASK_TEMPLATE_ID = 'page';
export const APPLE_DESIGN_PRESET_ID = 'apple';
export const VERCEL_DESIGN_PRESET_ID = 'vercel';
export const NOTION_DESIGN_PRESET_ID = 'notion';

export type BuiltInDesignPreset =
    | typeof APPLE_DESIGN_PRESET_ID
    | typeof VERCEL_DESIGN_PRESET_ID
    | typeof NOTION_DESIGN_PRESET_ID;

export interface TaskDesignMetadata {
    taskTemplateId?: string;
    designPreset?: string;
}

export interface DesignPresetDefinition {
    id: BuiltInDesignPreset;
    label: string;
    summary: string;
    relativePath: string;
    recommendedFor: string;
}

export const DESIGN_PRESETS: readonly DesignPresetDefinition[] = [
    {
        id: APPLE_DESIGN_PRESET_ID,
        label: 'Apple',
        summary: 'Bright premium surfaces, restrained monochrome palette, generous whitespace, cinematic calm.',
        relativePath: 'reference/design-presets/apple.design.md',
        recommendedFor: 'Premium marketing pages and polished product storytelling.',
    },
    {
        id: VERCEL_DESIGN_PRESET_ID,
        label: 'Vercel',
        summary: 'Black-and-white precision, developer-product clarity, sharp contrast, minimal chrome.',
        relativePath: 'reference/design-presets/vercel.design.md',
        recommendedFor: 'Developer tools, SaaS launches, and crisp monochrome product pages.',
    },
    {
        id: NOTION_DESIGN_PRESET_ID,
        label: 'Notion',
        summary: 'Warm minimalism, editorial structure, soft surfaces, calm document-first hierarchy.',
        relativePath: 'reference/design-presets/notion.design.md',
        recommendedFor: 'Knowledge products, docs-like landing pages, and quiet productivity interfaces.',
    },
] as const;

function asTaskDesignMetadata(metadata: unknown): TaskDesignMetadata {
    if (!metadata || typeof metadata !== 'object') return {};
    return metadata as TaskDesignMetadata;
}

export function getDesignPresetOptions(): DesignPresetDefinition[] {
    return [...DESIGN_PRESETS];
}

export function getDesignPresetById(id: string | null | undefined): DesignPresetDefinition | null {
    if (!id) return null;
    return DESIGN_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function resolveTaskTemplateId(metadata: unknown): string | null {
    const value = asTaskDesignMetadata(metadata).taskTemplateId;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function isPageTaskTemplate(metadata: unknown): boolean {
    return resolveTaskTemplateId(metadata) === PAGE_TASK_TEMPLATE_ID;
}

export function resolveDesignPreset(metadata: unknown): BuiltInDesignPreset | null {
    const value = asTaskDesignMetadata(metadata).designPreset;
    const preset = getDesignPresetById(value);
    return preset?.id ?? null;
}

export function getDefaultDesignPresetForTemplate(templateId: string | null | undefined): BuiltInDesignPreset | null {
    return templateId === PAGE_TASK_TEMPLATE_ID ? APPLE_DESIGN_PRESET_ID : null;
}

export function buildTaskMetadataWithDesignPreset(
    metadata: Record<string, unknown> | null | undefined,
    templateId: string | null | undefined,
    designPreset?: BuiltInDesignPreset | null
): Record<string, unknown> | undefined {
    const next: Record<string, unknown> = metadata ? { ...metadata } : {};
    if (templateId) {
        next.taskTemplateId = templateId;
    }

    const resolvedPreset = designPreset ?? getDefaultDesignPresetForTemplate(templateId);
    if (resolvedPreset) {
        next.designPreset = resolvedPreset;
    }

    return Object.keys(next).length > 0 ? next : undefined;
}
