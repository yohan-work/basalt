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
        <div className="flex flex-col gap-4 w-full h-[500px] animate-in fade-in duration-700 font-sans text-slate-800 bg-white">
            {/* Header / Status Bar - Minimal Square Style */}
            <div className="bg-white border border-slate-100 rounded-none p-4 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 border border-slate-100 rounded-none shadow-none text-[#3b9eff]">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-xs font-black text-[#3b9eff] uppercase tracking-widest">토론 진행 중</h3>
                                <Badge variant="secondary" className="bg-slate-100 text-[#3b9eff] border-none h-4 text-[9px] rounded-none">
                                    {currentThoughtIndex + 1} / {allThoughts.length}
                                </Badge>
                            </div>
                            <p className="text-[11px] text-slate-400 font-medium">안건: {allThoughts.length > 0 ? '작업 범위 확정 및 구현 계획 수립' : '에이전트 연결 중'}</p>
                            {currentThought && (
                                <p className="text-[9px] text-[#3b9eff] font-bold mt-0.5 uppercase tracking-tighter">
                                    CURRENT: {AGENTS.find(a => a.role === currentThought.agent)?.name || currentThought.agent}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
                <div className="h-1 w-full bg-slate-50 rounded-none overflow-hidden">
                    <motion.div
                        className="h-full bg-[#3b9eff]"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.8 }}
                    />
                </div>
            </div>

            <div className="flex flex-1 gap-4 overflow-hidden">
                {/* Left: Meeting Area - Pure White & Square */}
                <div className="flex-[1.6] relative bg-white rounded-none border border-slate-100 overflow-hidden flex items-center justify-center p-4">
                    {/* The Boardroom Table Boundary - Rectangle */}
                    <div className="absolute w-[85%] h-[75%] bg-white rounded-none border border-slate-100 flex items-center justify-center pointer-events-none">
                        <span className="text-slate-50 text-6xl font-black tracking-[0.4em] select-none uppercase transition-opacity">Basalt</span>
                    </div>

                    <div className="relative h-full w-full">
                        {AGENTS.map((agent, idx) => {
                            // Positioning exactly on the perimeter of a 85% x 75% rectangle container
                            const count = AGENTS.length;
                            const spacing = 100 / count;

                            // But keeping the circular math to keep them distributed smoothly at the "edges"
                            const angle = (idx / AGENTS.length) * Math.PI * 2 - Math.PI / 2;
                            const rx = 190; // Slightly larger to put them 'on' the edge
                            const ry = 120;
                            const x = Math.cos(angle) * rx;
                            const y = Math.sin(angle) * ry;

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
                                        scale: isSpeaking ? 1.05 : 1,
                                        zIndex: isSpeaking ? 30 : 10
                                    }}
                                >
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="relative">
                                            <div className={`
                                                w-14 h-14 rounded-none p-0.5 transition-all duration-300 shadow-sm
                                                ${isSpeaking ? 'bg-[#3b9eff]' : 'bg-slate-200'}
                                            `}>
                                                <div className="w-full h-full rounded-none bg-white flex items-center justify-center overflow-hidden">
                                                    <div className={`w-full h-full ${isSpeaking ? 'bg-[#3b9eff]' : agent.color} flex items-center justify-center text-white text-base font-black rounded-none`}>
                                                        {agent.name.charAt(0)}
                                                    </div>
                                                </div>
                                            </div>
                                            {isSpeaking && (
                                                <motion.div
                                                    className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-none border border-white shadow-sm flex items-center justify-center"
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                >
                                                    <div className="w-1.5 h-1.5 bg-white rounded-none animate-pulse" />
                                                </motion.div>
                                            )}
                                        </div>
                                        <div className={`
                                            px-3 py-1 rounded-none border transition-all duration-300 text-center
                                            ${isSpeaking ? 'bg-[#3b9eff] border-[#3b9eff] shadow-sm' : 'bg-white border-slate-100 shadow-none'}
                                        `}>
                                            <p className={`text-[10px] font-black uppercase tracking-tighter ${isSpeaking ? 'text-white' : 'text-[#3b9eff]'}`}>{agent.name}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}

                        {/* Central Speaker Bubble - Square/Sharp */}
                        <AnimatePresence mode="wait">
                            {currentThought && (
                                <motion.div
                                    key={currentThought.id}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className="absolute inset-x-6 bottom-4 bg-white border border-slate-200 p-4 rounded-none shadow-xl z-50 ring-1 ring-slate-100"
                                >
                                    <div className="flex items-center gap-2 mb-1.5 border-b border-slate-50 pb-1.5">
                                        <div className={`w-1.5 h-1.5 rounded-none bg-[#3b9eff]`} />
                                        <span className="text-[10px] font-black text-[#3b9eff] uppercase tracking-tighter">
                                            {AGENTS.find(a => a.role === currentThought.agent)?.name || currentThought.agent}
                                        </span>
                                        <span className="text-[8px] font-bold text-slate-300 uppercase ml-auto">RESPONDING</span>
                                    </div>
                                    <p className="text-[12px] text-slate-700 leading-relaxed font-medium">
                                        {currentThought.thought}
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Right: Meeting Log - White/Clean/Square */}
                <div className="flex-1 bg-white rounded-none border border-slate-100 shadow-sm flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-white">
                        <h3 className="text-[10px] font-black text-[#3b9eff] uppercase tracking-[0.2em] flex items-center gap-2">
                            Meeting Log
                        </h3>
                        <div className="flex items-center gap-1">
                            <span className="w-1 h-1 bg-green-500 rounded-none animate-pulse" />
                            <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">LIVE</span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                        {visibleThoughts.map((log, i) => {
                            const isCurrent = log.id === currentThought?.id;
                            const agent = AGENTS.find(a => a.role === log.agent) || AGENTS[0];

                            return (
                                <motion.div
                                    key={log.id}
                                    initial={{ opacity: 0, x: 5 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={`relative ${isCurrent ? 'z-10' : ''}`}
                                >
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[9px] font-black text-[#3b9eff] uppercase">
                                                {agent.name}
                                            </span>
                                            {log.type === 'critique' && <span className="bg-rose-50 text-rose-500 text-[8px] px-1 py-0.5 rounded-none font-bold">REPLY</span>}
                                        </div>
                                        <div className={`
                                            p-3 rounded-none text-[11px] leading-snug transition-all duration-300
                                            ${isCurrent
                                                ? 'bg-slate-50 border-[#3b9eff] border-l-2 text-slate-800'
                                                : 'bg-white border-slate-50 border text-slate-500'
                                            }
                                        `}>
                                            {log.thought}
                                        </div>
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
                    width: 3px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #f1f5f9;
                    border-radius: 0;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #e2e8f0;
                }
            `}</style>
        </div>
    );
}
