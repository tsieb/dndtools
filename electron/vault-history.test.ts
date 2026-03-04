// @vitest-environment node
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { VaultHistoryStore, evaluateVaultPermissions } from './vault-history.js';

async function makeTempDir(prefix: string): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe('vault history and permission checks', () => {
	it('marks a readable/writable directory as healthy', async () => {
		const vaultDir = await makeTempDir('dndtools-vault-health-');
		try {
			const report = await evaluateVaultPermissions(vaultDir);
			expect(report.health).toBe('healthy');
			expect(report.readable).toBe(true);
			expect(report.writable).toBe(true);
			expect(report.available).toBe(true);
		} finally {
			await fs.rm(vaultDir, { recursive: true, force: true });
		}
	});

	it('marks a missing directory as unavailable with remediation guidance', async () => {
		const missing = path.join(os.tmpdir(), `dndtools-missing-${Date.now()}`);
		const report = await evaluateVaultPermissions(missing);
		expect(report.health).toBe('unavailable');
		expect(report.available).toBe(false);
		expect(report.remediation).toContain('missing');
	});

	it('records opens and failures in recent vault history', async () => {
		const root = await makeTempDir('dndtools-vault-history-');
		const historyPath = path.join(root, 'vault-history.json');
		const store = new VaultHistoryStore(historyPath);
		const okVault = await makeTempDir('dndtools-ok-vault-');
		const failingVault = path.join(root, 'missing-vault');

		try {
			await store.recordVaultOpen(okVault);
			await store.recordVaultFailure(failingVault, 'Folder missing');
			const recent = await store.listRecentVaults(5);
			expect(recent.length).toBeGreaterThanOrEqual(2);

			const okEntry = recent.find(
				(entry) => path.resolve(entry.vaultDir) === path.resolve(okVault),
			);
			expect(okEntry?.health).toBe('healthy');
			expect(okEntry?.lastError).toBeNull();

			const failedEntry = recent.find(
				(entry) => path.resolve(entry.vaultDir) === path.resolve(failingVault),
			);
			expect(failedEntry?.health).toBe('unavailable');
			expect(failedEntry?.lastError).toContain('Folder missing');
		} finally {
			await fs.rm(okVault, { recursive: true, force: true });
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
