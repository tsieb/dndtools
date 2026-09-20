import { expect, test } from '@playwright/test';
import { mockWiki } from '../e2e/_wikiFixture';

// RC-POL-1.21: unlike the legacy offline-only golden route, these captures exercise the reader
// itself in every shipped theme. Fixtures are served entirely inside this browser context.
for (const theme of ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast']) {
	for (const mode of ['ready', 'empty', 'password', 'loading', 'error', 'missing'] as const) {
		test(`wiki reader ${theme} ${mode}`, async ({ page }) => {
			await page.addInitScript((applied) => {
				localStorage.setItem('dndtools:react:theme', applied);
				localStorage.setItem('dndtools:react:onboarded', 'visual');
			}, theme);
			if (mode !== 'error' && mode !== 'missing') await mockWiki(page, mode);
			await page.goto(mode === 'missing' ? '/#/wiki' : '/#/wiki?id=fixture');
			const title =
				mode === 'password'
					? 'This wiki is protected'
					: mode === 'loading'
						? 'Opening wiki…'
						: mode === 'error'
							? 'Wiki unavailable'
							: mode === 'missing'
								? 'No wiki link'
								: 'The Copper Coast';
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
			await expect(page.locator('main, [role="main"]').first()).toBeVisible();
			await expect(page.locator('[data-theme]').last()).toHaveAttribute('data-theme', theme);
			await page.evaluate(() => document.fonts.ready);
			await expect(page).toHaveScreenshot(`wiki-reader-${mode}--${theme}.png`);
		});
	}
}
