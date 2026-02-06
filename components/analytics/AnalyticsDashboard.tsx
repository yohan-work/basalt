
'use client';

import { useEffect, useState } from 'react';
import {
    getAgentPerformanceStats,
    getTaskSuccessMetrics,
    getErrorAnalysis,
    AgentPerformance,
    TaskSuccessMetrics,
    ErrorStats
} from '@/lib/analytics';
import { StatCard } from './StatCard';
import { AgentActivityChart } from './AgentActivityChart';
import { ErrorRankingTable } from './ErrorRankingTable';
import { Activity, CheckCircle2, AlertOctagon, BarChart3, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TeamActivityView } from './team/TeamActivityView';

export function AnalyticsDashboard() {
    const [agentStats, setAgentStats] = useState<AgentPerformance[]>([]);
    const [taskMetrics, setTaskMetrics] = useState<TaskSuccessMetrics | null>(null);
    const [errorStats, setErrorStats] = useState<ErrorStats[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [agents, tasks, errors] = await Promise.all([
                getAgentPerformanceStats(),
                getTaskSuccessMetrics(),
                getErrorAnalysis()
            ]);
            setAgentStats(agents);
            setTaskMetrics(tasks);
            setErrorStats(errors);
        } catch (e) {
            console.error('Failed to fetch analytics data', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (loading) {
        return <AnalyticsSkeleton />;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">AI Team Analytics</h2>
                <Button variant="outline" size="sm" onClick={fetchData}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Refresh Data
                </Button>
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="team-activity">Team Activity 🔴 Live</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    {/* Key Metrics */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            title="Total Tasks"
                            value={taskMetrics?.totalTasks || 0}
                            icon={Activity}
                            description="All time tasks"
                        />
                        <StatCard
                            title="Success Rate"
                            value={`${taskMetrics?.successRate || 0}%`}
                            icon={CheckCircle2}
                            trend={taskMetrics?.successRate && taskMetrics.successRate > 80 ? "Healthy" : undefined}
                            description="Completed / (Completed + Failed)"
                        />
                        <StatCard
                            title="Completed"
                            value={taskMetrics?.completedTasks || 0}
                            icon={CheckCircle2}
                            description="Succesfully finished"
                        />
                        <StatCard
                            title="Failed"
                            value={taskMetrics?.failedTasks || 0}
                            icon={AlertOctagon}
                            description="Needs attention"
                        />
                    </div>

                    {/* Charts & Tables */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                        <AgentActivityChart data={agentStats} />
                        <ErrorRankingTable errors={errorStats} />
                    </div>
                </TabsContent>

                <TabsContent value="team-activity">
                    <TeamActivityView />
                </TabsContent>
            </Tabs>
        </div>
    );
}

function AnalyticsSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <Skeleton className="h-9 w-[200px]" />
                <Skeleton className="h-9 w-[100px]" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {Array(4).fill(0).map((_, i) => (
                    <Skeleton key={i} className="h-[120px] rounded-xl" />
                ))}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Skeleton className="col-span-4 h-[400px] rounded-xl" />
                <Skeleton className="col-span-3 h-[400px] rounded-xl" />
            </div>
        </div>
    );
}
