import { NextResponse } from 'next/server';

/**
 * Lightweight liveness check for load balancers / monitoring.
 */
export async function GET() {
    return NextResponse.json({ ok: true, service: 'basalt' });
}
