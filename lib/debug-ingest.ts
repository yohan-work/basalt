type DebugIngestPayload = {
    sessionId: string;
    hypothesisId: string;
    location: string;
    message: string;
    data?: Record<string, unknown>;
    timestamp?: number;
};

function resolveDebugIngestUrl(): string | null {
    const raw = String(process.env.BASALT_DEBUG_INGEST_URL || '').trim();
    if (!raw) return null;
    try {
        const url = new URL(raw);
        if (!/^https?:$/.test(url.protocol)) return null;
        return url.toString();
    } catch {
        return null;
    }
}

export function isDebugIngestEnabled(): boolean {
    return Boolean(resolveDebugIngestUrl());
}

export async function sendDebugIngest(payload: DebugIngestPayload): Promise<void> {
    const url = resolveDebugIngestUrl();
    if (!url) return;

    const body = {
        ...payload,
        timestamp: payload.timestamp ?? Date.now(),
    };

    try {
        await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(process.env.BASALT_DEBUG_INGEST_SESSION
                    ? { 'X-Debug-Session-Id': process.env.BASALT_DEBUG_INGEST_SESSION }
                    : {}),
            },
            body: JSON.stringify(body),
        });
    } catch {
        // Debug telemetry must never affect execution flow.
    }
}
