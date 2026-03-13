'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from 'react';
import type { IncomingReactGrabPayload } from '@/lib/incoming-react-grab-types';
import { BASALT_REACT_GRAB_MESSAGE_TYPE } from '@/lib/incoming-react-grab-types';

type IncomingReactGrabContextValue = {
    payload: IncomingReactGrabPayload | null;
    clearPayload: () => void;
};

const IncomingReactGrabContext = createContext<IncomingReactGrabContextValue | null>(null);

function isAllowedOrigin(origin: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
        const our = new URL(window.location.origin);
        const other = new URL(origin);
        if (our.origin === other.origin) return true;
        if (other.hostname === 'localhost' || other.hostname === '127.0.0.1') return true;
    } catch {
        return false;
    }
    return false;
}

export function IncomingReactGrabProvider({ children }: { children: ReactNode }) {
    const [payload, setPayload] = useState<IncomingReactGrabPayload | null>(null);

    const clearPayload = useCallback(() => setPayload(null), []);

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            if (event.data?.type !== BASALT_REACT_GRAB_MESSAGE_TYPE) return;
            if (!isAllowedOrigin(event.origin)) return;
            const p = event.data.payload;
            if (p && (typeof p.filePath === 'string' || p.filePath === null)) {
                setPayload({
                    filePath: p.filePath ?? null,
                    componentName: p.componentName ?? null,
                    line: p.line,
                    column: p.column,
                    selector: p.selector,
                    stackString: p.stackString,
                    elementDescriptor: p.elementDescriptor,
                });
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    return (
        <IncomingReactGrabContext.Provider value={{ payload, clearPayload }}>
            {children}
        </IncomingReactGrabContext.Provider>
    );
}

export function useIncomingReactGrab(): IncomingReactGrabContextValue {
    const ctx = useContext(IncomingReactGrabContext);
    if (!ctx) {
        return {
            payload: null,
            clearPayload: () => {},
        };
    }
    return ctx;
}
