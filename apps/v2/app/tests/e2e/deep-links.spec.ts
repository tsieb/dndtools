import { expect, test, type Page } from '@playwright/test';

// NAV-005: map/Scene/note/object/character/search deep links restore the intended
// selection when authorized (AC1); a target hidden from a player shows a generic
// unavailable state without revealing it (AC2); an uncached/offline target reports
// unavailable while preserving non-sensitive route state (AC3).

async function freshAtlas(page: Page) {
	await page.goto('/atlas/');
	await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
}

/** Switch the rendered actor via the header "view as" select. */
async function viewAs(page: Page, role: 'dm' | 'player') {
	const select = page.getByTestId('view-as-select');
	const value = role === 'dm' ? 'local-dm' : 'actor-player';
	await select.selectOption(value);
}

test.describe('NAV-005 AC1 a deep link to a visible POI focuses the map viewport', () => {
	test('opening a map POI deep link focuses that region in the viewport', async ({ page }) => {
		await freshAtlas(page);
		// Western Reaches is player-visible; focus its Storm Coast region.
		await page.goto('/atlas/?map=map-western-reaches&poi=region-coast');
		await page.getByTestId('map-viewport').waitFor({ state: 'visible' });
		await expect(page.getByTestId('map-name')).toHaveText('Western Reaches');
		await expect(page.getByTestId('map-poi')).toContainText('Storm Coast');
		await expect(page.getByTestId('map-poi')).toContainText('region-coast');
	});

	test('a player can open a player-visible map POI deep link', async ({ page }) => {
		await freshAtlas(page);
		// Land on the deep link, then switch the rendered actor to a player (a client-side
		// "view as", not a reload): the player-visible map stays focused.
		await page.goto('/atlas/?map=map-western-reaches&poi=region-north-road');
		await page.getByTestId('map-viewport').waitFor({ state: 'visible' });
		await viewAs(page, 'player');
		await expect(page.getByTestId('map-viewport')).toBeVisible();
		await expect(page.getByTestId('map-name')).toHaveText('Western Reaches');
		await expect(page.getByTestId('map-poi')).toContainText('region-north-road');
	});
});

test.describe('NAV-005 AC2 a target hidden from a player is generic-unavailable', () => {
	test('a player opening a hidden map sees a generic unavailable state, not the map', async ({
		page,
	}) => {
		await freshAtlas(page);
		// Ruined Keep is `shared` (not player-visible without a projection). The DM can
		// open it; switching the rendered actor to a player must fail closed to the
		// generic unavailable state without ever revealing the hidden target (AC2). The
		// "view as" switch is a client-side re-render, so the deep link stays in the URL.
		await page.goto('/atlas/?map=map-ruined-keep&poi=region-secret-cellar');
		await page.getByTestId('map-viewport').waitFor({ state: 'visible' });
		await viewAs(page, 'player');

		const unavailable = page.getByTestId('deep-link-unavailable');
		await expect(unavailable).toBeVisible();
		// The map content is no longer rendered, and nothing names the hidden target (AC2).
		await expect(page.getByTestId('map-viewport')).toHaveCount(0);
		await expect(unavailable).not.toContainText('Ruined Keep');
		await expect(unavailable).not.toContainText('Secret Cellar');
	});
});

test.describe('NAV-005 AC3 an uncached target preserves non-sensitive route state', () => {
	test('an unknown map id reports unavailable while staying on the Atlas section', async ({
		page,
	}) => {
		await freshAtlas(page);
		await page.goto('/atlas/?map=map-never-synced');
		// The Atlas section (non-sensitive route state) still renders around the
		// unavailable notice; no content is exposed (AC3).
		await expect(page.getByTestId('atlas-view')).toBeVisible();
		await expect(page.getByTestId('deep-link-unavailable')).toBeVisible();
		await expect(page.getByTestId('map-viewport')).toHaveCount(0);
	});
});
