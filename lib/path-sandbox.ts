import path from 'path';

/**
 * True if `target` is `root` or a path inside `root` (after resolve).
 * Blocks `..` traversal and absolute paths outside the project.
 */
export function isPathInsideProjectRoot(projectRoot: string, targetPath: string): boolean {
    const root = path.resolve(projectRoot);
    const target = path.resolve(targetPath);
    const rel = path.relative(root, target);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function assertPathInsideProjectRoot(projectRoot: string, targetPath: string, label = 'path'): void {
    if (!isPathInsideProjectRoot(projectRoot, targetPath)) {
        throw new Error(
            `${label} resolves outside project root: ${path.resolve(targetPath)} (root: ${path.resolve(projectRoot)})`
        );
    }
}
