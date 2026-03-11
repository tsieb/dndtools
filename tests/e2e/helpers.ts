import { expect, type Page } from '@playwright/test';

export async function waitForAppReady(page: Page): Promise<void> {
	await page.goto('/');
	const mainContent = page.locator('main#main-content');
	const skipSetup = page.getByRole('button', { name: 'Skip setup' });
	const mainVisible: Promise<'main' | null> = mainContent
		.waitFor({ state: 'visible', timeout: 30_000 })
		.then(() => 'main' as const)
		.catch(() => null);
	const skipVisible: Promise<'skip' | null> = skipSetup
		.waitFor({ state: 'visible', timeout: 30_000 })
		.then(() => 'skip' as const)
		.catch(() => null);
	const visibleEntry = await Promise.race([mainVisible, skipVisible]);
	if (visibleEntry === 'skip') {
		await skipSetup.click();
	}
	await expect(mainContent).toBeVisible({ timeout: 30_000 });
	const desktopToggle = page.getByRole('button', { name: 'Toggle local navigation' }).first();
	const compactBrowse = page.getByRole('button', { name: 'Browse' }).first();
	const toggleVisible = await desktopToggle.isVisible().catch(() => false);
	if (toggleVisible) return;
	await expect(compactBrowse).toBeVisible({ timeout: 20_000 });
}
