import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Switches to an existing local branch or creates it from the current HEAD.
 * Avoids `git checkout -b` when the branch already exists (fatal: branch already exists).
 */
export async function checkoutOrCreateLocalBranch(cwd: string, branchName: string): Promise<void> {
    if (!branchName || /[\s'"`;]/.test(branchName)) {
        throw new Error(`Unsafe or empty branch name: ${branchName}`);
    }
    try {
        await execAsync(`git show-ref --verify --quiet refs/heads/${branchName}`, { cwd });
    } catch {
        await execAsync(`git checkout -b ${branchName}`, { cwd });
        return;
    }
    await execAsync(`git checkout ${branchName}`, { cwd });
}
