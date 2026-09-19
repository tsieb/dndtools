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

// RC-DSN-1.2 adds Scholar and Dungeon here, with their baselines, in the same change.
const THEMES = ['tavern', 'parchment', 'high-contrast'] as const;
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

/** The fresh vault's first real Scene, the one Command Center opens. */
function defaultSceneId(page: Page): Promise<string | null> {
	return page.evaluate(() => {
		const state = window.__rt!.state as unknown as {
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
		};
		return (
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((scene) => !scene.isTemplate)?.id ??
			null
		);
	});
}

async function snap(page: Page, theme: Theme, slug: string): Promise<void> {
	await settle(page, theme);
	await expect(page).toHaveScreenshot(`${slug}--${theme}.png`);
}

// The primary GM workspaces (the a11y gate's core set) plus the board, which POL-1.2 polishes.
const SHELLED_ROUTES: ReadonlyArray<{ path: string; slug: string }> = [
	{ path: '/', slug: 'command-center' },
	{ path: '/board', slug: 'board' },
	{ path: '/scenes', slug: 'scenes' },
	{ path: '/characters', slug: 'characters' },
	{ path: '/knowledge', slug: 'knowledge' },
	{ path: '/campaign', slug: 'campaign' },
	{ path: '/session', slug: 'session' },
	{ path: '/player', slug: 'player' },
	{ path: '/settings', slug: 'settings' },
];

for (const theme of THEMES) {
	test.describe(`golden routes — ${theme}`, () => {
		test.beforeEach(async ({ page }) => stage(page, theme));

		for (const route of SHELLED_ROUTES) {
			test(route.path, async ({ page }) => {
				await openShelled(page, route.path);
				await snap(page, theme, route.slug);
			});
		}

		test('/scene/:id', async ({ page }) => {
			await openShelled(page, '/');
			const sceneId = await defaultSceneId(page);
			expect(sceneId, 'the fresh vault has no Scene to open the editor on').not.toBeNull();
			await openShelled(page, `/scene/${sceneId}`);
			await snap(page, theme, 'scene-editor');
		});

		test('/atlas with the map editor open', async ({ page }) => {
			await openShelled(page, '/atlas');
			const created = await page.evaluate(async () => {
				const rt = window.__rt!;
				const res = await rt.dispatch({
					type: 'map.create',
					actorId: rt.defaultActorId,
					payload: {
						name: 'Golden Route Map',
						visibility: 'dm-only',
						projection: { kind: 'flat', rotationDegrees: 0 },
						initialLayers: [{ name: 'Base', category: 'base', visibility: 'dm-only' }],
					},
				});
				// Settle from a fresh task (TESTING.md §6).
				await new Promise((resolve) => setTimeout(resolve, 0));
				return res.status;
			});
			expect(created, 'map.create must be accepted to reach the editor').toBe('accepted');
			await page.getByRole('button', { name: 'Golden Route Map', exact: true }).click();
			const open = page.getByRole('button', { name: 'Open in map editor' });
			await expect(open).toBeEnabled();
			await open.click();
			await expect(
				page.getByRole('dialog', { name: 'Map editor — Golden Route Map' }),
			).toBeVisible();
			await snap(page, theme, 'atlas-map-editor');
		});

		test('/play', async ({ page }) => {
			await page.goto('/#/play', { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });
			await page.getByRole('main').first().waitFor({ state: 'visible', timeout: 20_000 });
			await snap(page, theme, 'play');
		});

		test('/display', async ({ page }) => {
			await page.goto('/#/display', { waitUntil: 'domcontentloaded' });
			await page.locator('.app-fixed-viewport').waitFor({ state: 'attached', timeout: 20_000 });
			await snap(page, theme, 'display');
		});

		// Offline, the public reader's only reachable phase is its "Wiki unavailable" notice.
		test('/wiki', async ({ page }) => {
			await page.goto('/#/wiki?id=golden-route-not-a-real-wiki', { waitUntil: 'domcontentloaded' });
			await expect(page.getByText('Wiki unavailable')).not.toHaveCount(0);
			await snap(page, theme, 'wiki');
		});

		// The DS gallery is RC-DSN-2.3's DEV-only `#/__ds` route (App.tsx), which this suite always
		// has because it runs against the Vite dev server. If the route ever disappears the shell's
		// catch-all redirects to `/`; asserting the URL survived fails that here instead of
		// re-capturing Command Center under the gallery's name. Its header reports live runtime
		// readiness, so the capture waits for `__rt.loaded` like every shelled route does.
		test('DS gallery', async ({ page }) => {
			await page.goto('/#/__ds', { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });
			await page.locator('h1').first().waitFor({ state: 'attached', timeout: 20_000 });
			expect(page.url(), 'the DS gallery route redirected away from #/__ds').toContain('#/__ds');
			await snap(page, theme, 'ds-gallery');
		});
	});
}
