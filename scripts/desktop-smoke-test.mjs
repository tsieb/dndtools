import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const READY_MARKER = 'DNDTOOLS_SMOKE_READY';
const TIMEOUT_MS = 90_000;

function resolveElectronBinary() {
	const base = path.join(process.cwd(), 'node_modules', 'electron', 'dist');
	if (process.platform === 'win32') {
		return path.join(base, 'electron.exe');
	}
	if (process.platform === 'darwin') {
		return path.join(base, 'Electron.app', 'Contents', 'MacOS', 'Electron');
	}
	return path.join(base, 'electron');
}

async function run() {
	const vaultDir = await mkdtemp(path.join(os.tmpdir(), 'dndtools-desktop-smoke-'));
	const electronBinary = resolveElectronBinary();
	const mainEntry = path.join(process.cwd(), 'electron', 'dist', 'main.cjs');

	let timedOut = false;
	let readySeen = false;
	const env = {
		...process.env,
		DNDTOOLS_SMOKE_TEST: '1',
		ELECTRON_ENABLE_LOGGING: '1',
	};
	delete env.ELECTRON_RUN_AS_NODE;
	const launchArgs = [mainEntry, `--vault=${vaultDir}`];
	if (process.env.CI && process.platform === 'linux') {
		launchArgs.push('--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage');
	}

	const child = spawn(electronBinary, launchArgs, {
		env,
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	const timeout = setTimeout(() => {
		timedOut = true;
		child.kill();
	}, TIMEOUT_MS);

	child.stdout.on('data', (chunk) => {
		const text = chunk.toString();
		process.stdout.write(text);
		if (text.includes(READY_MARKER)) {
			readySeen = true;
		}
	});

	child.stderr.on('data', (chunk) => {
		process.stderr.write(chunk.toString());
	});

	const exitCode = await new Promise((resolve) => {
		child.once('exit', (code) => resolve(code));
	});

	clearTimeout(timeout);
	await rm(vaultDir, { recursive: true, force: true });

	if (timedOut) {
		throw new Error(`Desktop smoke test timed out after ${TIMEOUT_MS}ms.`);
	}
	if (!readySeen) {
		throw new Error('Desktop smoke test did not observe readiness marker.');
	}
	if (exitCode !== 0) {
		throw new Error(`Desktop smoke test exited with code ${String(exitCode)}.`);
	}
}

run().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
