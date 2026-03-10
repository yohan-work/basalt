import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AgentAvatarProps {
    role: string;
    name: string;
    color?: string;
    isSpeaking?: boolean;
    isWalking?: boolean;
    isWorking?: boolean;
    thoughtType?: 'idea' | 'critique' | 'agreement' | null;
    isThinking?: boolean;
    lookDirection?: 'left' | 'right' | 'forward';
    emote?: 'thumbsup' | 'heart' | 'question' | null;
}

export const AgentAvatar = ({ role, name, color, isSpeaking, isWalking, isWorking, thoughtType, isThinking, lookDirection = 'forward', emote = null }: AgentAvatarProps) => {

    const pantsColor = "bg-[#1e40af]"; // Lego classic blue pants
    const shoeColor = "bg-[#0f172a]";
    const skinColor = "bg-[#fde047]"; // Lego yellow

    // Scale X to flip body if looking left
    const flipX = lookDirection === 'left' ? -1 : 1;

    return (
        <div className="relative flex flex-col items-center group w-16 h-24">
            {/* Name Label */}
            <div className={`absolute -top-10 flex items-center gap-1.5 px-3 py-1 bg-white rounded-full shadow-md border ${isSpeaking ? 'border-emerald-300' : 'border-slate-200'} transition-all z-50 whitespace-nowrap`}>
                <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                <span className={`text-[10px] font-bold ${isSpeaking ? 'text-slate-800' : 'text-slate-500'}`}>
                    {name}
                </span>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white border-b border-r border-slate-200 transform rotate-45" />
            </div>

            <motion.div
                className="relative w-full h-full flex flex-col items-center"
                animate={
                    isWalking ? {
                        y: [-2, 2, -2],
                    } : (isSpeaking ? (
                        thoughtType === 'critique' ? { x: [-2, 2, -2, 2, 0] } :
                            thoughtType === 'agreement' ? { y: [0, -3, 0] } :
                                { scale: [1, 1.05, 1] }
                    ) : (isWorking ? { y: [0, -1, 0] } : {}))
                }
                transition={{
                    repeat: Infinity,
                    duration: isWalking ? 0.3 : (thoughtType === 'critique' ? 0.4 : (isWorking ? 0.5 : 1.5)),
                    ease: "linear"
                }}
                style={{ transformOrigin: 'bottom center' }}
            >
                {/* Floating Acton Effects */}
                <AnimatePresence>
                    {isThinking && !isSpeaking && !emote && (
                        <motion.div
                            key="thinking"
                            initial={{ opacity: 0, scale: 0.5, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: -20 }}
                            exit={{ opacity: 0, scale: 0.5, y: -10 }}
                            className="absolute -top-3 z-40 bg-white border border-slate-200 px-2 py-1 rounded-full shadow flex gap-1 items-center"
                        >
                            <motion.div className="w-1 h-1 bg-slate-400 rounded-full" animate={{ y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0 }} />
                            <motion.div className="w-1 h-1 bg-slate-400 rounded-full" animate={{ y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.2 }} />
                            <motion.div className="w-1 h-1 bg-slate-400 rounded-full" animate={{ y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: 0.4 }} />
                        </motion.div>
                    )}
                    {isSpeaking && thoughtType === 'idea' && (
                        <motion.div
                            key="idea"
                            initial={{ opacity: 0, y: 10, scale: 0.5 }}
                            animate={{ opacity: 1, y: -25, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            className="absolute -top-3 z-40 text-yellow-500 drop-shadow-md"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.9 1.2 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></svg>
                        </motion.div>
                    )}
                    {isSpeaking && thoughtType === 'agreement' && (
                        <motion.div
                            key="agreement"
                            initial={{ opacity: 0, y: 10, scale: 0.5 }}
                            animate={{ opacity: 1, y: -25, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            className="absolute -top-3 z-40 text-emerald-500 drop-shadow-md"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /></svg>
                        </motion.div>
                    )}
                    {emote && (
                        <motion.div
                            key="emote"
                            initial={{ opacity: 0, scale: 0.5, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: -25 }}
                            exit={{ opacity: 0, scale: 0.5, y: -10 }}
                            className="absolute -top-6 z-50 text-2xl drop-shadow-md"
                        >
                            {emote === 'thumbsup' && '👍'}
                            {emote === 'heart' && '❤️'}
                            {emote === 'question' && '❓'}
                        </motion.div>
                    )}
                    {isWorking && !isSpeaking && !isWalking && (
                        <motion.div
                            key="working"
                            initial={{ opacity: 0, y: 10, scale: 0.5 }}
                            animate={{ opacity: 1, y: -25, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.5 }}
                            className="absolute -top-3 z-40 text-blue-500 drop-shadow-md bg-white border border-slate-200 px-1.5 py-0.5 rounded-md flex items-center shadow-sm"
                        >
                            <motion.svg 
                                animate={{ y: [-2, 2, -2] }} 
                                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                                xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            >
                                <polyline points="16 18 22 12 16 6"></polyline>
                                <polyline points="8 6 2 12 8 18"></polyline>
                            </motion.svg>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* LEGO BODY WRAPPER */}
                <div
                    className="relative flex flex-col items-center z-10 w-full h-full"
                    style={{ transform: `scaleX(${flipX})` }}
                >
                    {/* Head */}
                    <div className="relative z-30 flex flex-col items-center">
                        <div className={`w-3 h-1.5 ${skinColor} rounded-t-sm border-x border-t border-black/20`} /> {/* Lego stud */}
                        <div className={`w-9 h-9 ${skinColor} rounded-xl border-2 border-black/20 shadow-sm relative overflow-hidden flex justify-center items-center`}>
                            {/* Eyes */}
                            <div className={`absolute top-[35%] flex gap-2 transition-transform duration-300 ${lookDirection !== 'forward' ? 'translate-x-[3px]' : ''}`}>
                                <div className="w-1.5 h-1.5 rounded-full bg-black/80" />
                                <div className="w-1.5 h-1.5 rounded-full bg-black/80" />
                            </div>
                            {/* Mouth */}
                            <div className={`absolute bottom-[20%] w-3 h-1 ${isSpeaking ? 'bg-black/80 rounded-full h-2' : 'border-b-2 border-black/80 rounded-full h-1'} transition-transform duration-300 ${lookDirection !== 'forward' ? 'translate-x-[3px]' : ''}`} />
                        </div>
                    </div>

                    {/* Torso */}
                    <div className={`relative z-20 w-11 h-10 mt-[-2px] ${color || 'bg-red-500'} rounded-t-lg border-2 border-black/20 shadow-inner flex justify-center overflow-hidden`}>
                        {/* ID Badge / Tie accent */}
                        <div className="w-4 h-6 bg-white/20 mt-1 rounded-sm flex items-start justify-center pt-1 shadow-sm">
                            <div className="w-1.5 h-2 bg-black/10 rounded-sm" />
                        </div>
                    </div>

                    {/* Legs (Animated when walking) */}
                    <div className="relative z-10 w-9 h-7 flex justify-between mt-[-2px]">
                        {/* Left Leg */}
                        <motion.div
                            className={`w-4 h-full ${pantsColor} border-2 border-black/20 rounded-sm relative flex flex-col justify-end overflow-hidden`}
                            animate={isWalking ? { y: [-3, 3, -3] } : (lookDirection === 'left' || lookDirection === 'right' ? { y: -2, rotate: 5 } : { y: 0 })}
                            transition={{ repeat: Infinity, duration: 0.3, ease: 'linear' }}
                        >
                            <div className={`w-full h-2.5 ${shoeColor} border-t border-black/30 w-5 -ml-[2px] rounded-t-sm`} />
                        </motion.div>

                        {/* Right Leg */}
                        <motion.div
                            className={`w-4 h-full ${pantsColor} border-2 border-black/20 rounded-sm relative flex flex-col justify-end overflow-hidden`}
                            animate={isWalking ? { y: [3, -3, 3] } : (lookDirection === 'left' || lookDirection === 'right' ? { y: 2, rotate: -5 } : { y: 0 })}
                            transition={{ repeat: Infinity, duration: 0.3, ease: 'linear' }}
                        >
                            <div className={`w-full h-2.5 ${shoeColor} border-t border-black/30 w-5 -ml-[2px] rounded-t-sm`} />
                        </motion.div>
                    </div>
                </div>

            </motion.div>
        </div>
    );
};
