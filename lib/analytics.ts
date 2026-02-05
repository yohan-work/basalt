
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

/**
 * Fetches and aggregates agent performance statistics based on execution logs.
 * Counts how many 'ACTION' type logs each agent has generated.
 */
export async function getAgentPerformanceStats(): Promise<AgentPerformance[]> {
    const { data, error } = await supabase
        .from('Execution_Logs')
        .select('agent_role, metadata')
        .eq('metadata->>type', 'ACTION');

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
export async function getTaskSuccessMetrics(): Promise<TaskSuccessMetrics> {
    const { data, error } = await supabase
        .from('Tasks')
        .select('status');

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
 * Aggregates error logs to find most frequent errors.
 */
export async function getErrorAnalysis(): Promise<ErrorStats[]> {
    const { data, error } = await supabase
        .from('Execution_Logs')
        .select('message, agent_role, metadata')
        .eq('metadata->>type', 'ERROR')
        .order('created_at', { ascending: false })
        .limit(50); // Analyze last 50 errors

    if (error) {
        console.error('Error fetching error stats:', error);
        return [];
    }

    const errorCounts: Record<string, { count: number; agent: string }> = {};

    data?.forEach((log) => {
        // Group by message roughly (trancate to avoid unique timestamp diffs if any)
        // Assuming messages are consistent strings.
        const msg = log.message;
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
