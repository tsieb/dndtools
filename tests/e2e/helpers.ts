import { expect, type Page } from '@playwright/test';

export async function waitForAppReady(page: Page): Promise<void> {
	await page.goto('/');
	const setupWizardHeading = page.getByRole('heading', { name: 'Welcome to DND Tools' });
	const wizardVisible = await setupWizardHeading.isVisible({ timeout: 3_000 }).catch(() => false);
	if (wizardVisible) {
		await page.getByRole('button', { name: 'Next' }).click();
		await page.getByRole('button', { name: 'Next' }).click();
		await page.getByRole('button', { name: 'Open DND Tools' }).click();
	}
	await expect(page.locator('main#main-content')).toBeVisible({ timeout: 20_000 });
	const desktopToggle = page.getByRole('button', { name: 'Toggle local navigation' }).first();
	const compactBrowse = page.getByRole('button', { name: 'Browse' }).first();
	const toggleVisible = await desktopToggle.isVisible().catch(() => false);
	if (toggleVisible) return;
	await expect(compactBrowse).toBeVisible({ timeout: 20_000 });
}
