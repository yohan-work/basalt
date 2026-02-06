
import { TaskBoard, TaskBoardItem, TaskStatus } from '@/lib/team-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface KanbanBoardProps {
    board: TaskBoard;
}

export function KanbanBoard({ board }: KanbanBoardProps) {
    const columns: { id: keyof TaskBoard, title: string, color: string }[] = [
        { id: 'todo', title: 'To Do', color: 'bg-slate-100 dark:bg-slate-900' },
        { id: 'in_progress', title: 'In Progress', color: 'bg-blue-50 dark:bg-blue-950/20' },
        { id: 'done', title: 'Done', color: 'bg-green-50 dark:bg-green-950/20' }
    ];

    return (
        <Card className="h-full flex flex-col">
            <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">📋 Shared Task Board</CardTitle>
            </CardHeader>
            <CardContent className="h-full overflow-x-auto">
                <div className="flex gap-4 h-full min-w-[600px]">
                    {columns.map(col => (
                        <div key={col.id} className={`flex-1 flex flex-col gap-3 rounded-lg p-3 ${col.color}`}>
                            <div className="font-semibold text-xs uppercase tracking-wider text-muted-foreground flex justify-between">
                                {col.title}
                                <span className="bg-background/50 px-2 rounded-full text-[10px]">
                                    {board[col.id].length}
                                </span>
                            </div>
                            <div className="flex-1 space-y-2 overflow-y-auto max-h-[400px]">
                                {board[col.id].length === 0 && (
                                    <div className="text-xs text-muted-foreground text-center py-4 italic">
                                        Empty
                                    </div>
                                )}
                                {board[col.id].map(item => (
                                    <TaskCard key={item.id} item={item} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function TaskCard({ item }: { item: TaskBoardItem }) {
    return (
        <div className="bg-background shadow-sm border rounded-md p-3 text-sm space-y-2">
            <div className="font-medium leading-snug">{item.description}</div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                    {item.assignee ? (
                        <Badge variant="secondary" className="text-[10px] h-5 px-1">
                            {item.assignee}
                        </Badge>
                    ) : (
                        <span className="opacity-50">Unassigned</span>
                    )}
                </div>
                <div className="font-mono text-[10px] opacity-70">
                    #{item.id}
                </div>
            </div>
        </div>
    );
}
