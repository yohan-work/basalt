/**
 * Measures how much two text files differ at the line level using LCS length.
 * Cost = n + m - 2*LCS (minimum line insert/delete steps when matching equal lines).
 */
export function lineEditCostBetweenFiles(before: string, after: string): number {
    const a = before.split('\n');
    const b = after.split('\n');
    const n = a.length;
    const m = b.length;
    if (n === 0) return m;
    if (m === 0) return n;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
            else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    const lcs = dp[n][m];
    return n + m - 2 * lcs;
}

/** Allow more churn on large files, but keep a floor for small files. */
export function maxAllowedLineEditCost(lineCount: number): number {
    return Math.max(24, Math.floor(0.12 * Math.max(1, lineCount)));
}
