
import { TeamMessage } from '@/lib/team-types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useEffect, useRef } from 'react';

interface ChatChannelProps {
    messages: TeamMessage[];
}

export function ChatChannel({ messages }: ChatChannelProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new message
    useEffect(() => {
        if (scrollRef.current) {
            const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }
    }, [messages]);

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                    💬 Team Chat
                    <span className="text-xs font-normal text-muted-foreground ml-auto">
                        {messages.length} messages
                    </span>
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
                            <div key={msg.id} className="flex gap-3 text-sm">
                                <Avatar className="w-8 h-8 border">
                                    <AvatarFallback className="text-[10px] bg-primary/10 text-primary uppercase">
                                        {msg.sender.substring(0, 2)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="grid gap-1">
                                    <div className="flex items-center gap-2">
                                        <div className="font-semibold">{msg.sender}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {new Date(msg.timestamp).toLocaleTimeString()}
                                        </div>
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
