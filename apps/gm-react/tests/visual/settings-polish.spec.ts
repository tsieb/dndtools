import { expect, test, type Page } from '@playwright/test';
import { presentOnline, waitReady } from '../e2e/_helpers';

// RC-DSN-4.1 — see golden-routes.spec.ts for the suite, its determinism rules and the container
// commands (docs/development/TESTING.md §8).
//
// RC-POL-1.17 pins Settings in all five themes on every tier. golden-routes.spec.ts already
// captures the Appearance category whole for Tavern, Parchment and High contrast; a full capture
// costs 60–180 KiB a theme and tier, more than the shared budget has left. So each of the five
// themes pins one state crop instead: Vault connections' empty state, the panel a local build
// opens with. Every category and its overlays stay covered by strict axe scans on both profiles in
// tests/e2e/settings-polish.spec.ts.

const THEMES = ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast'] as const;
type Theme = (typeof THEMES)[number];

/** Pin theme, onboarding, tier and time before the first document loads. */
async function stage(page: Page, theme: Theme): Promise<void> {
	await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
	await presentOnline(page);
	await page.addInitScript((applied) => {
		window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		window.localStorage.setItem('dndtools:react:theme', applied);
		window.localStorage.setItem('dndtools:react:tier', 'advanced');
	}, theme);
}

for (const theme of THEMES) {
	test(`settings vault empty state — ${theme}`, async ({ page }) => {
		await stage(page, theme);
		await page.goto('/#/settings?tab=vault');
		await waitReady(page);
		const title = page.getByText('No sources connected', { exact: true });
		await expect(title).toBeVisible();
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		await page.waitForLoadState('networkidle');
		await page.evaluate(() => document.fonts.ready);
		const state = title.locator('xpath=..');
		await state.scrollIntoViewIfNeeded();
		await expect(state).toHaveScreenshot(`settings-vault-empty--${theme}.png`);
	});
}
