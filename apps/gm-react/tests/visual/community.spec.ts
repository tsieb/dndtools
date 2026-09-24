import { CRYPT, serveMarketplace } from '../e2e/_communityMarketplace';
import { expect, test, type Page } from '@playwright/test';
import '../e2e/_helpers';

// RC-DSN-4.1 — the golden-route visual regression suite. Every durable surface a polish pass
// (RC-POL-*) touches is captured in every theme on every layout tier (`visual-desktop`,
// `visual-rail`, `visual-phone`; playwright.config.ts), and a pixel diff against the committed
// baseline fails CI. Runs only with DNDTOOLS_VISUAL=1, inside the pinned Playwright image:
// docs/development/TESTING.md §8 has the commands, including the one that re-baselines.
//
// Determinism: the clock is fixed, Math.random is seeded, animations and the caret are off,
// reduced motion is on, fonts are awaited, and the vault is the fresh first-run seed.
//
// RC-POL-1.15 captures two Community states, each cropped to its own element: the illustrated
// local-only gate and a listing's Ratings. The shell is golden-routes.spec.ts's job, and whole-tab
// or overlay captures would not fit the 32 MiB cap in check-baseline-budget.mjs (Export, Wiki and
// the populated shelf cost 50–100 KiB per theme and tier, the install review ~29 KiB). Those stay
// covered functionally, with strict axe scans, in tests/e2e/community-*.spec.ts.

// RC-DSN-1.2 adds Scholar and Dungeon here, with their baselines, in the same change.
const THEMES = ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast'] as const;
type Theme = (typeof THEMES)[number];

// A fixed afternoon, so every "last played", calendar cell and relative time renders the same.
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

/** A route inside AppShell (the durable GM workspaces). */
async function openShelled(page: Page, path: string): Promise<void> {
	await page.goto(`/#${path}`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });
	await page.locator('#main-content').waitFor({ state: 'attached', timeout: 20_000 });
	await page.locator('h1').first().waitFor({ state: 'attached', timeout: 20_000 });
}

for (const theme of THEMES) {
	test(`community — ${theme}`, async ({ page }) => {
		await stage(page, theme);
		await openShelled(page, '/community');
		await settle(page, theme);
		await expect(page.getByRole('tabpanel')).toHaveScreenshot(`community-discover--${theme}.png`);
	});
}

for (const theme of THEMES) {
	test(`community marketplace — ${theme}`, async ({ page }) => {
		await stage(page, theme);
		// An installed, rated listing: the star radiogroup, the note and the review list all render.
		const market = await serveMarketplace(page);
		market.installs.add(CRYPT);
		market.ratings.set(CRYPT, {
			stars: 4,
			note: 'Tense third session; the flooded nave earns it.',
		});
		await openShelled(page, '/community');
		await expect(page.getByTestId('discover-shelf').getByRole('button')).toHaveCount(3);
		const ratings = page.getByRole('region', { name: 'Ratings', exact: true });
		await expect(
			ratings.getByRole('listitem').getByText('Tense third session; the flooded nave earns it.'),
		).toBeVisible();
		await settle(page, theme);
		await expect(ratings).toHaveScreenshot(`community-ratings--${theme}.png`);
	});
}
