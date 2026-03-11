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

export interface LaunchDesktopAppOptions {
	autoCompleteWizard?: boolean;
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

async function completeSetupWizard(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Next' }).click();
	await page.getByRole('button', { name: 'Next' }).click();
	await page.getByRole('button', { name: 'Open DND Tools' }).click();
}

export async function launchDesktopApp(
	vaultDir: string,
	options: LaunchDesktopAppOptions = {},
): Promise<DesktopAppHandle> {
	const autoCompleteWizard = options.autoCompleteWizard ?? true;
	const windowTimeoutMs = Number(process.env.DNDTOOLS_E2E_WINDOW_TIMEOUT_MS ?? '300000');
	const shellReadyTimeoutMs = Number(process.env.DNDTOOLS_E2E_SHELL_READY_TIMEOUT_MS ?? '60000');
	const appMain = path.join(process.cwd(), 'electron', 'dist', 'main.cjs');
	const launchArgs = [appMain, `--vault=${vaultDir}`];
	if (process.env.CI) {
		launchArgs.push('--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage');
	}
	const electronApp = await electron.launch({
		args: launchArgs,
		env: launchEnvironment(),
	});
	let page = (electronApp.windows()[0] ??
		(await electronApp.waitForEvent('window', { timeout: windowTimeoutMs }))) as Page;
	const deadline = Date.now() + shellReadyTimeoutMs;
	while (Date.now() < deadline) {
		for (const candidate of electronApp.windows()) {
			const wizardVisible = await candidate
				.getByRole('heading', { name: 'Welcome to DND Tools' })
				.isVisible({ timeout: 1_000 })
				.catch(() => false);
			if (wizardVisible) {
				page = candidate;
				if (!autoCompleteWizard) {
					return { electronApp, page, vaultDir };
				}
				await completeSetupWizard(candidate);
				await expect(candidate.getByRole('heading', { name: 'Welcome to DND Tools' })).toBeHidden({
					timeout: 20_000,
				});
				await expect(candidate.locator('header').first()).toBeVisible({ timeout: 20_000 });
				return { electronApp, page: candidate, vaultDir };
			}
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
