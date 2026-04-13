import React from 'react';
import { motion } from 'framer-motion';

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
    emote?: 'thumbsup' | 'heart' | 'question' | 'sweat' | 'exclamation' | 'idea' | null;
    isDebating?: boolean;
}

export const AgentAvatar = ({
    role,
    name,
    isSpeaking,
    isWalking,
    isWorking,
    thoughtType,
    isThinking,
    emote,
}: AgentAvatarProps) => {
    const chip = role === 'user' ? 'YOU' : name.toUpperCase();
    const spritePath =
        role === 'main-agent'
            ? '/pixel-avatars/lead.svg'
            : role === 'product-manager'
              ? '/pixel-avatars/pm.svg'
              : role === 'software-engineer'
                ? '/pixel-avatars/dev.svg'
                : role === 'designer'
                  ? '/pixel-avatars/design.svg'
                  : '/pixel-avatars/user.svg';

    return (
        <motion.div
            className="relative flex w-[46px] flex-col items-center"
            animate={
                isWalking ? { y: [-1, 1, -1] } :
                isSpeaking ? { y: [0, -2, 0] } :
                isWorking ? { y: [0, -1, 0] } : {}
            }
            transition={{ repeat: Infinity, duration: isWalking ? 0.35 : 1, ease: 'easeInOut' }}
        >
            {(isThinking || emote || thoughtType) && (
                <div className="absolute -top-4 text-[10px] text-white drop-shadow">
                    {emote === 'thumbsup' && '👍'}
                    {emote === 'heart' && '❤'}
                    {emote === 'question' && '?'}
                    {emote === 'sweat' && '💦'}
                    {emote === 'idea' && '💡'}
                    {!emote && thoughtType === 'critique' && '!'}
                    {!emote && thoughtType === 'agreement' && '✓'}
                    {!emote && thoughtType === 'idea' && '💡'}
                    {!emote && !thoughtType && isThinking && '…'}
                </div>
            )}
            <div className="relative h-[40px] w-[36px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={spritePath}
                    alt={name}
                    className="h-full w-full object-contain drop-shadow-[0_2px_3px_rgba(0,0,0,0.4)]"
                    style={{ imageRendering: 'pixelated' }}
                />
            </div>
            <div className={`mt-1 rounded-[4px] border px-1.5 py-[2px] text-[7px] font-semibold uppercase tracking-[0.12em] ${isSpeaking ? 'border-emerald-300/60 bg-emerald-500/20 text-emerald-200' : 'border-white/10 bg-black/45 text-slate-300'}`}>
                {chip}
            </div>
        </motion.div>
    );
};
