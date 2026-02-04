'use client';

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface ProgressInfo {
    currentStep: number;
    totalSteps: number;
    currentAction: string;
    currentAgent: string;
    completedSteps: string[];
    stepStatus: 'pending' | 'running' | 'completed' | 'failed';
}

interface WorkflowStep {
    agent: string;
    action: string;
}

interface AgentStatusDashboardProps {
    workflow?: { steps: WorkflowStep[] };
    progress?: ProgressInfo;
}

// 에이전트 정의
const AGENTS = [
    { id: 'main-agent', name: 'Main Agent', icon: '🎯', description: 'Orchestrator', color: '#3b82f6' },
    { id: 'software-engineer', name: 'Software Engineer', icon: '💻', description: 'Code Implementation', color: '#8b5cf6' },
    { id: 'product-manager', name: 'Product Manager', icon: '📋', description: 'Requirements', color: '#f59e0b' },
    { id: 'qa', name: 'QA', icon: '🧪', description: 'Testing', color: '#10b981' },
    { id: 'devops-engineer', name: 'DevOps', icon: '⚙️', description: 'Infrastructure', color: '#ef4444' },
    { id: 'style-architect', name: 'Style Architect', icon: '🎨', description: 'Design System', color: '#ec4899' },
    { id: 'technical-writer', name: 'Technical Writer', icon: '📝', description: 'Documentation', color: '#6366f1' },
    { id: 'git-manager', name: 'Git Manager', icon: '🔀', description: 'Version Control', color: '#14b8a6' },
    { id: 'database-administrator', name: 'DBA', icon: '🗄️', description: 'Database', color: '#f97316' },
];

type AgentStatus = 'idle' | 'active' | 'completed';

export function AgentStatusDashboard({ workflow, progress }: AgentStatusDashboardProps) {
    // 워크플로우에서 사용된 에이전트와 상태 계산
    const agentStatuses = useMemo(() => {
        const statuses: Record<string, { status: AgentStatus; currentAction?: string; completedActions: string[] }> = {};

        // 모든 에이전트를 idle로 초기화
        AGENTS.forEach(agent => {
            statuses[agent.id] = { status: 'idle', completedActions: [] };
        });

        if (!workflow?.steps) return statuses;

        // 워크플로우 step들을 순회하며 상태 결정
        workflow.steps.forEach((step, index) => {
            const agentSlug = step.agent.toLowerCase().replace(/\s+/g, '-');

            if (!statuses[agentSlug]) {
                statuses[agentSlug] = { status: 'idle', completedActions: [] };
            }

            // 완료된 step인지 확인
            const isCompleted = progress?.completedSteps?.includes(step.action);
            const isCurrent = progress?.currentStep === index && progress?.stepStatus === 'running';

            if (isCompleted) {
                statuses[agentSlug].completedActions.push(step.action);
                if (statuses[agentSlug].status !== 'active') {
                    statuses[agentSlug].status = 'completed';
                }
            } else if (isCurrent) {
                statuses[agentSlug].status = 'active';
                statuses[agentSlug].currentAction = step.action;
            }
        });

        return statuses;
    }, [workflow, progress]);

    // 워크플로우에서 사용된 에이전트만 필터링
    const usedAgents = useMemo(() => {
        if (!workflow?.steps) return [];

        const usedAgentIds = new Set<string>();
        workflow.steps.forEach(step => {
            const agentSlug = step.agent.toLowerCase().replace(/\s+/g, '-');
            usedAgentIds.add(agentSlug);
        });

        return AGENTS.filter(agent => usedAgentIds.has(agent.id));
    }, [workflow]);

    if (usedAgents.length === 0) {
        return null;
    }

    return (
        <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Agents</span>
            <div className="flex flex-wrap gap-2">
                {usedAgents.map(agent => {
                    const status = agentStatuses[agent.id];
                    const isActive = status?.status === 'active';
                    const isCompleted = status?.status === 'completed';

                    return (
                        <div
                            key={agent.id}
                            className={`
                                relative flex items-center gap-2 px-3 py-2 rounded-lg border transition-all
                                ${isActive
                                    ? 'border-primary bg-primary/10 shadow-sm'
                                    : isCompleted
                                        ? 'border-green-500/50 bg-green-50 dark:bg-green-950/20'
                                        : 'border-border bg-muted/30 opacity-50'
                                }
                            `}
                            title={status?.currentAction || agent.description}
                        >
                            {/* 아이콘 */}
                            <span className="text-lg">{agent.icon}</span>

                            {/* 에이전트 정보 */}
                            <div className="flex flex-col">
                                <span className={`text-xs font-medium ${isActive ? 'text-primary' : ''}`}>
                                    {agent.name}
                                </span>
                                {isActive && status?.currentAction && (
                                    <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                                        {status.currentAction}
                                    </span>
                                )}
                            </div>

                            {/* 상태 표시 */}
                            {isActive && (
                                <Loader2 className="h-3 w-3 animate-spin text-primary ml-1" />
                            )}
                            {isCompleted && (
                                <span className="text-green-500 text-xs ml-1">✓</span>
                            )}

                            {/* 완료된 액션 수 뱃지 */}
                            {status?.completedActions.length > 0 && (
                                <Badge
                                    variant="secondary"
                                    className="absolute -top-1.5 -right-1.5 h-4 min-w-[16px] px-1 text-[10px]"
                                >
                                    {status.completedActions.length}
                                </Badge>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
