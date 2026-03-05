'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, MessageSquare, Lightbulb } from 'lucide-react';
import { supabase } from '@/lib/supabase';


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
    { role: 'product-manager', name: 'PM', color: 'bg-amber-500' },
    { role: 'software-engineer', name: 'Dev', color: 'bg-violet-500' },
    { role: 'qa', name: 'QA', color: 'bg-emerald-500' },
    { role: 'main-agent', name: 'Lead', color: 'bg-blue-500' },
    { role: 'style-architect', name: 'Style', color: 'bg-pink-500' }
];


export function AgentDiscussion({ taskId, isActive }: AgentDiscussionProps) {
    const [allThoughts, setAllThoughts] = useState<AgentThought[]>([]);
    const [visibleThoughts, setVisibleThoughts] = useState<AgentThought[]>([]);
    const [currentThoughtIndex, setCurrentThoughtIndex] = useState(-1);
    const logEndRef = useRef<HTMLDivElement>(null);
    const meetingZoneRef = useRef<HTMLDivElement>(null);
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
                    .filter(log => log.metadata?.type === 'THOUGHT' &&
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
                    if (newLog.metadata?.type === 'THOUGHT' &&
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
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [visibleThoughts]);

    // Meeting zone size for circular agent layout
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
        <div className="flex flex-col gap-0 w-full h-full animate-in fade-in duration-700 font-sans text-slate-300 bg-[#020617] overflow-hidden border border-slate-800">
            {/* Dark Minimal Header */}
            <div className="bg-[#0f172a] border-b border-slate-800 p-3 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-[#3b9eff]" />
                        <div>
                            <div className="flex items-center gap-1.5">
                                <h3 className="text-[11px] font-bold text-slate-100 uppercase tracking-tight">AI Brainstorming</h3>
                                <Badge variant="outline" className="text-[#3b9eff] border-[#3b9eff]/30 h-4 text-[9px] px-1 rounded-none bg-[#3b9eff]/10">
                                    {currentThoughtIndex + 1} / {allThoughts.length}
                                </Badge>
                            </div>
                            <div className="h-0.5 w-32 bg-slate-800 mt-1.5 rounded-none overflow-hidden text-[#3b9eff]">
                                <motion.div
                                    className="h-full bg-current"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 0.8 }}
                                />
                            </div>
                        </div>
                    </div>
                    {currentThought && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 border border-slate-800 bg-slate-900/50">
                            <span className="w-1 h-1 bg-green-500 animate-pulse" />
                            <span className="text-[9px] font-bold text-[#3b9eff] uppercase tracking-tighter">{AGENTS.find(a => a.role === currentThought.agent)?.name} SPEAKING</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Left: Meeting Zone - Dark Layout */}
                <div className="flex-[1.2] relative bg-[#020617] border-r border-slate-800 flex items-center justify-center p-4 overflow-hidden">
                    {/* The Meeting Table Indicator - Subtle Grid/Line */}
                    <div className="absolute w-[70%] h-[50%] flex items-center justify-center pointer-events-none">
                        <span className="text-slate-800 text-3xl font-black tracking-widest select-none uppercase opacity-40">Basalt AI</span>
                    </div>

                    <div ref={meetingZoneRef} className="relative h-full w-full">
                        {AGENTS.map((agent, idx) => {
                            const angle = (idx / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
                            const radius = Math.max(140, Math.min(meetingSize.width, meetingSize.height) * 0.46);
                            const x = Math.cos(angle) * radius;
                            const y = Math.sin(angle) * radius;

                            const isSpeaking = currentThought?.agent === agent.role;

                            return (
                                <motion.div
                                    key={agent.role}
                                    className="absolute"
                                    style={{
                                        left: `calc(50% + ${x}px)`,
                                        top: `calc(50% + ${y}px)`,
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                    animate={{
                                        scale: isSpeaking ? 1.1 : 1,
                                        zIndex: isSpeaking ? 30 : 10
                                    }}
                                >
                                    <div className="flex flex-col items-center gap-1.5">
                                        <div className={`
                                            w-10 h-10 border transition-all duration-300 shadow-lg
                                            ${isSpeaking ? 'bg-[#3b9eff] border-[#3b9eff] shadow-[#3b9eff]/20' : 'bg-slate-900 border-slate-800'}
                                        `}>
                                            <div className={`w-full h-full flex items-center justify-center text-xs font-black ${isSpeaking ? 'text-white' : 'text-slate-600'}`}>
                                                {agent.name.charAt(0)}
                                            </div>
                                        </div>
                                        <p className={`text-[8px] font-bold uppercase tracking-tighter ${isSpeaking ? 'text-[#3b9eff]' : 'text-slate-600'}`}>{agent.name}</p>
                                    </div>
                                </motion.div>
                            );
                        })}

                        {/* Speech Overlay - Dark Premium Card */}
                        <AnimatePresence mode="wait">
                            {currentThought && (
                                <motion.div
                                    key={currentThought.id}
                                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: -5, scale: 0.98 }}
                                    className="absolute inset-x-4 bottom-4 bg-[#0f172a]/90 backdrop-blur-md border border-slate-700 p-3 shadow-2xl z-50 ring-1 ring-white/5"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-0.5 h-3 bg-[#3b9eff]" />
                                        <span className="text-[9px] font-bold text-slate-100 uppercase tracking-wide">
                                            {AGENTS.find(a => a.role === currentThought.agent)?.name}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-slate-300 leading-normal font-medium">
                                        {currentThought.thought}
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Right: Meeting Log - Chat Style Dark */}
                <div className="flex-1 flex flex-col bg-[#020617] overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-800 bg-[#0f172a]/30">
                        <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Discussion Stream</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                        {visibleThoughts.map((log, i) => {
                            const isCurrent = log.id === currentThought?.id;
                            const agent = AGENTS.find(a => a.role === log.agent) || AGENTS[0];

                            return (
                                <motion.div
                                    key={log.id}
                                    initial={{ opacity: 0, x: 5 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex flex-col gap-1"
                                >
                                    <div className="flex items-center justify-between">
                                        <span className={`text-[8px] font-bold uppercase ${isCurrent ? 'text-[#3b9eff]' : 'text-slate-500'}`}>
                                            {agent.name}
                                        </span>
                                        <span className="text-[7px] text-slate-700 font-mono">STEP {i + 1}</span>
                                    </div>
                                    <div className={`
                                        p-2.5 text-[10px] leading-relaxed transition-colors border
                                        ${isCurrent
                                            ? 'bg-[#3b9eff]/10 border-[#3b9eff]/30 text-slate-200'
                                            : 'bg-slate-900/50 border-slate-800 text-slate-500'
                                        }
                                    `}>
                                        {log.thought}
                                    </div>
                                </motion.div>
                            );
                        })}
                        <div ref={logEndRef} />
                    </div>
                </div>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 2px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #1e293b;
                }
            `}</style>
        </div>
    );
}
