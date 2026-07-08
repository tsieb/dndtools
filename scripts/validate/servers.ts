// Managed dev/preview servers for browser-driven checks. The runner asks the
// manager to ensure a named server is up before a check that needs it, and to
// tear everything down at the end. Servers already listening on their port
// (e.g. a dev server the user left running) are reused, never double-started.

import path from 'node:path';
import type { ServerSpec } from './types.ts';
import { isPortOpen, spawnServer, waitForPort, c } from './util.ts';

/**
 * The server all browser checks depend on:
 *  - `react-dev`: the React app under `vite dev` on :5273. The Playwright e2e/axe gates and the
 *    verify-* gates all need the DEV-only `window.__rt` seam, so this must be the dev server, not
 *    a production preview. Playwright's own config reuses this existing server when not in CI.
 */
export const SERVERS: Record<string, ServerSpec> = {
	'react-dev': {
		name: 'react-dev',
		command: 'pnpm dev',
		port: 5273,
		readyTimeoutMs: 60_000,
		note: 'React app vite dev server (DEV __rt seam)',
	},
};

interface Running {
	spec: ServerSpec;
	handle: ReturnType<typeof spawnServer> | null; // null = reused an existing external server
}

export class ServerManager {
	private running = new Map<string, Running>();
	constructor(private logDir: string) {}

	async ensure(name: string): Promise<void> {
		if (this.running.has(name)) return;
		const spec = SERVERS[name];
		if (!spec) throw new Error(`unknown server: ${name}`);

		if (await isPortOpen(spec.port)) {
			console.log(c.dim(`   · reusing server already on :${spec.port} (${spec.name})`));
			this.running.set(name, { spec, handle: null });
			return;
		}
		console.log(c.dim(`   · starting ${spec.name} → :${spec.port} …`));
		const handle = spawnServer(spec.command, path.join(this.logDir, `server-${spec.name}.log`));
		this.running.set(name, { spec, handle });
		try {
			await waitForPort(spec.port, spec.readyTimeoutMs);
			console.log(c.dim(`   · ${spec.name} ready on :${spec.port}`));
		} catch (err) {
			throw new Error(`server ${spec.name} failed to become ready: ${(err as Error).message}`, {
				cause: err,
			});
		}
	}

	async shutdown(): Promise<void> {
		for (const { spec, handle } of this.running.values()) {
			if (handle) {
				console.log(c.dim(`   · stopping ${spec.name}`));
				handle.kill();
			}
		}
		this.running.clear();
	}
}
