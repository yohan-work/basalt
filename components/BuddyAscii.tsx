'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
    getBuddyDefinition,
    getBuddyReaction,
    resolveBuddyAnimationState,
    type BuddyAnimationState,
} from '@/lib/buddy-catalog';

interface BuddyAsciiProps {
    buddyId?: string | null;
    thoughtType?: string | null;
    isHighlighted?: boolean;
    isComplete?: boolean;
    isWarning?: boolean;
    active?: boolean;
    compact?: boolean;
    className?: string;
}

function cx(...parts: Array<string | false | null | undefined>) {
    return parts.filter(Boolean).join(' ');
}

export function BuddyAscii({
    buddyId,
    thoughtType,
    isHighlighted = false,
    isComplete = false,
    isWarning = false,
    active = false,
    compact = false,
    className,
}: BuddyAsciiProps) {
    const buddy = getBuddyDefinition(buddyId);
    const reduceMotion = useReducedMotion();
    const state = resolveBuddyAnimationState({ thoughtType, isHighlighted, isComplete, isWarning });
    const reaction = getBuddyReaction(buddy.id, { thoughtType, isHighlighted, isComplete, isWarning });
    const frames = buddy.frames[state as BuddyAnimationState];
    const [frameIndex, setFrameIndex] = useState(0);

    useEffect(() => {
        if (reduceMotion || !active || frames.length <= 1) return;
        const intervalMs = state === 'warning' || state === 'critique' ? 380 : state === 'celebrate' ? 520 : 760;
        const timer = window.setInterval(() => {
            setFrameIndex((prev) => (prev + 1) % frames.length);
        }, intervalMs);
        return () => window.clearInterval(timer);
    }, [active, frames, reduceMotion, state]);

    const currentFrame = frames[frameIndex % frames.length];
    const accentRing = useMemo(() => {
        if (reaction.severity === 'high') return 'ring-2 ring-amber-400/60';
        if (reaction.severity === 'medium') return 'ring-1 ring-sky-300/60';
        return 'ring-1 ring-white/10';
    }, [reaction.severity]);

    const motionProps = reduceMotion
        ? {}
        : state === 'warning' || state === 'critique'
          ? { animate: { x: [0, -1.5, 1.5, -1, 0], y: [0, -1, 0] }, transition: { duration: 0.45, repeat: active ? Infinity : 0, repeatDelay: 1.2 } }
          : state === 'celebrate' || state === 'agreement'
            ? { animate: { y: [0, -2, 0], scale: [1, 1.03, 1] }, transition: { duration: 0.8, repeat: active ? Infinity : 0, repeatDelay: 1.4 } }
            : state === 'idea'
              ? { animate: { scale: [1, 1.02, 1], opacity: [1, 0.92, 1] }, transition: { duration: 1.1, repeat: active ? Infinity : 0, repeatDelay: 1.4 } }
              : {};

    return (
        <motion.div
            {...motionProps}
            className={cx(
                'inline-flex flex-col rounded-xl border bg-slate-950/95 px-3 py-2 text-slate-100 shadow-lg',
                accentRing,
                className
            )}
        >
            <pre
                className={cx(
                    'font-mono whitespace-pre text-slate-100',
                    compact ? 'text-[9px] leading-3' : 'text-[10px] leading-3'
                )}
            >
                {currentFrame}
            </pre>
            <div className={cx('mt-2 flex items-center gap-1.5', compact ? 'text-[10px]' : 'text-[11px]')}>
                <span>{reaction.emote}</span>
                <span className="font-semibold">{reaction.label}</span>
            </div>
            <div className={cx('text-slate-400', compact ? 'text-[10px]' : 'text-[11px]')}>
                {reaction.comment}
            </div>
        </motion.div>
    );
}
