'use client';

import { TeamMessage } from '@/lib/team-types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useEffect, useRef } from 'react';
import { Volume2, VolumeX, Square } from 'lucide-react';
import { useTTS } from '@/lib/tts/useTTS';
import { motion } from 'framer-motion';

interface ChatChannelProps {
    messages: TeamMessage[];
}

export function ChatChannel({ messages }: ChatChannelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const tts = useTTS();
    const lastSpokenIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (scrollRef.current) {
            const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }
    }, [messages]);

    useEffect(() => {
        if (!tts.enabled || messages.length === 0) return;
        const latest = messages[messages.length - 1];
        if (latest && latest.id !== lastSpokenIdRef.current) {
            lastSpokenIdRef.current = latest.id;
            tts.speak(latest.content, latest.sender);
        }
    }, [messages, tts.enabled, tts.speak]);

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    💬 Team Chat
                    <div className="flex items-center gap-1.5 ml-auto">
                        <button
                            onClick={() => tts.setEnabled(!tts.enabled)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all ${tts.enabled ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'}`}
                            title={tts.enabled ? 'TTS 끄기' : 'TTS 켜기'}
                        >
                            {tts.enabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                            TTS
                        </button>
                        {tts.isSpeaking && (
                            <button
                                onClick={() => tts.stop()}
                                className="p-1 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-all"
                                title="중지"
                            >
                                <Square className="w-2.5 h-2.5" />
                            </button>
                        )}
                        <span className="text-xs font-normal text-muted-foreground">
                            {messages.length} messages
                        </span>
                    </div>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 min-h-0">
                <ScrollArea className="h-[400px] p-4" ref={scrollRef}>
                    <div className="space-y-4">
                        {messages.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-8">
                                No messages yet.
                            </div>
                        )}
                        {messages.map((msg) => (
                            <div key={msg.id} className="flex gap-3 text-sm group">
                                <Avatar className="w-8 h-8 border">
                                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary uppercase">
                                        {msg.sender.substring(0, 2)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="grid gap-1 flex-1">
                                    <div className="flex items-center gap-2">
                                        <div className="font-semibold">{msg.sender}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {new Date(msg.timestamp).toLocaleTimeString()}
                                        </div>
                                        {tts.enabled && (
                                            <button
                                                onClick={() => tts.speak(msg.content, msg.sender)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-blue-50"
                                                title="이 메시지 재생"
                                            >
                                                <Volume2 className="w-3 h-3 text-blue-500" />
                                            </button>
                                        )}
                                        {tts.isSpeaking && tts.speakingAgent === msg.sender && msg.id === lastSpokenIdRef.current && (
                                            <span className="inline-flex items-center gap-[2px]">
                                                {[0, 1, 2].map(i => (
                                                    <motion.span
                                                        key={i}
                                                        className="inline-block w-[2px] bg-blue-500 rounded-full"
                                                        animate={{ height: ['4px', '10px', '4px'] }}
                                                        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                                                    />
                                                ))}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-foreground/90 whitespace-pre-wrap leading-relaxed">
                                        {msg.content}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
