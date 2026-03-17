declare module 'edge-tts-universal' {
    interface CommunicateOptions {
        voice?: string;
        rate?: string;
        pitch?: string;
    }

    type StreamChunk =
        | {
            type: 'audio';
            data: Buffer;
        }
        | {
            type: string;
            data?: Buffer;
        };

    export class Communicate {
        constructor(text: string, options?: CommunicateOptions);
        stream(): AsyncIterable<StreamChunk>;
    }
}
