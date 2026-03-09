'use client';

import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AgentActionDistribution {
    actionType: string;
    [key: string]: string | number;
}

interface AgentActionRadarChartProps {
    data: AgentActionDistribution[];
}

// Define some vibrant colors for agents
const AGENT_COLORS = [
    'hsl(var(--chart-1, 220 70% 50%))',
    'hsl(var(--chart-2, 160 60% 45%))',
    'hsl(var(--chart-3, 30 80% 55%))',
    'hsl(var(--chart-4, 280 65% 60%))',
    'hsl(var(--chart-5, 340 75% 55%))',
];

export function AgentActionRadarChart({ data }: AgentActionRadarChartProps) {
    if (!data || data.length === 0) return null;

    // Extract agent names from the first data object (excluding 'actionType')
    const agentNames = Object.keys(data[0]).filter(k => k !== 'actionType');

    return (
        <Card className="col-span-4 lg:col-span-3">
            <CardHeader>
                <CardTitle>Agent Action Topology</CardTitle>
                <CardDescription>
                    Radar chart showing execution density by action type for each agent
                </CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
                <ResponsiveContainer width="100%" height={350}>
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis 
                            dataKey="actionType" 
                            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} 
                        />
                        <PolarRadiusAxis 
                            angle={30} 
                            domain={[0, 'auto']} 
                            tick={{ fill: 'hsl(var(--muted-foreground))' }}
                            axisLine={false}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                            itemStyle={{ color: 'hsl(var(--foreground))' }}
                            labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold', marginBottom: '4px' }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        {agentNames.map((agent, idx) => (
                            <Radar
                                key={agent}
                                name={agent}
                                dataKey={agent}
                                stroke={AGENT_COLORS[idx % AGENT_COLORS.length]}
                                fill={AGENT_COLORS[idx % AGENT_COLORS.length]}
                                fillOpacity={0.4}
                            />
                        ))}
                    </RadarChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>
    );
}
