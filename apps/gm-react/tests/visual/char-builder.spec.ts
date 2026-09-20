import { expect, test } from '@playwright/test';
import '../e2e/_helpers';

// RC-POL-1.6: pins the builder's entry illustration chip in all five themes, as a text-free crop.
// The shared baseline budget (check-baseline-budget.mjs) has no room for full-state captures, and
// any crop with text costs several KiB per image. The full ten-state matrix was compared in the
// pinned container for review; the e2e and axe specs cover every state in every profile.
for (const theme of ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast']) {
	test(`character builder — ${theme}`, async ({ page }) => {
		await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
		await page.addInitScript((theme) => {
			localStorage.setItem('dndtools:react:onboarded', 'gate');
			localStorage.setItem('dndtools:react:theme', theme);
		}, theme);
		await page.goto('/#/characters');
		await page.waitForFunction(() => window.__rt?.loaded === true);
		await page.getByRole('button', { name: 'New character', exact: true }).first().click();
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		await page.evaluate(() => document.fonts.ready);
		await expect(
			page
				.getByRole('button', { name: /Build from scratch/ })
				.locator(':scope > span')
				.first(),
		).toHaveScreenshot(`character-builder-entry--${theme}.png`);
	});
}
