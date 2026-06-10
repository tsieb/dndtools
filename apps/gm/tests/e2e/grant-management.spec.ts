import { expect, test } from '@playwright/test';

// PERM-004 / PERM-005 / PERM-008 / PERM-013: the DM grant UI on Settings. It presents NAMED
// capability sets with explanations and a core-computed effective-permission preview (never raw
// field checkboxes), and dispatches durable grant / transfer / revoke commands. This Settings flow
// renders the same on desktop and compact profiles, so it runs on BOTH Playwright projects.

test.describe('PERM grant management UI', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/settings/');
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
	});

	test('PERM-005/008: the DM grant UI lists named character capability sets with a preview', async ({
		page,
	}) => {
		await expect(page.getByTestId('grant-manager')).toBeVisible();
		// Character entity type is the default; named sets are offered (not raw fields).
		const setSelect = page.getByTestId('grant-capability-set');
		await expect(setSelect.locator('option')).toHaveCount(4); // owner, combat-participant, backstory-editor, viewer

		// PERM-008 AC1: selecting combat-participant previews writable combat operations + exclusions.
		await setSelect.selectOption('combat-participant');
		await expect(page.getByTestId('grant-preview-label')).toHaveText('Combat Participant');
		await expect(page.getByTestId('grant-preview-allows')).toContainText('HP');
		await expect(page.getByTestId('grant-preview-excludes')).toContainText('owner');
		// The preview also shows the inherited viewer set it includes.
		await expect(page.getByTestId('grant-preview-inherits')).toContainText('viewer');
	});

	test('PERM-008 AC2: a capability set unavailable for the entity type is not offered', async ({
		page,
	}) => {
		await page.getByTestId('grant-entity-type').selectOption('note');
		const options = page.getByTestId('grant-capability-set').locator('option');
		// note sets: section-editor, contributor, viewer — never "owner".
		await expect(options).toHaveCount(3);
		await expect(page.getByTestId('grant-capability-set')).not.toContainText('Owner');
	});

	test('PERM-004: the DM grants a capability set and it appears in the active grants list', async ({
		page,
	}) => {
		await page.getByTestId('grant-player').selectOption('actor-player');
		await page.getByTestId('grant-entity-type').selectOption('character');
		await page.getByTestId('grant-entity-id').fill('char-1');
		await page.getByTestId('grant-capability-set').selectOption('combat-participant');
		await page.getByTestId('grant-submit').click();

		await expect(page.getByTestId('grant-list')).toContainText('combat-participant');
		await expect(page.getByTestId('grant-list')).toContainText('character:char-1');
		await expect(page.getByTestId('grant-list')).toContainText('Demo Player');
	});

	test('PERM-004: granting an unknown entity id still records the grant; revoking removes it', async ({
		page,
	}) => {
		await page.getByTestId('grant-player').selectOption('actor-player');
		await page.getByTestId('grant-entity-id').fill('char-revoke');
		await page.getByTestId('grant-capability-set').selectOption('viewer');
		await page.getByTestId('grant-submit').click();
		await expect(page.getByTestId('grant-list')).toContainText('char-revoke');

		// Revoke the first listed grant. The only grant is removed, so the list empties out.
		await page.getByTestId('grant-list').getByRole('button', { name: 'Revoke' }).first().click();
		await expect(page.getByTestId('grant-list-empty')).toBeVisible();
		await expect(page.getByTestId('grant-list')).toHaveCount(0);
	});

	test('PERM-013: transferring character ownership leaves exactly one owner', async ({ page }) => {
		// Grant owner to Demo Player first.
		await page.getByTestId('grant-player').selectOption('actor-player');
		await page.getByTestId('grant-entity-id').fill('char-shared');
		await page.getByTestId('grant-capability-set').selectOption('owner');
		await page.getByTestId('grant-submit').click();
		await expect(page.getByTestId('grant-list')).toContainText('owner');

		// Transfer ownership to Demo Player 2 (atomic revoke of the prior owner).
		await page.getByTestId('grant-player').selectOption('actor-player-2');
		await page.getByTestId('grant-entity-id').fill('char-shared');
		await page.getByTestId('grant-transfer').click();

		// Exactly one owner grant for char-shared, held by Demo Player 2.
		const ownerItems = page.getByTestId('grant-list').getByText('owner', { exact: true });
		await expect(ownerItems).toHaveCount(1);
		await expect(page.getByTestId('grant-list')).toContainText('Demo Player 2');
	});
});
