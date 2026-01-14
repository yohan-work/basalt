
import { KanbanBoard } from '@/components/KanbanBoard';
import { LogViewer } from '@/components/LogViewer';
import { Separator } from '@/components/ui/separator';

export default function Home() {
  return (
    <main className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header is handled inside KanbanBoard for now or can be global */}

      {/* Kanban Section - Top 60% */}
      <div className="flex-[3] min-h-0 overflow-hidden">
        <KanbanBoard />
      </div>

      <Separator className="bg-border" />

      {/* Logs Section - Bottom 40% */}
      <div className="flex-[2] min-h-0 overflow-hidden bg-black/5">
        <LogViewer />
      </div>
    </main>
  );
}
