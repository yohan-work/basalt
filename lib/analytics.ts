
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
