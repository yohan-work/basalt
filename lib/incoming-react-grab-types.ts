/**
 * Payload sent from the user's project (react-grab plugin) via postMessage.
 * Must match the plugin's postMessage payload shape.
 */
export interface IncomingReactGrabPayload {
    filePath: string | null;
    componentName: string | null;
    line?: number;
    column?: number;
    selector?: string;
    stackString?: string;
    /** Optional: pre-built descriptor string (component + location) */
    elementDescriptor?: string;
}

export const BASALT_REACT_GRAB_MESSAGE_TYPE = 'basalt-react-grab-context' as const;
