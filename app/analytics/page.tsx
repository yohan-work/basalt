
import { AnalyticsDashboard } from '@/components/analytics/AnalyticsDashboard';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function AnalyticsPage() {
    return (
        <div className="min-h-screen bg-background p-8">
            <div className="max-w-7xl mx-auto space-y-8">
                <div className="flex items-center">
                    <Link href="/">
                        <Button variant="ghost" className="mr-4">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Board
                        </Button>
                    </Link>
                </div>

                <AnalyticsDashboard />
            </div>
        </div>
    );
}
