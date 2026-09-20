import { expect, test } from '@playwright/test';
import '../e2e/_helpers';

for (const theme of ['tavern', 'parchment', 'high-contrast', 'scholar', 'dungeon']) {
	for (const state of ['missing', 'unavailable']) {
		test(`join ${state} ${theme}`, async ({ page }) => {
			await page.addInitScript((value) => {
				localStorage.setItem('dndtools:react:theme', value);
				localStorage.setItem('dndtools:react:onboarded', 'gate');
			}, theme);
			await page.goto(state === 'missing' ? '/#/join' : '/#/join?token=visual-invalid');
			await expect(page.getByRole('main', { name: 'Campaign invite' })).toBeVisible();
			if (state === 'unavailable') await expect(page.getByRole('alert')).toBeVisible();
			await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
			await page.evaluate(() => document.fonts.ready);
			await expect(page).toHaveScreenshot(`join-${state}--${theme}.png`);
		});
	}
}
