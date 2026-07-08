import { expect, test, type Page } from '@playwright/test';

/**
 * Unified widget platform on the scene route. Two behaviours that no unit test can reach (they live in
 * the route's render + a commit-on-blur interaction), run on BOTH desktop and mobile profiles:
 *
 *   1. SECURITY (UX-CANVAS-011 no-leak): the player-view PREVIEW canvas must never render a DM-resolved
 *      widget body. The on-canvas body resolves widget data against the DM actor, so rendering it inside
 *      the "player view" preview would leak DM-only content (here: a DM-only map's region name). The
 *      route gates the tile body on `!previewActive`; this proves the gate holds.
 *   2. B8: out-of-range numeric Customize values clamp to the field's [min, max] on commit.
 */

async function freshScene(page: Page, name: string) {
	await page.goto('/scenes/');
	await page.getByTestId('scene-name').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('scene-name').waitFor({ state: 'visible' });
	await page.getByTestId('scene-name').fill(name);
	await page.getByTestId('scene-visibility').selectOption('player-visible');
	await page.getByTestId('scene-create').click();
	await page.getByTestId('scene-list').getByRole('link', { name }).click();
	await page.getByTestId('scene-editor').waitFor({ state: 'visible' });
}

async function addWidget(
	page: Page,
	type: string,
	visibility: 'player-visible' | 'dm-only',
	bind?: { entityType: string; entityId: string },
) {
	const toggle = page.getByTestId('toggle-add-widget');
	if (await toggle.isVisible().catch(() => false)) await toggle.click();
	await page.getByTestId('widget-type').fill(type);
	if (bind) {
		await page.getByTestId('bind-entity-type').fill(bind.entityType);
		await page.getByTestId('bind-entity-id').fill(bind.entityId);
	}
	await page.getByTestId('widget-visibility').selectOption(visibility);
	await page.getByTestId('widget-add').click();
}

test.describe('Scene widget platform', () => {
	test('UX-CANVAS-011: the player-view preview canvas suppresses the DM-resolved widget body', async ({
		page,
	}) => {
		await freshScene(page, 'Preview No-Leak Scene');
		// A PLAYER-VISIBLE widget bound to a DM-ONLY map. The widget belongs in a player view, but its
		// body resolves the bound map against the DM actor — the exact DM-only content the preview must
		// not render. "Outpost Yard" is a region of the seeded dm-only map "Hidden Outpost".
		await addWidget(page, 'map', 'player-visible', {
			entityType: 'map',
			entityId: 'map-hidden-outpost',
		});

		const canvas = page.getByTestId('canvas-viewport');
		// Present-before guard: in the DM's own edit view the canvas body DOES render the region name.
		await expect(canvas).toContainText('Outpost Yard');

		// Enter the player-view preview.
		await page.getByTestId('preview-player-view-toggle').click();
		await page.getByTestId('preview-player-view-toggle').waitFor({ state: 'visible' });

		// The preview canvas no longer renders the DM-resolved body (the region name is gone from the
		// canvas). It must not have leaked the dm-only map's name either.
		await expect(canvas).not.toContainText('Outpost Yard');
		await expect(canvas).not.toContainText('Hidden Outpost');
	});

	test('B8: an out-of-range Customize numeric value clamps to [min, max] on commit', async ({
		page,
	}) => {
		await freshScene(page, 'Clamp Scene');
		// quick-reference has a numeric "Rows shown" field bounded to [1, 50] (default 8).
		await addWidget(page, 'quick-reference', 'player-visible');

		await page.getByRole('button', { name: /^Customize/ }).first().click();
		const dialog = page.getByTestId('widget-customize-dialog');
		await dialog.waitFor({ state: 'visible' });
		const count = dialog.getByTestId('customize-field-count').locator('input[type="number"]');
		await expect(count).toHaveValue('8');

		// Above the max → clamps DOWN to 50 (native number inputs do not clamp typed values; commitNumber does).
		await count.fill('999');
		await count.blur();
		await expect(count).toHaveValue('50');

		// Below the min → clamps UP to 1.
		await count.fill('0');
		await count.blur();
		await expect(count).toHaveValue('1');
	});
});
