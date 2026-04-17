'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MessageSquare, Send, Volume2, VolumeX, Square, TerminalSquare } from 'lucide-react';
import { getBuddyDefinition, getBuddyReaction } from '@/lib/buddy-catalog';
import { useTTS } from '@/lib/tts/useTTS';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AgentAvatar } from './AgentAvatar';
import { OfficeLayout } from './OfficeLayout';
import type {
    AgentInboxEntry,
    ExecutionDiscussionEntry,
    OrchestratorCollaborationMap,
    TaskBuddyInstance,
} from '@/lib/types/agent-visualization';

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
    buddy?: TaskBuddyInstance | null;
    executionDiscussions?: ExecutionDiscussionEntry[];
    agentInbox?: AgentInboxEntry[];
    collaboration?: OrchestratorCollaborationMap;
    impactRiskLevel?: string | null;
}

type AgentVisualState = 'speaking' | 'blocked' | 'review' | 'thinking' | 'idle';
type OfficeRoomMode = 'thinking' | 'review' | 'blocked' | 'speaking' | null;

const AGENTS = [
    {
        role: 'product-manager', name: 'PM', color: 'bg-emerald-500', baseColor: 'bg-emerald-500',
        zone: { idle: { left: '72%', top: '30%' }, meeting: { left: '32%', top: '26%' } }
    },
    {
        role: 'main-agent', name: 'Lead', color: 'bg-blue-500', baseColor: 'bg-blue-500',
        zone: { idle: { left: '79%', top: '39%' }, meeting: { left: '25%', top: '26%' } }
    },
    {
        role: 'software-engineer', name: 'Dev', color: 'bg-indigo-500', baseColor: 'bg-indigo-500',
        zone: { idle: { left: '67%', top: '64%' }, meeting: { left: '25%', top: '59%' } }
    },
    {
        role: 'designer', name: 'Design', color: 'bg-pink-500', baseColor: 'bg-pink-500',
        zone: { idle: { left: '77%', top: '72%' }, meeting: { left: '32%', top: '59%' } }
    }
];

function roleLabel(role: string) {
    if (role === 'main-agent') return 'Lead';
    if (role === 'product-manager') return 'PM';
    if (role === 'software-engineer') return 'Dev';
    if (role === 'designer') return 'Design';
    if (role === 'user') return 'You';
    return role;
}

function resolveAgentByRoleLike(role: string) {
    const agentStr = role.toLowerCase();
    for (const agent of AGENTS) {
        if (agentStr === agent.role.toLowerCase() || (agent.role === 'designer' && agentStr === 'style-architect')) return agent;
        if (agent.role === 'main-agent' && (agentStr.includes('lead') || agentStr.includes('main') || agentStr.includes('codex'))) return agent;
        if (agent.role === 'product-manager' && (agentStr.includes('pm') || agentStr.includes('product') || agentStr.includes('claude'))) return agent;
        if (agent.role === 'software-engineer' && (agentStr.includes('dev') || agentStr.includes('software') || agentStr.includes('gemini'))) return agent;
        if (agent.role === 'designer' && (agentStr.includes('design') || agentStr.includes('style'))) return agent;
    }
    return null;
}

export function AgentDiscussion({
    taskId,
    isActive,
    buddy = null,
    executionDiscussions = [],
    agentInbox = [],
    collaboration,
    impactRiskLevel = null,
}: AgentDiscussionProps) {
    const [allThoughts, setAllThoughts] = useState<AgentThought[]>([]);
    const [visibleThoughts, setVisibleThoughts] = useState<AgentThought[]>([]);
    const [currentThoughtIndex, setCurrentThoughtIndex] = useState(-1);
    const [userInput, setUserInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isUserFocused, setIsUserFocused] = useState(false);
    const [showInteractions, setShowInteractions] = useState<{ id: number, x: number }[]>([]);
    const [agentPings, setAgentPings] = useState<{ id: number; role: string }[]>([]);
    const [movingAgents, setMovingAgents] = useState<Set<string>>(new Set());
    const [idleOffsets, setIdleOffsets] = useState<Record<string, { dx: number, dy: number }>>({});
    const [workingAgents, setWorkingAgents] = useState<Set<string>>(new Set());

    const tts = useTTS();
    const lastSpokenIdRef = useRef<string | null>(null);

    const [userPos, setUserPos] = useState({ x: 52, y: 88 });
    const [userDir, setUserDir] = useState<'left' | 'right' | 'forward'>('forward');
    const [isUserWalking, setIsUserWalking] = useState(false);
    const [activeEmote, setActiveEmote] = useState<'thumbsup' | 'heart' | 'question' | null>(null);
    const [thoughtParticles, setThoughtParticles] = useState<{ id: string, type: string, role: string, x: string, y: string }[]>([]);

    const meetingZoneRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [chatPortalTarget, setChatPortalTarget] = useState<HTMLElement | null>(null);
    const buddyDefinition = getBuddyDefinition(buddy?.buddyId);

    useEffect(() => {
        setChatPortalTarget(document.getElementById('agent-discussion-chat-portal'));
    }, []);

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
                    .filter((log: any) => log.metadata?.type === 'THOUGHT' || log.agent_role === 'user')
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
                    if (newLog.metadata?.type !== 'THOUGHT' && newLog.agent_role !== 'user') return;

                    const newThought: AgentThought = {
                        id: newLog.id,
                        agent: newLog.agent_role,
                        thought: newLog.message,
                        type: (newLog.metadata?.thought_type || 'idea') as AgentThought['type'],
                        timestamp: new Date(newLog.created_at).getTime()
                    };

                    if (newLog.agent_role === 'user') {
                        let isNew = false;
                        setAllThoughts((prev) => {
                            if (prev.some((t) => t.id === newThought.id)) return prev;
                            isNew = true;
                            return [...prev, newThought];
                        });
                        setTimeout(() => {
                            if (!isNew) return;
                            setVisibleThoughts((prev) => {
                                if (prev.some((t) => t.id === newThought.id)) return prev;
                                return [...prev, newThought];
                            });
                            setCurrentThoughtIndex((prev) => prev + 1);
                        }, 0);
                    } else {
                        setAllThoughts((prev) => {
                            if (prev.some((t) => t.id === newThought.id)) return prev;
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

    useEffect(() => {
        const interval = setInterval(() => {
            if (currentThoughtIndex >= allThoughts.length - 1) return;

            const nextIndex = currentThoughtIndex + 1;
            const nextThought = allThoughts[nextIndex];

            if (nextThought && nextThought.agent !== 'user') {
                let parsedData: typeof AGENTS[number] | undefined = AGENTS.find((a) => a.role.toLowerCase() === nextThought.agent.toLowerCase());
                if (!parsedData) {
                    if (nextThought.agent.toLowerCase().includes('lead') || nextThought.agent.toLowerCase().includes('main')) parsedData = AGENTS.find((a) => a.role === 'main-agent');
                    else if (nextThought.agent.toLowerCase().includes('dev') || nextThought.agent.toLowerCase().includes('software')) parsedData = AGENTS.find((a) => a.role === 'software-engineer');
                    else if (nextThought.agent.toLowerCase().includes('design') || nextThought.agent.toLowerCase().includes('style')) parsedData = AGENTS.find((a) => a.role === 'designer');
                    else parsedData = AGENTS[0];
                }
                if (parsedData) {
                    const newParticle = {
                        id: `${nextThought.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                        type: nextThought.type,
                        role: parsedData.role,
                        x: parsedData.zone.meeting.left,
                        y: parsedData.zone.meeting.top
                    };
                    setThoughtParticles((prev) => [...prev, newParticle]);
                    setTimeout(() => {
                        setThoughtParticles((prev) => prev.filter((p) => p.id !== newParticle.id));
                    }, 2500);
                }
            }

            setCurrentThoughtIndex(nextIndex);
            setVisibleThoughts((prev) => {
                if (prev.some((t) => t.id === nextThought.id)) return prev;
                return [...prev, nextThought];
            });
        }, 4500);

        return () => clearInterval(interval);
    }, [allThoughts, currentThoughtIndex]);

    useEffect(() => {
        const updateOffsets = () => {
            setIdleOffsets((prev) => {
                const next = { ...prev };
                AGENTS.forEach((agent) => {
                    next[agent.role] = {
                        dx: (Math.random() - 0.5) * 2.8,
                        dy: (Math.random() - 0.5) * 2.8,
                    };
                });
                return next;
            });
        };

        updateOffsets();
        const interval = setInterval(updateOffsets, 4200);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const updateWorking = () => {
            setWorkingAgents(new Set(AGENTS.filter(() => Math.random() > 0.58).map((a) => a.role)));
        };

        updateWorking();
        const interval = setInterval(updateWorking, 5000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (isUserFocused) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === '1') {
                setActiveEmote('thumbsup');
                setTimeout(() => setActiveEmote(null), 2500);
                return;
            }
            if (e.key === '2' || e.key === '4') {
                setActiveEmote('heart');
                setTimeout(() => setActiveEmote(null), 2500);
                return;
            }
            if (e.key === '3') {
                setActiveEmote('question');
                setTimeout(() => setActiveEmote(null), 2500);
                return;
            }

            const step = 2.5;
            let moved = false;
            setUserPos((prev) => {
                let newX = prev.x;
                let newY = prev.y;

                if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') { newY -= step; moved = true; }
                if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') { newY += step; moved = true; }
                if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') { newX -= step; moved = true; setUserDir('left'); }
                if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') { newX += step; moved = true; setUserDir('right'); }

                if (moved) {
                    setIsUserWalking(true);
                    setTimeout(() => setIsUserWalking(false), 200);
                    newX = Math.max(5, Math.min(95, newX));
                    newY = Math.max(5, Math.min(95, newY));
                }
                return { x: newX, y: newY };
            });
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isUserFocused]);

    useEffect(() => {
        if (!tts.enabled || visibleThoughts.length === 0) return;
        const latest = visibleThoughts[visibleThoughts.length - 1];
        if (latest && latest.agent !== 'user' && latest.id !== lastSpokenIdRef.current) {
            lastSpokenIdRef.current = latest.id;
            tts.speak(latest.thought, latest.agent);
        }
    }, [visibleThoughts, tts.enabled, tts.speak]);

    useEffect(() => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
        }
    }, [visibleThoughts]);

    const getAgentData = React.useCallback((thought: AgentThought | null) => {
        if (!thought || thought.agent === 'user') return null;
        return resolveAgentByRoleLike(thought.agent) ?? AGENTS[0];
    }, []);

    const currentThought = currentThoughtIndex >= 0 ? allThoughts[currentThoughtIndex] : null;
    const nextThought = currentThoughtIndex + 1 < allThoughts.length ? allThoughts[currentThoughtIndex + 1] : null;
    const prevThought = currentThoughtIndex > 0 ? allThoughts[currentThoughtIndex - 1] : null;
    const activeAgentData = React.useMemo(() => getAgentData(currentThought), [currentThought, getAgentData]);
    const nextAgentData = React.useMemo(() => getAgentData(nextThought), [nextThought, getAgentData]);
    const prevAgentData = React.useMemo(() => getAgentData(prevThought), [prevThought, getAgentData]);

    const getDistance = (p1Left: string, p1Top: string, p2X: number, p2Y: number) => {
        const x1 = parseFloat(p1Left);
        const y1 = parseFloat(p1Top);
        const dx = x1 - p2X;
        const dy = y1 - p2Y;
        return Math.sqrt(dx * dx + dy * dy);
    };

    const nearestAgent = React.useMemo(() => {
        let nearest: typeof AGENTS[number] | null = null;
        let minDistance = 15;

        AGENTS.forEach((agent) => {
            const isSpeaking = activeAgentData?.role === agent.role;
            const isTarget = !!(activeAgentData && prevAgentData?.role === agent.role && (currentThought?.type === 'critique' || currentThought?.type === 'agreement'));
            let targetLeft = agent.zone.idle.left;
            let targetTop = agent.zone.idle.top;
            if (isSpeaking || isTarget) {
                targetLeft = agent.zone.meeting.left;
                targetTop = agent.zone.meeting.top;
            } else {
                const offset = idleOffsets[agent.role];
                if (offset) {
                    targetLeft = `${Math.max(5, Math.min(95, parseFloat(agent.zone.idle.left) + offset.dx))}%`;
                    targetTop = `${Math.max(5, Math.min(95, parseFloat(agent.zone.idle.top) + offset.dy))}%`;
                }
            }
            const dist = getDistance(targetLeft, targetTop, userPos.x, userPos.y);
            if (dist < minDistance) {
                minDistance = dist;
                nearest = agent;
            }
        });
        return nearest;
    }, [userPos, activeAgentData, prevAgentData, currentThought, idleOffsets]);

    const handleSendMessage = async () => {
        if (!userInput.trim() || isSending) return;

        const newId = Date.now();
        setShowInteractions((prev) => [...prev, { id: newId, x: 50 + (Math.random() * 20 - 10) }]);
        setTimeout(() => {
            setShowInteractions((prev) => prev.filter((p) => p.id !== newId));
        }, 800);

        if (nearestAgent) {
            const pingId = Date.now() + 1;
            setAgentPings((prev) => [...prev, { id: pingId, role: nearestAgent.role }]);
            setTimeout(() => {
                setAgentPings((prev) => prev.filter((ping) => ping.id !== pingId));
            }, 1800);
        }

        setIsSending(true);
        try {
            const res = await fetch('/api/agent/discuss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId,
                    message: userInput,
                    targetAgent: nearestAgent?.role || undefined
                })
            });
            if (res.ok) setUserInput('');
        } catch (err) {
            console.error('Failed to send message:', err);
        } finally {
            setIsSending(false);
        }
    };

    const buddyReaction = getBuddyReaction(buddyDefinition.id, {
        thoughtType: currentThought?.type,
        isHighlighted: currentThought?.type === 'critique',
        isWarning: currentThought?.type === 'critique',
        isComplete: currentThought?.type === 'agreement' && currentThoughtIndex === allThoughts.length - 1,
    });

    const latestThoughtByRole = React.useMemo(() => {
        const map = new Map<string, AgentThought>();
        for (const thought of allThoughts) {
            const agent = resolveAgentByRoleLike(thought.agent);
            if (!agent) continue;
            map.set(agent.role, thought);
        }
        return map;
    }, [allThoughts]);

    const agentVisualStates = React.useMemo(() => {
        const openInboxByRole = new Map<string, number>();
        for (const entry of agentInbox) {
            if (entry.status === 'completed') continue;
            const targetAgent = resolveAgentByRoleLike(entry.to) ?? resolveAgentByRoleLike(entry.from);
            if (!targetAgent) continue;
            openInboxByRole.set(targetAgent.role, (openInboxByRole.get(targetAgent.role) ?? 0) + 1);
        }

        const reviewRoles = new Set<string>();
        for (const discussion of executionDiscussions.slice(-6)) {
            for (const thought of discussion.thoughts || []) {
                const agent = resolveAgentByRoleLike(thought.agent);
                if (!agent) continue;
                if (thought.type === 'critique') reviewRoles.add(agent.role);
            }
        }

        const result = new Map<string, { state: AgentVisualState; label: string; tone: string; icon: string }>();
        for (const agent of AGENTS) {
            const latestThought = latestThoughtByRole.get(agent.role);
            const hasOpenInbox = (openInboxByRole.get(agent.role) ?? 0) > 0;
            const isSpeaking = activeAgentData?.role === agent.role;
            const isReview = reviewRoles.has(agent.role) || latestThought?.type === 'critique';
            const isThinking = nextAgentData?.role === agent.role || (workingAgents.has(agent.role) && !isSpeaking);
            const isBlocked =
                hasOpenInbox ||
                (impactRiskLevel === 'high' && (agent.role === 'main-agent' || agent.role === 'product-manager'));

            if (isSpeaking) {
                result.set(agent.role, { state: 'speaking', label: 'Speaking', tone: 'border-emerald-300/60 bg-emerald-500/15 text-emerald-200', icon: '●' });
            } else if (isBlocked) {
                result.set(agent.role, { state: 'blocked', label: 'Blocked', tone: 'border-rose-300/60 bg-rose-500/15 text-rose-200', icon: '!' });
            } else if (isReview) {
                result.set(agent.role, { state: 'review', label: 'Review', tone: 'border-amber-300/60 bg-amber-500/15 text-amber-200', icon: '◌' });
            } else if (isThinking) {
                result.set(agent.role, { state: 'thinking', label: 'Thinking', tone: 'border-sky-300/60 bg-sky-500/15 text-sky-200', icon: '…' });
            } else {
                result.set(agent.role, { state: 'idle', label: 'Idle', tone: 'border-white/10 bg-black/30 text-slate-400', icon: '○' });
            }
        }
        return result;
    }, [activeAgentData, agentInbox, executionDiscussions, impactRiskLevel, latestThoughtByRole, nextAgentData, workingAgents]);

    const relationLinks = React.useMemo(() => {
        const links: Array<{ from: string; to: string; tone: string; dashed?: boolean }> = [];
        if (activeAgentData && prevAgentData && activeAgentData.role !== prevAgentData.role && (currentThought?.type === 'critique' || currentThought?.type === 'agreement')) {
            links.push({
                from: activeAgentData.role,
                to: prevAgentData.role,
                tone: currentThought?.type === 'critique' ? 'rgba(251,191,36,0.8)' : 'rgba(52,211,153,0.8)',
            });
        }

        for (const entry of agentInbox.slice(-3)) {
            if (entry.status === 'completed') continue;
            const from = resolveAgentByRoleLike(entry.from);
            const to = resolveAgentByRoleLike(entry.to);
            if (!from || !to || from.role === to.role) continue;
            links.push({ from: from.role, to: to.role, tone: 'rgba(125,211,252,0.7)', dashed: true });
        }

        if (activeAgentData && collaboration?.[activeAgentData.role]) {
            const edges = Object.entries(collaboration[activeAgentData.role]).sort((a, b) => (b[1]?.weight ?? 0) - (a[1]?.weight ?? 0)).slice(0, 1);
            for (const [toRole, edge] of edges) {
                const to = resolveAgentByRoleLike(toRole);
                if (!to || to.role === activeAgentData.role || (edge?.weight ?? 0) <= 0) continue;
                links.push({ from: activeAgentData.role, to: to.role, tone: 'rgba(167,139,250,0.55)' });
            }
        }

        return links;
    }, [activeAgentData, collaboration, currentThought, prevAgentData, agentInbox]);

    const roomReactions = React.useMemo(() => {
        const workRoles = new Set<string>();
        if (activeAgentData) workRoles.add(activeAgentData.role);
        if (
            prevAgentData &&
            activeAgentData &&
            prevAgentData.role !== activeAgentData.role &&
            (currentThought?.type === 'critique' || currentThought?.type === 'agreement')
        ) {
            workRoles.add(prevAgentData.role);
        }

        let workMode: OfficeRoomMode = null;
        for (const role of workRoles) {
            const state = agentVisualStates.get(role)?.state;
            if (state === 'blocked') {
                workMode = 'blocked';
                break;
            }
            if (state === 'review') {
                workMode = 'review';
                continue;
            }
            if (state === 'thinking' && !workMode) {
                workMode = 'thinking';
                continue;
            }
            if (state === 'speaking' && !workMode) {
                workMode = 'speaking';
            }
        }

        const breakThinking = AGENTS.some((agent) => !workRoles.has(agent.role) && agentVisualStates.get(agent.role)?.state === 'thinking');

        return {
            workMode,
            breakMode: (breakThinking ? 'thinking' : 'idle') as 'thinking' | 'idle',
            doorwayPulse: relationLinks.some((link) => link.dashed) || currentThought?.type === 'critique' || currentThought?.type === 'agreement',
            terminalPulse: relationLinks.some((link) => link.dashed),
        };
    }, [activeAgentData, agentVisualStates, currentThought?.type, prevAgentData, relationLinks]);

    if (allThoughts.length === 0) {
        return (
            <div className="relative flex h-full min-h-[520px] w-full items-center justify-center overflow-hidden rounded-[24px] border border-white/10 bg-[#0f1117] text-slate-300 shadow-[0_32px_90px_rgba(0,0,0,0.45)]">
                <div className="space-y-4 text-center">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }} className="mx-auto">
                        <MessageSquare className="h-14 w-14 text-slate-600" />
                    </motion.div>
                    <div className="text-sm font-semibold uppercase tracking-[0.24em]">Booting Agent Office</div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-[520px] w-full overflow-hidden rounded-[24px] border border-white/8 bg-[#0f1117] text-slate-100 shadow-[0_32px_90px_rgba(0,0,0,0.45)]">
            <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/8 bg-[linear-gradient(180deg,#141823,#0d1118)]">
                <div className="border-b border-white/8 px-4 py-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">Task Buddy</div>
                    <div className="rounded-[14px] border border-[#f2c94c]/70 bg-[#fff7df] p-3 text-slate-800 shadow-[0_14px_36px_rgba(0,0,0,0.18)]">
                        <div className="mb-2 flex items-center gap-2">
                            <div className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">Buddy</div>
                            {/* <div className="text-[12px] font-semibold">{buddy?.name || buddyDefinition.name}</div> */}
                            {/* <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{buddyDefinition.rarity}</div> */}
                        </div>
                        <pre className="text-[12px] leading-4 text-slate-900">{buddyDefinition.ascii}</pre>
                        <div className="mt-2 text-[12px] font-medium">{buddyReaction.emote} {buddyReaction.label}</div>
                        <div className="mt-1 text-[11px] text-slate-600">{buddyReaction.comment}</div>
                    </div>
                </div>

                <div className="px-4 py-4">
                    <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                        <Search className="h-3.5 w-3.5" />
                        Discussion
                    </div>
                    <div className="rounded-[14px] border border-white/8 bg-white/4 p-3 text-[12px] text-slate-300">
                        <div className="mb-2 flex items-center justify-between">
                            <span>Thoughts</span>
                            <span>{visibleThoughts.length}</span>
                        </div>
                        <div className="mb-2 flex items-center justify-between">
                            <span>Active agents</span>
                            <span>{AGENTS.length}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span>Status</span>
                            <span>{isActive ? 'live' : 'idle'}</span>
                        </div>
                    </div>
                </div>
            </aside>

            <div className="relative flex min-w-0 flex-1 flex-col bg-[#111319]">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => tts.setEnabled(!tts.enabled)}
                            className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${tts.enabled ? 'border-blue-400/30 bg-blue-500/10 text-blue-300' : 'border-white/10 text-slate-500'}`}
                        >
                            {tts.enabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                        </button>
                        {tts.isSpeaking && (
                            <button
                                onClick={() => tts.stop()}
                                className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-[10px] text-red-300"
                            >
                                <Square className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="relative min-h-0 flex-1 overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none z-0">
                        <OfficeLayout reactions={roomReactions} />
                    </div>

                    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                        <AnimatePresence>
                            {showInteractions.map((interaction) => (
                                <motion.div
                                    key={interaction.id}
                                    initial={{ opacity: 0, top: '100%', left: `${interaction.x}%`, x: '-50%', scale: 0 }}
                                    animate={{ opacity: [0, 1, 1, 0], top: ['100%', '55%'], scale: [0.5, 1, 1.1, 0.8] }}
                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                    className="absolute z-30 origin-bottom"
                                >
                                    <div className="h-20 w-1 rounded-full bg-gradient-to-t from-transparent via-cyan-400 to-cyan-100 blur-[1px]" />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
                        <AnimatePresence>
                            {thoughtParticles.map((particle) => (
                                <motion.div
                                    key={particle.id}
                                    initial={{ opacity: 0, left: particle.x, top: particle.y, scale: 0.5, y: -10, x: '-50%' }}
                                    animate={{ opacity: [0, 1, 0], y: -38, scale: [0.5, 1, 0.8] }}
                                    transition={{ duration: 2, ease: 'easeOut' }}
                                    className="absolute z-30"
                                >
                                    {particle.type === 'idea' && <div className="text-lg">💡</div>}
                                    {particle.type === 'critique' && <div className="text-lg">⚠</div>}
                                    {particle.type === 'agreement' && <div className="text-lg">✓</div>}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    <div ref={meetingZoneRef} className="relative z-20 h-full w-full">
                        {relationLinks.length > 0 && (
                            <svg className="absolute inset-0 z-10 h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                                {relationLinks.map((link, index) => {
                                    const from = AGENTS.find((agent) => agent.role === link.from);
                                    const to = AGENTS.find((agent) => agent.role === link.to);
                                    if (!from || !to) return null;
                                    const fromIsSpeaking = activeAgentData?.role === from.role;
                                    const toIsSpeaking = activeAgentData?.role === to.role;
                                    const fromX = parseFloat(fromIsSpeaking ? from.zone.meeting.left : from.zone.idle.left);
                                    const fromY = parseFloat(fromIsSpeaking ? from.zone.meeting.top : from.zone.idle.top);
                                    const toX = parseFloat(toIsSpeaking ? to.zone.meeting.left : to.zone.idle.left);
                                    const toY = parseFloat(toIsSpeaking ? to.zone.meeting.top : to.zone.idle.top);
                                    return (
                                        <line
                                            key={`${link.from}-${link.to}-${index}`}
                                            x1={fromX}
                                            y1={fromY}
                                            x2={toX}
                                            y2={toY}
                                            stroke={link.tone}
                                            strokeWidth="0.28"
                                            strokeDasharray={link.dashed ? '1.4 1' : undefined}
                                            opacity="0.8"
                                        />
                                    );
                                })}
                            </svg>
                        )}

                        {AGENTS.map((agent) => {
                            const isSpeaking = activeAgentData?.role === agent.role;
                            const isTarget = !!(
                                activeAgentData &&
                                prevAgentData?.role === agent.role &&
                                activeAgentData.role !== agent.role &&
                                (currentThought?.type === 'critique' || currentThought?.type === 'agreement')
                            );
                            const isDebating = currentThought?.type === 'critique' && (isSpeaking || isTarget);
                            const isNearest = nearestAgent?.role === agent.role;

                            let targetLeft = agent.zone.idle.left;
                            let targetTop = agent.zone.idle.top;
                            if (isSpeaking || isTarget) {
                                targetLeft = agent.zone.meeting.left;
                                targetTop = agent.zone.meeting.top;
                            } else {
                                const offset = idleOffsets[agent.role];
                                if (offset) {
                                    targetLeft = `${Math.max(5, Math.min(95, parseFloat(agent.zone.idle.left) + offset.dx))}%`;
                                    targetTop = `${Math.max(5, Math.min(95, parseFloat(agent.zone.idle.top) + offset.dy))}%`;
                                }
                            }

                            let lookDirection: 'left' | 'right' | 'forward' = 'forward';
                            if (activeAgentData && !isSpeaking) {
                                const myLeft = parseFloat(targetLeft);
                                const activeLeft = parseFloat(activeAgentData.zone.meeting.left);
                                if (myLeft < activeLeft - 2) lookDirection = 'right';
                                else if (myLeft > activeLeft + 2) lookDirection = 'left';
                            }

                            const isThinking = nextAgentData?.role === agent.role;
                            const isWalking = movingAgents.has(agent.role);
                            const isWorking = workingAgents.has(agent.role) && !isSpeaking && !isWalking;
                            const visualState = agentVisualStates.get(agent.role) ?? { state: 'idle', label: 'Idle', tone: 'border-white/10 bg-black/30 text-slate-400', icon: '○' };
                            const hasPing = agentPings.some((ping) => ping.role === agent.role);

                            let currentEmote: 'thumbsup' | 'heart' | 'question' | 'sweat' | 'exclamation' | 'idea' | null = null;
                            if (isTarget) {
                                if (currentThought?.type === 'critique') currentEmote = 'sweat';
                                else if (currentThought?.type === 'agreement') currentEmote = 'idea';
                            }
                            if (isSpeaking && currentThought?.type === 'agreement') currentEmote = 'thumbsup';

                            return (
                                <motion.div
                                    key={agent.role}
                                    className="absolute"
                                    animate={{ left: targetLeft, top: targetTop, zIndex: isSpeaking ? 40 : isWalking ? 30 : 20 }}
                                    transition={{ type: 'spring', stiffness: 40, damping: 15, mass: 1 }}
                                    style={{ transform: 'translate(-50%, -50%)' }}
                                    onAnimationStart={() => setMovingAgents((prev) => new Set(prev).add(agent.role))}
                                    onAnimationComplete={() => setMovingAgents((prev) => {
                                        const next = new Set(prev);
                                        next.delete(agent.role);
                                        return next;
                                    })}
                                >
                                    <div className={`absolute -top-5 left-1/2 -translate-x-1/2 rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.14em] shadow-[0_8px_20px_rgba(0,0,0,0.25)] ${visualState.tone}`}>
                                        <span className="mr-1">{visualState.icon}</span>
                                        {visualState.label}
                                    </div>
                                    <AnimatePresence>
                                        {hasPing && (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.7 }}
                                                animate={{ opacity: [0, 1, 0], scale: [0.75, 1.22, 1.55] }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 1.6, ease: 'easeOut' }}
                                                className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/70 shadow-[0_0_18px_rgba(125,211,252,0.45)]"
                                            />
                                        )}
                                    </AnimatePresence>
                                    <AgentAvatar
                                        role={agent.role}
                                        name={agent.name}
                                        color={agent.baseColor}
                                        isSpeaking={isSpeaking}
                                        isWalking={isWalking}
                                        isWorking={isWorking}
                                        isDebating={isDebating}
                                        thoughtType={isSpeaking ? currentThought?.type : null}
                                        isThinking={isThinking}
                                        lookDirection={lookDirection}
                                        emote={currentEmote}
                                    />
                                    {isNearest && <div className="absolute -bottom-2 left-1/2 h-3 w-10 -translate-x-1/2 rounded-full bg-emerald-400/35 blur-[6px]" />}
                                    {visualState.state === 'speaking' && (
                                        <div className="absolute inset-x-0 bottom-4 mx-auto h-4 w-14 rounded-full bg-emerald-400/18 blur-[7px]" />
                                    )}
                                    {visualState.state === 'thinking' && (
                                        <div className="absolute inset-x-1 bottom-4 h-2 rounded-full bg-sky-400/18 blur-[6px]" />
                                    )}
                                    {visualState.state === 'blocked' && (
                                        <div className="absolute inset-x-1 bottom-4 h-3 rounded-full bg-rose-500/30 blur-[6px]" />
                                    )}
                                    {visualState.state === 'review' && (
                                        <div className="absolute inset-x-2 bottom-5 h-2 rounded-full bg-amber-400/25 blur-[5px]" />
                                    )}
                                </motion.div>
                            );
                        })}

                        <motion.div
                            className="absolute"
                            animate={{ left: `${userPos.x}%`, top: `${userPos.y}%`, zIndex: 100 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
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
                                emote={activeEmote}
                            />
                        </motion.div>
                    </div>
                </div>
            </div>

            {chatPortalTarget && createPortal(
                <div data-brainstorm-chat-root="true" className="pointer-events-auto flex h-full w-full flex-col overflow-hidden rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,#151922,#0e131a)] shadow-[0_32px_80px_rgba(0,0,0,0.45)]">
                    <div className="border-b border-white/8 px-4 py-3">
                        <div className="mb-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="rounded-[8px] bg-[#1b2230] px-2 py-1 text-[11px] font-semibold text-[#7aa2ff]">{currentThought ? roleLabel(currentThought.agent) : 'Transcript'}</div>
                                <div className="max-w-[220px] truncate text-[12px] text-slate-300">{currentThought?.thought || 'Transcript'}</div>
                            </div>
                        </div>
                    </div>

                    <div ref={scrollContainerRef} className="custom-scrollbar flex-1 overflow-y-auto px-4 py-3">
                        {visibleThoughts.map((log) => {
                            const isUser = log.agent === 'user';
                            return (
                                <div key={log.id} className={`mb-3 rounded-[12px] border px-3 py-2 ${isUser ? 'border-emerald-500/20 bg-emerald-500/8' : 'border-white/6 bg-white/4'}`}>
                                    <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.18em]">
                                        <span className={isUser ? 'text-emerald-300' : 'text-slate-500'}>{roleLabel(log.agent)}</span>
                                        <span className="text-slate-600">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    <div className="text-[13px] leading-relaxed text-slate-200">{log.thought}</div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="border-t border-white/8 px-4 py-3">
                        <div className="mb-2 flex items-center justify-between">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Transcript</div>
                            <div className="text-[10px] text-slate-500">{nearestAgent ? `${nearestAgent.name} in range` : 'broadcast'}</div>
                        </div>
                        <div className="relative flex items-center">
                            <Input
                                value={userInput}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUserInput(e.target.value)}
                                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleSendMessage()}
                                onFocus={() => setIsUserFocused(true)}
                                onBlur={() => setIsUserFocused(false)}
                                placeholder={nearestAgent ? `${nearestAgent.name}에게 메시지...` : '메시지 입력...'}
                                className="h-10 rounded-full border-white/10 bg-white/5 pl-4 pr-12 text-[13px] text-slate-100 placeholder:text-slate-500"
                                disabled={isSending}
                            />
                            <Button
                                size="sm"
                                onClick={handleSendMessage}
                                disabled={isSending || !userInput.trim()}
                                className="absolute right-1 h-8 w-8 rounded-full bg-emerald-500 p-0 text-white hover:bg-emerald-600"
                            >
                                <Send className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                </div>,
                chatPortalTarget
            )}

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #313846; border-radius: 99px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475164; }
            `}</style>
        </div>
    );
}
