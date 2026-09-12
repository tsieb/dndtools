// Extend the standard desktop suite without replacing its origin/migration/updater coverage.
'use strict';
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const cwd = path.join(__dirname, '..');
const base = spawnSync(process.execPath, ['scripts/run-desktop-smoke.mjs'], {
	cwd,
	stdio: 'inherit',
});
if (base.status !== 0) process.exit(base.status || 1);
const profile = mkdtempSync(path.join(tmpdir(), 'lamplight-parity-'));
let ok = true;
try {
	for (const mode of ['write', 'verify']) {
		const result = spawnSync(
			require('electron'),
			['--no-sandbox', path.join(__dirname, 'smoke-parity.cjs'), mode],
			{
				cwd,
				env: { ...process.env, SMOKE_USER_DATA: profile },
				encoding: 'utf8',
				timeout: 60000,
			},
		);
		process.stdout.write(result.stdout || '');
		process.stderr.write(result.stderr || '');
		const line = (result.stdout || '')
			.split('\n')
			.find((line) => line.startsWith('PARITY_SMOKE_RESULT '));
		if (
			result.status !== 0 ||
			!line ||
			JSON.parse(line.slice('PARITY_SMOKE_RESULT '.length)).ok !== true
		) {
			ok = false;
			break;
		}
	}
} finally {
	rmSync(profile, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
