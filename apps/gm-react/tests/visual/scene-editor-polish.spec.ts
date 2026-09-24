import { expect, test, type Page } from '@playwright/test';
import '../e2e/_helpers';

// RC-POL-1.3: the golden-route `scene-editor` captures pin the canvas in three themes. This pins the
// editor's Inspector in all five themes and three tiers, as a text-free crop of its widget glyph:
// the shared baseline budget (check-baseline-budget.mjs) has no room for full-state captures, and a
// crop with text costs several KiB per image. The six-state matrix was reviewed and strict-compared
// in the pinned image (journal: apps/gm-react/src/screens/sceneEditor/RC-POL-1.3.journal.md); the
// e2e and axe specs cover every state in every theme.
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

/** A route inside AppShell (the durable GM workspaces). */
async function openShelled(page: Page, path: string): Promise<void> {
	await page.goto(`/#${path}`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });
	await page.locator('#main-content').waitFor({ state: 'attached', timeout: 20_000 });
	await page.locator('h1').first().waitFor({ state: 'attached', timeout: 20_000 });
}

for (const theme of THEMES) {
	test(`scene editor inspector — ${theme}`, async ({ page }) => {
		await stage(page, theme);
		await openShelled(page, '/scenes');
		const id = await page.evaluate(
			() => Object.values(window.__rt!.state.scenes.scenes).find((s) => s.widgets.length > 0)!.id,
		);
		await openShelled(page, `/scene/${id}`);
		await page.getByRole('button', { name: 'Edit layout', exact: true }).click();
		await page.locator('[role="group"][data-testid^="widget-"]').first().focus();
		await page.keyboard.press('Enter');
		const inspector = page.getByTestId('widget-inspector');
		await expect(inspector).toBeVisible();
		await settle(page, theme);
		await expect(inspector.locator('svg').first()).toHaveScreenshot(
			`scene-editor-glyph--${theme}.png`,
		);
	});
}
