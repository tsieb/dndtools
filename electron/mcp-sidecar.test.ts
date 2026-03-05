// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { McpSidecar } from './mcp-sidecar.js';

describe('McpSidecar runtime selection', () => {
	it('starts with bundled runtime metadata and can stop cleanly', async () => {
		const vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-sidecar-runtime-'));
		const sidecarEntry = path.join(vaultDir, 'sidecar-entry.cjs');
		await fs.writeFile(
			sidecarEntry,
			'process.stdin.resume(); setInterval(() => undefined, 10_000);',
			'utf-8',
		);
		const sidecar = new McpSidecar({ entryOverride: sidecarEntry });
		try {
			await sidecar.restart(vaultDir);
			const status = sidecar.getStatus();
			expect(status.runtimeSource).toBe('bundled_electron');
			expect(status.runtimeVersion).toMatch(/^v\d+\./);
			expect(['running', 'error']).toContain(status.state);
		} finally {
			await sidecar.stop();
			await fs.rm(vaultDir, { recursive: true, force: true });
		}
	});
});
