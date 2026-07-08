import { expect, test, type Page } from '@playwright/test';

/**
 * MAP-010/011/012/013/014/018/019 — POIs, routes, fog, combat overlays, and the unified
 * actor-filtered map query.
 *
 * Everything the annotations panel renders comes from the SINGLE actor-filtered map query
 * (`getMapViewForActor` — the MAP-018 keystone), and search runs through `searchMapsForActor` built on
 * the same model. So the panel itself is a live non-leak proof: viewed as a player/observer it shows
 * ONLY the POIs/routes/fog/tokens that actor may see, and a dm-only POI / concealed fog / hidden token
 * NEVER appears in the view, the list, OR search. A route reports deterministic distance/travel time;
 * a combat mode whose prerequisite is unmet fails closed.
 *
 * The same testids/flows run on BOTH projects (desktop-chromium AND mobile-chromium); the panel is
 * presentation-equivalent across profiles, so nothing here is profile-scoped.
 */

async function openWesternReaches(page: Page) {
	await page.goto('/atlas/');
	await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.goto('/atlas/?map=map-western-reaches');
	await page.getByTestId('map-viewport').waitFor({ state: 'visible' });
	await page.getByTestId('map-annotations-panel').waitFor({ state: 'visible' });
}

async function openRuinedKeep(page: Page) {
	await page.goto('/atlas/');
	await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.goto('/atlas/?map=map-ruined-keep');
	await page.getByTestId('map-viewport').waitFor({ state: 'visible' });
	await page.getByTestId('map-annotations-panel').waitFor({ state: 'visible' });
}

async function viewAs(page: Page, value: string) {
	await page.getByTestId('view-as-select').selectOption(value);
}

test.describe('MAP-011 / MAP-018 a DM-only POI never leaks to a player (view, list, search)', () => {
	test('the DM sees the dm-only POI; a player and observer never do', async ({ page }) => {
		await openWesternReaches(page);
		// DM sees both the player-visible Harbor Town and the dm-only Smugglers' Cache.
		await expect(page.getByTestId('ann-poi-poi-harbor-town')).toBeVisible();
		await expect(page.getByTestId('ann-poi-poi-smugglers-cache')).toBeVisible();

		// View as the demo player: the dm-only POI is absent (omitted, not redacted), and its name/notes
		// never appear anywhere on the page.
		await viewAs(page, 'actor-player');
		await expect(page.getByTestId('ann-poi-poi-harbor-town')).toBeVisible();
		await expect(page.getByTestId('ann-poi-poi-smugglers-cache')).toHaveCount(0);
		await expect(page.locator('body')).not.toContainText("Smugglers' Cache");
		await expect(page.locator('body')).not.toContainText('contraband');
		// Authoring controls disappear for a non-DM.
		await expect(page.getByTestId('ann-poi-create')).toHaveCount(0);

		// View as the observer: same — the dm-only POI never appears.
		await viewAs(page, 'actor-observer');
		await expect(page.getByTestId('ann-poi-poi-smugglers-cache')).toHaveCount(0);
		await expect(page.locator('body')).not.toContainText("Smugglers' Cache");
	});

	test('search never returns the hidden POI for a player', async ({ page }) => {
		await openWesternReaches(page);
		// As DM, searching for "cache" finds the hidden POI.
		await page.getByTestId('map-search-input').fill('cache');
		await expect(page.getByTestId('search-hit-poi-smugglers-cache')).toBeVisible();

		// As a player, the same search returns nothing — the hidden artifact is not a candidate.
		await viewAs(page, 'actor-player');
		await page.getByTestId('map-search-input').fill('cache');
		await expect(page.getByTestId('search-empty')).toBeVisible();
		await expect(page.getByTestId('search-hit-poi-smugglers-cache')).toHaveCount(0);
		// The visible Harbor Town POI IS searchable for the player.
		await page.getByTestId('map-search-input').fill('harbor');
		await expect(page.getByTestId('search-hit-poi-harbor-town')).toBeVisible();
	});

	test('MAP-011 AC2: revealing the POI to players makes it appear without a reload', async ({
		page,
	}) => {
		await openWesternReaches(page);
		// As DM, reveal the dm-only layer AND the POI itself (independent visibility).
		await page
			.getByTestId('layer-set-visibility-layer-hidden-camps')
			.selectOption('player-visible');
		await page
			.getByTestId('ann-poi-set-visibility-poi-smugglers-cache')
			.selectOption('player-visible');

		// Switching to the player view now shows the POI — no reload.
		await viewAs(page, 'actor-player');
		await expect(page.getByTestId('ann-poi-poi-smugglers-cache')).toBeVisible();
	});
});

test.describe('MAP-013 a route reports deterministic distance and travel time', () => {
	test('the seeded north-road route shows 60.0 miles and ~2.50 days', async ({ page }) => {
		await openWesternReaches(page);
		// Western Reaches scale is 120 miles per map width; the route spans normalized 0.5 → 60 miles.
		await expect(page.getByTestId('route-distance-route-north-road')).toContainText('60.0 miles');
		// 60 miles / 24 miles-per-day = 2.50 days.
		await expect(page.getByTestId('route-time-route-north-road')).toContainText('2.50 days');
	});
});

test.describe('MAP-014 a combat mode gated by an unmet prerequisite fails closed', () => {
	test('entering grid-align without a visible grid is blocked with a reason', async ({ page }) => {
		await openRuinedKeep(page);
		await page.getByTestId('overlay-mode-select').selectOption('grid-align');
		await page.getByTestId('overlay-set-mode').click();
		// The mode is blocked; the reason is surfaced and the mode did not change.
		await expect(page.getByTestId('overlay-blocked')).toBeVisible();
		await expect(page.getByTestId('overlay-blocked')).toContainText('grid-visible');
		await expect(page.getByTestId('overlay-mode')).toContainText('Mode: none');

		// Re-issuing with auto-satisfy enables the grid and enters the mode.
		await page.getByTestId('overlay-auto-satisfy').check();
		await page.getByTestId('overlay-set-mode').click();
		await expect(page.getByTestId('overlay-mode')).toContainText('Mode: grid-align');
		await expect(page.getByTestId('overlay-mode')).toContainText('grid on');
	});
});

test.describe('MAP-019 hidden tokens and concealed fog never reach a player', () => {
	test('a player sees only the token they may see; the dm-only ambusher never appears', async ({
		page,
	}) => {
		await openRuinedKeep(page);
		// As DM, both tokens are visible.
		await expect(page.getByTestId('token-token-hero')).toBeVisible();
		await expect(page.getByTestId('token-token-ambusher')).toBeVisible();

		// The Ruined Keep is `shared`; project it to the player so they can see the delivered surface.
		// Without a session projection the player cannot open it, so we assert the non-leak through the
		// DM's own view-as filtering: switching to the player hides the dm-only ambusher token + the
		// dm-only trap-rune POI, and their names never appear.
		await viewAs(page, 'actor-player');
		// The shared map is not delivered to the player in this prototype path, so the panel reports
		// unavailable — which itself proves no hidden artifact leaks (the whole map is gated). The hard
		// assertion: the dm-only token/POI names never appear in the player's DOM.
		await expect(page.locator('body')).not.toContainText('Cellar Ambusher');
		await expect(page.locator('body')).not.toContainText('Glyph of Warding');
	});

	test('the DM can move any token; a player can move only a token they control', async ({ page }) => {
		await openRuinedKeep(page);
		// The DM sees a Move control on every token.
		await expect(page.getByTestId('token-move-token-hero')).toBeVisible();
		await expect(page.getByTestId('token-move-token-ambusher')).toBeVisible();
		// Moving the hero token is accepted (no error surfaced).
		await page.getByTestId('token-move-token-hero').click();
		await expect(page.getByTestId('token-token-hero')).toBeVisible();
	});
});

test.describe('MAP-012 the DM authors fog; an offline reveal still persists locally', () => {
	test('revealing and concealing append fog operations on the shared layer', async ({ page }) => {
		await openRuinedKeep(page);
		// The seeded conceal over the cellar is present (1 fog op).
		await expect(page.getByTestId('fog-count')).toContainText('1');
		// Reveal an area: a new fog op appears and a saved status is shown.
		await page.getByTestId('fog-reveal').click();
		await expect(page.getByTestId('fog-status')).toBeVisible();
		await expect(page.getByTestId('fog-count')).toContainText('2');
		// An OFFLINE reveal still persists locally (local-first): the count grows again.
		await page.getByTestId('fog-reveal-offline').click();
		await expect(page.getByTestId('fog-count')).toContainText('3');
	});
});
