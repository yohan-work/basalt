'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen } from 'lucide-react';

interface LogEntry {
    id: string;
    message: string;
    metadata?: {
        args?: any[];
        type?: string;
    };
}

interface FileActivity {
    path: string;
    type: 'read' | 'write';
    timestamp?: string;
}

interface TreeNode {
    name: string;
    path: string;
    isFolder: boolean;
    children: TreeNode[];
    activities: Array<{ type: 'read' | 'write' }>;
}

interface FileActivityTreeProps {
    taskId: string;
}

// 파일 경로를 트리 구조로 변환
function buildFileTree(activities: FileActivity[]): TreeNode[] {
    const root: TreeNode[] = [];

    activities.forEach(activity => {
        const parts = activity.path.split('/').filter(Boolean);
        let currentLevel = root;

        parts.forEach((part, index) => {
            const isFile = index === parts.length - 1;
            const existingNode = currentLevel.find(n => n.name === part);

            if (existingNode) {
                if (isFile) {
                    existingNode.activities.push({ type: activity.type });
                }
                currentLevel = existingNode.children;
            } else {
                const newNode: TreeNode = {
                    name: part,
                    path: parts.slice(0, index + 1).join('/'),
                    isFolder: !isFile,
                    children: [],
                    activities: isFile ? [{ type: activity.type }] : [],
                };
                currentLevel.push(newNode);
                currentLevel = newNode.children;
            }
        });
    });

    return root;
}

// 트리 노드 컴포넌트
function TreeNodeComponent({ node, level = 0 }: { node: TreeNode; level?: number }) {
    const [isOpen, setIsOpen] = useState(true);

    const hasRead = node.activities.some(a => a.type === 'read');
    const hasWrite = node.activities.some(a => a.type === 'write');

    return (
        <div>
            <div
                className={`
                    flex items-center gap-1 py-0.5 px-1 rounded text-xs cursor-pointer
                    hover:bg-muted/50 transition-colors
                    ${hasWrite ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}
                    ${hasRead && !hasWrite ? 'text-blue-600 dark:text-blue-400' : ''}
                `}
                style={{ paddingLeft: `${level * 12 + 4}px` }}
                onClick={() => node.isFolder && setIsOpen(!isOpen)}
            >
                {/* 접기/펼치기 아이콘 */}
                {node.isFolder ? (
                    isOpen ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                    ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    )
                ) : (
                    <span className="w-3" />
                )}

                {/* 폴더/파일 아이콘 */}
                {node.isFolder ? (
                    isOpen ? (
                        <FolderOpen className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    ) : (
                        <Folder className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )
                ) : (
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                )}

                {/* 파일명 */}
                <span className="truncate">{node.name}</span>

                {/* 활동 표시 */}
                {!node.isFolder && (
                    <span className="ml-auto flex gap-0.5">
                        {hasRead && <span title="Read">📖</span>}
                        {hasWrite && <span title="Write">✏️</span>}
                    </span>
                )}
            </div>

            {/* 자식 노드 */}
            {node.isFolder && isOpen && (
                <div>
                    {node.children
                        .sort((a, b) => {
                            // 폴더 우선, 그 다음 이름순
                            if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
                            return a.name.localeCompare(b.name);
                        })
                        .map(child => (
                            <TreeNodeComponent key={child.path} node={child} level={level + 1} />
                        ))}
                </div>
            )}
        </div>
    );
}

export function FileActivityTree({ taskId }: FileActivityTreeProps) {
    const [logs, setLogs] = useState<LogEntry[]>([]);

    useEffect(() => {
        const fetchLogs = async () => {
            const { data } = await supabase
                .from('Execution_Logs')
                .select('id, message, metadata')
                .eq('task_id', taskId)
                .order('created_at', { ascending: true });

            if (data) setLogs(data);
        };

        fetchLogs();

        // 실시간 구독
        const channel = supabase
            .channel(`file-activity-${taskId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'Execution_Logs',
                    filter: `task_id=eq.${taskId}`,
                },
                (payload) => {
                    setLogs((prev) => [...prev, payload.new as LogEntry]);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [taskId]);

    // 로그에서 파일 활동 추출
    const fileActivities = useMemo(() => {
        const activities: FileActivity[] = [];

        logs.forEach(log => {
            if (log.metadata?.type !== 'ACTION') return;

            const message = log.message;
            const args = log.metadata?.args;

            if (!args || args.length === 0) return;

            // read_codebase 또는 write_code 액션 감지
            if (message.includes('read_codebase') && typeof args[0] === 'string') {
                activities.push({ path: args[0], type: 'read' });
            } else if (message.includes('write_code') && typeof args[0] === 'string') {
                activities.push({ path: args[0], type: 'write' });
            }
        });

        return activities;
    }, [logs]);

    const fileTree = useMemo(() => buildFileTree(fileActivities), [fileActivities]);

    if (fileActivities.length === 0) {
        return null;
    }

    const readCount = fileActivities.filter(a => a.type === 'read').length;
    const writeCount = fileActivities.filter(a => a.type === 'write').length;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">File Activity</span>
                <div className="flex gap-2 text-[10px] text-muted-foreground">
                    {readCount > 0 && <span>📖 {readCount} read</span>}
                    {writeCount > 0 && <span>✏️ {writeCount} write</span>}
                </div>
            </div>
            <div className="border rounded-md bg-muted/20 p-2 max-h-[200px] overflow-y-auto">
                {fileTree.map(node => (
                    <TreeNodeComponent key={node.path} node={node} />
                ))}
            </div>
        </div>
    );
}
