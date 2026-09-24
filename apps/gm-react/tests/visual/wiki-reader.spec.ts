import { expect, test } from '@playwright/test';
import { mockWiki } from '../e2e/_wikiFixture';

// RC-POL-1.21: the golden-route `wiki` captures pin the offline notice in three themes. This pins
// the reader itself in all five, as a text-free crop of its header mark: the shared baseline
// budget (check-baseline-budget.mjs) has no room for full-state captures, and any crop with text
// costs several KiB per image. The e2e and axe specs cover the other states in every theme.
for (const theme of ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast']) {
	test(`wiki reader ${theme}`, async ({ page }) => {
		await page.addInitScript((applied) => {
			localStorage.setItem('dndtools:react:theme', applied);
			localStorage.setItem('dndtools:react:onboarded', 'visual');
		}, theme);
		await mockWiki(page, 'ready');
		await page.goto('/#/wiki?id=fixture');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Copper Coast');
		await expect(page.locator('[data-theme]').last()).toHaveAttribute('data-theme', theme);
		await page.evaluate(() => document.fonts.ready);
		await expect(page.locator('header svg').first()).toHaveScreenshot(
			`wiki-reader-mark--${theme}.png`,
		);
	});
}
