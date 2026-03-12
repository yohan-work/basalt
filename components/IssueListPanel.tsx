'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Github, Loader2, FileText } from 'lucide-react';

interface GitHubIssue {
    number: number;
    title: string;
    body: string | null;
    url: string;
    state: string;
}

interface IssueListPanelProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    projectId: string | null;
    onTaskCreated?: () => void;
}

export function IssueListPanel({ open, onOpenChange, projectId, onTaskCreated }: IssueListPanelProps) {
    const [issues, setIssues] = useState<GitHubIssue[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [creatingNumber, setCreatingNumber] = useState<number | null>(null);

    useEffect(() => {
        if (!open || !projectId) {
            setIssues([]);
            setMessage(null);
            return;
        }
        setLoading(true);
        setMessage(null);
        fetch(`/api/project/issues?projectId=${encodeURIComponent(projectId)}`)
            .then((res) => res.json())
            .then((data) => {
                if (data.issues) setIssues(data.issues);
                if (data.message) setMessage(data.message);
            })
            .catch(() => setIssues([]))
            .finally(() => setLoading(false));
    }, [open, projectId]);

    const handleCreateTask = async (issue: GitHubIssue) => {
        if (!projectId) return;
        setCreatingNumber(issue.number);
        try {
            const res = await fetch('/api/agent/create-task-from-issue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId, issueNumber: issue.number }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create task');
            onTaskCreated?.();
            onOpenChange(false);
        } catch (err) {
            console.error(err);
            alert(err instanceof Error ? err.message : 'Failed to create task from issue');
        } finally {
            setCreatingNumber(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Github className="h-5 w-5" />
                        GitHub 이슈
                    </DialogTitle>
                    <DialogDescription>
                        열린 이슈를 태스크로 가져옵니다. GITHUB_TOKEN이 설정되어 있어야 합니다.
                    </DialogDescription>
                </DialogHeader>
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                ) : message && issues.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">{message}</p>
                ) : issues.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">열린 이슈가 없습니다.</p>
                ) : (
                    <ScrollArea className="max-h-[60vh] pr-2">
                        <ul className="space-y-2">
                            {issues.map((issue) => (
                                <li
                                    key={issue.number}
                                    className="flex items-start justify-between gap-2 rounded-md border p-3"
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-sm truncate" title={issue.title}>
                                            #{issue.number} {issue.title}
                                        </p>
                                        {issue.body && (
                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                {issue.body}
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleCreateTask(issue)}
                                        disabled={creatingNumber !== null}
                                    >
                                        {creatingNumber === issue.number ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <>
                                                <FileText className="h-3 w-3 mr-1" />
                                                태스크로 만들기
                                            </>
                                        )}
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </ScrollArea>
                )}
            </DialogContent>
        </Dialog>
    );
}
