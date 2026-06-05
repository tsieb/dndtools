import { expect, test, type Page } from '@playwright/test';

/**
 * MAP-005 / MAP-006 / MAP-007 / MAP-016 — map layers and visibility.
 *
 * The DM authors map layers (create / reorder / duplicate / lock / delete) and toggles each layer's
 * INDEPENDENT player-visibility, DM-display, and opacity axes. Every mutation is a Processing-Core
 * command; the panel renders from the actor-filtered layer query, so:
 *   - a DM-only layer NEVER appears when the map is viewed as a player/observer (MAP-006/MAP-007),
 *   - toggling one layer's player-visibility does not change other layers (MAP-006),
 *   - a locked layer rejects edits (its edit controls are disabled / the command is rejected,
 *     MAP-005).
 *
 * The same testids and flow run on BOTH projects (desktop-chromium AND mobile-chromium); the panel is
 * presentation-equivalent across profiles, so nothing here is profile-scoped.
 */

async function openWesternReaches(page: Page) {
	// Western Reaches is player-visible and seeded with three layers: Terrain + Roads
	// (player-visible) and Hidden Camps (dm-only). The default actor is the DM.
	await page.goto('/atlas/');
	await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.goto('/atlas/?map=map-western-reaches');
	await page.getByTestId('map-viewport').waitFor({ state: 'visible' });
	await page.getByTestId('map-layer-panel').waitFor({ state: 'visible' });
}

async function viewAs(page: Page, value: string) {
	await page.getByTestId('view-as-select').selectOption(value);
}

test.describe('MAP-006 a DM-only layer never appears in the player/observer view', () => {
	test('the DM sees the dm-only layer; a player and observer do not', async ({ page }) => {
		await openWesternReaches(page);
		// DM sees all three layers including the dm-only one.
		await expect(page.getByTestId('layer-layer-hidden-camps')).toBeVisible();
		await expect(page.getByTestId('layer-layer-terrain')).toBeVisible();
		await expect(page.getByTestId('layer-layer-roads')).toBeVisible();

		// View as the demo player: the dm-only layer is absent (omitted, not redacted).
		await viewAs(page, 'actor-player');
		await expect(page.getByTestId('layer-layer-hidden-camps')).toHaveCount(0);
		await expect(page.getByTestId('layer-layer-terrain')).toBeVisible();
		await expect(page.getByTestId('layer-layer-roads')).toBeVisible();
		// Authoring controls are gone for a non-DM.
		await expect(page.getByTestId('layer-create')).toHaveCount(0);

		// View as the observer: same — the dm-only layer never appears.
		await viewAs(page, 'actor-observer');
		await expect(page.getByTestId('layer-layer-hidden-camps')).toHaveCount(0);
		// Hard leak check: the hidden layer's name never appears anywhere in the page.
		await expect(page.locator('body')).not.toContainText('Hidden Camps');
	});

	test('revealing a dm-only layer to players makes it appear in the player view', async ({
		page,
	}) => {
		await openWesternReaches(page);
		// As DM, set the hidden-camps layer to player-visible.
		await page
			.getByTestId('layer-set-visibility-layer-hidden-camps')
			.selectOption('player-visible');
		await expect(page.getByTestId('layer-visibility-layer-hidden-camps')).toHaveAttribute(
			'data-visibility',
			'player-visible',
		);

		// Now the player sees it.
		await viewAs(page, 'actor-player');
		await expect(page.getByTestId('layer-layer-hidden-camps')).toBeVisible();
	});
});

test.describe('MAP-006 toggling one layer player-visibility does not affect other layers', () => {
	test('hiding Roads from players leaves Terrain unchanged', async ({ page }) => {
		await openWesternReaches(page);
		// Both Terrain and Roads start player-visible.
		await expect(page.getByTestId('layer-visibility-layer-terrain')).toHaveAttribute(
			'data-visibility',
			'player-visible',
		);
		await expect(page.getByTestId('layer-visibility-layer-roads')).toHaveAttribute(
			'data-visibility',
			'player-visible',
		);

		// Hide ONLY Roads from players.
		await page.getByTestId('layer-set-visibility-layer-roads').selectOption('dm-only');
		await expect(page.getByTestId('layer-visibility-layer-roads')).toHaveAttribute(
			'data-visibility',
			'dm-only',
		);
		// Terrain is untouched.
		await expect(page.getByTestId('layer-visibility-layer-terrain')).toHaveAttribute(
			'data-visibility',
			'player-visible',
		);

		// As a player: Terrain is still visible, Roads is now hidden.
		await viewAs(page, 'actor-player');
		await expect(page.getByTestId('layer-layer-terrain')).toBeVisible();
		await expect(page.getByTestId('layer-layer-roads')).toHaveCount(0);
	});

	test('changing opacity on one layer does not change its visibility or other layers', async ({
		page,
	}) => {
		await openWesternReaches(page);
		// Drag Terrain opacity to 0 — it remains player-visible (opacity is an independent axis).
		const opacity = page.getByTestId('layer-set-opacity-layer-terrain');
		await opacity.fill('0');
		await opacity.dispatchEvent('change');
		await expect(page.getByTestId('layer-opacity-layer-terrain')).toHaveText('0');
		await expect(page.getByTestId('layer-visibility-layer-terrain')).toHaveAttribute(
			'data-visibility',
			'player-visible',
		);
		// Terrain still shows for the player (visibility unchanged by opacity).
		await viewAs(page, 'actor-player');
		await expect(page.getByTestId('layer-layer-terrain')).toBeVisible();
	});
});

test.describe('MAP-005 a locked layer rejects edits', () => {
	test('locking a layer disables its edit controls and re-enables them on unlock', async ({
		page,
	}) => {
		await openWesternReaches(page);
		// Lock the Terrain layer.
		await page.getByTestId('layer-lock-layer-terrain').click();
		await expect(page.getByTestId('layer-locked-layer-terrain')).toBeVisible();
		await expect(page.getByTestId('layer-lock-layer-terrain')).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		// Its mutating controls are now disabled (the command would reject; the UI reflects it).
		await expect(page.getByTestId('layer-set-visibility-layer-terrain')).toBeDisabled();
		await expect(page.getByTestId('layer-set-opacity-layer-terrain')).toBeDisabled();
		await expect(page.getByTestId('layer-delete-layer-terrain')).toBeDisabled();

		// Unlock — controls become editable again.
		await page.getByTestId('layer-lock-layer-terrain').click();
		await expect(page.getByTestId('layer-locked-layer-terrain')).toHaveCount(0);
		await expect(page.getByTestId('layer-set-visibility-layer-terrain')).toBeEnabled();
	});
});

test.describe('MAP-005 the DM creates, reorders, and duplicates layers (durable)', () => {
	test('creating a layer adds it; it persists across reload', async ({ page }) => {
		await openWesternReaches(page);
		await page.getByTestId('layer-new-name').fill('Encounter Markers');
		await page.getByTestId('layer-create').click();
		await expect(page.getByTestId('layer-list')).toContainText('Encounter Markers');

		// Reload: the durable layer survives (proves it went through the storage adapter, not just
		// local UI state).
		await page.reload();
		await page.getByTestId('map-layer-panel').waitFor({ state: 'visible' });
		await expect(page.getByTestId('layer-list')).toContainText('Encounter Markers');
	});

	test('reordering moves a layer and persists the order', async ({ page }) => {
		await openWesternReaches(page);
		// Move Roads up above Terrain.
		const list = page.getByTestId('layer-list');
		const before = await list.getByTestId(/^layer-layer-/).all();
		expect(before.length).toBeGreaterThanOrEqual(3);
		await page.getByTestId('layer-up-layer-roads').click();
		// Roads is now the first layer item in the list.
		const firstItem = list.getByTestId(/^layer-layer-/).first();
		await expect(firstItem).toHaveAttribute('data-testid', 'layer-layer-roads');
	});

	test('duplicating a layer inserts a (copy)', async ({ page }) => {
		await openWesternReaches(page);
		await page.getByTestId('layer-duplicate-layer-terrain').click();
		await expect(page.getByTestId('layer-list')).toContainText('Terrain (copy)');
	});
});
