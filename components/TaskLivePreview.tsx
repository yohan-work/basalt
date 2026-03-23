'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExternalLink, Loader2, Monitor, RefreshCw, AlertCircle } from 'lucide-react';

function normalizeUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `http://${trimmed}`;
}

export interface TaskLivePreviewProps {
    taskId: string;
}

export function TaskLivePreview({ taskId }: TaskLivePreviewProps) {
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [inferenceWarning, setInferenceWarning] = useState<string | null>(null);
    const [addressBarUrl, setAddressBarUrl] = useState('');
    const [iframeSrc, setIframeSrc] = useState('');
    const [iframeKey, setIframeKey] = useState(0);

    useEffect(() => {
        if (!taskId) return;
        let cancelled = false;
        fetch(`/api/project/task-preview-url?taskId=${encodeURIComponent(taskId)}`)
            .then((res) => res.json())
            .then((data: { error?: string; url?: string; inferenceWarning?: string | null }) => {
                if (cancelled) return;
                if (data.error || !data.url) {
                    setFetchError(data.error || 'URL을 계산하지 못했습니다.');
                    setInferenceWarning(null);
                    return;
                }
                setAddressBarUrl(data.url);
                setIframeSrc(data.url);
                setInferenceWarning(typeof data.inferenceWarning === 'string' ? data.inferenceWarning : null);
                setIframeKey((k) => k + 1);
            })
            .catch((e: unknown) => {
                if (!cancelled) setFetchError(e instanceof Error ? e.message : '조회 실패');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [taskId]);

    const handleAddressSubmit = () => {
        const url = normalizeUrl(addressBarUrl);
        if (url) {
            setAddressBarUrl(url);
            setIframeSrc(url);
            setIframeKey((k) => k + 1);
        }
    };

    const handleOpenTab = () => {
        const url = iframeSrc || normalizeUrl(addressBarUrl);
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleManualRefresh = () => {
        setIframeKey((k) => k + 1);
    };

    return (
        <div className="flex flex-1 flex-col gap-3 min-h-0 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Monitor className="h-4 w-4 shrink-0" />
                <span>
                    대상 프로젝트 dev 서버가 실행 중이어야 합니다. HMR 반영 후에는{' '}
                    <strong className="text-foreground">새로고침</strong>을 눌러 주세요.
                </span>
            </div>

            {inferenceWarning && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{inferenceWarning}</span>
                </div>
            )}

            {fetchError && !loading && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="space-y-2">
                        <p>{fetchError}</p>
                        <p className="text-muted-foreground text-xs">
                            아래 주소창에 직접 dev URL(예: http://localhost:3001/경로)을 입력한 뒤 이동할 수 있습니다.
                        </p>
                    </div>
                </div>
            )}

            {loading && (
                <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground py-12">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    미리보기 URL 계산 중…
                </div>
            )}

            {!loading && (
                <>
                    <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-sm shrink-0">
                        <Input
                            type="url"
                            value={addressBarUrl}
                            onChange={(e) => setAddressBarUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleAddressSubmit();
                                }
                            }}
                            placeholder="http://localhost:3001"
                            className="h-8 flex-1 border-0 bg-transparent font-mono text-foreground text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                        <Button type="button" variant="secondary" size="sm" className="h-8 shrink-0" onClick={handleAddressSubmit}>
                            이동
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0"
                            onClick={handleManualRefresh}
                            title="iframe만 다시 로드"
                        >
                            <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" onClick={handleOpenTab}>
                            <ExternalLink className="h-4 w-4" />
                        </Button>
                    </div>

                    {iframeSrc ? (
                        <div className="min-h-[320px] flex-1 overflow-hidden rounded-md border bg-muted/20 flex flex-col">
                            <iframe
                                title="Task dev preview"
                                src={iframeSrc}
                                key={`${iframeSrc}-${iframeKey}`}
                                className="w-full flex-1 min-h-[320px] border-0 bg-background"
                                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                            />
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground py-6 text-center">
                            표시할 URL이 없습니다. 주소를 입력한 뒤 이동해 주세요.
                        </p>
                    )}

                    <p className="text-[11px] text-muted-foreground">
                        일부 앱은 X-Frame-Options 때문에 iframe이 비어 보일 수 있습니다. 그 경우 새 탭 열기 버튼을 사용하세요.
                    </p>
                </>
            )}
        </div>
    );
}
