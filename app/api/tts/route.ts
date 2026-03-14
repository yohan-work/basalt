import { NextRequest } from 'next/server';
import { Communicate } from 'edge-tts-universal';

const MAX_TEXT_LENGTH = 500;

export async function POST(req: NextRequest) {
    try {
        const { text, voice, rate, pitch } = await req.json();

        if (!text || typeof text !== 'string') {
            return new Response(JSON.stringify({ error: 'text is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const trimmedText = text.slice(0, MAX_TEXT_LENGTH);

        const communicate = new Communicate(trimmedText, {
            voice: voice || 'ko-KR-SunHiNeural',
            rate: rate || '+0%',
            pitch: pitch || '+0Hz',
        });

        const audioChunks: Buffer[] = [];

        for await (const chunk of communicate.stream()) {
            if (chunk.type === 'audio' && chunk.data) {
                audioChunks.push(chunk.data);
            }
        }

        if (audioChunks.length === 0) {
            return new Response(JSON.stringify({ error: 'No audio generated' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const audioBuffer = Buffer.concat(audioChunks);

        return new Response(audioBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': String(audioBuffer.length),
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (error: any) {
        console.error('[TTS API] Error:', error);
        return new Response(JSON.stringify({ error: error.message || 'TTS generation failed' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
