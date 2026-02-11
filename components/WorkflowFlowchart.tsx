'use client';

import { useMemo } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    Node,
    Edge,
    Position,
    MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { ProgressInfo } from './StepProgress';

interface WorkflowStep {
    agent: string;
    action: string;
}

interface WorkflowFlowchartProps {
    workflow?: { steps: WorkflowStep[] };
    progress?: ProgressInfo;
}

// 에이전트별 색상 매핑
const AGENT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    'main-agent': { bg: '#3b82f6', border: '#2563eb', text: '#ffffff' },
    'software-engineer': { bg: '#8b5cf6', border: '#7c3aed', text: '#ffffff' },
    'product-manager': { bg: '#f59e0b', border: '#d97706', text: '#000000' },
    'qa': { bg: '#10b981', border: '#059669', text: '#ffffff' },
    'devops-engineer': { bg: '#ef4444', border: '#dc2626', text: '#ffffff' },
    'style-architect': { bg: '#ec4899', border: '#db2777', text: '#ffffff' },
    'technical-writer': { bg: '#6366f1', border: '#4f46e5', text: '#ffffff' },
    'default': { bg: '#64748b', border: '#475569', text: '#ffffff' },
};

const getAgentColor = (agent: string) => {
    const slug = agent.toLowerCase().replace(/[\s_]+/g, '-');
    return AGENT_COLORS[slug] || AGENT_COLORS['default'];
};

// 상태별 스타일
const getStatusStyle = (isCompleted: boolean, isCurrent: boolean, isFailed: boolean) => {
    if (isFailed) {
        return {
            boxShadow: '0 0 0 3px #ef4444',
            animation: 'none',
        };
    }
    if (isCurrent) {
        return {
            boxShadow: '0 0 0 3px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.5)',
            animation: 'pulse 2s infinite',
        };
    }
    if (isCompleted) {
        return {
            opacity: 0.8,
            boxShadow: '0 0 0 2px #10b981',
        };
    }
    return {
        opacity: 0.5,
    };
};

export function WorkflowFlowchart({ workflow, progress }: WorkflowFlowchartProps) {
    const { nodes, edges } = useMemo(() => {
        if (!workflow?.steps?.length) {
            return { nodes: [], edges: [] };
        }

        const steps = workflow.steps;
        const nodeWidth = 200;
        const nodeHeight = 60;
        const horizontalGap = 80;
        const verticalGap = 100;
        const nodesPerRow = 3;

        const nodes: Node[] = steps.map((step, index) => {
            const row = Math.floor(index / nodesPerRow);
            const col = index % nodesPerRow;
            // 짝수 행은 왼쪽→오른쪽, 홀수 행은 오른쪽→왼쪽 (지그재그)
            const actualCol = row % 2 === 0 ? col : (nodesPerRow - 1 - col);

            const isCompleted = progress?.completedSteps?.includes(step.action) || false;
            const isCurrent = progress?.currentStep === index && progress?.stepStatus === 'running';
            const isFailed = progress?.currentStep === index && progress?.stepStatus === 'failed';
            const agentColor = getAgentColor(step.agent);
            const statusStyle = getStatusStyle(isCompleted, isCurrent, isFailed);

            return {
                id: `step-${index}`,
                type: 'default',
                position: {
                    x: actualCol * (nodeWidth + horizontalGap) + 50,
                    y: row * (nodeHeight + verticalGap) + 50,
                },
                data: {
                    label: (
                        <div className="text-center">
                            <div className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                                {step.agent}
                            </div>
                            <div className="text-xs font-medium mt-1 truncate">
                                {step.action}
                            </div>
                            {isCompleted && <span className="text-[10px]">✓</span>}
                            {isCurrent && <span className="text-[10px]">⏳</span>}
                            {isFailed && <span className="text-[10px]">✗</span>}
                        </div>
                    ),
                },
                style: {
                    background: agentColor.bg,
                    color: agentColor.text,
                    border: `2px solid ${agentColor.border}`,
                    borderRadius: '8px',
                    padding: '10px',
                    width: nodeWidth,
                    ...statusStyle,
                },
                sourcePosition: Position.Right,
                targetPosition: Position.Left,
            };
        });

        const edges: Edge[] = steps.slice(1).map((_, index) => {
            const sourceRow = Math.floor(index / nodesPerRow);
            const targetRow = Math.floor((index + 1) / nodesPerRow);
            const isRowChange = sourceRow !== targetRow;

            return {
                id: `edge-${index}`,
                source: `step-${index}`,
                target: `step-${index + 1}`,
                type: isRowChange ? 'smoothstep' : 'default',
                animated: progress?.currentStep === index + 1 && progress?.stepStatus === 'running',
                style: {
                    stroke: progress?.completedSteps?.includes(steps[index + 1]?.action)
                        ? '#10b981'
                        : '#94a3b8',
                    strokeWidth: 2,
                },
                markerEnd: {
                    type: MarkerType.ArrowClosed,
                    color: progress?.completedSteps?.includes(steps[index + 1]?.action)
                        ? '#10b981'
                        : '#94a3b8',
                },
            };
        });

        return { nodes, edges };
    }, [workflow, progress]);

    if (!workflow?.steps?.length) {
        return (
            <div className="flex items-center justify-center h-[300px] text-muted-foreground text-sm">
                워크플로우가 없습니다
            </div>
        );
    }

    return (
        <div className="h-[300px] w-full border rounded-md overflow-hidden bg-muted/20">
            <style jsx global>{`
                @keyframes pulse {
                    0%, 100% { box-shadow: 0 0 0 3px #3b82f6, 0 0 20px rgba(59, 130, 246, 0.5); }
                    50% { box-shadow: 0 0 0 5px #3b82f6, 0 0 30px rgba(59, 130, 246, 0.8); }
                }
            `}</style>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag={true}
                zoomOnScroll={true}
                minZoom={0.5}
                maxZoom={1.5}
            >
                <Background color="#94a3b8" gap={16} size={1} />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
}
