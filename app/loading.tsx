import { Separator } from '@/components/ui/separator';

export default function Loading() {
  return (
    <main className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header skeleton */}
      <div className="px-6 py-3 flex items-center justify-between border-b border-border">
        <div className="h-6 w-32 bg-muted animate-pulse rounded" />
        <div className="flex gap-2">
          <div className="h-8 w-24 bg-muted animate-pulse rounded" />
          <div className="h-8 w-24 bg-muted animate-pulse rounded" />
        </div>
      </div>

      {/* Kanban skeleton - Top 60% */}
      <div className="flex-[3] min-h-0 overflow-hidden p-4">
        <div className="flex gap-4 h-full">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex-1 flex flex-col gap-3">
              <div className="h-5 w-20 bg-muted animate-pulse rounded" />
              <div className="flex-1 bg-muted/30 rounded-lg p-3 flex flex-col gap-2">
                {Array.from({ length: Math.max(1, 3 - i) }).map((_, j) => (
                  <div key={j} className="h-20 bg-muted animate-pulse rounded-md" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator className="bg-border" />

      {/* Log skeleton - Bottom 40% */}
      <div className="flex-[2] min-h-0 overflow-hidden bg-black/5 p-4 flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-4 bg-muted animate-pulse rounded" style={{ width: `${80 - i * 10}%` }} />
        ))}
      </div>
    </main>
  );
}
