
import { DoneTasksArchive } from '@/components/DoneTasksArchive';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';

export default function DonePage() {
    return (
        <div className="min-h-screen bg-background p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/">
                            <Button variant="ghost" className="mr-4">
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back to Board
                            </Button>
                        </Link>
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                            <h1 className="text-2xl font-bold tracking-tight">Completed Task</h1>
                        </div>
                    </div>
                </div>

                <DoneTasksArchive />
            </div>
        </div>
    );
}
