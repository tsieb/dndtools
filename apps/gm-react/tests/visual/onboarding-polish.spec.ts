import { expect, test } from '@playwright/test';
import { waitReady } from '../e2e/_helpers';

for (const theme of ['tavern', 'parchment', 'high-contrast', 'scholar', 'dungeon']) {
	test(`onboarding complexity ${theme}`, async ({ page }) => {
		await page.addInitScript((theme) => {
			localStorage.setItem('dndtools:react:theme', theme);
		}, theme);
		await page.goto('/#/');
		await waitReady(page);
		const dialog = page.locator('[data-fullscreen-overlay="onboarding"]');
		await dialog.getByLabel('Campaign name').fill('Lantern Coast');
		await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
		await page.evaluate(() => document.fonts.ready);
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		await expect(dialog.locator('[data-onboarding-content]')).toHaveScreenshot(
			`onboarding-complexity--${theme}.png`,
		);
	});
}
