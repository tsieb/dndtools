// One-command desktop verification: runs the Electron smoke test (scripts/smoke-desktop.cjs) twice
// against a shared throwaway userData dir — `write` then `verify` — proving the packaged app boots from
// its secure custom origin, identifies that origin correctly in CORS requests, loads self-hosted fonts
// offline, honours the production CSP, persists IndexedDB across a genuine process restart, and migrates
// the v0.2.0 file origin without losing binary data or secrets. Requires a display. Run after `vite build`.

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronBin = require('electron'); // in a plain-node context this resolves to the binary path
const here = path.dirname(new URL(import.meta.url).pathname);
const smoke = path.join(here, 'smoke-desktop.cjs');
const migrationSmoke = path.join(here, 'smoke-storage-origin-migration.cjs');
const dist = path.join(here, '..', 'dist', 'index.html');

if (!existsSync(dist)) {
	console.error('✗ dist/index.html missing — run `vite build` first.');
	process.exit(1);
}

const userData = mkdtempSync(path.join(tmpdir(), 'dndtools-desktop-smoke-'));
const sceneName = `Smoke Crypt ${Date.now()}`;
const env = { ...process.env, SMOKE_USER_DATA: userData, SMOKE_SCENE_NAME: sceneName };
// Electron needs --no-sandbox when the setuid sandbox helper isn't configured (common on CI/dev boxes).
const args = ['--no-sandbox', smoke];

function run(mode) {
	const res = spawnSync(electronBin, [...args, mode], { env, encoding: 'utf8' });
	const line = (res.stdout || '').split('\n').find((l) => l.startsWith('SMOKE_RESULT '));
	if (!line) {
		console.error(`✗ ${mode}: no result. stderr:\n${(res.stderr || '').slice(-800)}`);
		return { ok: false };
	}
	const result = JSON.parse(line.slice('SMOKE_RESULT '.length));
	console.log(`${result.ok ? '✓' : '✗'} ${mode}: ${JSON.stringify(result)}`);
	return result;
}

function runMigration() {
	const res = spawnSync(electronBin, ['--no-sandbox', migrationSmoke], {
		env: process.env,
		encoding: 'utf8',
	});
	const line = (res.stdout || '')
		.split('\n')
		.find((entry) => entry.startsWith('MIGRATION_SMOKE_RESULT '));
	if (!line) {
		console.error(`✗ origin migration: no result. stderr:\n${(res.stderr || '').slice(-1200)}`);
		return { ok: false };
	}
	const result = JSON.parse(line.slice('MIGRATION_SMOKE_RESULT '.length));
	console.log(`${result.ok ? '✓' : '✗'} origin migration: ${JSON.stringify(result)}`);
	if (!result.ok && res.stderr) console.error(res.stderr.slice(-1200));
	return result;
}

try {
	const w = run('write');
	const v = w.ok ? run('verify') : { ok: false };
	const migration = w.ok && v.ok ? runMigration() : { ok: false };
	const ok = w.ok && v.ok && migration.ok;
	console.log(
		ok
			? '\n✓ desktop smoke PASS (secure app origin, CORS, persistence, and crash-safe file-origin upgrade)'
			: '\n✗ desktop smoke FAIL',
	);
	process.exit(ok ? 0 : 1);
} finally {
	rmSync(userData, { recursive: true, force: true });
}
