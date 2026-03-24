'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Circle, Clock, FileText, Activity, AlertTriangle, RotateCcw, Trash2, GitCompare, Radio, Sparkles, ThumbsUp, Pencil, Search, ClipboardPaste, ExternalLink, ChevronDown, HelpCircle, ShieldCheck, Monitor, ClipboardCopy, Wand2 } from 'lucide-react';
import { LogViewer } from './LogViewer';
import { StepProgress, type ProgressInfo } from './StepProgress';
import { WorkflowFlowchart } from './WorkflowFlowchart';
import { AgentStatusDashboard } from './AgentStatusDashboard';
import { FileActivityTree } from './FileActivityTree';
import { CodeDiffViewer, type FileChange } from './CodeDiffViewer';
import { LiveProgressPanel } from './LiveProgressPanel';
import { AgentDiscussion } from './AgentDiscussion'; // Added import
import { supabase } from '@/lib/supabase';
import type { EventStreamState } from '@/lib/hooks/useEventStream';
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogHeader,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { pickPrimaryPageSourceFileFromChanges } from '@/lib/qa/infer-route-from-files';
import { parseReactGrabClipboard } from '@/lib/parse-react-grab-clipboard';
import { useIncomingReactGrab } from './IncomingReactGrabProvider';
import { Badge } from '@/components/ui/badge';
import { ExecutionDiscussionTimeline } from './ExecutionDiscussionTimeline';
import { CollaborationMatrix } from './analytics/team/CollaborationMatrix';
import { getTaskPerformanceBenchmark, type TaskPerformanceBenchmark } from '@/lib/analytics';
import type { ReviewSuggestionSet } from '@/lib/types/review-actions';
import type { QaSignoffStored } from '@/lib/qa/signoff-report';
import { QA_ARTIFACT_SLOTS, type QaArtifactSlot } from '@/lib/qa/artifact-slots';
import { TaskLivePreview } from '@/components/TaskLivePreview';

function qaSlotLabelKo(slot: QaArtifactSlot): string {
    switch (slot) {
        case 'main':
            return '메인(전체 페이지)';
        case 'mobile':
            return '모바일 뷰포트';
        case 'tablet':
            return '태블릿 뷰포트';
        case 'desktop':
            return '데스크톱 뷰포트';
        default:
            return slot;
    }
}
import type {
    ExecuteStreamOptions,
    ExecutionDiscussionEntry,
    OrchestratorCollaborationMap,
} from '@/lib/types/agent-visualization';

interface TaskDetailsModalProps {
    task: {
        id: string;
        title: string;
        description: string;
        status: string;
        project_id?: string;
        metadata?: Record<string, unknown>;
    } | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    stream?: EventStreamState & {
        start: (taskId: string, action: string, executeOptions?: ExecuteStreamOptions) => void;
        stop: () => void;
        isActive: boolean;
    };
    executionOptions?: ExecuteStreamOptions;
    onExecutionOptionsChange?: (taskId: string, options: ExecuteStreamOptions) => void;
    onExecute?: (taskId: string, options: ExecuteStreamOptions) => void;
}

const DEFAULT_EXECUTION_OPTIONS: Required<ExecuteStreamOptions> = {
    discussionMode: 'step_handoff',
    maxDiscussionThoughts: 3,
    carryDiscussionToPrompt: true,
    strategyPreset: 'balanced',
};

type MarkdownLineView = {
    kind: 'text' | 'heading' | 'list' | 'quote' | 'code';
    content: string;
    level?: number;
    indent?: number;
    codeFence?: boolean;
};

function renderMarkdownInline(content: string): ReactNode[] {
    const nodes: ReactNode[] = [];
    const regex = /\*\*([^\n*]+?)\*\*|`([^`\n]+)`|~~([^\n~]+)~~|_([^_\n]+)_/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
        if (match.index > lastIndex) {
            nodes.push(content.slice(lastIndex, match.index));
        }

        if (match[1] !== undefined) {
            nodes.push(<strong key={`b-${match.index}`}>{match[1]}</strong>);
        } else if (match[2] !== undefined) {
            nodes.push(
                <code
                    key={`c-${match.index}`}
                    className="rounded bg-background/70 px-1 py-0.5 text-[11px] font-mono"
                >
                    {match[2]}
                </code>
            );
        } else if (match[3] !== undefined) {
            nodes.push(<del key={`d-${match.index}`}>{match[3]}</del>);
        } else if (match[4] !== undefined) {
            nodes.push(<em key={`i2-${match.index}`}>{match[4]}</em>);
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
        nodes.push(content.slice(lastIndex));
    }

    return nodes.length ? nodes : [''];
}

function parseMarkdownLikeLine(rawLine: string, inCodeBlockRef: { value: boolean }): MarkdownLineView {
    const line = rawLine;
    if (inCodeBlockRef.value) {
        if (line.trim().startsWith('```')) {
            inCodeBlockRef.value = false;
            return { kind: 'code', content: line, codeFence: true };
        }
        return { kind: 'code', content: line };
    }

    if (line.trim().startsWith('```')) {
        inCodeBlockRef.value = true;
        return { kind: 'code', content: line, codeFence: true };
    }

    const headingMatch = /^(#{1,6})(?:\s+(.*)|(.+))$/.exec(line);
    if (headingMatch) {
        return {
            kind: 'heading',
            content: (headingMatch[2] ?? headingMatch[3] ?? '').trim(),
            level: Math.min(6, Math.max(1, headingMatch[1].length)),
            indent: 0,
        };
    }

    const bulletMatch = /^(\s*)([-*+]|\d+\.)\s+(.*)$/.exec(line);
    if (bulletMatch) {
        return { kind: 'list', content: `${bulletMatch[3]}`, indent: Math.min(2, Math.floor((bulletMatch[1].length || 0) / 2)) };
    }

    if (line.startsWith('> ')) {
        return { kind: 'quote', content: line.slice(2) };
    }

    if (line.startsWith('>')) {
        return { kind: 'quote', content: line.slice(1).trimStart() };
    }

    if (!line.trim()) {
        return { kind: 'text', content: '', };
    }

    return { kind: 'text', content: line };
}

function MarkdownLikeViewer({ content, height = 300, className = '' }: { content: string; height?: number; className?: string }) {
    const inCodeBlockRef = { value: false };
    const lines = (content || '').replace(/\r\n/g, '\n').split('\n');
    const parsedLines = lines.map((line) => parseMarkdownLikeLine(line, inCodeBlockRef));
    const listIndent = (depth: number | undefined, kind: MarkdownLineView['kind']) => {
        if (kind !== 'list') return 0;
        return Math.max(0, (depth || 0) * 8);
    };

    return (
        <div
            className={`rounded-md border bg-muted/30 overflow-hidden ${className}`}
            style={{ height }}
        >
            <div className="h-full overflow-y-auto px-2 py-3 text-xs">
                <div className="text-foreground/90 font-mono">
                    {parsedLines.map((token, index) => {
                        if (token.kind === 'code') {
                            return (
                                <div
                                    key={index}
                                    className={`whitespace-pre-wrap break-all rounded-sm px-2 py-0.5 ${token.codeFence ? 'bg-slate-100/70 dark:bg-slate-800/40 text-slate-700 dark:text-slate-200' : 'text-slate-900 dark:text-slate-100'}`}
                                    style={{ paddingLeft: `${listIndent(token.indent, token.kind)}px` }}
                                >
                                    {renderMarkdownInline(token.content || '\u00A0')}
                                </div>
                            );
                        }

                        if (token.kind === 'heading') {
                            const fontSize =
                                token.level === 1 ? 'text-sm' :
                                    token.level === 2 ? 'text-xs' :
                                        token.level === 3 ? 'text-[11px]' : 'text-[11px]';
                            const fontWeight = token.level === 1 || token.level === 2 ? 'font-semibold' : 'font-medium';
                            return (
                                <div key={index} className={`${fontSize} ${fontWeight} mt-2 mb-1`}>
                                    {renderMarkdownInline(token.content || '\u00A0')}
                                </div>
                            );
                        }

                        if (token.kind === 'quote') {
                            return (
                                <div key={index} className="border-l-2 border-amber-400 pl-2 text-amber-700/90 dark:text-amber-200/90 italic">
                                    {token.content}
                                </div>
                            );
                        }

                        if (token.kind === 'list') {
                            return (
                                <div
                                    key={index}
                                    className="flex items-start gap-2"
                                    style={{ paddingLeft: `${listIndent(token.indent, token.kind)}px` }}
                                >
                                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/60 shrink-0" />
                                    <span className="whitespace-pre-wrap break-all leading-5">
                                        {renderMarkdownInline(token.content || '\u00A0')}
                                    </span>
                                </div>
                            );
                        }

                        return (
                            <div key={index} className="leading-6 whitespace-pre-wrap break-all">
                                {renderMarkdownInline(token.content || '\u00A0')}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function normalizeExecutionOptions(raw?: ExecuteStreamOptions): Required<ExecuteStreamOptions> {
    const discussionMode =
        raw?.discussionMode === 'off' || raw?.discussionMode === 'step_handoff' || raw?.discussionMode === 'roundtable'
            ? raw.discussionMode
            : DEFAULT_EXECUTION_OPTIONS.discussionMode;
    const maxDiscussionThoughts =
        typeof raw?.maxDiscussionThoughts === 'number' && Number.isFinite(raw.maxDiscussionThoughts)
            ? Math.min(6, Math.max(1, Math.round(raw.maxDiscussionThoughts)))
            : DEFAULT_EXECUTION_OPTIONS.maxDiscussionThoughts;
    const carryDiscussionToPrompt =
        typeof raw?.carryDiscussionToPrompt === 'boolean'
            ? raw.carryDiscussionToPrompt
            : DEFAULT_EXECUTION_OPTIONS.carryDiscussionToPrompt;
    const strategyPreset =
        raw?.strategyPreset === 'quality_first'
            || raw?.strategyPreset === 'balanced'
            || raw?.strategyPreset === 'speed_first'
            || raw?.strategyPreset === 'cost_saver'
            ? raw.strategyPreset
            : DEFAULT_EXECUTION_OPTIONS.strategyPreset;

    return {
        discussionMode,
        maxDiscussionThoughts,
        carryDiscussionToPrompt,
        strategyPreset,
    };
}

function normalizeReviewSuggestionSet(raw: unknown): ReviewSuggestionSet | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const filesRaw = Array.isArray(row.files) ? row.files : [];
    const files: ReviewSuggestionSet['files'] = [];
    for (const item of filesRaw) {
        if (!item || typeof item !== 'object') continue;
        const file = item as Record<string, unknown>;
        const filePath = typeof file.filePath === 'string' ? file.filePath.trim() : '';
        const before = typeof file.before === 'string' ? file.before : null;
        const after = typeof file.after === 'string' ? file.after : '';
        const reason = typeof file.reason === 'string' ? file.reason : undefined;
        if (!filePath || !after) continue;
        files.push({ filePath, before, after, reason });
    }

    if (files.length === 0) return null;
    return {
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : new Date().toISOString(),
        sourceReviewHash: typeof row.sourceReviewHash === 'string' ? row.sourceReviewHash : '',
        files,
    };
}

export function TaskDetailsModal({
    task,
    open,
    onOpenChange,
    stream,
    executionOptions,
    onExecutionOptionsChange,
    onExecute,
}: TaskDetailsModalProps) {
    const [view, setView] = useState<'details' | 'logs' | 'changes' | 'live' | 'brainstorm' | 'signoff' | 'preview'>('details');
    const [isRetrying, setIsRetrying] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isApproving, setIsApproving] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editInstructions, setEditInstructions] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [modifyElementFilePath, setModifyElementFilePath] = useState('');
    const [modifyElementDescriptor, setModifyElementDescriptor] = useState('');
    const [modifyElementLine, setModifyElementLine] = useState('');
    const [modifyElementColumn, setModifyElementColumn] = useState('');
    const [modifyElementSelector, setModifyElementSelector] = useState('');
    const [modifyElementHtmlSnippet, setModifyElementHtmlSnippet] = useState('');
    const [modifyElementRequest, setModifyElementRequest] = useState('');
    const [isModifyingElement, setIsModifyingElement] = useState(false);
    const [isReviewing, setIsReviewing] = useState(false);
    const [originalRequestViewMode, setOriginalRequestViewMode] = useState<'text' | 'viewer'>('text');
    const [reviewResultViewMode, setReviewResultViewMode] = useState<'text' | 'viewer'>('text');
    const [isGeneratingReviewSuggestions, setIsGeneratingReviewSuggestions] = useState(false);
    const [isApplyingReviewSuggestions, setIsApplyingReviewSuggestions] = useState(false);
    const [isDiscussionAccordionOpen, setIsDiscussionAccordionOpen] = useState(false);
    const [isBenchmarkLoading, setIsBenchmarkLoading] = useState(false);
    const [taskBenchmark, setTaskBenchmark] = useState<TaskPerformanceBenchmark | null>(null);
    const [draftExecutionOptions, setDraftExecutionOptions] = useState<Required<ExecuteStreamOptions>>(
        DEFAULT_EXECUTION_OPTIONS
    );
    const [clarifyDraftAnswers, setClarifyDraftAnswers] = useState<Record<string, string>>({});
    const [isGeneratingClarify, setIsGeneratingClarify] = useState(false);
    const [isSubmittingClarify, setIsSubmittingClarify] = useState(false);
    const [isAckImpact, setIsAckImpact] = useState(false);
    const [recoveryNote, setRecoveryNote] = useState('');
    const [recoveryMarkdown, setRecoveryMarkdown] = useState<string | null>(null);
    const [isRecoveryLoading, setIsRecoveryLoading] = useState(false);
    const [handoffMarkdown, setHandoffMarkdown] = useState<string | null>(null);
    const [isHandoffLoading, setIsHandoffLoading] = useState(false);
    const [isSpecExpanding, setIsSpecExpanding] = useState(false);

    const { payload: incomingReactGrabPayload, clearPayload: clearIncomingReactGrab } = useIncomingReactGrab();

    useEffect(() => {
        if (!open) {
            setRecoveryNote('');
            setRecoveryMarkdown(null);
            setHandoffMarkdown(null);
        }
    }, [open]);

    /** 다른 태스크/보드에서 모달을 열 때 이전 탭(Logs·Changes 등)이 남아 Original Request가 안 보이는 문제 방지 */
    useEffect(() => {
        if (!open || !task?.id) return;
        setView('details');
        setOriginalRequestViewMode('text');
    }, [open, task?.id]);

    useEffect(() => {
        if (!task || !open) return;
        const previewOk = Boolean(task.project_id) && ['working', 'testing'].includes(task.status);
        if (view === 'preview' && !previewOk) setView('details');
    }, [task?.id, task?.status, task?.project_id, open, view]);

    useEffect(() => {
        if (!incomingReactGrabPayload || !task || !open) return;
        const allowed = ['testing', 'review', 'done'].includes(task.status);
        if (!allowed) return;
        const p = incomingReactGrabPayload;
        if (p.filePath) setModifyElementFilePath(p.filePath);
        const descriptor =
            p.elementDescriptor ??
            ([p.componentName, p.filePath && (p.line != null ? `${p.filePath}:${p.line}` : p.filePath)].filter(Boolean).join(' ').trim() || p.stackString || '');
        setModifyElementDescriptor(descriptor);
        setModifyElementLine(p.line != null ? String(p.line) : '');
        setModifyElementColumn(p.column != null ? String(p.column) : '');
        setModifyElementSelector(p.selector ?? '');
        setModifyElementHtmlSnippet(p.htmlSnippet ?? '');
        setView('changes');
        clearIncomingReactGrab();
    }, [incomingReactGrabPayload, task, open, clearIncomingReactGrab]);

    useEffect(() => {
        if (!task) return;

        const metadataExecutionOptions =
            typeof task.metadata === 'object' && task.metadata !== null
                ? ((task.metadata as Record<string, unknown>).executionOptions as ExecuteStreamOptions | undefined)
                : undefined;

        const next = normalizeExecutionOptions(executionOptions || metadataExecutionOptions);
        setDraftExecutionOptions(next);
    }, [task, executionOptions, open]);

    useEffect(() => {
        if (!open) return;
        setIsDiscussionAccordionOpen(false);
    }, [open, task?.id]);

    const clarifyingGateSig =
        task && typeof task.metadata === 'object' && task.metadata !== null
            ? JSON.stringify(
                  (task.metadata as Record<string, unknown>).clarifyingGate ?? null,
                  ['generatedAt', 'status', 'questions']
              )
            : '';

    useEffect(() => {
        if (!open || !task) return;
        const gate = (task.metadata as Record<string, unknown> | undefined)?.clarifyingGate as
            | { questions?: Array<{ id: string }>; answers?: Record<string, string> }
            | undefined;
        const next: Record<string, string> = {};
        for (const q of gate?.questions || []) {
            next[q.id] = (gate?.answers && gate.answers[q.id]) || '';
        }
        setClarifyDraftAnswers(next);
    }, [open, task?.id, clarifyingGateSig]);

    useEffect(() => {
        if (!open || !task?.id) return;

        let active = true;
        setIsBenchmarkLoading(true);

        void getTaskPerformanceBenchmark(task.id, task.project_id ?? null)
            .then((result) => {
                if (!active) return;
                setTaskBenchmark(result);
            })
            .catch((error) => {
                console.error('Failed to load task benchmark:', error);
                if (!active) return;
                setTaskBenchmark(null);
            })
            .finally(() => {
                if (!active) return;
                setIsBenchmarkLoading(false);
            });

        return () => {
            active = false;
        };
    }, [open, task?.id, task?.project_id]);

    useEffect(() => {
        if (!open || !task) return;
        const qs = (task.metadata as Record<string, unknown> | undefined)?.qaSignoff;
        const allowSignoff =
            Boolean(qs) || ['testing', 'review', 'done'].includes(task.status);
        if (view === 'signoff' && !allowSignoff) {
            setView('details');
        }
    }, [open, task, view]);

    if (!task) return null;

    const metadata = (task.metadata || {}) as Record<string, unknown> & {
        executionOptions?: ExecuteStreamOptions;
        executionDiscussions?: ExecutionDiscussionEntry[];
        agentCollaboration?: OrchestratorCollaborationMap;
        reviewSuggestions?: ReviewSuggestionSet;
        reviewSuggestionsAt?: string;
        reviewSuggestionsAppliedAt?: string;
    };
    const reviewResult = metadata.reviewResult as string | undefined;
    const reviewSuggestionSet = normalizeReviewSuggestionSet(metadata.reviewSuggestions);
    const reviewSuggestionFileChanges: FileChange[] = reviewSuggestionSet
        ? reviewSuggestionSet.files.map((file) => ({
            filePath: file.filePath,
            before: file.before,
            after: file.after,
            isNew: file.before === null,
            agent: 'review-suggestion',
            stepIndex: -1,
        }))
        : [];
    const hasReviewSuggestions = reviewSuggestionFileChanges.length > 0;
    const reviewSuggestionsAt = typeof metadata.reviewSuggestionsAt === 'string' ? metadata.reviewSuggestionsAt : null;
    const reviewSuggestionsAppliedAt = typeof metadata.reviewSuggestionsAppliedAt === 'string'
        ? metadata.reviewSuggestionsAppliedAt
        : null;
    const analysis = metadata.analysis as { complexity?: string; required_agents?: string[]; summary?: string } | undefined;
    const workflow = metadata.workflow as { steps: Array<{ action: string; agent: string }> } | undefined;
    const verification = metadata.verification as { verified: boolean; notes: string } | undefined;
    const qaSignoff = metadata.qaSignoff as QaSignoffStored | undefined;
    const showQaSignoffTab =
        Boolean(qaSignoff) || ['testing', 'review', 'done'].includes(task.status);
    const progress = metadata.progress as ProgressInfo | undefined;
    const fileChanges = metadata.fileChanges as FileChange[] | undefined;
    const defaultModifyFilePath =
        pickPrimaryPageSourceFileFromChanges(fileChanges?.map((fc) => fc.filePath) ?? []) ??
        fileChanges?.[0]?.filePath;
    const isFailed = task.status === 'failed';
    const isReview = task.status === 'review';
    const canEditOrReview = ['testing', 'review', 'done'].includes(task.status);
    const hasChanges = fileChanges && fileChanges.length > 0;
    const persistedExecutionOptions = normalizeExecutionOptions(metadata.executionOptions);
    const executionDiscussions = Array.isArray(metadata.executionDiscussions)
        ? metadata.executionDiscussions
        : [];
    const collaboration = metadata.agentCollaboration;
    const clarifyingGate = metadata.clarifyingGate as
        | {
              version?: number;
              status?: string;
              questions?: Array<{ id: string; prompt: string }>;
              answers?: Record<string, string>;
              note?: string;
              generatedAt?: string;
          }
        | undefined;
    const impactPreview = metadata.impactPreview as
        | {
              summary?: string;
              likelyTouchedPaths?: string[];
              riskLevel?: string;
              assumptions?: string[];
              outOfScopeNote?: string;
              generatedAt?: string;
              parseError?: boolean;
          }
        | undefined;
    const executionPreflight = metadata.executionPreflight as
        | { requiresImpactAck?: boolean; impactAcknowledgedAt?: string | null }
        | undefined;
    const needsImpactAck =
        executionPreflight?.requiresImpactAck === true && !executionPreflight?.impactAcknowledgedAt;

    const canRunExecuteFromModal =
        (task.status === 'planning' || task.status === 'working')
        && Array.isArray(workflow?.steps)
        && workflow.steps.length > 0
        && !needsImpactAck;

    const showPreviewTab = Boolean(task.project_id) && ['working', 'testing'].includes(task.status);
    const specExpansion = metadata.specExpansion as { markdown?: string; generatedAt?: string } | undefined;
    const showRecoveryPanel =
        task.status === 'failed' || task.status === 'testing' || task.status === 'review' || Boolean(metadata.qaPageCheck);
    const showHandoffPanel =
        executionDiscussions.length > 0 || (Array.isArray(fileChanges) && fileChanges.length > 0);

    const handleEditCompleted = async () => {
        if (!editInstructions.trim()) return;
        setIsEditing(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/edit-completed', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id, instructions: editInstructions.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Edit request failed');
            setIsEditModalOpen(false);
            setEditInstructions('');
            setView('changes');
        } catch (error) {
            console.error('Edit completed failed', error);
            setActionError(error instanceof Error ? error.message : '코드 수정 요청에 실패했습니다.');
        } finally {
            setIsEditing(false);
        }
    };

    const handlePasteElementContext = async () => {
        setActionError(null);
        try {
            const text = await navigator.clipboard.readText();
            const parsed = parseReactGrabClipboard(text);
            if (!parsed) {
                setActionError('react-grab으로 복사한 내용이 아닙니다. 미리보기에서 요소에 포커스 후 Cmd+C(또는 Ctrl+C)로 복사한 뒤 다시 시도하세요.');
                return;
            }
            if (parsed.filePath) setModifyElementFilePath(parsed.filePath);
            setModifyElementDescriptor(parsed.elementDescriptor);
            setModifyElementLine(parsed.line != null ? String(parsed.line) : '');
            setModifyElementColumn(parsed.column != null ? String(parsed.column) : '');
            setModifyElementSelector('');
            setModifyElementHtmlSnippet(parsed.htmlSnippet ?? '');
        } catch (e) {
            console.error('Paste element context failed', e);
            setActionError('클립보드를 읽을 수 없습니다. 브라우저에서 클립보드 접근을 허용해 주세요.');
        }
    };

    const handleOpenPreviewForGrab = async () => {
        if (!task?.id) return;
        if (!task.project_id) {
            setActionError('이 태스크에 연결된 프로젝트가 없어 미리보기를 열 수 없습니다.');
            return;
        }
        setActionError(null);
        try {
            const res = await fetch(`/api/project/task-preview-url?taskId=${encodeURIComponent(task.id)}`);
            const data = await res.json();
            if (!res.ok || data.error) throw new Error(data.error || 'Failed to get task preview URL');
            let url = typeof data.url === 'string' ? data.url.trim() : '';
            if (!url) {
                const res2 = await fetch(
                    `/api/project/dev-server-info?projectId=${encodeURIComponent(task.project_id)}`
                );
                const d2 = await res2.json();
                if (res2.ok && !d2.error) {
                    url = (typeof d2.url === 'string' && d2.url.trim()) || `http://localhost:${d2.port ?? 3001}`;
                }
            }
            if (!url) throw new Error('No preview URL');
            window.open(url, 'basalt-preview', 'noopener,noreferrer');
        } catch (e) {
            console.error('Open preview failed', e);
            setActionError('미리보기 URL을 가져오지 못했습니다. 해당 프로젝트 dev 서버가 실행 중인지 확인하세요.');
        }
    };

    const handleModifyElement = async () => {
        if (!modifyElementRequest.trim()) return;
        setIsModifyingElement(true);
        setActionError(null);
        try {
            const parsePositiveInt = (s: string): number | undefined => {
                const t = s.trim();
                if (!t) return undefined;
                const n = parseInt(t, 10);
                if (!Number.isFinite(n) || n < 1) return undefined;
                return n;
            };
            const line = parsePositiveInt(modifyElementLine);
            const column = parsePositiveInt(modifyElementColumn);
            const resolvedModifyFilePath =
                modifyElementFilePath.trim() || defaultModifyFilePath || undefined;
            const res = await fetch('/api/agent/modify-element', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId: task.id,
                    filePath: resolvedModifyFilePath,
                    elementDescriptor: modifyElementDescriptor.trim() || undefined,
                    request: modifyElementRequest.trim(),
                    ...(line != null ? { line } : {}),
                    ...(column != null ? { column } : {}),
                    ...(modifyElementSelector.trim() ? { selector: modifyElementSelector.trim() } : {}),
                    ...(modifyElementHtmlSnippet.trim() ? { htmlSnippet: modifyElementHtmlSnippet.trim() } : {}),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Element modify request failed');
            setModifyElementRequest('');
            setModifyElementDescriptor('');
            setModifyElementLine('');
            setModifyElementColumn('');
            setModifyElementSelector('');
            setModifyElementHtmlSnippet('');
        } catch (error) {
            console.error('Modify element failed', error);
            setActionError(error instanceof Error ? error.message : '요소 수정 요청에 실패했습니다.');
        } finally {
            setIsModifyingElement(false);
        }
    };

    const handleRunReview = async () => {
        setIsReviewing(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/review', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Review failed');
            setView('details');
        } catch (error) {
            console.error('Review failed', error);
            setActionError(error instanceof Error ? error.message : '코드 검토 실행에 실패했습니다.');
        } finally {
            setIsReviewing(false);
        }
    };

    const handleGenerateReviewSuggestions = async () => {
        setIsGeneratingReviewSuggestions(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/review/suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to generate review suggestions');
        } catch (error) {
            console.error('Generate review suggestions failed', error);
            setActionError(error instanceof Error ? error.message : '리뷰 반영안 생성에 실패했습니다.');
        } finally {
            setIsGeneratingReviewSuggestions(false);
        }
    };

    const handleApplyReviewSuggestions = async () => {
        setIsApplyingReviewSuggestions(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/review/apply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to apply review suggestions');
            setView('changes');
        } catch (error) {
            console.error('Apply review suggestions failed', error);
            setActionError(error instanceof Error ? error.message : '리뷰 반영안 적용에 실패했습니다.');
        } finally {
            setIsApplyingReviewSuggestions(false);
        }
    };

    const updateExecutionOptions = (patch: Partial<ExecuteStreamOptions>) => {
        if (!task) return;
        const next = normalizeExecutionOptions({ ...draftExecutionOptions, ...patch });
        setDraftExecutionOptions(next);
        onExecutionOptionsChange?.(task.id, next);
    };

    const handleExecuteWithOptions = () => {
        if (!task) return;

        if (needsImpactAck) {
            setActionError('실행 전에 아래 «영향 범위 확인»을 눌러 주세요.');
            return;
        }

        if (onExecute) {
            onExecute(task.id, draftExecutionOptions);
        } else {
            stream?.start(task.id, 'execute', draftExecutionOptions);
        }
        setView('live');
    };

    const handleGenerateClarify = async () => {
        if (!task) return;
        setIsGeneratingClarify(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/clarify/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'generate failed');
        } catch (e) {
            setActionError(e instanceof Error ? e.message : '질문 생성에 실패했습니다.');
        } finally {
            setIsGeneratingClarify(false);
        }
    };

    const handleSubmitClarify = async () => {
        if (!task) return;
        setIsSubmittingClarify(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/clarify/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id, answers: clarifyDraftAnswers }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'submit failed');
        } catch (e) {
            setActionError(e instanceof Error ? e.message : '답변 저장에 실패했습니다.');
        } finally {
            setIsSubmittingClarify(false);
        }
    };

    const handleSkipClarify = async () => {
        if (!task) return;
        setIsSubmittingClarify(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/clarify/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id, skipped: true }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'skip failed');
        } catch (e) {
            setActionError(e instanceof Error ? e.message : '건너뛰기에 실패했습니다.');
        } finally {
            setIsSubmittingClarify(false);
        }
    };

    const handleAckImpact = async () => {
        if (!task) return;
        setIsAckImpact(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/execution/acknowledge-impact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'ack failed');
        } catch (e) {
            setActionError(e instanceof Error ? e.message : '확인 처리에 실패했습니다.');
        } finally {
            setIsAckImpact(false);
        }
    };

    const handleRecoverySuggestions = async () => {
        if (!task) return;
        setIsRecoveryLoading(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/recovery-suggestions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id, note: recoveryNote.trim() || undefined }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '복구 제안 생성 실패');
            setRecoveryMarkdown(typeof data.markdown === 'string' ? data.markdown : '');
        } catch (e) {
            setActionError(e instanceof Error ? e.message : '복구 제안 생성에 실패했습니다.');
        } finally {
            setIsRecoveryLoading(false);
        }
    };

    const handleHandoffSummary = async () => {
        if (!task) return;
        setIsHandoffLoading(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/handoff-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '핸드오프 요약 실패');
            setHandoffMarkdown(typeof data.markdown === 'string' ? data.markdown : '');
        } catch (e) {
            setActionError(e instanceof Error ? e.message : '핸드오프 요약에 실패했습니다.');
        } finally {
            setIsHandoffLoading(false);
        }
    };

    const handleSpecExpand = async () => {
        if (!task) return;
        setIsSpecExpanding(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/spec-expand', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '스펙 확장 실패');
            /* Realtime으로 task.metadata 갱신됨 — 표시는 다음 페치에서 */
        } catch (e) {
            setActionError(e instanceof Error ? e.message : '스펙 확장에 실패했습니다.');
        } finally {
            setIsSpecExpanding(false);
        }
    };

    const isStreaming = stream?.isActive;

    const handleRetry = async () => {
        setIsRetrying(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/retry', {
                method: 'POST',
                body: JSON.stringify({ taskId: task.id })
            });
            if (!res.ok) throw new Error('Retry request failed');
            onOpenChange(false);
        } catch (error) {
            console.error('Retry failed', error);
            setActionError('재시도에 실패했습니다. 다시 시도해주세요.');
        } finally {
            setIsRetrying(false);
        }
    };

    const handleApprove = async () => {
        setIsApproving(true);
        setActionError(null);
        try {
            const res = await fetch('/api/agent/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId: task.id }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Approve request failed');
            }
            onOpenChange(false);
        } catch (error) {
            console.error('Approve failed', error);
            setActionError('승인에 실패했습니다. 다시 시도해주세요.');
        } finally {
            setIsApproving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm(`"${task.title}" 태스크를 삭제하시겠습니까?\n(관련 로그도 함께 삭제됩니다)`)) return;

        setIsDeleting(true);
        setActionError(null);
        try {
            const { error: logsError } = await supabase
                .from('Execution_Logs')
                .delete()
                .eq('task_id', task.id);

            if (logsError) {
                console.error('Logs delete failed:', logsError);
            }

            const { error } = await supabase.from('Tasks').delete().eq('id', task.id);
            if (error) {
                console.error('Delete failed:', error);
                setActionError('삭제 실패: ' + error.message);
            } else {
                onOpenChange(false);
            }
        } catch (error) {
            console.error('Delete error:', error);
            setActionError('삭제 중 오류가 발생했습니다.');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={`sm:max-w-5xl h-[85vh] flex flex-col p-0 gap-0 transition-all duration-300 ${view === 'brainstorm' ? 'overflow-visible !translate-x-[calc(-50%-190px)]' : 'overflow-hidden !translate-x-[-50%]'}`}
                style={{ overflow: view === 'brainstorm' ? 'visible' : 'hidden' }}
            >
                <div className="flex flex-col h-full w-full overflow-hidden sm:rounded-lg bg-background">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b shrink-0 bg-muted/10">
                        <div className="flex items-center gap-4">
                            <div>
                                <DialogTitle className="text-xl font-semibold leading-none tracking-tight">
                                    {task.title}
                                </DialogTitle>
                                <p className="text-sm text-muted-foreground mt-1">
                                    Status: <span className={`uppercase font-bold ${isFailed ? 'text-red-500' : 'text-primary'}`}>{task.status}</span>
                                    {metadata.retryCount ? <span className="text-xs ml-2">(Retry #{String(metadata.retryCount)})</span> : ''}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    <Badge variant="outline" className="text-[10px]">
                                        Preset: {draftExecutionOptions.strategyPreset}
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px]">
                                        Discussion: {draftExecutionOptions.discussionMode}
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px]">
                                        Thoughts: {draftExecutionOptions.maxDiscussionThoughts}
                                    </Badge>
                                    <Badge
                                        variant={draftExecutionOptions.carryDiscussionToPrompt ? 'default' : 'secondary'}
                                        className="text-[10px]"
                                    >
                                        {draftExecutionOptions.carryDiscussionToPrompt ? 'Prompt Carry On' : 'Prompt Carry Off'}
                                    </Badge>
                                </div>
                            </div>
                            <div className="flex bg-muted rounded-md p-1 gap-1 ml-4">
                                <button
                                    onClick={() => setView('details')}
                                    className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'details' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    aria-pressed={view === 'details'}
                                >
                                    <FileText className="w-3 h-3 inline mr-1" /> Details
                                </button>
                                {showPreviewTab && (
                                    <button
                                        type="button"
                                        onClick={() => setView('preview')}
                                        className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'preview' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        aria-pressed={view === 'preview'}
                                    >
                                        <Monitor className="w-3 h-3 inline mr-1" /> Preview
                                    </button>
                                )}
                                {(isStreaming || (stream && stream.status !== 'idle')) && (
                                    <button
                                        onClick={() => setView('live')}
                                        className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'live' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        aria-pressed={view === 'live'}
                                    >
                                        <Radio className={`w-3 h-3 inline mr-1 ${isStreaming ? 'text-red-500' : ''}`} /> Live
                                        {isStreaming && <span className="ml-1 inline-block w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
                                    </button>
                                )}
                                {hasChanges && (
                                    <button
                                        onClick={() => setView('changes')}
                                        className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'changes' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        aria-pressed={view === 'changes'}
                                    >
                                        <GitCompare className="w-3 h-3 inline mr-1" /> Changes
                                        <span className="ml-1 text-[10px] opacity-60">{fileChanges!.length}</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => setView('brainstorm')}
                                    className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'brainstorm' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    aria-pressed={view === 'brainstorm'}
                                >
                                    <Sparkles className={`w-3 h-3 inline mr-1 text-blue-500`} /> Brainstorm
                                </button>
                                {showQaSignoffTab && (
                                    <button
                                        type="button"
                                        onClick={() => setView('signoff')}
                                        className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'signoff' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        aria-pressed={view === 'signoff'}
                                    >
                                        <ShieldCheck className="w-3 h-3 inline mr-1 text-emerald-600" /> QA
                                    </button>
                                )}
                                <button
                                    onClick={() => setView('logs')}

                                    className={`px-3 py-1 text-xs rounded-sm font-medium transition-all ${view === 'logs' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                    aria-pressed={view === 'logs'}
                                >
                                    <Activity className="w-3 h-3 inline mr-1" /> Logs
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Action Error */}
                    {actionError && (
                        <div className="mx-6 mt-4 p-3 border border-red-300 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm rounded-sm flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            {actionError}
                        </div>
                    )}

                    {/* Body (Scrollable) */}
                    <div className={`flex-1 flex flex-col min-h-0 ${view === 'brainstorm' ? 'overflow-visible' : 'overflow-hidden'}`}>
                        {view === 'live' && stream ? (
                            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                                <LiveProgressPanel stream={stream} />
                            </div>
                        ) : view === 'preview' && showPreviewTab ? (
                            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                                <TaskLivePreview key={`${task.id}-${fileChanges?.length ?? 0}`} taskId={task.id} />
                            </div>
                        ) : view === 'brainstorm' ? (
                            <div className="flex-1 flex flex-col p-4 bg-slate-950 rounded-b-lg" style={{ overflow: 'visible' }}>
                                <div className="flex-1 relative" style={{ overflow: 'visible' }}>
                                    <AgentDiscussion
                                        taskId={task.id}
                                        isActive={task.status === 'planning' || task.status === 'working'}
                                    />
                                </div>

                                <div className="mt-3 p-3 bg-slate-900 border border-slate-700/70 shrink-0">
                                    <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                        <div className="w-0.5 h-2.5 bg-[#3b9eff]" />
                                        Analysis Summary
                                    </h4>
                                    <ScrollArea className="max-h-[80px]">
                                        <p className="text-[11px] text-slate-100/90 leading-relaxed font-medium">
                                            {typeof metadata.analysis === 'object' &&
                                            metadata.analysis !== null &&
                                            'summary' in metadata.analysis
                                                ? String((metadata.analysis as { summary?: unknown }).summary ?? '')
                                                : '에이전트들이 현재 요구사항을 분석하고 최적의 구현 방법을 논의 중입니다.'}
                                        </p>
                                    </ScrollArea>
                                </div>
                            </div>
                        ) : view === 'changes' && hasChanges ? (
                            <div className="flex-1 overflow-hidden flex flex-col">
                                {canEditOrReview && (
                                    <div className="shrink-0 p-4 border-b bg-muted/30 space-y-3">
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">특정 요소 수정 요청</h4>
                                        <p className="text-[11px] text-muted-foreground">
                                            미리보기에서 요소를 선택한 뒤 Cmd+C로 복사 후 붙여넣기하거나, 프로젝트에 react-grab 플러그인을 넣으면 &quot;Basalt로 보내기&quot;로 바로 전송할 수 있습니다.
                                        </p>
                                        <div className="flex flex-wrap gap-3 items-end">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handleOpenPreviewForGrab}
                                                disabled={isModifyingElement || !task.project_id}
                                                className="shrink-0"
                                                title="프로젝트 미리보기를 새 창으로 엽니다. 해당 프로젝트에 react-grab + Basalt 플러그인을 넣으면 요소 선택 후 Basalt로 보내기를 사용할 수 있습니다."
                                            >
                                                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                                                Select Element Preview
                                            </Button>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={handlePasteElementContext}
                                                disabled={isModifyingElement}
                                                className="shrink-0"
                                            >
                                                <ClipboardPaste className="w-3.5 h-3.5 mr-1.5" />
                                                Paste Context
                                            </Button>
                                            <div className="flex flex-col gap-1 min-w-[140px]">
                                                <Label className="text-xs">File</Label>
                                                <select
                                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                                    value={
                                                        modifyElementFilePath || defaultModifyFilePath || ''
                                                    }
                                                    onChange={(e) => setModifyElementFilePath(e.target.value)}
                                                    disabled={isModifyingElement}
                                                >
                                                    {modifyElementFilePath &&
                                                        !fileChanges!.some((f) => f.filePath === modifyElementFilePath) && (
                                                            <option value={modifyElementFilePath}>
                                                                {modifyElementFilePath} (grab)
                                                            </option>
                                                        )}
                                                    {fileChanges!.map((fc, idx) => (
                                                        <option
                                                            key={`${fc.filePath}-${fc.stepIndex ?? ''}-${idx}`}
                                                            value={fc.filePath}
                                                        >
                                                            {idx === 0 ? `${fc.filePath} · 최근 변경` : fc.filePath}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="flex flex-col gap-1 min-w-[160px]">
                                                <Label className="text-xs">Element Description (optional)</Label>
                                                <input
                                                    type="text"
                                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                                    placeholder="예: 타이틀, HeroSection"
                                                    value={modifyElementDescriptor}
                                                    onChange={(e) => setModifyElementDescriptor(e.target.value)}
                                                    disabled={isModifyingElement}
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1 w-14">
                                                <Label className="text-xs">Line</Label>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                                    placeholder="—"
                                                    value={modifyElementLine}
                                                    onChange={(e) => setModifyElementLine(e.target.value)}
                                                    disabled={isModifyingElement}
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1 w-14">
                                                <Label className="text-xs">Col</Label>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                                    placeholder="—"
                                                    value={modifyElementColumn}
                                                    onChange={(e) => setModifyElementColumn(e.target.value)}
                                                    disabled={isModifyingElement}
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1 min-w-[120px] flex-1">
                                                <Label className="text-xs">Selector (optional)</Label>
                                                <input
                                                    type="text"
                                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                                    placeholder="CSS selector"
                                                    value={modifyElementSelector}
                                                    onChange={(e) => setModifyElementSelector(e.target.value)}
                                                    disabled={isModifyingElement}
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                                                <Label className="text-xs">수정 요청</Label>
                                                <input
                                                    type="text"
                                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                                    placeholder="EX) component 요소를 제거해줘"
                                                    value={modifyElementRequest}
                                                    onChange={(e) => setModifyElementRequest(e.target.value)}
                                                    disabled={isModifyingElement}
                                                />
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={handleModifyElement}
                                                disabled={isModifyingElement || !modifyElementRequest.trim()}
                                            >
                                                {isModifyingElement ? 'Modifying...' : 'Request Modify Element'}
                                            </Button>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <Label className="text-xs">HTML snippet (optional)</Label>
                                            <textarea
                                                className="min-h-[52px] rounded-md border border-input bg-background px-2 py-1.5 text-xs font-mono"
                                                placeholder="react-grab이 채운 DOM 일부 — 요소 위치를 LLM에 고정하는 데 도움이 됩니다"
                                                value={modifyElementHtmlSnippet}
                                                onChange={(e) => setModifyElementHtmlSnippet(e.target.value)}
                                                disabled={isModifyingElement}
                                                rows={2}
                                            />
                                        </div>
                                    </div>
                                )}
                                <div className="flex-1 min-h-0 overflow-hidden">
                                    <CodeDiffViewer
                                        fileChanges={fileChanges!}
                                        taskId={canEditOrReview ? task.id : null}
                                    />
                                </div>
                            </div>
                        ) : view === 'changes' && !hasChanges ? (
                            <div className="flex-1 overflow-y-auto p-6 space-y-5">
                                <div className="rounded-md border border-dashed bg-muted/20 p-4 space-y-2">
                                    <h3 className="text-sm font-medium text-foreground">코드 변경 없음</h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        아직 기록된 파일 변경(diff)이 없습니다. 실행이 끝나면 여기에 표시됩니다. Changes 탭을 눌렀을 때 로그 화면으로 잘못 넘어가던 문제를 막기 위한 화면입니다.
                                    </p>
                                    <Button type="button" size="sm" variant="secondary" onClick={() => setView('details')}>
                                        Details로 이동 · Original Request 전체 보기
                                    </Button>
                                </div>
                                {task.description.trim() ? (
                                    <div className="space-y-2">
                                        <h3 className="text-sm font-medium text-muted-foreground">Original Request (요약)</h3>
                                        <div className="p-3 bg-muted/40 rounded-md text-xs text-foreground/90 whitespace-pre-wrap max-h-[200px] overflow-y-auto leading-relaxed">
                                            {task.description.length > 1200
                                                ? `${task.description.slice(0, 1200)}…`
                                                : task.description}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ) : view === 'details' ? (
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {/* Description */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <h3 className="text-sm font-medium text-muted-foreground">Original Request</h3>
                                        <div className="flex items-center gap-1.5">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={originalRequestViewMode === 'text' ? 'secondary' : 'outline'}
                                                onClick={() => setOriginalRequestViewMode('text')}
                                                className="h-7 px-2 text-[11px]"
                                                aria-pressed={originalRequestViewMode === 'text'}
                                                aria-label="원본 요청 텍스트 보기"
                                            >
                                                <FileText className="h-3 w-3 mr-1" />
                                                텍스트
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant={originalRequestViewMode === 'viewer' ? 'secondary' : 'outline'}
                                                onClick={() => setOriginalRequestViewMode('viewer')}
                                                className="h-7 px-2 text-[11px]"
                                                aria-pressed={originalRequestViewMode === 'viewer'}
                                                aria-label="원본 요청 뷰어 보기"
                                            >
                                                <Search className="h-3 w-3 mr-1" />
                                                뷰어
                                            </Button>
                                        </div>
                                    </div>
                                    {originalRequestViewMode === 'viewer' ? (
                                        <MarkdownLikeViewer content={task.description} height={160} />
                                    ) : (
                                        <div className="p-3 bg-muted/40 rounded-md text-sm whitespace-pre-wrap">
                                            {task.description}
                                        </div>
                                    )}
                                </div>

                                {(task.status === 'pending' || task.status === 'planning') && (
                                    <div className="space-y-2 rounded-md border border-dashed p-3 bg-muted/15">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                                태스크 스펙 확장
                                            </h4>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="secondary"
                                                onClick={handleSpecExpand}
                                                disabled={isSpecExpanding}
                                                className="h-7 text-[11px]"
                                            >
                                                <Wand2 className="h-3 w-3 mr-1" />
                                                {isSpecExpanding ? '생성 중…' : 'AC·스모크 시나리오 생성'}
                                            </Button>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            플랜에 합쳐져 실행 품질을 올립니다. «Confirm &amp; Plan» 전에 생성해 두세요.
                                        </p>
                                        {specExpansion?.markdown ? (
                                            <MarkdownLikeViewer content={specExpansion.markdown} height={180} />
                                        ) : null}
                                    </div>
                                )}

                                {task.status === 'pending' && (
                                    <div className="space-y-3 rounded-md border border-blue-200/60 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-900/50 p-4">
                                        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                                            <HelpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                            요구사항 명확화 (선택)
                                        </h3>
                                        <p className="text-xs text-muted-foreground leading-relaxed">
                                            플랜 생성 전에 AI가 애매한 점을 짚어 질문합니다. 답을 저장하면 이후 플랜·실행 프롬프트에 반영됩니다.
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="secondary"
                                                onClick={handleGenerateClarify}
                                                disabled={isGeneratingClarify || isSubmittingClarify}
                                            >
                                                {isGeneratingClarify ? '질문 생성 중…' : '질문 생성'}
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={handleSkipClarify}
                                                disabled={isSubmittingClarify || isGeneratingClarify}
                                            >
                                                명확화 건너뛰기
                                            </Button>
                                        </div>
                                        {clarifyingGate?.note && (
                                            <p className="text-xs text-muted-foreground">{clarifyingGate.note}</p>
                                        )}
                                        {clarifyingGate?.status === 'awaiting_answers' &&
                                            (clarifyingGate.questions?.length || 0) > 0 && (
                                                <div className="space-y-3">
                                                    {clarifyingGate.questions!.map((q) => (
                                                        <div key={q.id} className="space-y-1">
                                                            <Label className="text-xs font-medium">{q.prompt}</Label>
                                                            <textarea
                                                                className="w-full min-h-[72px] rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                                                                value={clarifyDraftAnswers[q.id] ?? ''}
                                                                onChange={(e) =>
                                                                    setClarifyDraftAnswers((prev) => ({
                                                                        ...prev,
                                                                        [q.id]: e.target.value,
                                                                    }))
                                                                }
                                                            />
                                                        </div>
                                                    ))}
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={handleSubmitClarify}
                                                        disabled={isSubmittingClarify}
                                                    >
                                                        {isSubmittingClarify ? '저장 중…' : '답변 저장'}
                                                    </Button>
                                                </div>
                                            )}
                                        {clarifyingGate?.status === 'empty' &&
                                            clarifyingGate.generatedAt &&
                                            (clarifyingGate.questions?.length || 0) === 0 && (
                                                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                                                    추가 질문이 필요 없다고 판단되었습니다. 바로 «Confirm &amp; Plan»을 진행하세요.
                                                </p>
                                            )}
                                        {(clarifyingGate?.status === 'answered' || clarifyingGate?.status === 'skipped') && (
                                            <p className="text-xs text-muted-foreground">
                                                {clarifyingGate.status === 'skipped'
                                                    ? '명확화를 건너뛰었습니다. 플랜을 생성할 수 있습니다.'
                                                    : '답변이 저장되었습니다. 플랜 생성 시 반영됩니다.'}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Code Review Result */}
                                {reviewResult && (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                                <Search className="w-4 h-4" />
                                                코드 검토 결과
                                            </h3>
                                            <div className="flex items-center gap-1.5">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant={reviewResultViewMode === 'text' ? 'secondary' : 'outline'}
                                                    onClick={() => setReviewResultViewMode('text')}
                                                    className="h-7 px-2 text-[11px]"
                                                    aria-pressed={reviewResultViewMode === 'text'}
                                                    aria-label="코드 검토 결과 텍스트 보기"
                                                >
                                                    <FileText className="h-3 w-3 mr-1" />
                                                    텍스트
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant={reviewResultViewMode === 'viewer' ? 'secondary' : 'outline'}
                                                    onClick={() => setReviewResultViewMode('viewer')}
                                                    className="h-7 px-2 text-[11px]"
                                                    aria-pressed={reviewResultViewMode === 'viewer'}
                                                    aria-label="코드 검토 결과 뷰어 보기"
                                                >
                                                    <Search className="h-3 w-3 mr-1" />
                                                    뷰어
                                                </Button>
                                            </div>
                                        </div>
                                        {reviewResultViewMode === 'viewer' ? (
                                            <MarkdownLikeViewer content={reviewResult} height={300} className="bg-card/60" />
                                        ) : (
                                            <div className="p-4 rounded-md border bg-card text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                                                {reviewResult}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Task Performance Benchmark */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium text-muted-foreground">Task Performance Trend</h3>
                                    <div className="rounded-md border bg-card p-4 space-y-3">
                                        <p className="text-xs text-muted-foreground">
                                            현재 태스크 실행 지표를 같은 프로젝트의 최근 완료/실패 태스크 평균과 비교합니다.
                                        </p>
                                        {isBenchmarkLoading ? (
                                            <div className="text-xs text-muted-foreground">비교 지표를 불러오는 중...</div>
                                        ) : !taskBenchmark ? (
                                            <div className="text-xs text-muted-foreground">비교 가능한 baseline 데이터가 아직 충분하지 않습니다.</div>
                                        ) : (
                                            <>
                                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                                                    <div className="rounded-md border p-3">
                                                        <div className="text-[11px] text-muted-foreground">Tokens</div>
                                                        <div className="text-sm font-semibold">
                                                            {taskBenchmark.current.totalTokens.toLocaleString()}
                                                            <span className="ml-1 text-xs text-muted-foreground">
                                                                vs {taskBenchmark.baseline.totalTokens.toLocaleString()}
                                                            </span>
                                                        </div>
                                                        <div className={`text-xs mt-1 ${taskBenchmark.deltaPct.totalTokens <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                            {taskBenchmark.deltaPct.totalTokens > 0 ? '+' : ''}
                                                            {taskBenchmark.deltaPct.totalTokens.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                    <div className="rounded-md border p-3">
                                                        <div className="text-[11px] text-muted-foreground">Lead Time</div>
                                                        <div className="text-sm font-semibold">
                                                            {taskBenchmark.current.leadTimeSeconds}s
                                                            <span className="ml-1 text-xs text-muted-foreground">
                                                                vs {taskBenchmark.baseline.leadTimeSeconds}s
                                                            </span>
                                                        </div>
                                                        <div className={`text-xs mt-1 ${taskBenchmark.deltaPct.leadTimeSeconds <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                            {taskBenchmark.deltaPct.leadTimeSeconds > 0 ? '+' : ''}
                                                            {taskBenchmark.deltaPct.leadTimeSeconds.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                    <div className="rounded-md border p-3">
                                                        <div className="text-[11px] text-muted-foreground">Discussion Calls</div>
                                                        <div className="text-sm font-semibold">
                                                            {taskBenchmark.current.discussionCalls}
                                                            <span className="ml-1 text-xs text-muted-foreground">
                                                                vs {taskBenchmark.baseline.discussionCalls}
                                                            </span>
                                                        </div>
                                                        <div className={`text-xs mt-1 ${taskBenchmark.deltaPct.discussionCalls <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                            {taskBenchmark.deltaPct.discussionCalls > 0 ? '+' : ''}
                                                            {taskBenchmark.deltaPct.discussionCalls.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                    <div className="rounded-md border p-3">
                                                        <div className="text-[11px] text-muted-foreground">LLM Calls</div>
                                                        <div className="text-sm font-semibold">
                                                            {taskBenchmark.current.llmCalls}
                                                            <span className="ml-1 text-xs text-muted-foreground">
                                                                vs {taskBenchmark.baseline.llmCalls}
                                                            </span>
                                                        </div>
                                                        <div className={`text-xs mt-1 ${taskBenchmark.deltaPct.llmCalls <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                            {taskBenchmark.deltaPct.llmCalls > 0 ? '+' : ''}
                                                            {taskBenchmark.deltaPct.llmCalls.toFixed(1)}%
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                                    <Badge variant="outline" className="text-[10px]">
                                                        Current: {taskBenchmark.current.status}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[10px]">
                                                        Baseline Sample: {taskBenchmark.sampleSize}
                                                    </Badge>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Discussion Controls */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium text-muted-foreground">Discussion Controls</h3>
                                    <div className="rounded-md border bg-card p-4 space-y-4">
                                        <div className="grid gap-3 md:grid-cols-4">
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Preset</Label>
                                                <select
                                                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                                    value={draftExecutionOptions.strategyPreset}
                                                    onChange={(e) =>
                                                        updateExecutionOptions({
                                                            strategyPreset: e.target.value as ExecuteStreamOptions['strategyPreset'],
                                                        })
                                                    }
                                                >
                                                    <option value="quality_first">quality_first</option>
                                                    <option value="balanced">balanced</option>
                                                    <option value="speed_first">speed_first</option>
                                                    <option value="cost_saver">cost_saver</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Mode</Label>
                                                <select
                                                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                                    value={draftExecutionOptions.discussionMode}
                                                    onChange={(e) =>
                                                        updateExecutionOptions({
                                                            discussionMode: e.target.value as ExecuteStreamOptions['discussionMode'],
                                                        })
                                                    }
                                                >
                                                    <option value="off">off</option>
                                                    <option value="step_handoff">step_handoff</option>
                                                    <option value="roundtable">roundtable</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Max Thoughts</Label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={6}
                                                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                                    value={draftExecutionOptions.maxDiscussionThoughts}
                                                    onChange={(e) =>
                                                        updateExecutionOptions({
                                                            maxDiscussionThoughts: Number(e.target.value),
                                                        })
                                                    }
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Prompt Carry</Label>
                                                <button
                                                    type="button"
                                                    className={`h-9 w-full rounded-md border px-2 text-sm transition-colors ${
                                                        draftExecutionOptions.carryDiscussionToPrompt
                                                            ? 'border-emerald-500/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                                                            : 'border-input bg-background text-muted-foreground'
                                                    }`}
                                                    onClick={() =>
                                                        updateExecutionOptions({
                                                            carryDiscussionToPrompt:
                                                                !draftExecutionOptions.carryDiscussionToPrompt,
                                                        })
                                                    }
                                                >
                                                    {draftExecutionOptions.carryDiscussionToPrompt ? 'enabled' : 'disabled'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                            <Badge variant="outline" className="text-[10px]">
                                                Saved Preset: {persistedExecutionOptions.strategyPreset}
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px]">
                                                Saved: {persistedExecutionOptions.discussionMode}
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px]">
                                                Saved Thoughts: {persistedExecutionOptions.maxDiscussionThoughts}
                                            </Badge>
                                            <Badge variant="outline" className="text-[10px]">
                                                Saved Carry: {persistedExecutionOptions.carryDiscussionToPrompt ? 'on' : 'off'}
                                            </Badge>
                                        </div>
                                        {canRunExecuteFromModal && (
                                            <div className="flex justify-end">
                                                <Button size="sm" onClick={handleExecuteWithOptions}>
                                                    Execute With Discussion Options
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Discussion Timeline */}
                                <div className="space-y-3">
                                    <button
                                        type="button"
                                        className="flex w-full items-center justify-between rounded-md border bg-card px-3 py-2 text-left transition-colors hover:bg-muted/30"
                                        aria-expanded={isDiscussionAccordionOpen}
                                        aria-controls="execution-discussions-panel"
                                        onClick={() => setIsDiscussionAccordionOpen((prev) => !prev)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-muted-foreground">Execution Discussions</span>
                                            <Badge variant="outline" className="text-[10px]">
                                                {executionDiscussions.length} entries
                                            </Badge>
                                        </div>
                                        <ChevronDown
                                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                                                isDiscussionAccordionOpen ? 'rotate-180' : ''
                                            }`}
                                        />
                                    </button>
                                    {isDiscussionAccordionOpen && (
                                        <div id="execution-discussions-panel">
                                            <ExecutionDiscussionTimeline
                                                entries={executionDiscussions}
                                                carryDiscussionToPrompt={draftExecutionOptions.carryDiscussionToPrompt}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Collaboration Matrix */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-medium text-muted-foreground">Agent Collaboration</h3>
                                    <CollaborationMatrix
                                        title="Execution Collaboration Matrix"
                                        collaboration={collaboration}
                                        emptyMessage="협업 그래프 데이터가 아직 저장되지 않았습니다."
                                    />
                                </div>

                                {/* Error Information Section (If Failed) */}
                                {isFailed && !!metadata.lastError && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-medium text-red-600 flex items-center gap-2">
                                            <span className="bg-red-100 text-red-700 p-1 rounded-sm"><AlertTriangle className="w-3 h-3" /></span>
                                            Error Information
                                        </h3>
                                        <div className="p-4 border border-red-200 rounded-md bg-red-50 dark:bg-red-950/30 dark:border-red-800 space-y-3">
                                            <div className="text-sm">
                                                <span className="font-semibold text-red-700 dark:text-red-400">Error Message:</span>
                                                <p className="mt-1 font-mono text-xs text-red-600 dark:text-red-300 bg-red-100 dark:bg-red-900/50 p-2 rounded">
                                                    {String(metadata.lastError)}
                                                </p>
                                            </div>
                                            <div className="grid grid-cols-2 gap-4 text-xs">
                                                {!!metadata.failedAction && (
                                                    <div>
                                                        <span className="font-semibold text-red-700 dark:text-red-400">Failed Action:</span>
                                                        <span className="ml-1 font-mono">{String(metadata.failedAction)}</span>
                                                    </div>
                                                )}
                                                {!!metadata.failedAgent && (
                                                    <div>
                                                        <span className="font-semibold text-red-700 dark:text-red-400">Failed Agent:</span>
                                                        <span className="ml-1 font-mono">{String(metadata.failedAgent)}</span>
                                                    </div>
                                                )}
                                                {metadata.failedStep !== undefined && (
                                                    <div>
                                                        <span className="font-semibold text-red-700 dark:text-red-400">Failed at Step:</span>
                                                        <span className="ml-1">{Number(metadata.failedStep) + 1}</span>
                                                    </div>
                                                )}
                                                {!!metadata.failedAt && (
                                                    <div>
                                                        <span className="font-semibold text-red-700 dark:text-red-400">Failed At:</span>
                                                        <span className="ml-1">{new Date(String(metadata.failedAt)).toLocaleString()}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Analysis Section (If Available) */}
                                {analysis && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                            <span className="bg-blue-100 text-blue-700 p-1 rounded-sm"><Clock className="w-3 h-3" /></span>
                                            Agent Analysis
                                        </h3>
                                        <div className="p-4 border rounded-md bg-card space-y-2">
                                            <div className="grid grid-cols-2 gap-4 text-xs">
                                                <div>
                                                    <span className="font-semibold text-muted-foreground">Complexity:</span> {analysis.complexity}
                                                </div>
                                                <div>
                                                    <span className="font-semibold text-muted-foreground">Required Agents:</span> {(analysis.required_agents || []).join(', ')}
                                                </div>
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-2 border-t pt-2">
                                                {analysis.summary}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Workflow Section (If Available) */}
                                {workflow && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                            <span className="bg-amber-100 text-amber-700 p-1 rounded-sm"><CheckCircle2 className="w-3 h-3" /></span>
                                            Execution Plan
                                        </h3>

                                        {/* Flowchart Visualization */}
                                        <WorkflowFlowchart
                                            workflow={workflow}
                                            progress={progress}
                                        />

                                        {/* Agent Status Dashboard */}
                                        <AgentStatusDashboard
                                            workflow={workflow}
                                            progress={progress}
                                        />

                                        {/* File Activity Tree */}
                                        <FileActivityTree taskId={task.id} />

                                        {/* Show StepProgress if progress exists, otherwise show static list */}
                                        {progress ? (
                                            <div className="p-4 border rounded-md bg-card">
                                                <StepProgress
                                                    progress={progress}
                                                    workflow={workflow}
                                                />
                                            </div>
                                        ) : (
                                            <div className="rounded-md border bg-card overflow-hidden">
                                                {workflow.steps.map((step, index: number) => (
                                                    <div key={index} className="flex items-center gap-3 p-3 text-sm border-b last:border-0 hover:bg-muted/20">
                                                        <div className="flex h-6 w-6 items-center justify-center rounded-full border bg-background text-xs font-semibold text-muted-foreground shadow-sm shrink-0">
                                                            {index + 1}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-medium truncate">{step.action}</div>
                                                            <div className="text-xs text-muted-foreground">Assigned to: {step.agent}</div>
                                                        </div>
                                                        <Circle className="h-3 w-3 text-muted-foreground/30" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {showHandoffPanel && (
                                    <div className="space-y-3 rounded-md border p-4 bg-muted/10">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h3 className="text-sm font-medium text-muted-foreground">인수인계 요약</h3>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={handleHandoffSummary}
                                                disabled={isHandoffLoading}
                                                className="h-8"
                                            >
                                                {isHandoffLoading ? '생성 중…' : 'AI 요약 생성'}
                                            </Button>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            실행 토론·워크플로·변경 파일을 바탕으로 이슈 트래커나 팀 공유용 한 페이지 요약을 만듭니다.
                                        </p>
                                        {handoffMarkdown ? (
                                            <div className="space-y-2">
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-[11px]"
                                                    onClick={() => {
                                                        void navigator.clipboard.writeText(handoffMarkdown);
                                                    }}
                                                >
                                                    <ClipboardCopy className="h-3 w-3 mr-1" />
                                                    복사
                                                </Button>
                                                <MarkdownLikeViewer content={handoffMarkdown} height={220} />
                                            </div>
                                        ) : null}
                                    </div>
                                )}

                                {showRecoveryPanel && (
                                    <div className="space-y-3 rounded-md border border-amber-200/60 bg-amber-50/30 dark:bg-amber-950/15 dark:border-amber-900/40 p-4">
                                        <h3 className="text-sm font-medium text-foreground">복구 · 다음 시도 가이드</h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            QA·검증 실패나 Dev 오류 후, 태스크에 다시 넣을 프롬프트 초안을 생성합니다.
                                        </p>
                                        <textarea
                                            className="w-full min-h-[56px] rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                                            placeholder="추가로 전달할 맥락 (선택)"
                                            value={recoveryNote}
                                            onChange={(e) => setRecoveryNote(e.target.value)}
                                            disabled={isRecoveryLoading}
                                        />
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={handleRecoverySuggestions}
                                                disabled={isRecoveryLoading}
                                            >
                                                {isRecoveryLoading ? '생성 중…' : '복구 제안 생성'}
                                            </Button>
                                            {recoveryMarkdown ? (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => void navigator.clipboard.writeText(recoveryMarkdown)}
                                                >
                                                    <ClipboardCopy className="h-3 w-3 mr-1" />
                                                    제안 복사
                                                </Button>
                                            ) : null}
                                        </div>
                                        {recoveryMarkdown ? (
                                            <MarkdownLikeViewer content={recoveryMarkdown} height={240} />
                                        ) : null}
                                    </div>
                                )}

                                {task.status === 'planning' && impactPreview?.summary && (
                                    <div
                                        className={`space-y-3 rounded-md border p-4 ${
                                            needsImpactAck
                                                ? 'border-amber-300/80 bg-amber-50/50 dark:bg-amber-950/25 dark:border-amber-800/60'
                                                : 'border-emerald-200/80 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-900/50'
                                        }`}
                                    >
                                        <h3 className="text-sm font-medium flex items-center gap-2">
                                            <ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                                            실행 전 영향 범위 미리보기
                                        </h3>
                                        <p className="text-sm leading-relaxed">{impactPreview.summary}</p>
                                        {impactPreview.likelyTouchedPaths &&
                                            impactPreview.likelyTouchedPaths.length > 0 && (
                                                <div>
                                                    <p className="text-xs font-semibold text-muted-foreground mb-1">
                                                        예상 경로
                                                    </p>
                                                    <ul className="text-xs font-mono space-y-0.5 max-h-32 overflow-y-auto">
                                                        {impactPreview.likelyTouchedPaths.map((p) => (
                                                            <li key={p}>{p}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        <div className="flex flex-wrap items-center gap-2 text-xs">
                                            <Badge
                                                variant="outline"
                                                className={
                                                    impactPreview.riskLevel === 'high'
                                                        ? 'border-red-400 text-red-800 dark:text-red-300'
                                                        : impactPreview.riskLevel === 'low'
                                                          ? 'border-emerald-500 text-emerald-800 dark:text-emerald-300'
                                                          : 'border-amber-500 text-amber-900 dark:text-amber-200'
                                                }
                                            >
                                                위험도: {impactPreview.riskLevel || 'medium'}
                                            </Badge>
                                            {impactPreview.parseError && (
                                                <Badge variant="destructive" className="text-[10px]">
                                                    미리보기 품질 낮음
                                                </Badge>
                                            )}
                                            {impactPreview.generatedAt && (
                                                <span className="text-muted-foreground">
                                                    생성: {new Date(impactPreview.generatedAt).toLocaleString()}
                                                </span>
                                            )}
                                        </div>
                                        {impactPreview.assumptions && impactPreview.assumptions.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold text-muted-foreground mb-1">가정</p>
                                                <ul className="text-xs list-disc pl-4 space-y-0.5">
                                                    {impactPreview.assumptions.map((a, i) => (
                                                        <li key={i}>{a}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {impactPreview.outOfScopeNote && (
                                            <p className="text-xs text-muted-foreground border-t pt-2">
                                                범위 밖: {impactPreview.outOfScopeNote}
                                            </p>
                                        )}
                                        {needsImpactAck ? (
                                            <Button
                                                type="button"
                                                size="sm"
                                                className="bg-amber-600 hover:bg-amber-700 text-white"
                                                onClick={handleAckImpact}
                                                disabled={isAckImpact}
                                            >
                                                {isAckImpact ? '처리 중…' : '영향 범위 확인 — 실행 허용'}
                                            </Button>
                                        ) : (
                                            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                                                확인 완료. Start Dev / Execute를 진행할 수 있습니다.
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Verification Section (If Available) */}
                                {verification && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-medium text-muted-foreground">Verification Results</h3>
                                        <div className={`p-3 rounded-md border text-sm ${verification.verified ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                                            <p className="font-semibold">{verification.verified ? 'Verified Successfully' : 'Verification Failed'}</p>
                                            <p className="text-xs mt-1">{verification.notes}</p>
                                        </div>
                                    </div>
                                )}

                                {(reviewResult || hasReviewSuggestions) && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                                            <CheckCircle2 className="w-4 h-4" />
                                            리뷰 반영 (미리보기 + 승인)
                                        </h3>
                                        <div className="rounded-md border bg-card p-4 space-y-3">
                                            <p className="text-xs text-muted-foreground">
                                                코드 리뷰 결과를 기준으로 수정안을 생성하고, diff를 확인한 뒤 승인 시 실제 파일에 반영합니다.
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={handleGenerateReviewSuggestions}
                                                    disabled={isGeneratingReviewSuggestions || !reviewResult || !canEditOrReview}
                                                >
                                                    {isGeneratingReviewSuggestions ? '반영안 생성 중...' : '반영안 생성'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    onClick={handleApplyReviewSuggestions}
                                                    disabled={isApplyingReviewSuggestions || !hasReviewSuggestions || !canEditOrReview}
                                                >
                                                    {isApplyingReviewSuggestions ? '반영 적용 중...' : '승인 후 반영'}
                                                </Button>
                                                <Badge variant="outline" className="text-[10px]">
                                                    Suggestions: {reviewSuggestionFileChanges.length}
                                                </Badge>
                                                {reviewSuggestionsAt && (
                                                    <Badge variant="outline" className="text-[10px]">
                                                        Generated: {new Date(reviewSuggestionsAt).toLocaleString()}
                                                    </Badge>
                                                )}
                                                {reviewSuggestionsAppliedAt && (
                                                    <Badge variant="outline" className="text-[10px]">
                                                        Last Applied: {new Date(reviewSuggestionsAppliedAt).toLocaleString()}
                                                    </Badge>
                                                )}
                                            </div>
                                            {hasReviewSuggestions ? (
                                                <div className="rounded-md border overflow-hidden h-[360px]">
                                                    <CodeDiffViewer fileChanges={reviewSuggestionFileChanges} />
                                                </div>
                                            ) : (
                                                <div className="text-xs text-muted-foreground">
                                                    아직 생성된 반영안이 없습니다. 먼저 `반영안 생성`을 눌러주세요.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {!analysis && !workflow && (
                                    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                        <Clock className="h-8 w-8 mb-2 opacity-20" />
                                        <p className="text-sm">No plan generated yet.</p>
                                        <p className="text-xs">Click &quot;Confirm &amp; Plan&quot; to generate.</p>
                                    </div>
                                )}
                            </div>
                        ) : view === 'signoff' ? (
                            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-8">
                                {!qaSignoff ? (
                                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center space-y-2">
                                        <ShieldCheck className="h-10 w-10 opacity-25" />
                                        <p className="text-sm">검수 데이터가 아직 없습니다.</p>
                                        <p className="text-xs max-w-md">
                                            Dev 실행이 끝나면 Test 칸반으로 넘어가기 직전에 QA 스모크·캡처·검수 요약이 기록됩니다. 이 메시지가 보이면 아직 해당 파이프라인이 끝나지 않았거나(실행 중)·실패했을 수 있습니다. 대상 앱 dev 서버(예: 3001)와 agent-browser가 필요합니다.
                                        </p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-2">
                                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                                최종 판정
                                            </h3>
                                            <p className="text-sm leading-relaxed border rounded-md p-3 bg-muted/30">
                                                {qaSignoff.finalVerdictKo}
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <h3 className="text-sm font-semibold text-muted-foreground">검수 요약</h3>
                                            <pre className="whitespace-pre-wrap text-xs leading-relaxed border rounded-md p-3 bg-muted/20 font-sans">
                                                {qaSignoff.narrativeKo}
                                            </pre>
                                        </div>
                                        <div className="space-y-2">
                                            <h3 className="text-sm font-semibold text-muted-foreground">대상 URL · 시각</h3>
                                            <p className="text-xs text-muted-foreground break-all">{qaSignoff.targetUrl}</p>
                                            <p className="text-[10px] text-muted-foreground">
                                                기록 시각: {new Date(qaSignoff.checkedAt).toLocaleString()}
                                            </p>
                                        </div>
                                        {qaSignoff.incidents.length > 0 && (
                                            <div className="space-y-2">
                                                <h3 className="text-sm font-semibold text-muted-foreground">이슈 · 보정 기록</h3>
                                                <ul className="space-y-2">
                                                    {qaSignoff.incidents.map((inc, idx) => (
                                                        <li
                                                            key={`${inc.source}-${idx}-${inc.title.slice(0, 24)}`}
                                                            className="text-xs border rounded-md p-3 bg-background"
                                                        >
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <Badge variant="outline" className="text-[10px]">
                                                                    {inc.source}
                                                                </Badge>
                                                                <span className="font-medium">{inc.title}</span>
                                                            </div>
                                                            <p className="text-muted-foreground whitespace-pre-wrap">{inc.detailKo}</p>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        <div className="space-y-3">
                                            <h3 className="text-sm font-semibold text-muted-foreground">스크린샷 (agent-browser)</h3>
                                            {qaSignoff.artifactSlots.length === 0 ? (
                                                <p className="text-xs text-muted-foreground">
                                                    저장된 캡처가 없습니다. 검증 통과 시 브라우저 도구가 있어야 복사됩니다. 프로젝트 경로에{' '}
                                                    <code className="text-[10px] bg-muted px-1 rounded">.basalt/basalt-qa/{task.id}/</code>{' '}
                                                    가 생성되는지 확인하세요.
                                                </p>
                                            ) : (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {QA_ARTIFACT_SLOTS.filter((s) => qaSignoff.artifactSlots.includes(s)).map((slot) => (
                                                        <div key={slot} className="space-y-1">
                                                            <p className="text-xs font-medium text-muted-foreground">
                                                                {qaSlotLabelKo(slot)}
                                                            </p>
                                                            <div className="rounded-md border bg-muted/10 overflow-hidden">
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={`/api/project/qa-artifact?taskId=${encodeURIComponent(task.id)}&slot=${slot}&t=${encodeURIComponent(qaSignoff.checkedAt)}`}
                                                                    alt={`QA ${slot}`}
                                                                    className="w-full h-auto max-h-[min(520px,70vh)] object-contain object-top bg-neutral-950/5 dark:bg-neutral-950/40"
                                                                />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 h-full overflow-hidden">
                                <LogViewer taskId={task.id} />
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between p-4 bg-muted/20 border-t shrink-0">
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={isDeleting}
                        >
                            <Trash2 className={`mr-2 h-4 w-4 ${isDeleting ? 'animate-pulse' : ''}`} />
                            {isDeleting ? 'deleting...' : 'delete task'}
                        </Button>
                        <div className="flex gap-2">
                            {isFailed && (
                                <Button
                                    onClick={handleRetry}
                                    disabled={isRetrying}
                                    className="bg-red-600 hover:bg-red-700"
                                >
                                    <RotateCcw className={`mr-2 h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
                                    {isRetrying ? 'Retrying...' : 'Retry Task'}
                                </Button>
                            )}
                            {isReview && (
                                <Button
                                    onClick={handleApprove}
                                    disabled={isApproving}
                                    className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                    <ThumbsUp className={`mr-2 h-4 w-4 ${isApproving ? 'animate-pulse' : ''}`} />
                                    {isApproving ? 'Approving...' : 'Approve'}
                                </Button>
                            )}
                            {canEditOrReview && hasChanges && (
                                <Button
                                    variant="outline"
                                    onClick={() => setIsEditModalOpen(true)}
                                    disabled={isEditing}
                                >
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Request Code Edit
                                </Button>
                            )}
                            {canEditOrReview && (hasChanges || task.description) && (
                                <Button
                                    variant="outline"
                                    onClick={handleRunReview}
                                    disabled={isReviewing}
                                >
                                    <Search className={`mr-2 h-4 w-4 ${isReviewing ? 'animate-pulse' : ''}`} />
                                    {isReviewing ? '검토 중...' : 'Code Review'}
                                </Button>
                            )}
                            <Button onClick={() => onOpenChange(false)}>Close</Button>
                        </div>
                    </div>
                </div>

                {/* External Portal Target for Brainstorm Chat */}
                {view === 'brainstorm' && (
                    <div id="agent-discussion-chat-portal" className="absolute top-0 -right-[400px] w-[380px] h-full pointer-events-none" />
                )}
            </DialogContent>
        </Dialog>

            {/* Edit completed code modal (sibling to avoid nested dialog issues) */}
            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Request Code Edit</DialogTitle>
                        <DialogDescription>
                            완료된 결과물에 적용할 수정 지시사항을 입력하세요.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="edit-instructions">수정 지시사항</Label>
                            <textarea
                                id="edit-instructions"
                                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                placeholder="EX) Increase the font size of the title"
                                value={editInstructions}
                                onChange={(e) => setEditInstructions(e.target.value)}
                                disabled={isEditing}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsEditModalOpen(false)} disabled={isEditing}>
                            취소
                        </Button>
                        <Button onClick={handleEditCompleted} disabled={isEditing || !editInstructions.trim()}>
                            {isEditing ? '수정 중...' : '수정 요청'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
