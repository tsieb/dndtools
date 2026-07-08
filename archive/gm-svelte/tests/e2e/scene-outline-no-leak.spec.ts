import { expect, test, type Page } from '@playwright/test';

// UX-A11Y-004 + UX-A11Y-008: the Scene Outline gives screen-reader users structural access to canvas
// widgets, and a Player's outline NEVER lists a DM-only widget. This runs on BOTH desktop-chromium
// and mobile-chromium because the outline is profile-independent (it is not the dense widget grid),
// and the no-leak boundary must hold on every profile.

async function freshScenes(page: Page) {
	await page.goto('/scenes/');
	await page.getByTestId('scene-name').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('scene-name').waitFor({ state: 'visible' });
}

async function openPlayerVisibleScene(page: Page, name: string) {
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
	// On the compact profile the add-widget form lives behind a drawer toggle.
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

test.describe('Scene Outline — structural access and no-leak boundary', () => {
	test.beforeEach(async ({ page }) => {
		await freshScenes(page);
	});

	test('UX-A11Y-008: a DM-only widget is absent from a player outline (not hidden)', async ({
		page,
	}) => {
		await openPlayerVisibleScene(page, 'No Leak Scene');
		await addWidget(page, 'note', 'player-visible');
		// The DM-only widget carries a distinctive binding id ("forbidden-vault") used as the leak probe.
		await addWidget(page, 'map', 'dm-only', { entityType: 'vault', entityId: 'forbidden-vault' });

		const outline = page.getByTestId('scene-outline-section');

		// DM view: both widgets are listed (the DM-only one named with its binding), with a DM-only
		// visibility label and a count of two.
		await expect(page.getByTestId('scene-outline-count')).toHaveText('2 widgets');
		await expect(outline.getByText('Note widget', { exact: false })).toBeVisible();
		await expect(outline.getByText('forbidden-vault', { exact: false })).toBeVisible();
		await expect(outline).toContainText('DM only');

		// Switch the rendered actor to a player.
		await page.getByTestId('view-as-select').selectOption('actor-player');

		// The player outline lists ONLY the player-visible widget; the DM-only widget is gone from the
		// DOM entirely (absent, not display:none) and no DM-only label or binding id leaks.
		await expect(page.getByTestId('scene-outline-count')).toHaveText('1 widget');
		await expect(outline.getByText('Note widget', { exact: false })).toBeVisible();
		await expect(outline.getByText('forbidden-vault', { exact: false })).toHaveCount(0);
		await expect(outline).not.toContainText('DM only');
		// The DM-only binding id never appears anywhere in the player-rendered scene view.
		await expect(page.getByTestId('scene-editor')).not.toContainText('forbidden-vault');
	});

	test('UX-A11Y-004: the outline is keyboard-navigable and filterable by name', async ({ page }) => {
		await openPlayerVisibleScene(page, 'Outline Nav Scene');
		await addWidget(page, 'note', 'player-visible');
		await addWidget(page, 'map', 'player-visible');

		const items = page.getByTestId('scene-outline-section').getByRole('option');
		await expect(items).toHaveCount(2);

		// Roving tabindex: focus the first item, ArrowDown moves focus to the second.
		await items.first().focus();
		await expect(items.first()).toBeFocused();
		await page.keyboard.press('ArrowDown');
		await expect(items.nth(1)).toBeFocused();
		// ArrowUp wraps/returns to the first.
		await page.keyboard.press('ArrowUp');
		await expect(items.first()).toBeFocused();

		// Filtering by name narrows the list and the live count updates.
		await page.getByTestId('scene-outline-search').fill('map');
		await expect(page.getByTestId('scene-outline-section').getByRole('option')).toHaveCount(1);
		await expect(page.getByTestId('scene-outline-count')).toHaveText('1 widget');
	});
});
