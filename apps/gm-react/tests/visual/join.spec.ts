import { expect, test } from '@playwright/test';
import '../e2e/_helpers';

// One state per theme and tier: the shared baseline budget has no room for a second. The illustrated
// empty state is pinned here; the error state's alert, retry and exit are covered by
// tests/e2e/join.spec.ts and the axe gate on both profiles.
for (const theme of ['tavern', 'parchment', 'high-contrast', 'scholar', 'dungeon']) {
	test(`join missing ${theme}`, async ({ page }) => {
		await page.addInitScript((value) => {
			localStorage.setItem('dndtools:react:theme', value);
			localStorage.setItem('dndtools:react:onboarded', 'gate');
		}, theme);
		await page.goto('/#/join');
		const card = page.getByRole('main', { name: 'Campaign invite' });
		await expect(card).toBeVisible();
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		await page.evaluate(() => document.fonts.ready);
		// The card is the whole surface; cropping to it keeps the baselines inside the shared budget.
		await expect(card).toHaveScreenshot(`join-missing--${theme}.png`);
	});
}
