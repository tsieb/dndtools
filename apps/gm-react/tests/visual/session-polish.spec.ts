import { expect, test, type Page } from '@playwright/test';
import { presentOnline, waitReady } from '../e2e/_helpers';

// RC-DSN-4.1 — see golden-routes.spec.ts for the suite, its determinism rules and the container
// commands (docs/development/TESTING.md §8).
//
// RC-POL-1.4 pins the Session surface in all five themes on every tier. golden-routes.spec.ts
// already captures `/session` whole for Tavern, Parchment and High contrast; the shared baseline
// budget has room for small crops only, so each of the five themes pins the state the polish pass
// illustrated: the combat tracker's empty state (`combat-idle`), text-free. The route, its overlays
// and every theme's contrast stay covered by tests/e2e/session-polish.spec.ts on both profiles.

const THEMES = ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast'] as const;
type Theme = (typeof THEMES)[number];

/** Pin theme, onboarding, tier and time before the first document loads. */
async function stage(page: Page, theme: Theme): Promise<void> {
	await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
	await presentOnline(page);
	await page.addInitScript((applied) => {
		window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		window.localStorage.setItem('dndtools:react:theme', applied);
	}, theme);
}

for (const theme of THEMES) {
	test(`session combat empty state — ${theme}`, async ({ page }) => {
		await stage(page, theme);
		await page.goto('/#/session');
		await waitReady(page);
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		const art = page.locator('#main-content [data-illustration="combat-idle"]');
		await expect(art).toBeVisible();
		await page.waitForLoadState('networkidle');
		await page.evaluate(() => document.fonts.ready);
		await art.scrollIntoViewIfNeeded();
		await expect(art).toHaveScreenshot(`session-combat-idle--${theme}.png`);
	});
}
