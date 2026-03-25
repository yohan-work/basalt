'use client';

import { useState, useEffect, useRef } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Monitor, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { parseResponseAsJson } from '@/lib/fetch-json';

interface DevServerInfo {
    port: number | null;
    url: string;
    inferred: boolean;
    error?: string;
}

interface ProjectPreviewPanelProps {
    projectId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function normalizeUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `http://${trimmed}`;
}

export function ProjectPreviewPanel({ projectId, open, onOpenChange }: ProjectPreviewPanelProps) {
    const [info, setInfo] = useState<DevServerInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [manualPort, setManualPort] = useState('');
    const [useManualPort, setUseManualPort] = useState(false);
    /** Editable address bar value (input field) */
    const [addressBarUrl, setAddressBarUrl] = useState('');
    /** URL actually loaded in the iframe (updated on API load, manual port apply, or 이동/Enter) */
    const [iframeSrc, setIframeSrc] = useState('');
    const prevOpenRef = useRef(false);

    useEffect(() => {
        if (!open || !projectId) {
            if (prevOpenRef.current) {
                prevOpenRef.current = false;
                setInfo(null);
                setFetchError(null);
                setManualPort('');
                setUseManualPort(false);
                setAddressBarUrl('');
                setIframeSrc('');
            }
            return;
        }

        prevOpenRef.current = true;
        let cancelled = false;
        setLoading(true);
        setFetchError(null);
        setInfo(null);

        fetch(`/api/project/dev-server-info?projectId=${encodeURIComponent(projectId)}`)
            .then((res) => parseResponseAsJson<DevServerInfo & { error?: string }>(res))
            .then((data) => {
                if (cancelled) return;
                if (data.error && !data.url) {
                    setFetchError(data.error);
                    setInfo({ port: null, url: '', inferred: false, error: data.error });
                } else {
                    setInfo({
                        port: data.port ?? null,
                        url: data.url || '',
                        inferred: data.inferred ?? false,
                    });
                    if (data.port) setManualPort(String(data.port));
                    if (data.url) {
                        setAddressBarUrl(data.url);
                        setIframeSrc(data.url);
                    }
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setFetchError(err?.message || 'Failed to load dev server info');
                    setInfo(null);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [open, projectId]);

    const displayUrl = useManualPort && manualPort
        ? `http://localhost:${manualPort}`
        : info?.url || '';
    /** Address bar shows user-editable value; fallback to displayUrl when empty (e.g. before first load) */
    const effectiveAddressBar = addressBarUrl || displayUrl;
    const showIframe = Boolean(iframeSrc) && !loading;
    const showManualInput = (info?.error || fetchError || !info?.url) && !loading && !iframeSrc;

    const handleAddressBarSubmit = () => {
        const url = normalizeUrl(effectiveAddressBar);
        if (url) {
            setAddressBarUrl(url);
            setIframeSrc(url);
        }
    };

    const handleOpenInNewTab = () => {
        const url = iframeSrc || effectiveAddressBar;
        if (url) window.open(normalizeUrl(url), '_blank', 'noopener,noreferrer');
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="fixed left-auto right-0 top-0 h-full w-[min(90vw,800px)] max-w-full translate-x-0 translate-y-0 gap-0 rounded-l-lg rounded-r-none border-r p-0 pl-6 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
                onPointerDownOutside={(e) => e.preventDefault()}
            >

                <div className="flex flex-1 flex-col gap-2 overflow-hidden px-6 pt-2 pb-3">
                    <DialogHeader className="space-y-2 border-b px-6 pb-2 pt-3">
                        <DialogTitle className="flex items-center gap-2 text-lg">
                            <Monitor className="h-5 w-5" />
                            Project Preview
                        </DialogTitle>
                    </DialogHeader>
                    {loading && (
                        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>dev 서버 정보 조회 중...</span>
                        </div>
                    )}

                    {showManualInput && !loading && (
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>
                                    {fetchError || info?.error || '포트를 알 수 없습니다.'} 프로젝트에서{' '}
                                    <code className="rounded bg-muted px-1">npm run dev</code>를 실행한 뒤, 포트를 입력하거나
                                    설정해 주세요.
                                </span>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="manual-port">포트</Label>
                                <div className="flex gap-2">
                                    <Input
                                        id="manual-port"
                                        type="number"
                                        placeholder="3001"
                                        value={manualPort}
                                        onChange={(e) => {
                                            setManualPort(e.target.value);
                                            setUseManualPort(true);
                                        }}
                                        min={1}
                                        max={65535}
                                        className="w-28"
                                    />
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => {
                                            const port = parseInt(manualPort, 10);
                                            if (port > 0 && port < 65536) {
                                                const url = `http://localhost:${port}`;
                                                setUseManualPort(true);
                                                setInfo({ port, url, inferred: false });
                                                setAddressBarUrl(url);
                                                setIframeSrc(url);
                                            }
                                        }}
                                    >
                                        적용
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {showIframe && (
                        <>
                            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-sm">
                                <Input
                                    type="url"
                                    value={effectiveAddressBar}
                                    onChange={(e) => setAddressBarUrl(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddressBarSubmit();
                                        }
                                    }}
                                    placeholder="http://localhost:3000"
                                    className="h-8 flex-1 border-0 bg-transparent font-mono text-foreground placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    className="h-8 shrink-0"
                                    onClick={handleAddressBarSubmit}
                                >
                                    이동
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 shrink-0"
                                    onClick={handleOpenInNewTab}
                                >
                                    <ExternalLink className="h-4 w-4" />
                                </Button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/20">
                                <iframe
                                    title="Project preview"
                                    src={iframeSrc}
                                    key={iframeSrc}
                                    className="h-full w-full min-h-[400px] border-0"
                                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                                />
                            </div>
                        </>
                    )}

                    {!loading && !showIframe && !showManualInput && projectId && (
                        <p className="text-sm text-muted-foreground">
                            프로젝트를 선택했지만 dev 서버 정보를 불러오지 못했습니다.
                        </p>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
