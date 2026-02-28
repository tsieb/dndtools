import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import type { McpLifecycleEvent } from '../src/lib/types/diagnostics.js';

export type McpSidecarState = 'stopped' | 'running' | 'error';

export interface McpSidecarStatus {
	state: McpSidecarState;
	vaultDir: string | null;
	entry: string | null;
	pid: number | null;
	lastStartedAt: string | null;
	lastStoppedAt: string | null;
	lastExitReason: string | null;
	restartCount: number;
	crashCount: number;
	error: string | null;
}

/** Maximum number of lifecycle events kept in the in-memory ring buffer. */
const MAX_IN_MEMORY_EVENTS = 500;
/** Maximum number of lifecycle events persisted to the on-disk log. */
const MAX_PERSISTED_EVENTS = 200;
/** Current version of the on-disk sidecar log format. */
const SIDECAR_LOG_VERSION = 1;

function resolveDefaultEntry(): string | null {
	const candidates = [
		// Packaged/Electron build output (electron/dist -> repo root)
		path.resolve(__dirname, '../../mcp/dist/index.cjs'),
		path.resolve(__dirname, '../../mcp/dist/index.js'),
		// Source-run Electron main (electron -> repo root)
		path.resolve(__dirname, '../mcp/dist/index.cjs'),
		path.resolve(__dirname, '../mcp/dist/index.js'),
		// Fallback for cwd-based launches
		path.resolve(process.cwd(), 'mcp/dist/index.cjs'),
		path.resolve(process.cwd(), 'mcp/dist/index.js'),
	];
	return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export class McpSidecar {
	private child: ChildProcess | null = null;
	private lifecycleEvents: McpLifecycleEvent[] = [];
	private logPath: string | null = null;
	private status: McpSidecarStatus = {
		state: 'stopped',
		vaultDir: null,
		entry: null,
		pid: null,
		lastStartedAt: null,
		lastStoppedAt: null,
		lastExitReason: null,
		restartCount: 0,
		crashCount: 0,
		error: null,
	};

	getStatus(): McpSidecarStatus {
		return { ...this.status };
	}

	getLifecycleEvents(limit = 30): McpLifecycleEvent[] {
		return this.lifecycleEvents.slice(-limit).reverse();
	}

	/**
	 * Set the vault directory so lifecycle events can be persisted to
	 * `.vault/sidecar-log.json`.  Call this before the first `restart()`.
	 */
	setLogPath(vaultDir: string): void {
		this.logPath = path.join(vaultDir, '.vault', 'sidecar-log.json');
	}

	/**
	 * Load previously persisted lifecycle events from `.vault/sidecar-log.json`.
	 *
	 * Allows event history to survive application restarts.
	 * Errors are silently swallowed — the log file may not exist yet on first launch.
	 */
	async loadPersistedEvents(): Promise<void> {
		if (!this.logPath) return;
		try {
			const raw = await fs.promises.readFile(this.logPath, 'utf-8');
			const data: unknown = JSON.parse(raw);
			if (
				data !== null &&
				typeof data === 'object' &&
				'version' in data &&
				(data as { version: unknown }).version === SIDECAR_LOG_VERSION &&
				'events' in data &&
				Array.isArray((data as { events: unknown }).events)
			) {
				const events = (data as { events: McpLifecycleEvent[] }).events;
				this.lifecycleEvents = events.slice(-MAX_IN_MEMORY_EVENTS);
			}
		} catch {
			// File may not exist yet on first launch — that is expected.
		}
	}

	private recordLifecycleEvent(event: McpLifecycleEvent): void {
		this.lifecycleEvents.push(event);
		if (this.lifecycleEvents.length > MAX_IN_MEMORY_EVENTS) {
			this.lifecycleEvents.shift();
		}
		this.persistLogAsync();
	}

	/**
	 * Persist the last N lifecycle events to `.vault/sidecar-log.json`.
	 *
	 * Best-effort, non-blocking write.  Errors are silently ignored so a
	 * write failure never disrupts sidecar lifecycle management.
	 */
	private persistLogAsync(): void {
		if (!this.logPath) return;
		const logPath = this.logPath;
		const events = this.lifecycleEvents.slice(-MAX_PERSISTED_EVENTS);
		const payload = JSON.stringify({ version: SIDECAR_LOG_VERSION, events }, null, 2);
		void fs.promises
			.mkdir(path.dirname(logPath), { recursive: true })
			.then(() => fs.promises.writeFile(logPath, payload, 'utf-8'))
			.catch(() => undefined);
	}

	async restart(vaultDir: string): Promise<void> {
		const wasRunning = this.child !== null;
		await this.stop();
		if (wasRunning) {
			this.recordLifecycleEvent({
				at: new Date().toISOString(),
				event: 'restart',
				reason: 'manual_restart',
				pid: null,
			});
			this.status = {
				...this.status,
				restartCount: this.status.restartCount + 1,
			};
		}

		const entry = resolveDefaultEntry();
		if (!entry) {
			this.status = {
				state: 'error',
				vaultDir,
				entry: null,
				pid: null,
				lastStartedAt: null,
				lastStoppedAt: new Date().toISOString(),
				lastExitReason: 'missing_bundle',
				restartCount: this.status.restartCount,
				crashCount: this.status.crashCount,
				error: 'MCP bundle missing. Run "pnpm mcp:build" before launching desktop mode.',
			};
			this.recordLifecycleEvent({
				at: new Date().toISOString(),
				event: 'crash',
				reason: 'missing_bundle',
				pid: null,
			});
			return;
		}

		const child = spawn('node', [entry, vaultDir], {
			// Keep stdin open so the stdio MCP server stays alive between status refreshes.
			stdio: ['pipe', 'ignore', 'ignore'],
			windowsHide: true,
		});

		this.child = child;
		this.status = {
			state: 'running',
			vaultDir,
			entry,
			pid: child.pid ?? null,
			lastStartedAt: new Date().toISOString(),
			lastStoppedAt: null,
			lastExitReason: null,
			restartCount: this.status.restartCount,
			crashCount: this.status.crashCount,
			error: null,
		};
		this.recordLifecycleEvent({
			at: this.status.lastStartedAt,
			event: 'start',
			reason: null,
			pid: child.pid ?? null,
		});

		child.once('error', (error) => {
			if (this.child !== child) return;
			this.child = null;
			const at = new Date().toISOString();
			this.status = {
				...this.status,
				state: 'error',
				pid: null,
				lastStoppedAt: at,
				lastExitReason: 'spawn_error',
				crashCount: this.status.crashCount + 1,
				error: error.message,
			};
			this.recordLifecycleEvent({
				at,
				event: 'crash',
				reason: `spawn_error:${error.message}`,
				pid: child.pid ?? null,
			});
		});

		child.once('exit', (code, signal) => {
			if (this.child !== child) return;
			this.child = null;
			const at = new Date().toISOString();
			const exitedWithError = code !== 0 && code !== null;
			const reason = !exitedWithError
				? `exit:${code ?? 'null'}${signal ? `:${signal}` : ''}`
				: `crash:${code}${signal ? `:${signal}` : ''}`;
			this.status = {
				...this.status,
				state: exitedWithError ? 'error' : 'stopped',
				pid: null,
				lastStoppedAt: at,
				lastExitReason: reason,
				crashCount: exitedWithError ? this.status.crashCount + 1 : this.status.crashCount,
				error: !exitedWithError ? null : `Exited with code ${code}${signal ? ` (${signal})` : ''}`,
			};
			this.recordLifecycleEvent({
				at,
				event: exitedWithError ? 'crash' : 'stop',
				reason,
				pid: child.pid ?? null,
			});
		});
	}

	async stop(): Promise<void> {
		if (!this.child) {
			if (this.status.state !== 'error') {
				this.status = {
					...this.status,
					state: 'stopped',
					pid: null,
					lastStoppedAt: new Date().toISOString(),
					lastExitReason: 'already_stopped',
				};
			}
			return;
		}

		const child = this.child;
		this.child = null;

		await new Promise<void>((resolve) => {
			let settled = false;
			const finish = (): void => {
				if (settled) return;
				settled = true;
				resolve();
			};

			child.once('exit', finish);
			child.kill();
			setTimeout(finish, 1200);
		});

		if (this.status.state !== 'error') {
			const at = new Date().toISOString();
			this.status = {
				...this.status,
				state: 'stopped',
				pid: null,
				lastStoppedAt: at,
				lastExitReason: 'manual_stop',
			};
			this.recordLifecycleEvent({
				at,
				event: 'stop',
				reason: 'manual_stop',
				pid: child.pid ?? null,
			});
		}
	}
}
