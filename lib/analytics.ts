
import { supabase } from '@/lib/supabase';

// Helper types
export interface AgentPerformance {
    agentName: string;
    actionsCount: number;
}

export interface TaskSuccessMetrics {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    successRate: number;
}

export interface ErrorStats {
    message: string;
    count: number;
    agent: string;
}

export interface DateRange {
    from: Date;
    to?: Date;
}

/**
 * Fetches and aggregates agent performance statistics based on execution logs.
 * Counts how many 'ACTION' type logs each agent has generated.
 */
export async function getAgentPerformanceStats(dateRange?: DateRange): Promise<AgentPerformance[]> {
    let query = supabase
        .from('Execution_Logs')
        .select('agent_role, metadata, created_at')
        .eq('metadata->>type', 'ACTION');

    if (dateRange) {
        query = query.gte('created_at', dateRange.from.toISOString());
        if (dateRange.to) {
            query = query.lte('created_at', dateRange.to.toISOString());
        }
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching agent stats:', error);
        return [];
    }

    const agentCounts: Record<string, number> = {};

    data?.forEach((log) => {
        const agent = log.agent_role || 'Unknown';
        agentCounts[agent] = (agentCounts[agent] || 0) + 1;
    });

    return Object.entries(agentCounts)
        .map(([agentName, actionsCount]) => ({
            agentName,
            actionsCount,
        }))
        .sort((a, b) => b.actionsCount - a.actionsCount);
}

/**
 * Fetches task success metrics from the Tasks table.
 */
export async function getTaskSuccessMetrics(dateRange?: DateRange): Promise<TaskSuccessMetrics> {
    let query = supabase
        .from('Tasks')
        .select('status, created_at');

    if (dateRange) {
        query = query.gte('created_at', dateRange.from.toISOString());
        if (dateRange.to) {
            query = query.lte('created_at', dateRange.to.toISOString());
        }
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching task metrics:', error);
        return { totalTasks: 0, completedTasks: 0, failedTasks: 0, successRate: 0 };
    }

    const totalTasks = data.length;
    const completedTasks = data.filter(t => t.status === 'done').length;
    const failedTasks = data.filter(t => t.status === 'failed').length;

    // Tasks currently in progress (not done/failed) are not counted in success rate base roughly,
    // or we can just count done vs failed. Let's use (done / (done + failed)) or (done / total).
    // For now, let's use global success rate calculated against total tasks (including pending).
    // Actually, (completed / (completed + failed)) is a more fair 'success rate' for finished work.
    const finishedTotal = completedTasks + failedTasks;
    const successRate = finishedTotal > 0 ? (completedTasks / finishedTotal) * 100 : 0;

    return {
        totalTasks,
        completedTasks,
        failedTasks,
        successRate: Math.round(successRate),
    };
}

/**
 * Normalizes error messages by removing variable parts like module names or file paths.
 */
function normalizeErrorMessage(msg: string): string {
    if (!msg) return 'Unknown Error';
    return msg
        .replace(/(['"])(?:(?!\1|\\).|\\.)*\1/g, "'...'") // replaces string literals in quotes
        .replace(/(\/.*?\.[\w:]+)/g, '/.../file.ext') // replaces file paths roughly
        .replace(/\b([A-Za-z0-9_-]+)\.ts(x)?\b/gi, 'file.ts') // replaces specific file names
        .trim();
}

/**
 * Aggregates error logs to find most frequent errors.
 */
export async function getErrorAnalysis(dateRange?: DateRange): Promise<ErrorStats[]> {
    let query = supabase
        .from('Execution_Logs')
        .select('message, agent_role, metadata, created_at')
        .eq('metadata->>type', 'ERROR')
        .order('created_at', { ascending: false })
        .limit(100);

    if (dateRange) {
        query = query.gte('created_at', dateRange.from.toISOString());
        if (dateRange.to) {
            query = query.lte('created_at', dateRange.to.toISOString());
        }
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching error stats:', error);
        return [];
    }

    const errorCounts: Record<string, { count: number; agent: string }> = {};

    data?.forEach((log) => {
        const msg = normalizeErrorMessage(log.message);
        if (!errorCounts[msg]) {
            errorCounts[msg] = { count: 0, agent: log.agent_role };
        }
        errorCounts[msg].count += 1;
    });

    return Object.entries(errorCounts)
        .map(([message, { count, agent }]) => ({
            message,
            count,
            agent,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10
}

/**
 * Fetches the Team State (Messages, Board) from the most recent active team task.
 */
export async function getTeamState(taskId?: string): Promise<import('./team-types').TeamState | null> {
    let query = supabase.from('Tasks').select('metadata');

    if (taskId) {
        query = query.eq('id', taskId);
    } else {
        // Find most recent task with teamState
        // Filter where metadata contains teamState (requires JSONB filter, simplified here)
        query = query.order('created_at', { ascending: false }).limit(1);
    }

    const { data, error } = await query.single();

    if (error || !data) {
        return null;
    }

    // Check if metadata has teamState
    if (data.metadata?.teamState) {
        return data.metadata.teamState as import('./team-types').TeamState;
    }

    return null;
}

export interface ResourceMetrics {
    totalTokens: number;
    avgTokensPerTask: number;
    avgLeadTimeSeconds: number;
}

export interface BenchmarkSnapshot {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    successRate: number;
    failureRate: number;
    avgTokensPerTask: number;
    avgLeadTimeSeconds: number;
}

export interface BenchmarkComparison {
    currentRange: DateRange;
    baselineRange: DateRange;
    current: BenchmarkSnapshot;
    baseline: BenchmarkSnapshot;
    delta: {
        successRatePp: number;
        failureRatePp: number;
        avgTokensPerTaskPct: number;
        avgLeadTimeSecondsPct: number;
    };
}

export interface TaskPerformanceSnapshot {
    totalTokens: number;
    leadTimeSeconds: number;
    discussionCalls: number;
    llmCalls: number;
    dbUpdates: number;
    status: 'success' | 'failed' | 'in_progress';
}

export interface TaskPerformanceBenchmark {
    current: TaskPerformanceSnapshot;
    baseline: TaskPerformanceSnapshot;
    sampleSize: number;
    deltaPct: {
        totalTokens: number;
        leadTimeSeconds: number;
        discussionCalls: number;
        llmCalls: number;
    };
}

interface AnalyticsTaskRow {
    id: string;
    status: string;
    project_id?: string | null;
    created_at: string;
    updated_at?: string | null;
    metadata?: Record<string, unknown> | null;
}

function roundTo(value: number, digits: number = 1): number {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function percentChange(current: number, baseline: number): number {
    if (baseline === 0) {
        if (current === 0) return 0;
        return 100;
    }
    return ((current - baseline) / baseline) * 100;
}

function toFailureRate(metrics: TaskSuccessMetrics): number {
    const finished = metrics.completedTasks + metrics.failedTasks;
    if (finished === 0) return 0;
    return (metrics.failedTasks / finished) * 100;
}

export function getPreviousComparableRange(range: DateRange): DateRange {
    const currentFrom = range.from.getTime();
    const currentTo = (range.to || new Date()).getTime();
    const durationMs = Math.max(24 * 60 * 60 * 1000, currentTo - currentFrom + 1);

    const baselineTo = new Date(currentFrom - 1);
    const baselineFrom = new Date(currentFrom - durationMs);

    return { from: baselineFrom, to: baselineTo };
}

export async function getBenchmarkComparison(currentRange: DateRange): Promise<BenchmarkComparison> {
    const baselineRange = getPreviousComparableRange(currentRange);

    const [
        currentTaskMetrics,
        baselineTaskMetrics,
        currentResourceMetrics,
        baselineResourceMetrics,
    ] = await Promise.all([
        getTaskSuccessMetrics(currentRange),
        getTaskSuccessMetrics(baselineRange),
        getSystemResourceMetrics(currentRange),
        getSystemResourceMetrics(baselineRange),
    ]);

    const currentSnapshot: BenchmarkSnapshot = {
        totalTasks: currentTaskMetrics.totalTasks,
        completedTasks: currentTaskMetrics.completedTasks,
        failedTasks: currentTaskMetrics.failedTasks,
        successRate: currentTaskMetrics.successRate,
        failureRate: roundTo(toFailureRate(currentTaskMetrics), 1),
        avgTokensPerTask: currentResourceMetrics.avgTokensPerTask,
        avgLeadTimeSeconds: currentResourceMetrics.avgLeadTimeSeconds,
    };

    const baselineSnapshot: BenchmarkSnapshot = {
        totalTasks: baselineTaskMetrics.totalTasks,
        completedTasks: baselineTaskMetrics.completedTasks,
        failedTasks: baselineTaskMetrics.failedTasks,
        successRate: baselineTaskMetrics.successRate,
        failureRate: roundTo(toFailureRate(baselineTaskMetrics), 1),
        avgTokensPerTask: baselineResourceMetrics.avgTokensPerTask,
        avgLeadTimeSeconds: baselineResourceMetrics.avgLeadTimeSeconds,
    };

    return {
        currentRange,
        baselineRange,
        current: currentSnapshot,
        baseline: baselineSnapshot,
        delta: {
            successRatePp: roundTo(currentSnapshot.successRate - baselineSnapshot.successRate, 1),
            failureRatePp: roundTo(currentSnapshot.failureRate - baselineSnapshot.failureRate, 1),
            avgTokensPerTaskPct: roundTo(percentChange(currentSnapshot.avgTokensPerTask, baselineSnapshot.avgTokensPerTask), 1),
            avgLeadTimeSecondsPct: roundTo(percentChange(currentSnapshot.avgLeadTimeSeconds, baselineSnapshot.avgLeadTimeSeconds), 1),
        },
    };
}

function toTaskStatus(status: string): TaskPerformanceSnapshot['status'] {
    if (status === 'done' || status === 'review') return 'success';
    if (status === 'failed') return 'failed';
    return 'in_progress';
}

function deriveLeadTimeSeconds(task: AnalyticsTaskRow): number {
    const metadata = task.metadata || {};
    const execMetrics = metadata.executionMetrics as { startedAt?: string; endedAt?: string } | undefined;
    if (execMetrics?.startedAt && execMetrics?.endedAt) {
        const started = new Date(execMetrics.startedAt).getTime();
        const ended = new Date(execMetrics.endedAt).getTime();
        if (ended > started) return Math.round((ended - started) / 1000);
    }
    const created = new Date(task.created_at).getTime();
    const updated = task.updated_at ? new Date(task.updated_at).getTime() : created;
    return updated > created ? Math.round((updated - created) / 1000) : 0;
}

function toTaskSnapshot(task: AnalyticsTaskRow): TaskPerformanceSnapshot {
    const metadata = task.metadata || {};
    const execMetrics = metadata.executionMetrics as
        | {
            totalTokens?: number;
            discussionCalls?: number;
            llmCalls?: number;
            dbUpdates?: number;
        }
        | undefined;
    const tokenMetrics = metadata.tokens as { total?: number } | undefined;

    return {
        totalTokens:
            (typeof execMetrics?.totalTokens === 'number' ? execMetrics.totalTokens : undefined)
            ?? (typeof tokenMetrics?.total === 'number' ? tokenMetrics.total : 0),
        leadTimeSeconds: deriveLeadTimeSeconds(task),
        discussionCalls: Number(execMetrics?.discussionCalls) || 0,
        llmCalls: Number(execMetrics?.llmCalls) || 0,
        dbUpdates: Number(execMetrics?.dbUpdates) || 0,
        status: toTaskStatus(task.status),
    };
}

function averageSnapshots(items: TaskPerformanceSnapshot[]): TaskPerformanceSnapshot {
    if (items.length === 0) {
        return {
            totalTokens: 0,
            leadTimeSeconds: 0,
            discussionCalls: 0,
            llmCalls: 0,
            dbUpdates: 0,
            status: 'in_progress',
        };
    }
    const sum = items.reduce(
        (acc, item) => {
            acc.totalTokens += item.totalTokens;
            acc.leadTimeSeconds += item.leadTimeSeconds;
            acc.discussionCalls += item.discussionCalls;
            acc.llmCalls += item.llmCalls;
            acc.dbUpdates += item.dbUpdates;
            return acc;
        },
        { totalTokens: 0, leadTimeSeconds: 0, discussionCalls: 0, llmCalls: 0, dbUpdates: 0 }
    );
    return {
        totalTokens: Math.round(sum.totalTokens / items.length),
        leadTimeSeconds: Math.round(sum.leadTimeSeconds / items.length),
        discussionCalls: roundTo(sum.discussionCalls / items.length, 1),
        llmCalls: roundTo(sum.llmCalls / items.length, 1),
        dbUpdates: roundTo(sum.dbUpdates / items.length, 1),
        status: 'in_progress',
    };
}

export async function getTaskPerformanceBenchmark(taskId: string, projectId?: string | null): Promise<TaskPerformanceBenchmark | null> {
    if (!taskId) return null;

    const { data: currentTask, error: currentTaskError } = await supabase
        .from('Tasks')
        .select('id, status, project_id, created_at, updated_at, metadata')
        .eq('id', taskId)
        .single();

    if (currentTaskError || !currentTask) {
        return null;
    }

    const normalizedCurrent = currentTask as AnalyticsTaskRow;
    const effectiveProjectId = projectId ?? normalizedCurrent.project_id ?? null;

    let peersQuery = supabase
        .from('Tasks')
        .select('id, status, project_id, created_at, updated_at, metadata')
        .neq('id', taskId)
        .in('status', ['done', 'review', 'failed'])
        .order('updated_at', { ascending: false })
        .limit(40);

    if (effectiveProjectId) {
        peersQuery = peersQuery.eq('project_id', effectiveProjectId);
    }

    const { data: peerTasks, error: peerTasksError } = await peersQuery;
    if (peerTasksError) {
        console.error('Error fetching task benchmark peers:', peerTasksError);
        return null;
    }

    const currentSnapshot = toTaskSnapshot(normalizedCurrent);
    const peerSnapshots = (peerTasks || []).map((task) => toTaskSnapshot(task as AnalyticsTaskRow));
    const baseline = averageSnapshots(peerSnapshots);

    return {
        current: currentSnapshot,
        baseline,
        sampleSize: peerSnapshots.length,
        deltaPct: {
            totalTokens: roundTo(percentChange(currentSnapshot.totalTokens, baseline.totalTokens), 1),
            leadTimeSeconds: roundTo(percentChange(currentSnapshot.leadTimeSeconds, baseline.leadTimeSeconds), 1),
            discussionCalls: roundTo(percentChange(currentSnapshot.discussionCalls, baseline.discussionCalls), 1),
            llmCalls: roundTo(percentChange(currentSnapshot.llmCalls, baseline.llmCalls), 1),
        },
    };
}

/**
 * Calculates total tokens, average tokens, and average lead time from tasks.
 */
export async function getSystemResourceMetrics(dateRange?: DateRange): Promise<ResourceMetrics> {
    let query = supabase
        .from('Tasks')
        .select('status, created_at, updated_at, metadata');

    if (dateRange) {
        query = query.gte('created_at', dateRange.from.toISOString());
        if (dateRange.to) {
            query = query.lte('created_at', dateRange.to.toISOString());
        }
    }

    const { data, error } = await query;
    if (error || !data) {
        return { totalTokens: 0, avgTokensPerTask: 0, avgLeadTimeSeconds: 0 };
    }

    let totalTokens = 0;
    let completedTasksWithLoc = 0;
    let totalLeadTime = 0;

    data.forEach(task => {
        // Tokens
        const tokens = task.metadata?.tokens;
        if (tokens && typeof tokens.total === 'number') {
            totalTokens += tokens.total;
        }

        // Lead time (only for completed ones to be meaningful)
        if (task.status === 'done' || task.status === 'review') {
            const start = new Date(task.created_at).getTime();
            let end = start;

            if (task.updated_at) {
                end = new Date(task.updated_at).getTime();
            } else if (task.metadata?.contextLogs && task.metadata.contextLogs.length > 0) {
                const logs = task.metadata.contextLogs;
                end = logs[logs.length - 1].timestamp;
            }

            if (end > start) {
                totalLeadTime += (end - start);
                completedTasksWithLoc++;
            }
        }
    });

    return {
        totalTokens,
        avgTokensPerTask: data.length > 0 ? Math.round(totalTokens / data.length) : 0,
        avgLeadTimeSeconds: completedTasksWithLoc > 0 ? Math.round((totalLeadTime / completedTasksWithLoc) / 1000) : 0
    };
}

/**
 * Aggregates daily token consumption for a given date range.
 */
export async function getDailyTokenTrends(dateRange?: DateRange): Promise<{ date: string; tokens: number }[]> {
    let query = supabase
        .from('Tasks')
        .select('created_at, metadata');

    if (dateRange) {
        query = query.gte('created_at', dateRange.from.toISOString());
        if (dateRange.to) {
            query = query.lte('created_at', dateRange.to.toISOString());
        }
    }

    const { data, error } = await query;
    if (error || !data) {
        return [];
    }

    const dailyMap: Record<string, number> = {};

    data.forEach(task => {
        const tokens = task.metadata?.tokens;
        if (tokens && typeof tokens.total === 'number') {
            // Use YYYY-MM-DD as key
            const dateKey = new Date(task.created_at).toISOString().split('T')[0];
            dailyMap[dateKey] = (dailyMap[dateKey] || 0) + tokens.total;
        }
    });

    return Object.entries(dailyMap)
        .map(([date, tokens]) => ({ date, tokens }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

export interface AgentActionDistribution {
    actionType: string;
    [agentName: string]: string | number; // 'actionType' is string, rests are numbers (count)
}

/**
 * Gathers distribution of action types per agent for the Radar Chart.
 */
export async function getAgentActionDistribution(dateRange?: DateRange): Promise<AgentActionDistribution[]> {
    let query = supabase
        .from('Execution_Logs')
        .select('message, agent_role, created_at')
        .eq('metadata->>type', 'ACTION');

    if (dateRange) {
        query = query.gte('created_at', dateRange.from.toISOString());
        if (dateRange.to) {
            query = query.lte('created_at', dateRange.to.toISOString());
        }
    }

    const { data, error } = await query;
    if (error || !data) return [];

    // Map: ActionType -> { AgentName -> count }
    const distributionMap: Record<string, Record<string, number>> = {};
    const agentsSet = new Set<string>();

    data.forEach(log => {
        const agent = log.agent_role || 'Unknown';
        agentsSet.add(agent);

        let actionType = 'other';
        const msg = log.message || '';
        if (msg.startsWith('Executing ')) {
            actionType = msg.replace('Executing ', '').trim();
        } else if (msg.startsWith('Generating code')) {
            actionType = 'write_code';
        }

        // Simplify action names if too long
        if (actionType.length > 20) {
            actionType = actionType.substring(0, 20) + '...';
        }

        if (!distributionMap[actionType]) {
            distributionMap[actionType] = {};
        }
        distributionMap[actionType][agent] = (distributionMap[actionType][agent] || 0) + 1;
    });

    const result: AgentActionDistribution[] = [];
    const agents = Array.from(agentsSet);

    Object.entries(distributionMap).forEach(([actionType, counts]) => {
        const entry: AgentActionDistribution = { actionType };
        agents.forEach(a => {
            entry[a] = counts[a] || 0;
        });
        result.push(entry);
    });

    // Sort by total frequency so radar chart shows most frequent actions
    result.sort((a, b) => {
        const sumA = agents.reduce((acc, curr) => acc + (a[curr] as number || 0), 0);
        const sumB = agents.reduce((acc, curr) => acc + (b[curr] as number || 0), 0);
        return sumB - sumA;
    });

    return result.slice(0, 6); // Top 6 actions looks best on radar chart
}
