import { expect, test, type Page } from '@playwright/test';
import { presentOnline } from '../e2e/_helpers';

// RC-DSN-4.1 — see golden-routes.spec.ts for the suite, its determinism rules and the container
// commands (docs/development/TESTING.md §8).
//
// RC-POL-1.2 pins the GM Screen in all five themes on every tier (each project is one tier). It
// captures `#main-content` — the screen's heading and toolbar and every tile — because the shell
// around it has its own goldens (shell-polish.spec.ts). The board's full-viewport captures in three
// themes left golden-routes.spec for this; the PNGs are losslessly re-deflated to fit the budget.

const THEMES = ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast'] as const;
type Theme = (typeof THEMES)[number];

/** Pin theme, onboarding, time and randomness before the first document loads, as golden routes do. */
async function stage(page: Page, theme: Theme): Promise<void> {
	await page.clock.setFixedTime(new Date('2026-03-14T15:30:00Z'));
	await presentOnline(page);
	await page.addInitScript((applied) => {
		window.localStorage.setItem('dndtools:react:onboarded', 'gate');
		window.localStorage.setItem('dndtools:react:theme', applied);
		// mulberry32, so anything cosmetic drawn from Math.random (the map tile's noise) repeats.
		let seed = 0x1f2e3d4c;
		Math.random = () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		// Seeded notes share one `updatedAt` under the fixed clock, so the reference and prep tiles
		// fall back to id order; a counter in v4 shape keeps that order between runs.
		let nextId = 0;
		Object.defineProperty(crypto, 'randomUUID', {
			configurable: true,
			value: () => `00000000-0000-4000-8000-${(++nextId).toString(16).padStart(12, '0')}`,
		});
	}, theme);
}

async function settle(page: Page, theme: Theme): Promise<void> {
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
	await page.waitForLoadState('networkidle');
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

for (const theme of THEMES) {
	test(`GM Screen — ${theme}`, async ({ page }) => {
		await stage(page, theme);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });
		await expect(page).toHaveURL(/#\/screen\//);
		const main = page.locator('#main-content');
		await expect(main.getByRole('button', { name: 'Edit layout' })).toBeVisible();
		await expect(main.locator('[data-testid^="widget-"]').first()).toBeVisible();
		await settle(page, theme);
		await expect(main).toHaveScreenshot(`board-main--${theme}.png`);
	});
}
