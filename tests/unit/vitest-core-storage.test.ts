import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// Exercise the real core config and schema assertions without filling shared host storage.
// Only the child runner's temporary writes fail; repository files and test assertions are intact.
function runWithTemporaryQuota(pool?: 'forks') {
	const directory = mkdtempSync(join(tmpdir(), 'dndtools-vitest-quota-'));
	const temporary = join(directory, 'tmp');
	const preload = join(directory, 'quota.mjs');
	mkdirSync(temporary);
	writeFileSync(
		preload,
		`import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { sep } from 'node:path';
const writeFile = fs.writeFile;
fs.writeFile = async function (path, ...args) {
  if (String(path).startsWith(process.env.TMPDIR + sep)) {
    console.error('Injected EDQUOT on temporary module write');
    throw Object.assign(new Error('Unknown system error -122: Unknown system error -122, write'), {
      code: 'EDQUOT', errno: -122, syscall: 'write',
    });
  }
  return writeFile.call(this, path, ...args);
};
syncBuiltinESMExports();
`,
	);
	try {
		return spawnSync(
			process.execPath,
			[
				'--import',
				pathToFileURL(preload).href,
				resolve('node_modules/vitest/vitest.mjs'),
				'run',
				'tests/schemas.test.ts',
				'--maxWorkers=1',
				...(pool ? [`--pool=${pool}`] : []),
			],
			{
				cwd: resolve('packages/core'),
				env: { ...process.env, TMPDIR: temporary, NO_COLOR: '1' },
				encoding: 'utf8',
				timeout: 20_000,
			},
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

describe('core test runner under temporary storage quota', () => {
	it('reproduces the promotion load failure with the forks disk transport', () => {
		const result = runWithTemporaryQuota('forks');
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('Injected EDQUOT on temporary module write');
		expect(result.stderr).toContain('Unknown system error -122');
	}, 30_000);

	it('runs the core schema assertions with the configured pool despite that quota', () => {
		const result = runWithTemporaryQuota();
		expect(result.error).toBeUndefined();
		expect(result.status, result.stdout + result.stderr).toBe(0);
		expect(result.stdout).toMatch(/Test Files\s+1 passed/);
		expect(result.stderr).not.toContain('Injected EDQUOT');
	}, 30_000);
});
