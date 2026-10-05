import { expect, test, type Page } from '@playwright/test';
import '../e2e/_helpers';

// RC-CAN-8.5: the Add panel as rows — the desktop and rail side panel, the phone bottom sheet — in
// all five themes and three tiers. The board behind it is the golden-route `/board` capture's job.
const THEMES = ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast'] as const;
type Theme = (typeof THEMES)[number];
const FIXED_TIME = new Date('2026-03-14T15:30:00Z');

/** Pin theme, onboarding, time and randomness before the first document loads. */
async function stage(page: Page, theme: Theme): Promise<void> {
	await page.clock.setFixedTime(FIXED_TIME);
	await page.addInitScript((applied) => {
		try {
			window.localStorage.setItem('dndtools:react:onboarded', 'gate');
			window.localStorage.setItem('dndtools:react:theme', applied);
		} catch {
			/* storage is best-effort here, as in markOnboarded */
		}
		// mulberry32: anything cosmetic drawn from Math.random (map noise, shuffles) repeats.
		let seed = 0x1f2e3d4c;
		Math.random = () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		// Entity ids come from crypto.randomUUID (runtime/environment.ts). With the clock fixed, every
		// seeded note shares one `updatedAt`, so lists sorted by it (Notes, the board's reference and
		// prep tiles) fall back to id order, and random ids reshuffled them on every run. A counter in
		// v4 shape repeats. It restarts on reload, so no test here may reload after writing.
		let nextId = 0;
		Object.defineProperty(crypto, 'randomUUID', {
			configurable: true,
			value: () => `00000000-0000-4000-8000-${(++nextId).toString(16).padStart(12, '0')}`,
		});
	}, theme);
}

/** Wait until the page has nothing left to load or lay out, then until fonts are in. */
async function settle(page: Page, theme: Theme): Promise<void> {
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
	await page.waitForLoadState('networkidle');
	await page.evaluate(async () => {
		await document.fonts.ready;
		// Two frames: the first commits any layout the font swap caused, the second paints it.
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

for (const theme of THEMES) {
	test(`Add panel rows — ${theme}`, async ({ page }) => {
		await stage(page, theme);
		await page.goto('/#/board', { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });
		const frames = page.getByTestId('scene-board-bounded').locator('[data-testid^="widget-"]');
		await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
		await expect(frames.first()).toBeVisible();
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		const panel = page.getByTestId('add-widget-gallery');
		await expect(panel.getByRole('button', { name: 'Add Dice', exact: true })).toBeVisible();
		await settle(page, theme);
		await expect(panel).toHaveScreenshot(`add-panel--${theme}.png`);
	});
}
