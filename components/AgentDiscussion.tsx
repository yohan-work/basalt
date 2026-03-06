'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, MessageSquare, Lightbulb, Send, Coffee, Beer, Music } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';


interface AgentThought {
    id: string;
    agent: string;
    thought: string;
    type: 'idea' | 'critique' | 'agreement';
    timestamp: number;
}

interface AgentDiscussionProps {
    taskId: string;
    isActive: boolean;
}

const AGENTS = [
    { role: 'product-manager', name: 'PM', color: 'bg-[#ff00ff]', pixelIcon: '☕' },
    { role: 'software-engineer', name: 'Dev', color: 'bg-[#00ffff]', pixelIcon: '💻' },
    { role: 'qa', name: 'QA', color: 'bg-[#00ff00]', pixelIcon: '🔍' },
    { role: 'main-agent', name: 'Lead', color: 'bg-[#ffff00]', pixelIcon: '👑' },
    { role: 'style-architect', name: 'Style', color: 'bg-[#ff0066]', pixelIcon: '🎨' }
];


export function AgentDiscussion({ taskId, isActive }: AgentDiscussionProps) {
    const [allThoughts, setAllThoughts] = useState<AgentThought[]>([]);
    const [visibleThoughts, setVisibleThoughts] = useState<AgentThought[]>([]);
    const [currentThoughtIndex, setCurrentThoughtIndex] = useState(-1);
    const [userInput, setUserInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const meetingZoneRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [meetingSize, setMeetingSize] = useState({ width: 0, height: 0 });

    // 1. Fetch and Subscribe
    useEffect(() => {
        if (!taskId) return;

        const fetchInitialThoughts = async () => {
            const { data, error } = await supabase
                .from('Execution_Logs')
                .select('*')
                .eq('task_id', taskId)
                .order('created_at', { ascending: true });

            if (!error && data) {
                const thoughtLogs = data
                    .filter(log => (log.metadata?.type === 'THOUGHT' || log.agent_role === 'user') &&
                        log.message !== "에이전트 그룹 논의 시작: 작업 범위를 확정하고 최적의 실행 계획을 수립합니다.")
                    .map(log => ({
                        id: log.id,
                        agent: log.agent_role,
                        thought: log.message,
                        type: (log.metadata?.thought_type || 'idea') as AgentThought['type'],
                        timestamp: new Date(log.created_at).getTime()
                    }));
                setAllThoughts(thoughtLogs);
            }
        };

        fetchInitialThoughts();

        const channel = supabase
            .channel(`agent-thoughts-${taskId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'Execution_Logs',
                    filter: `task_id=eq.${taskId}`
                },
                (payload) => {
                    const newLog = payload.new;
                    if ((newLog.metadata?.type === 'THOUGHT' || newLog.agent_role === 'user') &&
                        newLog.message !== "에이전트 그룹 논의 시작: 작업 범위를 확정하고 최적의 실행 계획을 수립합니다.") {
                        const newThought: AgentThought = {
                            id: newLog.id,
                            agent: newLog.agent_role,
                            thought: newLog.message,
                            type: (newLog.metadata?.thought_type || 'idea') as AgentThought['type'],
                            timestamp: new Date(newLog.created_at).getTime()
                        };
                        setAllThoughts(prev => {
                            if (prev.some(t => t.id === newThought.id)) return prev;
                            return [...prev, newThought];
                        });
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [taskId]);

    // 2. Drip feed logic (4.5s delay)
    useEffect(() => {
        const interval = setInterval(() => {
            if (currentThoughtIndex < allThoughts.length - 1) {
                const nextIndex = currentThoughtIndex + 1;
                setCurrentThoughtIndex(nextIndex);
                setVisibleThoughts(prev => [...prev, allThoughts[nextIndex]]);
            }
        }, 4500);

        return () => clearInterval(interval);
    }, [allThoughts, currentThoughtIndex]);

    // Auto-scroll log
    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }, [visibleThoughts]);

    // Resize observer for meeting zone
    useEffect(() => {
        const el = meetingZoneRef.current;
        if (!el) return;
        const ro = new ResizeObserver((entries) => {
            const { width, height } = entries[0]?.contentRect ?? { width: 0, height: 0 };
            setMeetingSize({ width, height });
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // 3. User Interaction
    const handleSendMessage = async () => {
        if (!userInput.trim() || isSending) return;

        setIsSending(true);
        try {
            const res = await fetch('/api/agent/discuss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId, message: userInput })
            });

            if (res.ok) {
                setUserInput('');
            }
        } catch (err) {
            console.error('Failed to send message:', err);
        } finally {
            setIsSending(false);
        }
    };

    const currentThought = currentThoughtIndex >= 0 ? allThoughts[currentThoughtIndex] : null;
    const progress = allThoughts.length > 0 ? ((currentThoughtIndex + 1) / allThoughts.length) * 100 : 0;

    if (allThoughts.length === 0) {
        return (
            <div className="relative w-full h-[500px] bg-slate-950/40 rounded-2xl border border-slate-800/60 flex items-center justify-center backdrop-blur-xl">
                <div className="text-center space-y-4 animate-in fade-in zoom-in duration-700">
                    <div className="relative inline-block">
                        <div className="absolute inset-0 bg-blue-500/10 rounded-full blur-2xl animate-pulse" />
                        <MessageSquare className="w-16 h-16 text-slate-800 relative" />
                    </div>
                    <div className="space-y-2">
                        <p className="text-slate-400 text-sm font-medium">에이전트들이 회의실로 모이고 있습니다...</p>
                        <p className="text-slate-600 text-xs">잠시만 기다려주세요</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-0 w-full h-[600px] animate-in fade-in duration-700 font-mono text-slate-300 bg-[#0a0a0f] overflow-hidden border-4 border-[#1a1a2e] shadow-[0_0_20px_rgba(0,0,0,0.5)]">
            {/* Retro Neon Header */}
            <div className="bg-[#1a1a2e] border-b-4 border-[#0f0f1a] p-3 shrink-0 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ff00ff_1px,transparent_1px)] bg-[size:10px_10px]" />
                <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-black flex items-center justify-center border-2 border-[#ff00ff] shadow-[0_0_10px_#ff00ff]">
                            <Music className="w-4 h-4 text-[#ff00ff] animate-pulse" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-[14px] font-black text-white italic tracking-tighter uppercase">
                                    <span className="text-[#ff00ff] animate-pulse">Neon</span> <span className="text-[#00ffff]">Basalt Bar</span>
                                </h3>
                                <Badge className="bg-[#ff00ff] text-white animate-bounce h-5 text-[8px] border-none px-1 rounded-none scale-90">
                                    LIVE {currentThoughtIndex + 1}/{allThoughts.length}
                                </Badge>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Left: Pixel Street Zone */}
                <div className="flex-[1.4] relative bg-[#050510] border-r-4 border-[#1a1a2e] flex items-center justify-center p-4 overflow-hidden h-full">
                    {/* Retro Grid Floor (2D) */}
                    <div className="absolute bottom-0 inset-x-0 h-32 opacity-30 select-none z-0">
                        <div className="w-full h-full" style={{
                            backgroundImage: 'linear-gradient(#ff00ff 1px, transparent 1px), linear-gradient(90deg, #ff00ff 1px, transparent 1px)',
                            backgroundSize: '30px 30px',
                            maskImage: 'linear-gradient(to top, black, transparent)'
                        }} />
                    </div>

                    {/* Bar Counter / Table (Pixel Style) */}
                    <div className="absolute inset-x-10 bottom-24 h-4 z-10 bg-[#1a1a2e] border-t-2 border-b-2 border-pink-500 shadow-[0_0_15px_rgba(255,0,255,0.4)]" />

                    {/* Background Neon Signs */}
                    <div className="absolute top-10 right-10 opacity-40 select-none">
                        <div className="text-[20px] font-black text-[#00ffff] blur-[1px] rotate-12 flex items-center gap-2 border-2 border-dashed border-[#00ffff] p-2">
                            <Coffee className="w-5 h-5" /> OPEN
                        </div>
                    </div>
                    <div className="absolute top-20 left-10 opacity-30 select-none">
                        <div className="text-[16px] font-black text-[#ff0066] -rotate-6 flex items-center gap-2">
                            <Beer className="w-5 h-5" /> 24H SERVICE
                        </div>
                    </div>

                    <div ref={meetingZoneRef} className="relative h-full w-full z-20">
                        {AGENTS.map((agent, idx) => {
                            // Lay out agents along the "bar counter" or in a freeform street way
                            const isOdd = idx % 2 === 0;
                            const xOffset = (idx - 2) * 100;
                            const yOffset = isOdd ? -40 : 20;

                            const isSpeaking = currentThought?.agent === agent.role;

                            return (
                                <motion.div
                                    key={agent.role}
                                    className="absolute"
                                    style={{
                                        left: `calc(50% + ${xOffset}px)`,
                                        top: `calc(70% + ${yOffset}px)`,
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                    animate={{
                                        y: isSpeaking ? [0, -10, 0] : 0,
                                        scale: isSpeaking ? 1.1 : 1
                                    }}
                                    transition={isSpeaking ? { repeat: Infinity, duration: 2 } : {}}
                                >
                                    <div className="flex flex-col items-center gap-2">
                                        <div className={`
                                            relative w-16 h-16 transition-all duration-300
                                            flex flex-col items-center justify-center overflow-hidden
                                            border-4 ${isSpeaking ? 'border-[#00ffff] shadow-[0_0_15px_#00ffff]' : 'border-slate-800 opacity-70'}
                                            bg-black
                                        `}>
                                            {/* Pixel Character Body */}
                                            <div className="text-2xl mb-1">{agent.pixelIcon}</div>
                                            <div className="text-[10px] font-black text-white bg-black/50 px-1">{agent.name}</div>

                                            {/* Retro Scanline effect */}
                                            <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[size:100%_4px,3px_100%]" />
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}

                        {/* Speech Bubble - Classic RPG Style */}
                        <AnimatePresence mode="wait">
                            {currentThought && (
                                <motion.div
                                    key={currentThought.id}
                                    initial={{ opacity: 0, scale: 0.8, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="absolute inset-x-8 top-16 z-50"
                                >
                                    <div className="relative bg-white text-black p-4 border-4 border-black shadow-[4px_4px_0_#ff00ff]">
                                        {/* Pixel Bubble Tail */}
                                        <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-white border-r-4 border-b-4 border-black rotate-45" />

                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[10px] bg-black text-white px-1 font-black uppercase">
                                                {AGENTS.find(a => a.role === currentThought.agent)?.name}
                                            </span>
                                            <div className="flex-1 h-0.5 bg-black" />
                                        </div>
                                        <p className="text-[12px] leading-tight font-bold font-mono">
                                            {currentThought.thought}
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Right: Retro Arcade Log */}
                <div className="flex-1 flex flex-col bg-[#050510] overflow-hidden h-full">
                    <div className="px-3 py-2 border-b-4 border-[#1a1a2e] bg-[#0a0a1a]">
                        <h3 className="text-[10px] font-black text-[#ff00ff] uppercase italic">System.Log_Disk</h3>
                    </div>
                    <div
                        ref={scrollContainerRef}
                        className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar"
                    >
                        {visibleThoughts.map((log, i) => {
                            const isUser = log.agent === 'user';
                            const agent = isUser ? { name: 'YOU', color: 'bg-white' } : (AGENTS.find(a => a.role === log.agent) || AGENTS[0]);

                            return (
                                <motion.div
                                    key={log.id}
                                    initial={{ opacity: 0, x: isUser ? 10 : -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={`relative p-2 border-2 ${isUser ? 'border-white bg-white/5 ml-4' : 'border-[#1a1a2e] bg-[#0a0a1a] mr-4'}`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[9px] font-black uppercase ${isUser ? 'text-white' : 'text-[#00ffff]'}`}>
                                            [{agent.name}]
                                        </span>
                                        <span className="text-[7px] text-slate-700 font-mono flex-1 text-right">0x{log.id.slice(0, 4)}</span>
                                    </div>
                                    <div className={`text-[11px] leading-tight ${isUser ? 'text-white' : 'text-slate-400'}`}>
                                        {log.thought}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>

                    {/* Arcade Input */}
                    <div className="p-3 border-t-4 border-[#1a1a2e] bg-[#0a0a1a]">
                        <div className="flex gap-2">
                            <Input
                                value={userInput}
                                onChange={(e) => setUserInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                placeholder="[INPUT MESSAGE...]"
                                className="h-10 text-[12px] bg-black border-2 border-slate-700 text-[#00ff00] placeholder:text-slate-800 rounded-none focus-visible:ring-0 focus-visible:border-[#00ff00]"
                                disabled={isSending}
                            />
                            <Button
                                size="sm"
                                onClick={handleSendMessage}
                                disabled={isSending || !userInput.trim()}
                                className="h-10 w-12 p-0 bg-[#00ff00] hover:bg-[#00cc00] text-black rounded-none shadow-[4px_4px_0_#1a1a2e] transition-transform active:translate-x-1 active:translate-y-1"
                            >
                                <Send className="w-5 h-5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: #050510; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #1a1a2e; }

                @keyframes flicker {
                    0% { opacity: 0.9; }
                    5% { opacity: 0.8; }
                    10% { opacity: 1; }
                    15% { opacity: 0.9; }
                    100% { opacity: 1; }
                }

                .animate-flicker { animation: flicker 2s infinite; }
            `}</style>
        </div>
    );
}
