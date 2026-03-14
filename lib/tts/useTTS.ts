'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { getVoiceForAgent } from './voice-map';

interface QueueItem {
    text: string;
    agentRole: string;
}

interface UseTTSReturn {
    speak: (text: string, agentRole: string) => void;
    stop: () => void;
    enabled: boolean;
    setEnabled: (v: boolean) => void;
    isSpeaking: boolean;
    isLoading: boolean;
    speakingAgent: string | null;
    volume: number;
    setVolume: (v: number) => void;
    rate: number;
    setRate: (v: number) => void;
}

const TTS_STORAGE_KEY = 'basalt-tts-enabled';
const TTS_VOLUME_KEY = 'basalt-tts-volume';

function getStoredEnabled(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return localStorage.getItem(TTS_STORAGE_KEY) === 'true';
    } catch {
        return false;
    }
}

function getStoredVolume(): number {
    if (typeof window === 'undefined') return 0.8;
    try {
        const v = localStorage.getItem(TTS_VOLUME_KEY);
        return v ? parseFloat(v) : 0.8;
    } catch {
        return 0.8;
    }
}

function fallbackSpeak(text: string, agentRole: string, volume: number, rate: number): Promise<void> {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined' || !window.speechSynthesis) {
            reject(new Error('Web Speech API not available'));
            return;
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ko-KR';
        utterance.volume = volume;
        utterance.rate = rate;

        const voices = window.speechSynthesis.getVoices();
        const koVoice = voices.find(v => v.lang.startsWith('ko'));
        if (koVoice) utterance.voice = koVoice;

        utterance.onend = () => resolve();
        utterance.onerror = (e) => reject(e);
        window.speechSynthesis.speak(utterance);
    });
}

export function useTTS(): UseTTSReturn {
    const [enabled, setEnabledState] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [speakingAgent, setSpeakingAgent] = useState<string | null>(null);
    const [volume, setVolumeState] = useState(0.8);
    const [rate, setRateState] = useState(1.0);

    const queueRef = useRef<QueueItem[]>([]);
    const processingRef = useRef(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    useEffect(() => {
        setEnabledState(getStoredEnabled());
        setVolumeState(getStoredVolume());
    }, []);

    const setEnabled = useCallback((v: boolean) => {
        setEnabledState(v);
        try { localStorage.setItem(TTS_STORAGE_KEY, String(v)); } catch {}
        if (!v) {
            queueRef.current = [];
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            if (abortRef.current) abortRef.current.abort();
            window.speechSynthesis?.cancel();
            setIsSpeaking(false);
            setSpeakingAgent(null);
        }
    }, []);

    const setVolume = useCallback((v: number) => {
        const clamped = Math.max(0, Math.min(1, v));
        setVolumeState(clamped);
        try { localStorage.setItem(TTS_VOLUME_KEY, String(clamped)); } catch {}
        if (audioRef.current) audioRef.current.volume = clamped;
    }, []);

    const setRate = useCallback((v: number) => {
        setRateState(Math.max(0.5, Math.min(2, v)));
    }, []);

    const processQueue = useCallback(async () => {
        if (processingRef.current || queueRef.current.length === 0) return;
        processingRef.current = true;

        while (queueRef.current.length > 0) {
            const item = queueRef.current.shift()!;
            const voiceConfig = getVoiceForAgent(item.agentRole);

            setIsSpeaking(true);
            setSpeakingAgent(item.agentRole);
            setIsLoading(true);

            try {
                const controller = new AbortController();
                abortRef.current = controller;

                const res = await fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: item.text,
                        voice: voiceConfig.voice,
                        rate: voiceConfig.rate,
                        pitch: voiceConfig.pitch,
                    }),
                    signal: controller.signal,
                });

                if (!res.ok) throw new Error(`TTS API error: ${res.status}`);

                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                audio.volume = volume;
                audioRef.current = audio;
                setIsLoading(false);

                await new Promise<void>((resolve, reject) => {
                    audio.onended = () => {
                        URL.revokeObjectURL(url);
                        resolve();
                    };
                    audio.onerror = () => {
                        URL.revokeObjectURL(url);
                        reject(new Error('Audio playback failed'));
                    };
                    audio.play().catch(reject);
                });
            } catch (err: any) {
                setIsLoading(false);
                if (err?.name === 'AbortError') break;

                console.warn('[TTS] edge-tts failed, falling back to Web Speech API:', err.message);
                try {
                    await fallbackSpeak(item.text, item.agentRole, volume, rate);
                } catch (fallbackErr) {
                    console.warn('[TTS] Fallback also failed:', fallbackErr);
                }
            }
        }

        processingRef.current = false;
        setIsSpeaking(false);
        setSpeakingAgent(null);
        audioRef.current = null;
        abortRef.current = null;
    }, [volume, rate]);

    const speak = useCallback((text: string, agentRole: string) => {
        if (!enabled || !text.trim() || agentRole === 'user') return;
        queueRef.current.push({ text, agentRole });
        processQueue();
    }, [enabled, processQueue]);

    const stop = useCallback(() => {
        queueRef.current = [];
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        if (abortRef.current) abortRef.current.abort();
        window.speechSynthesis?.cancel();
        processingRef.current = false;
        setIsSpeaking(false);
        setIsLoading(false);
        setSpeakingAgent(null);
    }, []);

    return {
        speak,
        stop,
        enabled,
        setEnabled,
        isSpeaking,
        isLoading,
        speakingAgent,
        volume,
        setVolume,
        rate,
        setRate,
    };
}
