
'use client';

import { useState, useEffect } from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';
import { FileText, FilePlus, FileEdit as FileEditIcon, ChevronRight, Pencil, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiErrorText, parseResponseAsJson } from '@/lib/fetch-json';

export interface FileChange {
    filePath: string;
    before: string | null;
    after: string;
    isNew: boolean;
    agent: string;
    stepIndex: number;
}

interface CodeDiffViewerProps {
    fileChanges: FileChange[];
    /** When set, show "Edit" to apply direct text edits (no LLM). Simple text changes only. */
    taskId?: string | null;
    /** Called after a direct patch is applied (e.g. to refetch task). Optional if using realtime. */
    onAppliedEdit?: () => void;
}

export function CodeDiffViewer({ fileChanges, taskId, onAppliedEdit }: CodeDiffViewerProps) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [isDark, setIsDark] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editContent, setEditContent] = useState('');
    const [isPatching, setIsPatching] = useState(false);
    const [patchError, setPatchError] = useState<string | null>(null);

    useEffect(() => {
        setIsDark(document.documentElement.classList.contains('dark'));
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains('dark'));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    if (!fileChanges || fileChanges.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileText className="h-8 w-8 mb-2 opacity-20" />
                <p className="text-sm">파일 변경 내역이 없습니다.</p>
            </div>
        );
    }

    const selected = fileChanges[selectedIndex];
    const newFilesCount = fileChanges.filter(f => f.isNew).length;
    const modifiedCount = fileChanges.filter(f => !f.isNew).length;

    const canDirectEdit = Boolean(taskId);

    const startEdit = () => {
        setEditContent(selected.after);
        setEditMode(true);
        setPatchError(null);
    };
    const cancelEdit = () => {
        setEditMode(false);
        setPatchError(null);
    };
    const applyPatch = async () => {
        if (!taskId) return;
        setIsPatching(true);
        setPatchError(null);
        try {
            const res = await fetch('/api/agent/patch-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId,
                    filePath: selected.filePath,
                    content: editContent,
                }),
            });
            const data = await parseResponseAsJson(res);
            if (!res.ok) throw new Error(apiErrorText(data, 'Patch failed'));
            setEditMode(false);
            onAppliedEdit?.();
        } catch (e) {
            setPatchError(e instanceof Error ? e.message : 'Failed to apply edit');
        } finally {
            setIsPatching(false);
        }
    };

    // When user switches to another file in the list while in edit mode, load that file's content
    useEffect(() => {
        if (editMode && selected) setEditContent(selected.after);
    }, [editMode, selectedIndex]);

    // Extract file name from path
    const getFileName = (filePath: string) => {
        const parts = filePath.split('/');
        return parts[parts.length - 1];
    };

    const getDirPath = (filePath: string) => {
        const parts = filePath.split('/');
        if (parts.length <= 1) return '';
        return parts.slice(0, -1).join('/') + '/';
    };

    const darkStyles = {
        variables: {
            dark: {
                diffViewerBackground: '#0a0a0a',
                diffViewerColor: '#fafafa',
                addedBackground: '#0d2818',
                addedColor: '#4ade80',
                removedBackground: '#2d0a0a',
                removedColor: '#f87171',
                wordAddedBackground: '#166534',
                wordRemovedBackground: '#991b1b',
                addedGutterBackground: '#0d2818',
                removedGutterBackground: '#2d0a0a',
                gutterBackground: '#111111',
                gutterBackgroundDark: '#0a0a0a',
                highlightBackground: '#1a1a2e',
                highlightGutterBackground: '#1a1a2e',
                codeFoldGutterBackground: '#1a1a1a',
                codeFoldBackground: '#1a1a1a',
                emptyLineBackground: '#0a0a0a',
                gutterColor: '#a0a0a0',
                addedGutterColor: '#4ade80',
                removedGutterColor: '#f87171',
                codeFoldContentColor: '#a0a0a0',
                diffViewerTitleBackground: '#111111',
                diffViewerTitleColor: '#fafafa',
                diffViewerTitleBorderColor: '#2a2a2a',
            },
        },
    };

    const lightStyles = {
        variables: {
            light: {
                diffViewerBackground: '#ffffff',
                diffViewerColor: '#000000',
                addedBackground: '#e6ffec',
                addedColor: '#24292f',
                removedBackground: '#ffebe9',
                removedColor: '#24292f',
                wordAddedBackground: '#abf2bc',
                wordRemovedBackground: '#ff8182',
                addedGutterBackground: '#ccffd8',
                removedGutterBackground: '#ffd7d5',
                gutterBackground: '#f6f8fa',
                gutterBackgroundDark: '#f0f0f0',
                highlightBackground: '#fffbdd',
                highlightGutterBackground: '#fff5b1',
                codeFoldGutterBackground: '#f6f8fa',
                codeFoldBackground: '#f6f8fa',
                emptyLineBackground: '#ffffff',
                gutterColor: '#636c76',
                addedGutterColor: '#116329',
                removedGutterColor: '#82071e',
                codeFoldContentColor: '#636c76',
                diffViewerTitleBackground: '#f6f8fa',
                diffViewerTitleColor: '#000000',
                diffViewerTitleBorderColor: '#e0e0e0',
            },
        },
    };

    return (
        <div className="flex h-full min-h-0">
            {/* File List Sidebar */}
            <div className="w-[240px] shrink-0 border-r border-border flex flex-col">
                <div className="p-3 border-b border-border bg-muted/30">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Changed Files
                    </h4>
                    <div className="flex gap-2 mt-1.5">
                        {newFilesCount > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-700 border-green-300 dark:text-green-300 dark:border-green-700">
                                +{newFilesCount} new
                            </Badge>
                        )}
                        {modifiedCount > 0 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-700 border-amber-300 dark:text-amber-300 dark:border-amber-700">
                                ~{modifiedCount} modified
                            </Badge>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <div className="py-1">
                        {fileChanges.map((change, index) => (
                            <button
                                key={`${change.filePath}-${index}`}
                                onClick={() => setSelectedIndex(index)}
                                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${selectedIndex === index
                                        ? 'bg-primary/10 text-primary border-l-2 border-primary'
                                        : 'hover:bg-muted/50 border-l-2 border-transparent'
                                    }`}
                            >
                                {change.isNew ? (
                                    <FilePlus className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                ) : (
                                    <FileEditIcon className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium truncate">{getFileName(change.filePath)}</div>
                                    <div className="text-[10px] text-muted-foreground truncate">{getDirPath(change.filePath)}</div>
                                </div>
                                {selectedIndex === index && (
                                    <ChevronRight className="h-3 w-3 shrink-0 text-primary" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Diff Viewer */}
            <div className="flex-1 min-w-0 flex flex-col">
                <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        {selected.isNew ? (
                            <Badge variant="outline" className="text-[10px] text-green-700 border-green-300 dark:text-green-300 dark:border-green-700">NEW</Badge>
                        ) : (
                            <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 dark:text-amber-300 dark:border-amber-700">MODIFIED</Badge>
                        )}
                        <span className="font-mono text-xs">{selected.filePath}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {canDirectEdit && !editMode && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={startEdit}
                                title="간단한 텍스트/코드 수정을 직접 적용합니다. 스타일·구조 변경은 아래 '특정 요소 수정 요청'을 사용하세요."
                            >
                                <Pencil className="w-3 h-3 mr-1" />
                                Edit in place
                            </Button>
                        )}
                        {!editMode && (
                            <span className="text-[10px] text-muted-foreground">
                                by {selected.agent} &middot; step {selected.stepIndex + 1}
                            </span>
                        )}
                    </div>
                </div>
                {editMode ? (
                    <div className="flex-1 flex flex-col min-h-0 p-2">
                        <p className="text-[11px] text-muted-foreground mb-2">
                            간단한 텍스트 수정만 적용됩니다. 스타일·구조 변경은 취소 후 &quot;특정 요소 수정 요청&quot;을 사용하세요.
                        </p>
                        {patchError && (
                            <div className="mb-2 text-xs text-red-600 dark:text-red-400" role="alert">
                                {patchError}
                            </div>
                        )}
                        <textarea
                            className="flex-1 min-h-[200px] w-full font-mono text-xs p-3 rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            spellCheck={false}
                            aria-label="Edit file content"
                        />
                        <div className="flex gap-2 mt-2 shrink-0">
                            <Button size="sm" onClick={applyPatch} disabled={isPatching}>
                                <Check className="w-3.5 h-3.5 mr-1" />
                                {isPatching ? 'Applying...' : 'Save'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelEdit} disabled={isPatching}>
                                <X className="w-3.5 h-3.5 mr-1" />
                                Cancel
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        <ReactDiffViewer
                            oldValue={selected.before || ''}
                            newValue={selected.after}
                            splitView={false}
                            useDarkTheme={isDark}
                            leftTitle={selected.isNew ? undefined : 'Before'}
                            rightTitle={selected.isNew ? 'New File' : 'After'}
                            compareMethod={DiffMethod.WORDS}
                            styles={isDark ? darkStyles : lightStyles}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
