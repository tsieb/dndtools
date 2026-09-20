import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { captureRevision, assertSameRevision } from '../../scripts/perf/provenance';

it('binds evidence to a clean immutable revision and rejects changes during capture', () => {
	const root = mkdtempSync(join(tmpdir(), 'perf-provenance-'));
	const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
	try {
		git('init');
		git('config', 'user.email', 'fixture@example.invalid');
		git('config', 'user.name', 'Fixture');
		writeFileSync(join(root, 'source'), 'before');
		git('add', 'source');
		git('commit', '-m', 'fixture');
		const revision = captureRevision(root);
		expect(revision.commit).toMatch(/^[a-f0-9]{40}$/);
		expect(() => assertSameRevision(root, revision)).not.toThrow();
		writeFileSync(join(root, 'source'), 'after');
		expect(() => assertSameRevision(root, revision)).toThrow('clean checkout');
		git('add', 'source');
		expect(() => captureRevision(root)).toThrow('clean checkout');
		git('commit', '-m', 'changed');
		expect(() => assertSameRevision(root, revision)).toThrow('changed during');
		writeFileSync(join(root, 'new-source'), 'untracked');
		expect(() => captureRevision(root)).toThrow('clean checkout');
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
