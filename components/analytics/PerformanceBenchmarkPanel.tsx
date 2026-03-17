'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { BenchmarkComparison } from '@/lib/analytics';
import { TrendingDown, TrendingUp } from 'lucide-react';

interface PerformanceBenchmarkPanelProps {
    benchmark: BenchmarkComparison | null;
    loading?: boolean;
}

function formatPercent(value: number): string {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
}

function formatPp(value: number): string {
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}pp`;
}

interface ComparisonItemProps {
    title: string;
    current: string;
    baseline: string;
    delta: number;
    deltaText: string;
    goodWhenLower?: boolean;
}

function ComparisonItem({ title, current, baseline, delta, deltaText, goodWhenLower = false }: ComparisonItemProps) {
    const isImproved = goodWhenLower ? delta < 0 : delta > 0;
    const isNeutral = delta === 0;
    const toneClass = isNeutral
        ? 'text-muted-foreground'
        : (isImproved ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400');

    return (
        <div className="rounded-md border bg-card p-3">
            <div className="text-xs text-muted-foreground">{title}</div>
            <div className="mt-1 text-sm">
                <span className="font-semibold">{current}</span>
                <span className="mx-1 text-muted-foreground">vs</span>
                <span className="text-muted-foreground">{baseline}</span>
            </div>
            <div className={`mt-1 flex items-center gap-1 text-xs ${toneClass}`}>
                {isNeutral ? null : isImproved ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                <span>{deltaText}</span>
            </div>
        </div>
    );
}

export function PerformanceBenchmarkPanel({ benchmark, loading = false }: PerformanceBenchmarkPanelProps) {
    if (loading && !benchmark) {
        return (
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Baseline Comparison</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                    기준선 대비 성능을 계산 중입니다...
                </CardContent>
            </Card>
        );
    }

    if (!benchmark) {
        return (
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base">Baseline Comparison</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                    기간을 선택하면 직전 동일 기간 대비 개선치를 표시합니다.
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-base">Baseline Comparison</CardTitle>
                <div className="text-xs text-muted-foreground">
                    현재 기간 대비 직전 동일 길이 기간 비교
                </div>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <ComparisonItem
                    title="Success Rate"
                    current={`${benchmark.current.successRate}%`}
                    baseline={`${benchmark.baseline.successRate}%`}
                    delta={benchmark.delta.successRatePp}
                    deltaText={formatPp(benchmark.delta.successRatePp)}
                />
                <ComparisonItem
                    title="Failure Rate"
                    current={`${benchmark.current.failureRate}%`}
                    baseline={`${benchmark.baseline.failureRate}%`}
                    delta={benchmark.delta.failureRatePp}
                    deltaText={formatPp(benchmark.delta.failureRatePp)}
                    goodWhenLower
                />
                <ComparisonItem
                    title="Avg Tokens / Task"
                    current={benchmark.current.avgTokensPerTask.toLocaleString()}
                    baseline={benchmark.baseline.avgTokensPerTask.toLocaleString()}
                    delta={benchmark.delta.avgTokensPerTaskPct}
                    deltaText={formatPercent(benchmark.delta.avgTokensPerTaskPct)}
                    goodWhenLower
                />
                <ComparisonItem
                    title="Avg Lead Time"
                    current={`${benchmark.current.avgLeadTimeSeconds}s`}
                    baseline={`${benchmark.baseline.avgLeadTimeSeconds}s`}
                    delta={benchmark.delta.avgLeadTimeSecondsPct}
                    deltaText={formatPercent(benchmark.delta.avgLeadTimeSecondsPct)}
                    goodWhenLower
                />
            </CardContent>
        </Card>
    );
}
