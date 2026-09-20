import { execFileSync } from 'node:child_process';

/** Refuse timing evidence whose code cannot be identified by an immutable commit. */
export function captureRevision(root: string): { commit: string; tree: string } {
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
	if (git('status', '--porcelain', '--untracked-files=normal')) {
		throw new Error('Performance capture requires a clean checkout; commit the candidate first.');
	}
	return { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}') };
}

export function assertSameRevision(root: string, expected: { commit: string; tree: string }): void {
	const actual = captureRevision(root);
	if (actual.commit !== expected.commit || actual.tree !== expected.tree) {
		throw new Error('Source revision changed during performance capture; discard this run.');
	}
}
