'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Sparkles, MessageSquare, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AgentAvatar } from './AgentAvatar';
import { OfficeLayout } from './OfficeLayout';

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
    // Center Row (V4 Concept - Fixed px height to prevent overlapping with bottom modal)
    { role: 'product-manager', name: 'PM', color: 'bg-green-500', baseColor: 'bg-green-500', zone: { idle: { left: '25%', top: '190px' }, meeting: { left: '25%', top: '190px' } } },
    { role: 'main-agent', name: 'Lead', color: 'bg-green-500', baseColor: 'bg-green-500', zone: { idle: { left: '50%', top: '190px' }, meeting: { left: '50%', top: '190px' } } },
    { role: 'software-engineer', name: 'Dev', color: 'bg-green-500', baseColor: 'bg-green-500', zone: { idle: { left: '75%', top: '190px' }, meeting: { left: '75%', top: '190px' } } }
];

export function AgentDiscussion({ taskId, isActive }: AgentDiscussionProps) {
    const [allThoughts, setAllThoughts] = useState<AgentThought[]>([]);
    const [visibleThoughts, setVisibleThoughts] = useState<AgentThought[]>([]);
    const [currentThoughtIndex, setCurrentThoughtIndex] = useState(-1);
    const [userInput, setUserInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const meetingZoneRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // 1. Fetch and Subscribe (SAME)
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
                    .filter((log: any) => (log.metadata?.type === 'THOUGHT' || log.agent_role === 'user') &&
                        log.message !== "에이전트 그룹 논의 시작: 작업 범위를 확정하고 최적의 실행 계획을 수립합니다.")
                    .map((log: any) => ({
                        id: log.id,
                        agent: log.agent_role,
                        thought: log.message,
                        type: (log.metadata?.thought_type || 'idea') as AgentThought['type'],
                        timestamp: new Date(log.created_at).getTime()
                    }));
                setAllThoughts(thoughtLogs);
                setVisibleThoughts(thoughtLogs);
                setCurrentThoughtIndex(thoughtLogs.length - 1);
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
                (payload: any) => {
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

                        if (newLog.agent_role === 'user') {
                            setAllThoughts((prev: AgentThought[]) => {
                                if (prev.some((t: AgentThought) => t.id === newThought.id)) return prev;
                                const updated = [...prev, newThought];
                                setVisibleThoughts((v: AgentThought[]) => {
                                    if (v.some(t => t.id === newThought.id)) return v;
                                    return [...v, newThought];
                                });
                                setCurrentThoughtIndex(updated.length - 1);
                                return updated;
                            });
                        } else {
                            setAllThoughts((prev: AgentThought[]) => {
                                if (prev.some((t: AgentThought) => t.id === newThought.id)) return prev;
                                return [...prev, newThought];
                            });
                        }
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
                setVisibleThoughts((prev: AgentThought[]) => {
                    const nextThought = allThoughts[nextIndex];
                    if (prev.some(t => t.id === nextThought.id)) return prev;
                    return [...prev, nextThought];
                });
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

    if (allThoughts.length === 0) {
        return (
            <div className="relative w-full h-[500px] bg-slate-950/40 rounded-2xl border border-slate-800/60 flex items-center justify-center backdrop-blur-xl group">
                <div className="text-center space-y-4 animate-in fade-in zoom-in duration-700">
                    <div className="relative inline-block">
                        <div className="absolute inset-0 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-1000" />
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }}>
                            <MessageSquare className="w-16 h-16 text-slate-700 relative" />
                        </motion.div>
                    </div>
                    <div className="space-y-2">
                        <p className="text-slate-400 text-sm font-black uppercase tracking-widest">Entering Virtual Workspace...</p>
                        <p className="text-slate-600 text-[10px] font-mono">Synchronizing Neural Links</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-0 w-full h-[75vh] min-h-[600px] max-h-[850px] animate-in fade-in duration-700 font-sans text-slate-800 bg-[#f5f5f5] overflow-hidden border border-slate-200 rounded-xl shadow-md">
            {/* Header - White Minimalist */}
            <div className="bg-white border-b border-slate-200 p-4 shrink-0 relative z-10">
                <div className="flex items-center justify-between relative">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-slate-50 flex items-center justify-center border border-slate-200 rounded-lg shadow-sm">
                            <Sparkles className="w-5 h-5 text-emerald-500" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h3 className="text-[16px] font-black text-slate-800 tracking-tight">
                                    Basalt <span className="text-slate-400 font-medium">Virtual Office</span>
                                </h3>
                                <div className="flex items-center gap-2 px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded-full">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                                    <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">Live</span>
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-500 font-medium">Session ID: {taskId?.slice(0, 8)}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Progress</div>
                        <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-emerald-400"
                                initial={{ width: 0 }}
                                animate={{ width: `${((currentThoughtIndex + 1) / allThoughts.length) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden relative">
                {/* Background Office Zone (V4 - Full Width) */}
                <div className="w-full relative bg-white overflow-hidden h-full flex flex-col">
                    {/* The Office Layout Component (Contains Brick Wall & Wooden Floor) */}
                    <div className="absolute inset-0 pointer-events-none z-0">
                        <OfficeLayout />
                    </div>

                    {/* Agent Avatars Layer */}
                    <div ref={meetingZoneRef} className="relative h-full w-full z-10">
                        {AGENTS.map((agent) => {
                            const isSpeaking = currentThought?.agent === agent.role;
                            const pos = agent.zone.idle;

                            return (
                                <motion.div
                                    key={agent.role}
                                    className="absolute"
                                    animate={{
                                        left: pos.left,
                                        top: pos.top,
                                        zIndex: isSpeaking ? 40 : 20
                                    }}
                                    transition={{ type: "spring", stiffness: 70, damping: 15 }}
                                    style={{ transform: 'translate(-50%, -50%)' }}
                                >
                                    <AgentAvatar
                                        role={agent.role}
                                        name={agent.name}
                                        color={agent.baseColor}
                                        isSpeaking={isSpeaking}
                                        isWalking={false}
                                    />
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* V4 Floating Chat Modal (Bottom Center) */}
                <div className="absolute inset-x-0 bottom-0 z-50 p-4 pointer-events-none flex justify-center pb-6">
                    <div className="w-full max-w-4xl bg-white/95 backdrop-blur-xl rounded-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.1)] border border-slate-200 pointer-events-auto flex flex-col overflow-hidden">

                        {/* Conversation Log (Floating Area) */}
                        <div
                            ref={scrollContainerRef}
                            className="max-h-[160px] overflow-y-auto p-4 space-y-4 custom-scrollbar"
                        >
                            {visibleThoughts.length === 0 ? (
                                <div className="text-center text-slate-400 text-sm py-4">Waiting for agents to speak...</div>
                            ) : (
                                visibleThoughts.slice(-8).map((log: AgentThought, i: number) => { // 최근 8개만 렌더링
                                    const isUser = log.agent === 'user';
                                    const agentData = isUser ? { name: 'YOU', baseColor: 'bg-emerald-500' } : (AGENTS.find(a => a.role === log.agent) || AGENTS[0]);

                                    return (
                                        <motion.div
                                            key={log.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                                        >
                                            {/* Avatar Circle */}
                                            <div className="shrink-0 flex flex-col items-center">
                                                <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center p-1 relative">
                                                    <div className={`w-full h-full rounded-full ${agentData.baseColor}`} />
                                                    {log.id === currentThought?.id && !isUser && (
                                                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full animate-pulse" />
                                                    )}
                                                </div>
                                                <div className="text-[10px] font-bold text-slate-600 mt-1 uppercase">
                                                    {agentData.name}
                                                </div>
                                            </div>

                                            {/* Message Bubble */}
                                            <div className={`max-w-[85%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                                                {!isUser && (
                                                    <Badge variant="secondary" className="mb-1 text-[10px] bg-slate-100 text-slate-500 hover:bg-slate-200 px-2 py-0">
                                                        {log.type}
                                                    </Badge>
                                                )}
                                                <div className={`text-[14px] leading-relaxed font-medium ${isUser ? 'text-emerald-900 bg-emerald-50 px-4 py-2 rounded-2xl rounded-tr-none' : 'text-slate-700 bg-slate-50 px-4 py-2 rounded-2xl rounded-tl-none border border-slate-100'}`}>
                                                    {log.thought}
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })
                            )}
                        </div>

                        {/* Input Area */}
                        <div className="p-4 border-t border-slate-100 bg-white/50">
                            <div className="relative flex items-center">
                                <Input
                                    value={userInput}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserInput(e.target.value)}
                                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSendMessage()}
                                    placeholder="메시지를 입력하여 논의에 참여하세요..."
                                    className="h-12 w-full pl-5 pr-14 text-[13px] bg-white border border-slate-300 text-slate-800 placeholder:text-slate-400 rounded-full focus:bg-white focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50 transition-all font-medium shadow-sm"
                                    disabled={isSending}
                                />
                                <Button
                                    size="sm"
                                    onClick={handleSendMessage}
                                    disabled={isSending || !userInput.trim()}
                                    className="absolute right-1.5 h-9 w-10 p-0 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full transition-all active:scale-95 flex items-center justify-center shadow-sm disabled:opacity-50 disabled:bg-slate-300"
                                >
                                    <Send className="w-4 h-4 ml-0.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>
        </div>
    );
}
