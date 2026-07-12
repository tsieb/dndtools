// Low-level helpers: process execution with log capture, TCP port readiness,
// timing/format, and terminal color. No dependencies beyond Node builtins so the
// harness stays runnable via `tsx` with nothing to install.

import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

export const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: string) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = {
	bold: wrap('1'),
	dim: wrap('2'),
	red: wrap('31'),
	green: wrap('32'),
	yellow: wrap('33'),
	blue: wrap('34'),
	cyan: wrap('36'),
	gray: wrap('90'),
};

export function fmtDuration(ms: number): string {
	if (ms < 1000) return `${Math.round(ms)}ms`;
	const s = ms / 1000;
	if (s < 60) return `${s.toFixed(1)}s`;
	const m = Math.floor(s / 60);
	return `${m}m${Math.round(s - m * 60)}s`;
}

export interface ExecResult {
	code: number;
	durationMs: number;
	/** Last chunk of combined output, for inline reporting. */
	tail: string;
	timedOut: boolean;
}

/**
 * Run a shell command, streaming combined stdout/stderr to `logPath` (if given)
 * and keeping the tail in memory. Kills the whole process group on timeout.
 */
export function exec(
	command: string,
	opts: {
		cwd?: string;
		env?: Record<string, string>;
		timeoutMs?: number;
		logPath?: string;
		onLine?: (line: string) => void;
	} = {},
): Promise<ExecResult> {
	const { cwd = REPO_ROOT, timeoutMs = 20 * 60_000, logPath } = opts;
	if (logPath) mkdirSync(path.dirname(logPath), { recursive: true });
	const logStream = logPath ? createWriteStream(logPath, { flags: 'w' }) : null;
	const start = Date.now();

	return new Promise<ExecResult>((resolve) => {
		const child = spawn(command, {
			cwd,
			shell: '/bin/bash',
			env: { ...process.env, FORCE_COLOR: '0', ...opts.env },
			detached: true, // own process group so timeout can kill descendants (vite, playwright)
		});
		logStream?.write(`$ ${command}\n\n`);

		const tailBuf: string[] = [];
		let timedOut = false;
		const pushChunk = (buf: Buffer) => {
			const s = buf.toString();
			logStream?.write(s);
			tailBuf.push(s);
			// keep only the last ~8000 chars in memory
			let total = tailBuf.reduce((n, x) => n + x.length, 0);
			while (total > 8000 && tailBuf.length > 1) total -= tailBuf.shift()!.length;
			if (opts.onLine) for (const line of s.split('\n')) if (line.trim()) opts.onLine(line);
		};
		child.stdout.on('data', pushChunk);
		child.stderr.on('data', pushChunk);

		const timer = setTimeout(() => {
			timedOut = true;
			try {
				process.kill(-child.pid!, 'SIGKILL');
			} catch {
				/* already gone */
			}
		}, timeoutMs);

		child.on('close', (code) => {
			clearTimeout(timer);
			logStream?.end();
			resolve({
				code: timedOut ? 124 : (code ?? 1),
				durationMs: Date.now() - start,
				tail: tailBuf.join('').trim().split('\n').slice(-25).join('\n'),
				timedOut,
			});
		});
		child.on('error', (err) => {
			clearTimeout(timer);
			logStream?.write(`\n[spawn error] ${err.message}\n`);
			logStream?.end();
			resolve({ code: 127, durationMs: Date.now() - start, tail: err.message, timedOut });
		});
	});
}

/** Spawn a long-lived process; returns a handle with a kill() that tears down the group. */
export function spawnServer(command: string, logPath: string, env?: Record<string, string>) {
	mkdirSync(path.dirname(logPath), { recursive: true });
	const logStream = createWriteStream(logPath, { flags: 'w' });
	const child = spawn(command, {
		cwd: REPO_ROOT,
		shell: '/bin/bash',
		env: { ...process.env, FORCE_COLOR: '0', ...env },
		detached: true,
	});
	logStream.write(`$ ${command}\n\n`);
	child.stdout.on('data', (b) => logStream.write(b));
	child.stderr.on('data', (b) => logStream.write(b));
	return {
		pid: child.pid,
		kill() {
			try {
				process.kill(-child.pid!, 'SIGKILL');
			} catch {
				/* already gone */
			}
			logStream.end();
		},
	};
}

// Dev servers (vite) bind to `localhost`, which resolves to IPv6 `::1` on many
// systems while a bare `127.0.0.1` probe sees nothing. So we probe BOTH stacks
// and treat the port as open if either accepts.
const PROBE_HOSTS = ['127.0.0.1', '::1'] as const;

function tryConnect(port: number, host: string): Promise<boolean> {
	return new Promise((resolve) => {
		const sock = net.connect({ port, host });
		const done = (ok: boolean) => {
			sock.destroy();
			resolve(ok);
		};
		sock.once('connect', () => done(true));
		sock.once('error', () => done(false));
	});
}

export async function isPortOpen(port: number): Promise<boolean> {
	for (const host of PROBE_HOSTS) if (await tryConnect(port, host)) return true;
	return false;
}

/** Resolve once a TCP port accepts a connection (v4 or v6), or reject after `timeoutMs`. */
export async function waitForPort(port: number, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (await isPortOpen(port)) return;
		if (Date.now() > deadline) throw new Error(`port ${port} not ready after ${timeoutMs}ms`);
		await new Promise((r) => setTimeout(r, 400));
	}
}
