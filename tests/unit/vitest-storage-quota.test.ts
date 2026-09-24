import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// Every Vitest config the `pnpm test` gate runs, each with one real test file as a probe. The core
// suite failed promotion dda3120a5615 this way and the app suite failed 52161311fa13; cloud and
// tooling share the same exposure.
const SUITES = [
	{ name: 'core', cwd: 'packages/core', config: [], probe: 'tests/schemas.test.ts' },
	{
		name: 'app',
		cwd: '.',
		config: ['--config', 'vitest.app.config.ts'],
		probe: 'apps/gm-react/src/runtime/audio-starter-pack.test.ts',
	},
	{
		name: 'cloud',
		cwd: '.',
		config: ['--config', 'vitest.cloud.config.ts'],
		probe: 'apps/gm-react/src/cloud/vaultMode.test.ts',
	},
	{ name: 'tooling', cwd: '.', config: [], probe: 'tests/unit/format-changed.test.ts' },
] as const;

// Exercise the real configs and assertions without filling shared host storage.
// Only the child runner's temporary writes fail; repository files and test assertions are intact.
function runWithTemporaryQuota(suite: (typeof SUITES)[number], pool?: 'forks') {
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
				...suite.config,
				suite.probe,
				'--maxWorkers=1',
				...(pool ? [`--pool=${pool}`] : []),
			],
			{
				cwd: resolve(suite.cwd),
				env: { ...process.env, TMPDIR: temporary, NO_COLOR: '1' },
				encoding: 'utf8',
				timeout: 40_000,
			},
		);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

describe.each(SUITES)('$name test runner under temporary storage quota', (suite) => {
	it('reproduces the promotion load failure with the forks disk transport', () => {
		const result = runWithTemporaryQuota(suite, 'forks');
		expect(result.error).toBeUndefined();
		expect(result.status).toBe(1);
		expect(result.stderr).toContain('Injected EDQUOT on temporary module write');
		expect(result.stderr + result.stdout).toContain('Unknown system error -122');
	}, 60_000);

	it('runs the probe assertions with the configured pool despite that quota', () => {
		const result = runWithTemporaryQuota(suite);
		expect(result.error).toBeUndefined();
		expect(result.status, result.stdout + result.stderr).toBe(0);
		expect(result.stdout).toMatch(/Test Files\s+1 passed/);
		expect(result.stderr).not.toContain('Injected EDQUOT');
	}, 60_000);
});
