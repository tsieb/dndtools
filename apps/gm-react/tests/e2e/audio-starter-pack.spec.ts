import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-AUD-1.3 — the bundled CC0 STARTER PACK, installed ON DEMAND from the Audio screen. The pack is
// never pre-loaded: a fresh vault's library is empty until the DM asks for it, and then each track
// goes through the ordinary import path, so it lands as a real content-addressed asset carrying the
// manifest's licence (cc0 — no review flag). Driven through the REAL button and asserted against
// `__rt.state.audio.assets` AND the visible soundboard. Audio is never asserted to actually sound.

interface AssetLite {
	title: string;
	fileName: string;
	licenseKind: string;
	tags: string[];
}

function libraryAssets(page: Page): Promise<AssetLite[]> {
	return page.evaluate(() => {
		const assets = (
			window.__rt!.state.audio as {
				assets: Record<
					string,
					{ title: string; fileName: string; license: { kind: string }; tags: string[] }
				>;
			}
		).assets;
		return Object.values(assets).map((a) => ({
			title: a.title,
			fileName: a.fileName,
			licenseKind: a.license.kind,
			tags: a.tags,
		}));
	});
}

test.describe('audio starter pack: install on demand', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/audio');
		await seedFresh(page);
		await page.goto('/#/audio', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('the shipped manifest is reachable and every track it lists declares a cleared licence', async ({
		page,
	}) => {
		// The same relative path the installer uses (desktop bundles the folder; web serves it).
		const manifest = await page.evaluate(async () => {
			const response = await fetch(new URL('audio/starter/manifest.json', document.baseURI));
			return response.ok ? ((await response.json()) as Record<string, unknown>) : null;
		});
		expect(manifest).not.toBeNull();
		const tracks = manifest!.tracks as { file: string; license: { kind: string } }[];
		expect(tracks.length).toBeGreaterThan(0);
		for (const track of tracks) {
			expect(['cc0', 'cc-by', 'owned', 'royalty-free', 'licensed']).toContain(track.license.kind);
		}
	});

	test('installs the pack into the library and shows the tracks on the soundboard', async ({
		page,
	}) => {
		// A fresh vault ships no audio assets — the pack is opt-in, not pre-loaded.
		expect(await libraryAssets(page)).toEqual([]);

		await page.getByRole('button', { name: 'Add starter pack' }).first().click();
		await expect(page.getByText(/starter tracks? added to the soundboard/)).toBeVisible({
			timeout: 30_000,
		});

		const assets = await libraryAssets(page);
		expect(assets.length).toBeGreaterThan(0);
		// Each installed track carries the manifest's licence, so none of them trips the review gate.
		for (const asset of assets) {
			expect(asset.licenseKind).toBe('cc0');
			expect(asset.tags).toContain('starter');
		}
		expect(assets.map((a) => a.title)).toContain('Wind over stone');

		// And the real surface shows it: the tile is on the soundboard, playable like any other asset.
		await expect(page.getByRole('button', { name: /Wind over stone/ }).first()).toBeVisible();
	});

	test('a second install adds nothing — content-addressed dedupe, reported honestly', async ({
		page,
	}) => {
		await page.getByRole('button', { name: 'Add starter pack' }).first().click();
		await expect(page.getByText(/starter tracks? added to the soundboard/)).toBeVisible({
			timeout: 30_000,
		});
		const first = await libraryAssets(page);

		await page.getByRole('button', { name: 'Add starter pack' }).first().click();
		await expect(page.getByText('The starter pack is already in this library.')).toBeVisible({
			timeout: 30_000,
		});
		expect(await libraryAssets(page)).toHaveLength(first.length);
	});
});
