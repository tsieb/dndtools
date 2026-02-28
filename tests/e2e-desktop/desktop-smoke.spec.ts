import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test, expect, _electron as electron } from '@playwright/test';

test.describe('Desktop smoke', () => {
	test('launches built desktop app and renders shell', async () => {
		const vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dndtools-e2e-vault-'));
		const appMain = path.join(process.cwd(), 'electron', 'dist', 'main.cjs');
		const launchEnv: Record<string, string> = {};
		for (const [key, value] of Object.entries(process.env)) {
			if (typeof value === 'string') {
				launchEnv[key] = value;
			}
		}
		launchEnv.ELECTRON_ENABLE_LOGGING = '0';
		delete launchEnv.ELECTRON_RUN_AS_NODE;

		const electronApp = await electron.launch({
			args: [appMain, `--vault=${vaultDir}`],
			env: launchEnv,
		});

		try {
			const window = await electronApp.firstWindow();
			await expect(window).toHaveTitle(/DND Tools/i);
			await expect(window.getByText('DND Tools')).toBeVisible({ timeout: 15_000 });
		} finally {
			await electronApp.close();
			await fs.rm(vaultDir, { recursive: true, force: true });
		}
	});
});
