import { expect, test, type Page } from '@playwright/test';
import { presentOnline, waitReady } from '../e2e/_helpers';

// RC-DSN-4.1 — see golden-routes.spec.ts for the suite, its determinism rules and the container
// commands (docs/development/TESTING.md §8).
//
// RC-POL-1.4 pins the Session interface in all five themes on every tier. golden-routes.spec.ts
// captures the whole viewport in Tavern, Parchment and High contrast; the Scholar and Dungeon
// captures here complete that matrix, including typography, controls and panel layout. The
// five-theme illustration crops additionally pin the combat empty-state art.

const THEMES = ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast'] as const;
type Theme = (typeof THEMES)[number];

/** Pin theme, onboarding, tier and time before the first document loads. */
async function stage(page: Page, theme: Theme): Promise<void> {
	await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
	await presentOnline(page);
	await page.addInitScript((applied) => {
		window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		window.localStorage.setItem('dndtools:react:theme', applied);
		// Match golden routes: deterministic IDs keep tied seeded records in the same order.
		let nextId = 0;
		Object.defineProperty(crypto, 'randomUUID', {
			configurable: true,
			value: () => `00000000-0000-4000-8000-${(++nextId).toString(16).padStart(12, '0')}`,
		});
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

// Each project supplies one responsive tier. Capture the interface, not just the illustration.
for (const theme of ['scholar', 'dungeon'] as const) {
	test(`session interface — ${theme}`, async ({ page }) => {
		await stage(page, theme);
		await page.goto('/#/session');
		await waitReady(page);
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		await expect(page.getByTestId('session-screen')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Start session', exact: true })).toBeVisible();
		await page.waitForLoadState('networkidle');
		await page.evaluate(() => document.fonts.ready);
		await expect(page).toHaveScreenshot(`session--${theme}.png`);
	});
}
