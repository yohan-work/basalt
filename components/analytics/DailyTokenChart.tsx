'use client';

import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';

export interface DailyTokenData {
    date: string;
    tokens: number;
}

interface DailyTokenChartProps {
    data: DailyTokenData[];
}

export function DailyTokenChart({ data }: DailyTokenChartProps) {
    return (
        <Card className="col-span-4 lg:col-span-3">
            <CardHeader>
                <CardTitle>Token Consumption Trend</CardTitle>
                <CardDescription>
                    Daily LLM token usage over time
                </CardDescription>
            </CardHeader>
            <CardContent className="pl-2">
                {data.length === 0 ? (
                    <div className="flex h-[350px] items-center justify-center text-sm text-muted-foreground">
                        No token data available for this range.
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={350}>
                        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis
                                dataKey="date"
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => {
                                    try {
                                        return format(new Date(val), 'MMM dd');
                                    } catch {
                                        return val;
                                    }
                                }}
                            />
                            <YAxis
                                stroke="#888888"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(value) => `${value}`}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))' }}
                                itemStyle={{ color: 'hsl(var(--foreground))' }}
                                labelStyle={{ color: 'hsl(var(--foreground))', marginBottom: '8px' }}
                                formatter={(value: any) => {
                                    const num = typeof value === 'number' ? value : Number(value) || 0;
                                    return [num.toLocaleString(), 'Tokens'];
                                }}
                                labelFormatter={(label) => {
                                    try {
                                        return format(new Date(label), 'PPP');
                                    } catch {
                                        return label;
                                    }
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="tokens"
                                stroke="hsl(var(--primary))"
                                strokeWidth={2}
                                fillOpacity={1}
                                fill="url(#colorTokens)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}
