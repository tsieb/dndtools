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
	const windowTimeoutMs = Number(process.env.DNDTOOLS_E2E_WINDOW_TIMEOUT_MS ?? '300000');
	const shellReadyTimeoutMs = Number(process.env.DNDTOOLS_E2E_SHELL_READY_TIMEOUT_MS ?? '60000');
	const appMain = path.join(process.cwd(), 'electron', 'dist', 'main.cjs');
	const electronApp = await electron.launch({
		args: [appMain, `--vault=${vaultDir}`],
		env: launchEnvironment(),
	});
	const page = (electronApp.windows()[0] ??
		(await electronApp.waitForEvent('window', { timeout: windowTimeoutMs }))) as Page;
	await expect(page).toHaveTitle(/DND Tools/i);
	await expect(page.getByRole('link', { name: 'DND Tools' })).toBeVisible({
		timeout: shellReadyTimeoutMs,
	});
	return { electronApp, page, vaultDir };
}

export async function closeDesktopApp(handle: DesktopAppHandle): Promise<void> {
	await handle.electronApp.close();
	await fs.rm(handle.vaultDir, { recursive: true, force: true });
}
