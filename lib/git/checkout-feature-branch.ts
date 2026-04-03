import { execFile } from 'child_process';
import { promisify } from 'util';
import { classifyCommandRisk, resolveCommandRiskMode, shouldBlockByRisk } from '@/lib/command-risk';

const execFileAsync = promisify(execFile);

/**
 * Switches to an existing local branch or creates it from the current HEAD.
 * Avoids `git checkout -b` when the branch already exists (fatal: branch already exists).
 */
export async function checkoutOrCreateLocalBranch(cwd: string, branchName: string): Promise<void> {
    if (!branchName || /[\s'"`;]/.test(branchName)) {
        throw new Error(`Unsafe or empty branch name: ${branchName}`);
    }
    const risk = classifyCommandRisk(`git checkout ${branchName}`);
    const riskMode = resolveCommandRiskMode();
    if (shouldBlockByRisk(risk.level, riskMode)) {
        throw new Error(`Blocked by BASALT_COMMAND_RISK_MODE=${riskMode}: ${risk.level} risk (${risk.reason}).`);
    }
    try {
        await execFileAsync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], { cwd });
    } catch {
        await execFileAsync('git', ['checkout', '-b', branchName], { cwd });
        return;
    }
    await execFileAsync('git', ['checkout', branchName], { cwd });
}
