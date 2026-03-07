'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface AgentAvatarProps {
    role: string;
    name: string;
    color: string;
    isSpeaking?: boolean;
    isWalking?: boolean;
}

export const AgentAvatar = ({ role, name, color, isSpeaking, isWalking }: AgentAvatarProps) => {
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
                animate={isWalking ? {
                    y: [0, -2, 0]
                } : (isSpeaking ? {
                    scale: [1, 1.05, 1]
                } : {})}
                transition={{
                    repeat: Infinity,
                    duration: isWalking ? 0.3 : 1.5,
                    ease: "easeInOut"
                }}
                className="relative w-28 h-20 mt-2 flex flex-col items-center"
            >
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
                <div className={`absolute bottom-0 w-12 h-8 ${color} border-x-2 border-t-2 border-emerald-600 z-20`} />

                {/* Avatar Head / Neckline */}
                <div className="absolute bottom-5 w-12 h-6 bg-[#1e293b] border-2 border-emerald-600 flex justify-center z-30 overflow-hidden">
                    {/* Head Top/Hair */}
                    <div className="w-10 h-10 mt-2 bg-[#f3d3b0] border border-black/10 rounded-full" />
                </div>

            </motion.div>
        </div>
    );
};
