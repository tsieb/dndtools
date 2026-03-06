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
	let page = (electronApp.windows()[0] ??
		(await electronApp.waitForEvent('window', { timeout: windowTimeoutMs }))) as Page;
	const deadline = Date.now() + shellReadyTimeoutMs;
	while (Date.now() < deadline) {
		for (const candidate of electronApp.windows()) {
			const ready = await candidate
				.locator('header')
				.first()
				.isVisible({ timeout: 1_000 })
				.catch(() => false);
			if (ready) {
				page = candidate;
				return { electronApp, page, vaultDir };
			}
		}
		await electronApp
			.waitForEvent('window', { timeout: Math.min(1_000, Math.max(1, deadline - Date.now())) })
			.catch(() => undefined);
	}
	await expect(page.locator('header').first()).toBeVisible({ timeout: 1_000 });
	return { electronApp, page, vaultDir };
}

export async function closeDesktopApp(handle: DesktopAppHandle): Promise<void> {
	await handle.electronApp.close();
	await fs.rm(handle.vaultDir, { recursive: true, force: true });
}
