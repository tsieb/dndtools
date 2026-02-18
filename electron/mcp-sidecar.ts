import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

export type McpSidecarState = 'stopped' | 'running' | 'error';

export interface McpSidecarStatus {
	state: McpSidecarState;
	vaultDir: string | null;
	entry: string | null;
	pid: number | null;
	lastStartedAt: string | null;
	error: string | null;
}

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
	private status: McpSidecarStatus = {
		state: 'stopped',
		vaultDir: null,
		entry: null,
		pid: null,
		lastStartedAt: null,
		error: null,
	};

	getStatus(): McpSidecarStatus {
		return { ...this.status };
	}

	async restart(vaultDir: string): Promise<void> {
		await this.stop();
		const entry = resolveDefaultEntry();
		if (!entry) {
			this.status = {
				state: 'error',
				vaultDir,
				entry: null,
				pid: null,
				lastStartedAt: null,
				error: 'MCP bundle missing. Run "pnpm mcp:build" before launching desktop mode.',
			};
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
			error: null,
		};

		child.once('error', (error) => {
			if (this.child !== child) return;
			this.child = null;
			this.status = {
				...this.status,
				state: 'error',
				pid: null,
				error: error.message,
			};
		});

		child.once('exit', (code, signal) => {
			if (this.child !== child) return;
			this.child = null;
			const exitedWithError = code !== 0 && code !== null;
			this.status = {
				...this.status,
				state: exitedWithError ? 'error' : 'stopped',
				pid: null,
				error:
					!exitedWithError
						? null
						: `Exited with code ${code}${signal ? ` (${signal})` : ''}`,
			};
		});
	}

	async stop(): Promise<void> {
		if (!this.child) {
			if (this.status.state !== 'error') {
				this.status = {
					...this.status,
					state: 'stopped',
					pid: null,
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
			this.status = {
				...this.status,
				state: 'stopped',
				pid: null,
			};
		}
	}
}
