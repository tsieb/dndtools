// One-command desktop verification: runs the Electron smoke test (scripts/smoke-desktop.cjs) twice
// against a shared throwaway userData dir — `write` then `verify` — proving the packaged app boots from
// file://, loads self-hosted fonts offline, honours the production CSP, and persists IndexedDB across a
// genuine process restart. Requires a display (uses the real Electron/Chromium runtime); intended for
// local/dev use, not the headless CI. Run after `vite build` (see the `desktop:smoke` package script).

import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const electronBin = require('electron'); // in a plain-node context this resolves to the binary path
const here = path.dirname(new URL(import.meta.url).pathname);
const smoke = path.join(here, 'smoke-desktop.cjs');
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

try {
	const w = run('write');
	const v = w.ok ? run('verify') : { ok: false };
	const ok = w.ok && v.ok;
	console.log(ok ? '\n✓ desktop smoke PASS (file:// render, offline fonts, CSP, IndexedDB persistence)' : '\n✗ desktop smoke FAIL');
	process.exit(ok ? 0 : 1);
} finally {
	rmSync(userData, { recursive: true, force: true });
}
