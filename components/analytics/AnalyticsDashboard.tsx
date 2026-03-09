
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
import { DailyTokenChart, DailyTokenData } from './DailyTokenChart';
import { AgentActionRadarChart } from './AgentActionRadarChart';
import { ErrorRankingTable } from './ErrorRankingTable';
import { Activity, CheckCircle2, AlertOctagon, Cpu, Clock, RotateCcw, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { DateRange } from 'react-day-picker';
import { addDays, startOfDay, endOfDay } from 'date-fns';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TeamActivityView } from './team/TeamActivityView';

export function AnalyticsDashboard() {
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: addDays(new Date(), -30),
        to: new Date()
    });
    
    const [agentStats, setAgentStats] = useState<AgentPerformance[]>([]);
    const [taskMetrics, setTaskMetrics] = useState<TaskSuccessMetrics | null>(null);
    const [errorStats, setErrorStats] = useState<ErrorStats[]>([]);
    const [resourceMetrics, setResourceMetrics] = useState<any>(null);
    const [dailyTokens, setDailyTokens] = useState<DailyTokenData[]>([]);
    const [radarData, setRadarData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Include endOfDay for the 'to' date, startOfDay for 'from' to ensure full day coverage
            const fetchRange = dateRange?.from ? {
                from: startOfDay(dateRange.from),
                to: dateRange.to ? endOfDay(dateRange.to) : endOfDay(new Date())
            } : undefined;

            const [agents, tasks, errors, resources, trends, radar] = await Promise.all([
                getAgentPerformanceStats(fetchRange),
                getTaskSuccessMetrics(fetchRange),
                getErrorAnalysis(fetchRange),
                import('@/lib/analytics').then(m => m.getSystemResourceMetrics(fetchRange)),
                import('@/lib/analytics').then(m => m.getDailyTokenTrends(fetchRange)),
                import('@/lib/analytics').then(m => m.getAgentActionDistribution(fetchRange))
            ]);
            setAgentStats(agents);
            setTaskMetrics(tasks);
            setErrorStats(errors);
            setResourceMetrics(resources);
            setDailyTokens(trends);
            setRadarData(radar);
        } catch (e) {
            console.error('Failed to fetch analytics data', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [dateRange]); // Refetch when dateRange changes

    if (loading && !taskMetrics) {
        return <AnalyticsSkeleton />;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <h2 className="text-3xl font-bold tracking-tight">AI Team Analytics</h2>
                <div className="flex items-center gap-2">
                    <DatePickerWithRange date={dateRange} setDate={setDateRange} />
                    <Button variant="outline" size="icon" onClick={fetchData} disabled={loading}>
                        <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                </div>
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
                            description="Tasks created"
                        />
                        <StatCard
                            title="Success Rate"
                            value={`${taskMetrics?.successRate || 0}%`}
                            icon={CheckCircle2}
                            trend={taskMetrics?.successRate && taskMetrics.successRate > 80 ? "Healthy" : undefined}
                            description="Completed / Finished"
                        />
                        <StatCard
                            title="Tokens Consumed"
                            value={(resourceMetrics?.totalTokens || 0).toLocaleString()}
                            icon={Cpu}
                            description={`~${(resourceMetrics?.avgTokensPerTask || 0).toLocaleString()} per task`}
                        />
                        <StatCard
                            title="Cost Saved (Est.)"
                            value={`$${((resourceMetrics?.totalTokens || 0) * 0.00001).toFixed(3)}`}
                            icon={Wallet}
                            description="Based on avg $10/1M tokens"
                        />
                    </div>
                    
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            title="Avg. Lead Time"
                            value={`${resourceMetrics?.avgLeadTimeSeconds || 0}s`}
                            icon={Clock}
                            description="Execution duration"
                        />
                        <div className="col-span-3"></div>
                    </div>

                    {/* Charts & Tables */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                        <DailyTokenChart data={dailyTokens} />
                        <AgentActionRadarChart data={radarData} />
                    </div>
                    
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                        <div className="col-span-4 lg:col-span-7">
                            <ErrorRankingTable errors={errorStats} />
                        </div>
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
