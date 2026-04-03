export type CommandRiskLevel = 'safe' | 'low' | 'medium' | 'high' | 'critical';
export type CommandRiskMode = 'deny' | 'warn' | 'off';

export type CommandRiskAssessment = {
    level: CommandRiskLevel;
    reason: string;
};

function splitByShellOperators(raw: string): string[] {
    return String(raw || '')
        .split(/(?:\|\||&&|[|;])/g)
        .map((s) => s.trim())
        .filter(Boolean);
}

function detectSegmentRisk(segment: string): CommandRiskAssessment {
    const s = segment.trim();
    const lower = s.toLowerCase();

    if (!s) return { level: 'safe', reason: 'empty' };

    if (
        /(^|\s)(rm\s+-rf\s+\/|mkfs(\.| )|dd\s+if=|:\(\)\s*\{\s*:\|:&\s*;\s*\})/i.test(s) ||
        /\bshred\b/i.test(s)
    ) {
        return { level: 'critical', reason: 'destructive-system-operation' };
    }

    if (
        /\b(sudo|su)\b/i.test(s) ||
        /\b(curl|wget)\b.*\|\s*(bash|sh|zsh)\b/i.test(s) ||
        /\b(curl|wget)\b.*\s(-o|--output|\>)\s/i.test(s)
    ) {
        return { level: 'high', reason: 'privileged-or-network-exec' };
    }

    if (
        /\b(rm|kill|pkill|killall|chmod|chown|useradd|userdel|systemctl|service)\b/i.test(s)
    ) {
        return { level: 'medium', reason: 'state-mutating-command' };
    }

    if (
        /\b(git|npm|pnpm|yarn|npx|node|python|tsx|tsc|next|docker|kubectl|make|cargo)\b/i.test(s)
    ) {
        return { level: 'low', reason: 'developer-command' };
    }

    return { level: 'safe', reason: 'read-or-unknown' };
}

function maxRisk(a: CommandRiskLevel, b: CommandRiskLevel): CommandRiskLevel {
    const order: CommandRiskLevel[] = ['safe', 'low', 'medium', 'high', 'critical'];
    return order[Math.max(order.indexOf(a), order.indexOf(b))];
}

export function classifyCommandRisk(command: string): CommandRiskAssessment {
    const segments = splitByShellOperators(command);
    if (segments.length === 0) return { level: 'safe', reason: 'empty' };

    let highest: CommandRiskAssessment = { level: 'safe', reason: 'safe' };
    for (const seg of segments) {
        const r = detectSegmentRisk(seg);
        if (maxRisk(highest.level, r.level) !== highest.level) {
            highest = r;
        }
    }
    return highest;
}

export function resolveCommandRiskMode(): CommandRiskMode {
    const raw = String(process.env.BASALT_COMMAND_RISK_MODE || 'deny').trim().toLowerCase();
    if (raw === 'off') return 'off';
    if (raw === 'warn') return 'warn';
    return 'deny';
}

export function shouldBlockByRisk(level: CommandRiskLevel, mode: CommandRiskMode): boolean {
    if (mode === 'off') return false;
    if (mode === 'warn') return false;
    return level === 'high' || level === 'critical';
}
