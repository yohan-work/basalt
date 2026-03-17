'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import type {
    NumericCollaborationMap,
    OrchestratorCollaborationMap,
} from '@/lib/types/agent-visualization';

type CollaborationInput = NumericCollaborationMap | OrchestratorCollaborationMap | undefined;

interface CollaborationMatrixProps {
    title?: string;
    collaboration?: CollaborationInput;
    emptyMessage?: string;
}

type Matrix = Record<string, Record<string, number>>;

function toNumericMatrix(collaboration?: CollaborationInput): Matrix {
    const matrix: Matrix = {};
    if (!collaboration || typeof collaboration !== 'object') return matrix;

    for (const [from, links] of Object.entries(collaboration)) {
        if (!links || typeof links !== 'object') continue;
        if (!matrix[from]) matrix[from] = {};

        for (const [to, edge] of Object.entries(links)) {
            let weight: number | undefined;
            if (typeof edge === 'number') {
                weight = edge;
            } else if (
                edge &&
                typeof edge === 'object' &&
                'weight' in edge &&
                typeof (edge as { weight?: unknown }).weight === 'number'
            ) {
                weight = (edge as { weight: number }).weight;
            }
            if (typeof weight !== 'number' || Number.isNaN(weight)) continue;
            matrix[from][to] = weight;
        }
    }

    return matrix;
}

function collectAgents(matrix: Matrix): string[] {
    const agents = new Set<string>();
    for (const [from, links] of Object.entries(matrix)) {
        agents.add(from);
        Object.keys(links).forEach((to) => agents.add(to));
    }
    return Array.from(agents).sort();
}

export function CollaborationMatrix({
    title = 'Collaboration Matrix',
    collaboration,
    emptyMessage = '협업 데이터가 아직 없습니다.',
}: CollaborationMatrixProps) {
    const matrix = toNumericMatrix(collaboration);
    const agents = collectAgents(matrix);

    if (!agents.length) {
        return (
            <Card className="border-dashed">
                <CardHeader>
                    <CardTitle className="text-sm">{title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{emptyMessage}</CardContent>
            </Card>
        );
    }

    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    for (const from of agents) {
        rowTotals[from] = 0;
        for (const to of agents) {
            const value = matrix[from]?.[to] ?? 0;
            rowTotals[from] += value;
            colTotals[to] = (colTotals[to] || 0) + value;
        }
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                <ScrollArea className="w-full">
                    <table className="w-full min-w-[520px] border-collapse text-xs">
                        <thead>
                            <tr>
                                <th className="border-b p-2 text-left font-semibold">From \\ To</th>
                                {agents.map((agent) => (
                                    <th key={agent} className="border-b p-2 text-right font-semibold">
                                        {agent}
                                    </th>
                                ))}
                                <th className="border-b p-2 text-right font-semibold">Row Sum</th>
                            </tr>
                        </thead>
                        <tbody>
                            {agents.map((from) => (
                                <tr key={from}>
                                    <td className="border-b p-2 font-medium">{from}</td>
                                    {agents.map((to) => (
                                        <td key={`${from}-${to}`} className="border-b p-2 text-right tabular-nums">
                                            {matrix[from]?.[to] ?? 0}
                                        </td>
                                    ))}
                                    <td className="border-b p-2 text-right font-semibold tabular-nums">
                                        {rowTotals[from]}
                                    </td>
                                </tr>
                            ))}
                            <tr>
                                <td className="p-2 font-semibold">Col Sum</td>
                                {agents.map((agent) => (
                                    <td key={`col-${agent}`} className="p-2 text-right font-semibold tabular-nums">
                                        {colTotals[agent] || 0}
                                    </td>
                                ))}
                                <td className="p-2 text-right font-semibold tabular-nums">
                                    {Object.values(rowTotals).reduce((acc, curr) => acc + curr, 0)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
