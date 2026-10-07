import { expect, test } from '@playwright/test';
import '../e2e/_helpers';

for (const theme of ['tavern', 'parchment', 'high-contrast', 'scholar', 'dungeon']) {
	test(`Command Center ${theme}`, async ({ page }) => {
		await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
		await page.addInitScript((applied) => {
			localStorage.setItem('dndtools:react:theme', applied);
			localStorage.setItem('dndtools:react:onboarded', 'gate');
		}, theme);
		await page.goto('/#/', { waitUntil: 'domcontentloaded' });
		await expect(page.getByTestId('home-screen')).toBeVisible();
		await page.evaluate(() => document.fonts.ready);
		await expect(page.getByTestId('widget-template-hero')).toHaveScreenshot(
			`home-polish--${theme}.png`,
		);
		const launchers = page.getByTestId('widget-template-launcher');
		await launchers.scrollIntoViewIfNeeded();
		await expect(launchers).toHaveScreenshot(`home-create--${theme}.png`);
		await page.goto('/#/screens', { waitUntil: 'domcontentloaded' });
		await expect(page.locator('#card-title')).toBeVisible();
		await expect(
			page.locator('[data-illustration="scenes-empty"]').last().locator('..'),
		).toHaveScreenshot(`scene-cards-empty--${theme}.png`);
	});
}
