import { expect, test, type Page } from '@playwright/test';
import '../e2e/_helpers';

// RC-POL-1.14 — Extensions in all five themes on every layout tier (`visual-desktop`, `visual-rail`,
// `visual-phone`). The route's content is captured once (the Plugins tab, where it opens; the shell
// has its own golden routes). The Compendium's loading, empty and failure states and the named
// remove confirm are captured as the one element that changes, which keeps the suite inside the
// baseline size budget (check-baseline-budget.mjs). Open5e is cut off, so the Compendium is always
// the bundled SRD.
const THEMES = ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast'] as const;
type Theme = (typeof THEMES)[number];
const FIXED_TIME = new Date('2026-03-14T15:30:00Z');

/** Pin theme, onboarding, time, randomness and ids before the first document loads. */
async function stage(page: Page, theme: Theme): Promise<void> {
	await page.clock.setFixedTime(FIXED_TIME);
	await page.addInitScript((applied) => {
		try {
			window.localStorage.setItem('dndtools:react:onboarded', 'gate');
			window.localStorage.setItem('dndtools:react:theme', applied);
		} catch {
			/* storage is best-effort here, as in markOnboarded */
		}
		let seed = 0x1f2e3d4c;
		Math.random = () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		let nextId = 0;
		Object.defineProperty(crypto, 'randomUUID', {
			configurable: true,
			value: () => `00000000-0000-4000-8000-${(++nextId).toString(16).padStart(12, '0')}`,
		});
	}, theme);
}

/** Fonts in and two frames painted. `networkidle` is skipped where a request is held on purpose. */
async function settle(page: Page, theme: Theme, idle = true): Promise<void> {
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
	if (idle) await page.waitForLoadState('networkidle');
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

async function openExtensions(page: Page): Promise<void> {
	await page.goto('/#/extensions', { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });
	await page.locator('#main-content').waitFor({ state: 'attached', timeout: 20_000 });
	await page.getByRole('tab', { name: 'Plugins', exact: true }).waitFor({ timeout: 20_000 });
}

for (const theme of THEMES) {
	test.describe(`Extensions polish — ${theme}`, () => {
		test.beforeEach(async ({ page }) => {
			await stage(page, theme);
			await page.route('https://api.open5e.com/**', (route) => route.abort('internetdisconnected'));
			await openExtensions(page);
		});

		test('/extensions', async ({ page }) => {
			await settle(page, theme);
			await expect(page.locator('#main-content')).toHaveScreenshot(`extensions--${theme}.png`);
		});

		test('/extensions named remove confirm', async ({ page }) => {
			await page.getByRole('button', { name: 'Install Table Roller', exact: true }).click();
			const card = page.getByTestId('package-card-starter.table-roller');
			await card.getByRole('button', { name: 'Remove Table Roller', exact: true }).click();
			await expect(
				card.getByRole('button', { name: 'Yes, remove Table Roller', exact: true }),
			).toBeFocused();
			await settle(page, theme);
			await expect(card).toHaveScreenshot(`extensions-remove--${theme}.png`);
		});

		test('/extensions compendium loading, empty and unavailable', async ({ page }) => {
			// Loading: the first search is held until the capture is taken.
			await page.unroute('https://api.open5e.com/**');
			let release!: () => void;
			const held = new Promise<void>((resolve) => {
				release = resolve;
			});
			await page.route('https://api.open5e.com/**', async (route) => {
				await held;
				await route.abort('internetdisconnected');
			});
			await page.getByRole('tab', { name: 'Compendium', exact: true }).click();
			await expect(page.getByRole('status').filter({ hasText: 'Loading results' })).toBeVisible();
			await settle(page, theme, false);
			await expect(
				page.getByRole('status').filter({ hasText: 'Loading results' }),
			).toHaveScreenshot(`extensions-compendium-loading--${theme}.png`);
			release();

			// Empty: nothing in the bundled SRD matches.
			await expect(page.getByText('Offline — bundled SRD')).toBeVisible();
			await page.getByLabel('Search the compendium by name').fill('zzz-no-such-creature');
			await expect(page.getByRole('heading', { name: 'No matches' })).toBeVisible();
			await settle(page, theme);
			await expect(
				page.getByRole('heading', { name: 'No matches' }).locator('xpath=..'),
			).toHaveScreenshot(`extensions-compendium-empty--${theme}.png`);

			// Failure: the Open5e source list cannot be reached.
			await page.getByRole('button', { name: 'Other sources…', exact: true }).click();
			await expect(
				page.getByRole('alert').filter({ hasText: 'could not be reached' }),
			).toBeVisible();
			await settle(page, theme);
			await expect(
				page.getByRole('alert').filter({ hasText: 'could not be reached' }).locator('xpath=..'),
			).toHaveScreenshot(`extensions-compendium-error--${theme}.png`);
		});
	});
}
