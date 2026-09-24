import { expect, test, type Page } from '@playwright/test';
import { serveAccountFixture } from '../e2e/_accountFixture';
import { waitReady } from '../e2e/_helpers';

// RC-DSN-4.1 — see golden-routes.spec.ts for the suite, its determinism rules and the container
// commands (docs/development/TESTING.md §8).
//
// RC-POL-1.16 pins one Plans & cloud state per theme and tier: the account-check skeleton, cropped
// to its first row (the whole three-row list is ~4 KiB per desktop image). The shared 32 MiB cap in check-baseline-budget.mjs had ~23 KiB left once the in-flight
// Join pass lands, and any crop that carries text (the cycle row, the saving pill, the legal nav)
// costs 2–6 KiB per image, 30–90 KiB across fifteen. The route, dialogs, comparison and legal pages
// stay covered functionally, with strict axe scans on both profiles, in tests/e2e/upgrade*.spec.ts
// and tests/e2e/legal.spec.ts.

const THEMES = ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast'] as const;
type Theme = (typeof THEMES)[number];

/** Pin theme, onboarding and time before the first document loads. */
async function stage(page: Page, theme: Theme): Promise<void> {
	await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
	await page.addInitScript((applied) => {
		window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		window.localStorage.setItem('dndtools:react:theme', applied);
	}, theme);
}

for (const theme of THEMES) {
	test(`plans account check — ${theme}`, async ({ page }) => {
		await stage(page, theme);
		await serveAccountFixture(page, 'loading');
		await page.goto('/#/upgrade');
		await waitReady(page);
		await expect(page.getByRole('status').filter({ hasText: 'Checking your plan…' })).toBeVisible();
		await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
		await page.waitForLoadState('networkidle');
		await page.evaluate(() => document.fonts.ready);
		await expect(page.locator('[data-skeleton="list"] > :first-child')).toHaveScreenshot(
			`plans-account-check--${theme}.png`,
		);
	});
}
