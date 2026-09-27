import { expect, test } from '@playwright/test';
import '../e2e/_helpers';

// Five themes × three tiers. Capture the owned sheet viewport, excluding shared shell chrome,
// so full-theme coverage stays inside RC-DSN-4.1's repository-wide baseline budget.
for (const theme of ['tavern', 'parchment', 'high-contrast', 'scholar', 'dungeon']) {
	test(`player sheet ${theme}`, async ({ page }) => {
		await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
		await page.addInitScript((applied) => {
			localStorage.setItem('dndtools:react:theme', applied);
			localStorage.setItem('dndtools:react:onboarded', 'gate');
		}, theme);
		await page.goto('/#/player', { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });
		await expect(page.getByTestId('character-sheet')).toBeVisible();
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		await page.evaluate(() => document.fonts.ready);
		const main = (await page.locator('#main-content').boundingBox())!;
		await expect(page).toHaveScreenshot(`player--${theme}.png`, {
			clip: {
				x: Math.ceil(main.x),
				y: Math.ceil(main.y),
				width: Math.floor(main.width),
				height: Math.min(500, Math.floor(main.height)),
			},
		});
		const combat = page.locator('.character-sheet-combat');
		await combat.scrollIntoViewIfNeeded();
		await expect(combat).toHaveScreenshot(`player-combat--${theme}.png`);
		await page.getByRole('tab', { name: 'History', exact: true }).click();
		const illustration = page.locator('[data-illustration="timeline-empty"]');
		await expect(illustration).toBeVisible();
		await expect(illustration.locator('..')).toHaveScreenshot(`player-history-empty--${theme}.png`);
	});
}
