import { expect, test, type Page } from '@playwright/test';

/**
 * MAP-003 / MAP-004 — map editing and generation.
 *
 * MAP-003 (draw/paint with before+after capture for undo and sync): the DM paints a deterministic mark
 * onto a layer; the painted content is committed as a Processing-Core command that captures the layer's
 * before+after content. Undo dispatches the inverse (the captured before-state), restoring the EXACT
 * prior visible state. A paint on a DM-only layer never reaches a player (the layer is omitted from the
 * actor-filtered query).
 *
 * MAP-004 (deterministic procedural generation): the DM generates layers from explicit parameters + a
 * seed; the result is saved as editable map layers (visible, paintable). The same seed reproduces the
 * same layer set.
 *
 * The panel and flow are presentation-equivalent across profiles, so the same testids/flow run on BOTH
 * projects (desktop-chromium AND mobile-chromium); nothing here is profile-scoped.
 */

async function openWesternReaches(page: Page) {
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

test.describe('MAP-003 draw/paint with undo restoring the prior visible state', () => {
	test('painting a mark adds content; undo restores the exact prior state', async ({ page }) => {
		await openWesternReaches(page);
		// Terrain starts with no painted content.
		const count = page.getByTestId('layer-content-count-layer-terrain');
		await expect(count).toHaveText('0 marks');

		// Paint a mark — the content count increases and persists (durable command).
		await page.getByTestId('layer-paint-layer-terrain').click();
		await expect(count).toHaveText('1 mark');

		// Undo — the inverse restores the captured before-state exactly (back to 0 marks).
		await page.getByTestId('edit-undo').click();
		await expect(count).toHaveText('0 marks');
	});

	test('a painted edit persists across reload (durable, went through the storage adapter)', async ({
		page,
	}) => {
		await openWesternReaches(page);
		await page.getByTestId('layer-paint-layer-roads').click();
		await expect(page.getByTestId('layer-content-count-layer-roads')).toHaveText('1 mark');

		await page.reload();
		await page.getByTestId('map-layer-panel').waitFor({ state: 'visible' });
		await expect(page.getByTestId('layer-content-count-layer-roads')).toHaveText('1 mark');
	});

	test('a paint on a DM-only layer never reaches the player view', async ({ page }) => {
		await openWesternReaches(page);
		// Paint on the dm-only Hidden Camps layer.
		await page.getByTestId('layer-paint-layer-hidden-camps').click();
		await expect(page.getByTestId('layer-content-count-layer-hidden-camps')).toHaveText('1 mark');

		// As a player, the dm-only layer (and its painted content) is absent entirely.
		await viewAs(page, 'actor-player');
		await expect(page.getByTestId('layer-layer-hidden-camps')).toHaveCount(0);
		await expect(page.getByTestId('layer-content-count-layer-hidden-camps')).toHaveCount(0);
	});
});

test.describe('MAP-004 procedural generation produces saved, visible, editable layers', () => {
	test('generating from parameters adds visible, editable layers that persist', async ({
		page,
	}) => {
		await openWesternReaches(page);
		await page.getByTestId('generate-kind').selectOption('dungeon');
		await page.getByTestId('generate-seed').fill('crypt-7');
		await page.getByTestId('generate-submit').click();

		// The generated dungeon layers appear in the layer list (saved as editable layers).
		const rooms = page.getByTestId('layer-gen-dungeon-crypt-7-rooms');
		await expect(rooms).toBeVisible();
		await expect(page.getByTestId('layer-gen-dungeon-crypt-7-corridors')).toBeVisible();
		await expect(page.getByTestId('layer-list')).toContainText('Generated Rooms');

		// The generated layer is editable: paint onto it and the content count rises.
		const roomsCount = page.getByTestId('layer-content-count-gen-dungeon-crypt-7-rooms');
		const beforeText = (await roomsCount.textContent()) ?? '';
		await page.getByTestId('layer-paint-gen-dungeon-crypt-7-rooms').click();
		await expect(roomsCount).not.toHaveText(beforeText);

		// The generated layers survive a reload (durable).
		await page.reload();
		await page.getByTestId('map-layer-panel').waitFor({ state: 'visible' });
		await expect(page.getByTestId('layer-gen-dungeon-crypt-7-rooms')).toBeVisible();
	});
});
