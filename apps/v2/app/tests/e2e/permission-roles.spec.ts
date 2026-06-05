import { expect, test } from '@playwright/test';

// PERM-001 / PERM-011: the permission summary on Settings renders the effective permission
// surface the Processing Core computes for the active "view as" actor. The base role floor is
// computed first and caps the participant; an Observer is always read-only with no character
// data, and the DM sees the permission consistency audit. The GUI never computes permissions.

test.describe('PERM-001/PERM-011 permission summary', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/settings/');
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
	});

	test('the DM sees a writable surface with character data and the consistency audit', async ({
		page,
	}) => {
		// Default actor is the DM.
		await expect(page.getByTestId('perm-role-value')).toHaveText('dm');
		await expect(page.getByTestId('perm-write-value')).toHaveText('can write');
		await expect(page.getByTestId('perm-character-data-value')).toHaveText('available');
		// The DM-only consistency audit is visible and clean for the default demo state.
		await expect(page.getByTestId('perm-consistency')).toBeVisible();
		await expect(page.getByTestId('perm-consistency-clean')).toBeVisible();
	});

	test('viewing as an Observer yields a read-only surface with no character data', async ({
		page,
	}) => {
		await page.getByTestId('view-as-select').selectOption('actor-observer');

		await expect(page.getByTestId('perm-role-value')).toHaveText('observer');
		await expect(page.getByTestId('perm-write-value')).toHaveText('read-only');
		await expect(page.getByTestId('perm-character-data-value')).toHaveText('none');
		// The DM-only consistency audit is NOT shown to the observer.
		await expect(page.getByTestId('perm-consistency')).toHaveCount(0);
	});

	test('viewing as a Player yields a writable surface', async ({ page }) => {
		await page.getByTestId('view-as-select').selectOption('actor-player');

		await expect(page.getByTestId('perm-role-value')).toHaveText('player');
		await expect(page.getByTestId('perm-write-value')).toHaveText('can write');
	});
});
