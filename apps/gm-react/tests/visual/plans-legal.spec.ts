import { expect, test } from '@playwright/test';
import { waitReady } from '../e2e/_helpers';

// RC-POL-1.16: five shipped themes × the three configured visual tiers.
for (const theme of ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast']) {
	test.describe(`plans and legal — ${theme}`, () => {
		test.beforeEach(async ({ page }) => {
			await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
			await page.addInitScript((theme) => {
				localStorage.setItem('dndtools:react:onboarded', 'gate');
				localStorage.setItem('dndtools:react:theme', theme);
			}, theme);
		});
		for (const route of ['upgrade', 'legal/privacy', 'legal/terms']) {
			test(route, async ({ page }) => {
				await page.goto(`/#/${route}`);
				if (route === 'upgrade') await waitReady(page);
				await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
				await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
				await page.waitForLoadState('networkidle');
				await page.evaluate(() => document.fonts.ready);
				await expect(page).toHaveScreenshot(`pol-plans-${route.replace('/', '-')}--${theme}.png`);
				if (route === 'upgrade') {
					await page.getByRole('button', { name: 'Try Lantern preview' }).click();
					await expect(page.getByRole('dialog')).toBeVisible();
					await expect(page).toHaveScreenshot(`pol-plans-dialog--${theme}.png`);
					await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
					const comparison = page.getByRole('table').locator('..');
					await comparison.evaluate((el) => el.scrollIntoView({ block: 'start' }));
					await expect(page).toHaveScreenshot(`pol-plans-comparison--${theme}.png`);
				}
			});
		}
	});
}
