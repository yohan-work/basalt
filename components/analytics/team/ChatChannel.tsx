'use client';

import { TeamMessage } from '@/lib/team-types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Volume2, VolumeX, Square } from 'lucide-react';
import { useTTS } from '@/lib/tts/useTTS';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';

interface ChatChannelProps {
    messages: TeamMessage[];
}

export function ChatChannel({ messages }: ChatChannelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const tts = useTTS();
    const { enabled, isSpeaking, speakingAgent, setEnabled, stop, speak } = tts;
    const lastSpokenIdRef = useRef<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'chat' | 'discussion' | 'system'>('all');

    const filteredMessages = useMemo(() => {
        if (filter === 'all') return messages;
        return messages.filter((msg) => (msg.messageType || 'chat') === filter);
    }, [messages, filter]);

    useEffect(() => {
        if (scrollRef.current) {
            const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }
    }, [filteredMessages]);

    useEffect(() => {
        if (!enabled || messages.length === 0) return;
        const latest = messages[messages.length - 1];
        if (latest && latest.id !== lastSpokenIdRef.current) {
            lastSpokenIdRef.current = latest.id;
            speak(latest.content, latest.sender);
        }
    }, [messages, enabled, speak]);

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    💬 Team Chat
                    <div className="flex items-center gap-1.5 ml-auto">
                        <button
                            onClick={() => setEnabled(!enabled)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all ${enabled ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'}`}
                            title={enabled ? 'TTS 끄기' : 'TTS 켜기'}
                        >
                            {enabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                            TTS
                        </button>
                        {isSpeaking && (
                            <button
                                onClick={() => stop()}
                                className="p-1 rounded-full bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-all"
                                title="중지"
                            >
                                <Square className="w-2.5 h-2.5" />
                            </button>
                        )}
                        <span className="text-xs font-normal text-muted-foreground">
                            {filteredMessages.length}/{messages.length} messages
                        </span>
                    </div>
                </CardTitle>
                <div className="mt-2 flex flex-wrap gap-1">
                    {(['all', 'chat', 'discussion', 'system'] as const).map((option) => (
                        <button
                            key={option}
                            onClick={() => setFilter(option)}
                            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors ${
                                filter === option
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-background text-muted-foreground border-border hover:bg-muted'
                            }`}
                        >
                            {option}
                        </button>
                    ))}
                </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 min-h-0">
                <ScrollArea className="h-[400px] p-4" ref={scrollRef}>
                    <div className="space-y-4">
                        {filteredMessages.length === 0 && (
                            <div className="text-center text-sm text-muted-foreground py-8">
                                No messages yet.
                            </div>
                        )}
                        {filteredMessages.map((msg) => {
                            const messageType = msg.messageType || 'chat';
                            const isHandoffSystem =
                                messageType === 'system' && /handoff|핸드오프/i.test(msg.content);

                            return (
                            <div
                                key={msg.id}
                                className={`flex gap-3 text-sm group rounded-md p-2 ${
                                    isHandoffSystem
                                        ? 'border border-amber-400/40 bg-amber-50/40 dark:bg-amber-950/20'
                                        : ''
                                }`}
                            >
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
                                        <Badge
                                            variant={
                                                messageType === 'system'
                                                    ? 'default'
                                                    : messageType === 'discussion'
                                                        ? 'secondary'
                                                        : 'outline'
                                            }
                                            className="text-[10px]"
                                        >
                                            {messageType}
                                        </Badge>
                                        {isHandoffSystem && (
                                            <Badge variant="outline" className="text-[10px] border-amber-500/50">
                                                handoff
                                            </Badge>
                                        )}
                                        {enabled && (
                                            <button
                                                onClick={() => speak(msg.content, msg.sender)}
                                                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-blue-50"
                                                title="이 메시지 재생"
                                            >
                                                <Volume2 className="w-3 h-3 text-blue-500" />
                                            </button>
                                        )}
                                        {isSpeaking && speakingAgent === msg.sender && (
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
                        )})}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
