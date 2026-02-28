import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
	expect,
	_electron as electron,
	type ElectronApplication,
	type Page,
} from '@playwright/test';

export interface DesktopAppHandle {
	electronApp: ElectronApplication;
	page: Page;
	vaultDir: string;
}

function launchEnvironment(): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (typeof value === 'string') {
			env[key] = value;
		}
	}
	env.ELECTRON_ENABLE_LOGGING = '0';
	delete env.ELECTRON_RUN_AS_NODE;
	return env;
}

export async function createTempVaultDir(prefix: string): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function launchDesktopApp(vaultDir: string): Promise<DesktopAppHandle> {
	const appMain = path.join(process.cwd(), 'electron', 'dist', 'main.cjs');
	const electronApp = await electron.launch({
		args: [appMain, `--vault=${vaultDir}`],
		env: launchEnvironment(),
	});
	const page = await electronApp.firstWindow();
	await expect(page).toHaveTitle(/DND Tools/i);
	await expect(page.getByRole('link', { name: 'DND Tools' })).toBeVisible({ timeout: 15_000 });
	return { electronApp, page, vaultDir };
}

export async function closeDesktopApp(handle: DesktopAppHandle): Promise<void> {
	await handle.electronApp.close();
	await fs.rm(handle.vaultDir, { recursive: true, force: true });
}
