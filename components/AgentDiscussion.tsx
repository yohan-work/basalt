'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
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
    {
        // PM -> Engineering Hub
        role: 'product-manager', name: 'PM', color: 'bg-emerald-500', baseColor: 'bg-emerald-500',
        zone: { idle: { left: '25%', top: '75%' }, meeting: { left: '25%', top: '25%' } } // idle on left desk hub, meeting inside Boardroom
    },
    {
        // Lead -> Patio
        role: 'main-agent', name: 'Lead', color: 'bg-blue-500', baseColor: 'bg-blue-500',
        zone: { idle: { left: '72%', top: '22%' }, meeting: { left: '30%', top: '30%' } }
    },
    {
        // Dev -> Boardroom 
        role: 'software-engineer', name: 'Dev', color: 'bg-indigo-500', baseColor: 'bg-indigo-500',
        zone: { idle: { left: '15%', top: '35%' }, meeting: { left: '27%', top: '21%' } } // Center of the oval table
    },
    {
        // Design -> Bottom Right area
        role: 'designer', name: 'Design', color: 'bg-pink-500', baseColor: 'bg-pink-500',
        zone: { idle: { left: '80%', top: '80%' }, meeting: { left: '32%', top: '25%' } }
    }
];

export function AgentDiscussion({ taskId, isActive }: AgentDiscussionProps) {
    const [allThoughts, setAllThoughts] = useState<AgentThought[]>([]);
    const [visibleThoughts, setVisibleThoughts] = useState<AgentThought[]>([]);
    const [currentThoughtIndex, setCurrentThoughtIndex] = useState(-1);
    const [userInput, setUserInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isUserFocused, setIsUserFocused] = useState(false);
    const [showInteractions, setShowInteractions] = useState<{ id: number, x: number }[]>([]);
    const [movingAgents, setMovingAgents] = useState<Set<string>>(new Set());

    // User Agency State
    const [userPos, setUserPos] = useState({ x: 50, y: 85 });
    const [userDir, setUserDir] = useState<'left' | 'right' | 'forward'>('forward');
    const [isUserWalking, setIsUserWalking] = useState(false);

    const meetingZoneRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [chatPortalTarget, setChatPortalTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
        setChatPortalTarget(document.getElementById('agent-discussion-chat-portal'));
    }, []);

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

    // 3. WASD Movement Logic
    useEffect(() => {
        if (isUserFocused) return; // Disable movement if user is typing

        const handleKeyDown = (e: KeyboardEvent) => {
            const step = 2.5; // Movement speed %
            let moved = false;
            setUserPos(prev => {
                let newX = prev.x;
                let newY = prev.y;

                if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') { newY -= step; moved = true; }
                if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') { newY += step; moved = true; }
                if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') { newX -= step; moved = true; setUserDir('left'); }
                if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') { newX += step; moved = true; setUserDir('right'); }

                if (moved) {
                    setIsUserWalking(true);
                    // Clear walking animation after short delay if no more keys
                    setTimeout(() => setIsUserWalking(false), 200);

                    // Clamp to bounds to prevent walking off-screen
                    newX = Math.max(5, Math.min(95, newX));
                    newY = Math.max(5, Math.min(95, newY));
                }
                return { x: newX, y: newY };
            });
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isUserFocused]);

    // Auto-scroll log
    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }, [visibleThoughts]);

    // 3. User Interaction
    const handleSendMessage = async () => {
        if (!userInput.trim() || isSending) return;

        const newId = Date.now();
        setShowInteractions(prev => [...prev, { id: newId, x: 50 + (Math.random() * 20 - 10) }]);
        setTimeout(() => {
            setShowInteractions(prev => prev.filter(p => p.id !== newId));
        }, 800);

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

    const activeAgentData = React.useMemo(() => {
        if (!currentThought || currentThought.agent === 'user') return null;
        const currentAgentStr = currentThought.agent.toLowerCase();
        for (const agent of AGENTS) {
            if (currentAgentStr === agent.role.toLowerCase() || (agent.role === 'designer' && currentAgentStr === 'style-architect')) return agent;
            if (agent.role === 'main-agent' && (currentAgentStr.includes('lead') || currentAgentStr.includes('main'))) return agent;
            if (agent.role === 'software-engineer' && (currentAgentStr.includes('dev') || currentAgentStr.includes('software'))) return agent;
            if (agent.role === 'designer' && (currentAgentStr.includes('design') || currentAgentStr.includes('style'))) return agent;
        }
        if (!currentAgentStr.includes('lead') && !currentAgentStr.includes('dev') && !currentAgentStr.includes('design') && !currentAgentStr.includes('main') && !currentAgentStr.includes('software') && !currentAgentStr.includes('style')) {
            return AGENTS[0];
        }
        return null;
    }, [currentThought]);

    const nextThought = currentThoughtIndex + 1 < allThoughts.length ? allThoughts[currentThoughtIndex + 1] : null;

    const nextAgentData = React.useMemo(() => {
        if (!nextThought || nextThought.agent === 'user') return null;
        const nextAgentStr = nextThought.agent.toLowerCase();
        for (const agent of AGENTS) {
            if (nextAgentStr === agent.role.toLowerCase() || (agent.role === 'designer' && nextAgentStr === 'style-architect')) return agent;
            if (agent.role === 'main-agent' && (nextAgentStr.includes('lead') || nextAgentStr.includes('main'))) return agent;
            if (agent.role === 'software-engineer' && (nextAgentStr.includes('dev') || nextAgentStr.includes('software'))) return agent;
            if (agent.role === 'designer' && (nextAgentStr.includes('design') || nextAgentStr.includes('style'))) return agent;
        }
        if (!nextAgentStr.includes('lead') && !nextAgentStr.includes('dev') && !nextAgentStr.includes('design') && !nextAgentStr.includes('main') && !nextAgentStr.includes('software') && !nextAgentStr.includes('style')) {
            return AGENTS[0];
        }
        return null;
    }, [nextThought]);



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

            <div className="flex flex-1 min-h-0 overflow-hidden relative flex-col md:flex-row">
                {/* Background Office Zone (Full Size) */}
                <div className="flex-1 relative bg-slate-100 overflow-hidden h-full flex flex-col rounded-b-xl border border-slate-200">
                    {/* The Office Layout Component (Contains Brick Wall & Wooden Floor) */}
                    <div className="absolute inset-0 pointer-events-none z-0">
                        <OfficeLayout />
                    </div>

                    {/* User Interaction Beams Layer */}
                    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden rounded-b-xl">
                        <AnimatePresence>
                            {showInteractions.map(interaction => (
                                <motion.div
                                    key={interaction.id}
                                    initial={{ opacity: 0, top: '100%', left: `${interaction.x}%`, x: '-50%', scale: 0 }}
                                    animate={{ opacity: [0, 1, 1, 0], top: ['100%', '35%'], scale: [0.5, 1, 1.2, 0.8] }}
                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                    className="absolute z-50 pointer-events-none origin-bottom"
                                >
                                    <div className="w-1.5 h-24 bg-gradient-to-t from-transparent via-cyan-400 to-cyan-200 rounded-full blur-[2px] shadow-[0_0_20px_rgba(34,211,238,0.8)]" />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* User Interaction Beams Layer */}
                    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden rounded-b-xl">
                        <AnimatePresence>
                            {showInteractions.map(interaction => (
                                <motion.div
                                    key={interaction.id}
                                    initial={{ opacity: 0, top: '100%', left: `${interaction.x}%`, x: '-50%', scale: 0 }}
                                    animate={{ opacity: [0, 1, 1, 0], top: ['100%', '35%'], scale: [0.5, 1, 1.2, 0.8] }}
                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                    className="absolute z-50 pointer-events-none origin-bottom"
                                >
                                    <div className="w-1.5 h-24 bg-gradient-to-t from-transparent via-cyan-400 to-cyan-200 rounded-full blur-[2px] shadow-[0_0_20px_rgba(34,211,238,0.8)]" />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* Agent Avatars Layer */}
                    <div ref={meetingZoneRef} className="relative h-full w-full z-10">
                        {AGENTS.map((agent) => {
                            const isSpeaking = activeAgentData?.role === agent.role;
                            const targetPos = isSpeaking ? agent.zone.meeting : agent.zone.idle;

                            let lookDirection: 'left' | 'right' | 'forward' = 'forward';
                            if (!isUserFocused && activeAgentData && !isSpeaking) {
                                const myLeft = parseInt(agent.zone.meeting.left);
                                const activeLeft = parseInt(activeAgentData.zone.meeting.left);
                                if (myLeft < activeLeft) lookDirection = 'right';
                                else if (myLeft > activeLeft) lookDirection = 'left';
                            }

                            const isThinking = nextAgentData?.role === agent.role;
                            const isWalking = movingAgents.has(agent.role);

                            return (
                                <motion.div
                                    key={agent.role}
                                    className="absolute"
                                    animate={{
                                        left: targetPos.left,
                                        top: targetPos.top,
                                        zIndex: isSpeaking ? 40 : (isWalking ? 30 : 20)
                                    }}
                                    transition={{ type: "spring", stiffness: 60, damping: 12, mass: 1 }}
                                    style={{ transform: 'translate(-50%, -50%)' }}
                                    onAnimationStart={() => setMovingAgents(prev => new Set(prev).add(agent.role))}
                                    onAnimationComplete={() => setMovingAgents(prev => { const next = new Set(prev); next.delete(agent.role); return next; })}
                                >
                                    <AgentAvatar
                                        role={agent.role}
                                        name={agent.name}
                                        color={agent.baseColor}
                                        isSpeaking={isSpeaking}
                                        isWalking={isWalking}
                                        thoughtType={isSpeaking ? currentThought?.type : null}
                                        isThinking={isThinking}
                                        lookDirection={lookDirection}
                                    />
                                </motion.div>
                            );
                        })}

                        {/* User Avatar */}
                        <motion.div
                            className="absolute pointer-events-none"
                            animate={{ left: `${userPos.x}%`, top: `${userPos.y}%`, zIndex: 100 }}
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                            style={{ transform: 'translate(-50%, -50%)' }}
                        >
                            <AgentAvatar
                                role="user"
                                name="YOU"
                                color="bg-emerald-600"
                                isSpeaking={false}
                                isWalking={isUserWalking}
                                thoughtType={null}
                                isThinking={false}
                                lookDirection={userDir}
                            />
                            {/* Proximity Radius Debug/Hint (Optional visual) */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30vw] h-[30vw] min-w-[300px] min-h-[300px] rounded-full border-2 border-emerald-400/10 bg-emerald-400/5 -z-10 pointer-events-none"></div>
                        </motion.div>
                    </div>
                </div>

                {/* V6 Floating Chat Panel via Portal */}
                {chatPortalTarget && createPortal(
                    <div className="w-full h-full bg-slate-50 border border-slate-200 flex flex-col relative z-[9999] shadow-2xl rounded-xl overflow-hidden pointer-events-auto">

                        {/* Header for Chat */}
                        <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10">
                            <div className="flex items-center">
                                <MessageSquare className="w-4 h-4 text-emerald-500 mr-2" />
                                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Live Discussion</span>
                            </div>
                            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Chat: ON</span>
                            </div>
                        </div>

                        {/* Conversation Log */}
                        <div
                            ref={scrollContainerRef}
                            className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50"
                        >
                            {(() => {
                                if (visibleThoughts.length === 0) {
                                    return (
                                        <div className="text-center text-slate-400 text-sm py-8 flex flex-col items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center">
                                                <MessageSquare className="w-4 h-4 text-slate-500" />
                                            </div>
                                            <p className="font-bold">아직 대화가 없습니다.</p>
                                        </div>
                                    );
                                }

                                return visibleThoughts.map((log: AgentThought, i: number) => {
                                    const isUser = log.agent === 'user';

                                    // Default mapping logic
                                    let agentData: any = isUser ? { name: 'YOU', baseColor: 'bg-emerald-600', role: 'user' } : null;

                                    if (!isUser) {
                                        // Try exact match
                                        agentData = AGENTS.find(a => a.role.toLowerCase() === log.agent.toLowerCase());
                                        // Fallback by keyword parsing or index
                                        if (!agentData) {
                                            if (log.agent.toLowerCase().includes('lead') || log.agent.toLowerCase().includes('main')) {
                                                agentData = AGENTS.find(a => a.role === 'main-agent');
                                            } else if (log.agent.toLowerCase().includes('dev') || log.agent.toLowerCase().includes('software')) {
                                                agentData = AGENTS.find(a => a.role === 'software-engineer');
                                            } else if (log.agent.toLowerCase().includes('design') || log.agent.toLowerCase().includes('style')) {
                                                agentData = AGENTS.find(a => a.role === 'designer');
                                            } else {
                                                // If still not matched, fallback to PM
                                                agentData = AGENTS[0];
                                            }
                                        }
                                    }
                                    // TypeScript fallback
                                    if (!agentData) agentData = AGENTS[0];

                                    return (
                                        <motion.div
                                            key={log.id}
                                            initial={{ opacity: 0, scale: 0.95 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
                                        >
                                            {/* Avatar Circle */}
                                            <div className="shrink-0 flex flex-col items-center">
                                                <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center p-1 relative shadow-sm">
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
                                                    <Badge variant="secondary" className="mb-1 text-[10px] bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 px-2 py-0">
                                                        {log.type}
                                                    </Badge>
                                                )}
                                                <div className={`text-[13px] leading-relaxed font-medium break-words w-full ${isUser ? 'text-emerald-900 bg-emerald-50 px-3 py-2 rounded-2xl rounded-tr-none text-right' : 'text-slate-700 bg-white px-3 py-2 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm'}`}>
                                                    {log.thought}
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                });
                            })()}
                        </div>

                        {/* Input Area */}
                        <div className="p-4 border-t border-slate-200 bg-white shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-10">
                            <div className="relative flex items-center">
                                <Input
                                    value={userInput}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserInput(e.target.value)}
                                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSendMessage()}
                                    onFocus={() => setIsUserFocused(true)}
                                    onBlur={() => setIsUserFocused(false)}
                                    placeholder="메시지 입력..."
                                    className="h-10 w-full pl-4 pr-12 text-[13px] bg-slate-50 border border-slate-200 text-slate-800 placeholder:text-slate-400 rounded-full focus:bg-white focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 transition-all font-medium shadow-inner"
                                    disabled={isSending}
                                />
                                <Button
                                    size="sm"
                                    onClick={handleSendMessage}
                                    disabled={isSending || !userInput.trim()}
                                    className="absolute right-1 h-8 w-8 p-0 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full transition-all active:scale-95 flex items-center justify-center shadow-sm disabled:opacity-50 disabled:bg-slate-300"
                                >
                                    <Send className="w-3.5 h-3.5 ml-0.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                    , chatPortalTarget)}
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
