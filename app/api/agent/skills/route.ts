
import { NextRequest, NextResponse } from 'next/server';
import * as skills from '@/lib/skills';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { skillName, args } = body;

        if (!skillName || typeof skillName !== 'string') {
            return NextResponse.json({ error: 'Invalid skillName' }, { status: 400 });
        }

        const skillFunction = (skills as any)[skillName];

        if (!skillFunction) {
            return NextResponse.json({ error: `Skill ${skillName} not found` }, { status: 404 });
        }

        // Execute the skill
        // Supports passing args as array (for spread) or single object/value
        let result;
        if (Array.isArray(args)) {
            result = await skillFunction(...args);
        } else {
            result = await skillFunction(args);
        }

        return NextResponse.json({ success: true, result });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
