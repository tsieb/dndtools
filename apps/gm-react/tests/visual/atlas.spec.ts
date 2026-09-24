import { expect, test, type Page } from '@playwright/test';
import '../e2e/_helpers';

// RC-POL-1.9: the golden-route `atlas-map-editor` captures pin the whole open editor in three
// themes. The shared baseline budget (check-baseline-budget.mjs) has no room for full-page Atlas
// captures in every theme and tier, so this pins the remaining two themes on every tier as clipped,
// text-free bands: the editor's tool rail (themed surface, icon ink, the gold active tool) and the
// map-library empty illustration. tests/e2e/atlas-polish.spec.ts covers the library, loading,
// search-none and overlay states and their axe scans.
const THEMES = ['scholar', 'dungeon'] as const;
type Theme = (typeof THEMES)[number];

async function openAtlas(page: Page, theme: Theme): Promise<void> {
	await page.addInitScript((applied) => {
		localStorage.setItem('dndtools:react:theme', applied);
		localStorage.setItem('dndtools:react:onboarded', 'gate');
	}, theme);
	await page.goto('/#/atlas', { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__rt?.loaded === true, null, { timeout: 20_000 });
	await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function clipOf(
	page: Page,
	selector: string,
	x: number,
	y: number,
	width: number,
	height: number,
) {
	const target = page.locator(selector).first();
	await expect(target).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	const box = (await target.boundingBox())!;
	return { x: Math.round(box.x) + x, y: Math.round(box.y) + y, width, height };
}

for (const theme of THEMES) {
	test(`atlas empty ${theme}`, async ({ page }) => {
		await openAtlas(page, theme);
		await page.evaluate(async () => {
			const rt = window.__rt!;
			const maps = (rt.state.maps as { maps: Record<string, unknown> }).maps;
			for (const mapId of Object.keys(maps)) {
				const result = await rt.dispatch({
					type: 'map.delete',
					actorId: rt.defaultActorId,
					payload: { mapId, force: true },
				});
				if (result.status !== 'accepted') throw new Error('Cannot clear the map fixture');
			}
			// Settle from a fresh task (TESTING.md §6).
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		const clip = await clipOf(page, 'svg[data-illustration="map-library"]', 48, 40, 64, 36);
		await expect(page).toHaveScreenshot(`atlas-empty--${theme}.png`, { clip });
	});

	test(`atlas editor rail ${theme}`, async ({ page }) => {
		await openAtlas(page, theme);
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
			await new Promise((resolve) => setTimeout(resolve, 0));
			return res.status;
		});
		expect(created, 'map.create must be accepted to reach the editor').toBe('accepted');
		await page.getByRole('button', { name: 'Golden Route Map', exact: true }).click();
		await page.getByRole('button', { name: 'Open in map editor' }).click();
		await expect(page.getByRole('dialog', { name: 'Map editor — Golden Route Map' })).toBeVisible();
		const clip = await clipOf(page, '[data-map-coach="rail"]', 0, 0, 48, 64);
		await expect(page).toHaveScreenshot(`atlas-editor-rail--${theme}.png`, { clip });
	});
}
