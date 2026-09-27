import { expect, test } from '@playwright/test';
import { presentOnline } from '../e2e/_helpers';

// The golden routes cover the whole companion in Tavern, Parchment and High Contrast.
// These stage captures complete five-theme coverage within the shared 32 MiB baseline budget.
for (const theme of ['scholar', 'dungeon']) {
	test(`play stage ${theme}`, async ({ page }) => {
		await presentOnline(page);
		await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
		await page.addInitScript((theme) => {
			localStorage.setItem('dndtools:react:theme', theme);
			localStorage.setItem('dndtools:react:onboarded', 'gate');
		}, theme);
		await page.goto('/#/play');
		await page.waitForFunction(() => window.__rt?.loaded === true);
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		await page.evaluate(() => document.fonts.ready);
		await expect(page.getByTestId('player-stage')).toHaveScreenshot(`play-stage--${theme}.png`);
	});
}
