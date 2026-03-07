'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AgentAvatarProps {
    role: string;
    name: string;
    color?: string;
    isSpeaking?: boolean;
    isWalking?: boolean;
    thoughtType?: 'idea' | 'critique' | 'agreement' | null;
    isThinking?: boolean;
    lookDirection?: 'left' | 'right' | 'forward';
}

export const AgentAvatar = ({ role, name, color, isSpeaking, isWalking, thoughtType, isThinking, lookDirection = 'forward' }: AgentAvatarProps) => {
    return (
        <div className="relative flex flex-col items-center group">
            {/* Name Label - Rounded Capsule */}
            <div className={`absolute -top-12 flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-full shadow-md border ${isSpeaking ? 'border-emerald-200' : 'border-slate-200'} transition-all z-50 whitespace-nowrap`}>
                <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                <span className={`text-[11px] font-bold ${isSpeaking ? 'text-slate-800' : 'text-slate-500'}`}>
                    {name}
                </span>
                {/* 꼬리 */}
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border-b border-r border-slate-200 transform rotate-45" />
            </div>

            {/* 2D Flat Desk & Avatar (Top-Down) */}
            <motion.div
                animate={
                    isWalking ? {
                        y: [0, -4, 0] // Bouncier for walking
                    } : (isSpeaking ? (
                        thoughtType === 'critique' ? {
                            x: [-2, 2, -2, 2, 0], // Shake
                            scale: 1.05
                        } : thoughtType === 'agreement' ? {
                            y: [0, -3, 0], // Nodding bounce
                            scale: 1.05
                        } : {
                            scale: [1, 1.08, 1] // Idea or default
                        }
                    ) : {})
                }
                transition={
                    thoughtType === 'critique' ? {
                        repeat: Infinity,
                        duration: 0.4, // Fast shake
                        ease: "easeInOut"
                    } : {
                        repeat: Infinity,
                        duration: isWalking ? 0.3 : (thoughtType === 'agreement' ? 0.6 : 1.5),
                        ease: "easeInOut"
                    }
                }
                className="relative w-28 h-20 mt-2 flex flex-col items-center"
            >
                {/* Floating Effect above head when speaking or thinking */}
                <AnimatePresence>
                    {isThinking && !isSpeaking && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.5, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: -25 }}
                            exit={{ opacity: 0, scale: 0.5, y: -10 }}
                            className="absolute -top-4 z-40 bg-white border border-slate-200 px-2 py-1.5 rounded-full shadow-md flex gap-1 items-center"
                        >
                            <motion.div className="w-1.5 h-1.5 bg-slate-400 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0 }} />
                            <motion.div className="w-1.5 h-1.5 bg-slate-400 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.2 }} />
                            <motion.div className="w-1.5 h-1.5 bg-slate-400 rounded-full" animate={{ y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }} />
                        </motion.div>
                    )}
                    {isSpeaking && thoughtType === 'idea' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.5 }}
                            animate={{ opacity: 1, y: -20, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            className="absolute -top-4 z-40 text-yellow-400 drop-shadow-md"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.9 1.2 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></svg>
                        </motion.div>
                    )}
                    {isSpeaking && thoughtType === 'agreement' && (
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.5 }}
                            animate={{ opacity: 1, y: -20, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            className="absolute -top-4 z-40 text-emerald-500 drop-shadow-md"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
                        </motion.div>
                    )}
                </AnimatePresence>
                {/* Desk Base */}
                <div className="absolute top-4 w-28 h-12 bg-white rounded-md shadow-sm border border-slate-200 z-10 flex px-2 py-1.5 justify-between">
                    {/* Yellow Post-it */}
                    <div className="w-2.5 h-2.5 bg-yellow-300 rounded-sm opacity-80 mt-1" />
                    {/* White Papers */}
                    <div className="flex gap-1">
                        <div className="w-1.5 h-3 bg-slate-100 rounded-sm border border-slate-200 mt-2" />
                        <div className="w-2 h-3 bg-slate-100 rounded-sm border border-slate-200 mt-3" />
                    </div>
                </div>

                {/* Avatar Torso */}
                <div
                    className={`absolute bottom-0 w-12 h-8 ${color} border-x-2 border-t-2 border-black/20 z-20 transition-transform duration-500 rounded-t-xl`}
                    style={{
                        transform: lookDirection === 'left' ? 'rotate(-10deg) translateX(-2px)' :
                            lookDirection === 'right' ? 'rotate(10deg) translateX(2px)' :
                                'rotate(0deg) translateX(0px)'
                    }}
                />

                {/* Avatar Head / Neckline */}
                <div
                    className="absolute bottom-5 w-12 h-6 bg-[#1e293b] border-2 border-black/30 flex justify-center z-30 overflow-hidden transition-all duration-500 rounded-lg"
                    style={{
                        transform: lookDirection === 'left' ? 'rotate(-15deg) translateX(-6px)' :
                            lookDirection === 'right' ? 'rotate(15deg) translateX(6px)' :
                                'rotate(0deg) translateX(0px)'
                    }}
                >
                    {/* Head Top/Hair */}
                    <div className="w-10 h-10 mt-2 bg-[#f3d3b0] border border-black/10 rounded-full" />
                </div>

            </motion.div>
        </div>
    );
};
