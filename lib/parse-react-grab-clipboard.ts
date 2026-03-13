/**
 * Parses clipboard content copied by react-grab (Cmd+C / Ctrl+C on a UI element).
 * Format example:
 *   <a class="ml-auto ...">Forgot your password?</a>
 *   in LoginForm at components/login-form.tsx:46:19
 */

export interface ParsedReactGrabContext {
    filePath: string | null;
    componentName: string | null;
    line?: number;
    column?: number;
    htmlSnippet?: string;
    /** Ready-to-use descriptor string for LLM (component + location, optional HTML) */
    elementDescriptor: string;
}

const RE_IN_COMPONENT_AT =
    /in\s+([^\s]+)\s+at\s+([^\s:]+)(?::(\d+))?(?::(\d+))?/i;
const RE_AT_PATH = /at\s+([^\s:]+)(?::(\d+))?(?::(\d+))?/i;

/**
 * Parses react-grab clipboard text into file path, component name, and optional HTML snippet.
 * Returns null if the input does not look like react-grab format.
 */
export function parseReactGrabClipboard(text: string): ParsedReactGrabContext | null {
    if (!text || typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed) return null;

    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let filePath: string | null = null;
    let componentName: string | null = null;
    let line: number | undefined;
    let column: number | undefined;
    let htmlSnippet: string | undefined;

    for (const lineStr of lines) {
        const inMatch = lineStr.match(RE_IN_COMPONENT_AT);
        if (inMatch) {
            componentName = inMatch[1] || null;
            filePath = inMatch[2] || null;
            if (inMatch[3] !== undefined) line = parseInt(inMatch[3], 10);
            if (inMatch[4] !== undefined) column = parseInt(inMatch[4], 10);
            break;
        }
        const atMatch = lineStr.match(RE_AT_PATH);
        if (atMatch) {
            filePath = atMatch[1] || null;
            if (atMatch[2] !== undefined) line = parseInt(atMatch[2], 10);
            if (atMatch[3] !== undefined) column = parseInt(atMatch[3], 10);
            break;
        }
    }

    if (!filePath && !componentName) return null;

    const firstLine = lines[0];
    if (
        firstLine &&
        (firstLine.startsWith('<') || firstLine.startsWith('<!')) &&
        !firstLine.match(/^\s*in\s+/i)
    ) {
        htmlSnippet = lines[0];
    }

    const locationPart =
        filePath && (line !== undefined || column !== undefined)
            ? `${filePath}${line !== undefined ? `:${line}` : ''}${column !== undefined ? `:${column}` : ''}`
            : filePath || '';
    const descriptorParts: string[] = [];
    if (componentName) descriptorParts.push(componentName);
    if (locationPart) descriptorParts.push(`(${locationPart})`);
    if (htmlSnippet) descriptorParts.push(htmlSnippet);
    const elementDescriptor = descriptorParts.join(' ').trim() || locationPart || '';

    return {
        filePath,
        componentName,
        line,
        column,
        htmlSnippet,
        elementDescriptor: elementDescriptor || (filePath ?? '') || (componentName ?? ''),
    };
}
