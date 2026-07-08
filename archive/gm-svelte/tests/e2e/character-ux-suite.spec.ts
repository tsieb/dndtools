import { expect, test } from '@playwright/test';

// UX-CHAR-001 / UX-CHAR-011 / UX-CHAR-013 — the Characters SUITE polish layer on top of the existing
// functional flows: a minimal quick-create with dynamic submit text + a success toast that opens the
// new sheet, a glanceable party HP meter, and safety-critical draft transfer/revoke behind a
// confirmation dialog. Renders the same on desktop and compact profiles, so this runs on BOTH
// Playwright projects.

test.describe('UX-CHAR character suite polish', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/characters/');
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
	});

	test('UX-CHAR-001: the submit button names the selected kind', async ({ page }) => {
		await expect(page.getByTestId('qc-submit')).toContainText('Create NPC');
		await page.getByTestId('qc-kind').selectOption('monster');
		await expect(page.getByTestId('qc-submit')).toContainText('Create Monster');
		await page.getByTestId('qc-kind').selectOption('sidekick');
		await expect(page.getByTestId('qc-submit')).toContainText('Create Sidekick');
	});

	test('UX-CHAR-001: a successful create toasts the name and offers Open sheet', async ({ page }) => {
		await page.getByTestId('qc-name').fill('Brass Sentinel');
		await page.getByTestId('qc-submit').click();

		const toast = page.getByTestId('qc-created');
		await expect(toast).toContainText('Brass Sentinel');
		// "Open sheet" reveals the new character in the roster and moves focus to its card.
		await page.getByTestId('qc-open-sheet').click();
		const rosterCard = page.getByTestId('roster-list').locator('li').first();
		await expect(rosterCard).toBeFocused();
		await expect(rosterCard).toContainText('Brass Sentinel');
	});

	test('UX-CHAR-001: an empty name shows an inline error and returns focus to Name', async ({ page }) => {
		await page.getByTestId('qc-name').fill('');
		await page.getByTestId('qc-submit').click();
		await expect(page.getByTestId('qc-error')).toBeVisible();
		await expect(page.getByTestId('qc-name')).toBeFocused();
	});

	test('UX-CHAR-011: party members render an HP meter with the live value', async ({ page }) => {
		await page.getByTestId('qc-kind').selectOption('sidekick');
		await page.getByTestId('qc-name').fill('Borin');
		await page.getByTestId('qc-hp').fill('24');
		await page.getByTestId('qc-ac').fill('16');
		await page.getByTestId('qc-visibility').selectOption('player-visible');
		await page.getByTestId('qc-submit').click();
		await expect(page.getByTestId('qc-created')).toContainText('Borin');

		const meter = page.getByTestId('party-members').getByRole('meter').first();
		await expect(meter).toHaveAttribute('aria-valuenow', '24');
		await expect(meter).toHaveAttribute('aria-valuemax', '24');
		// A fresh character is at full HP, so the card is not in the critical (red-accent) state.
		const member = page.getByTestId('party-members').locator('[data-testid^="party-member-"]').first();
		await expect(member).toHaveAttribute('data-critical', 'false');
	});

	test('UX-CHAR-013: revoke is guarded by a confirmation; cancel dispatches nothing', async ({ page }) => {
		await page.getByTestId('draft-owner').selectOption('actor-player');
		await page.getByTestId('draft-create').click();
		const draftItem = page.getByTestId('draft-list').locator('li').first();
		const draftId = (await draftItem.getAttribute('data-testid'))!.replace('draft-item-', '');

		// Opening the revoke dialog and cancelling leaves the draft and its owner untouched.
		await page.getByTestId(`draft-revoke-${draftId}`).click();
		await expect(page.getByTestId('draft-revoke-dialog')).toBeVisible();
		await page.getByTestId('draft-revoke-dialog').getByRole('button', { name: 'Cancel' }).click();
		await expect(page.getByTestId('draft-revoke-dialog')).toHaveCount(0);
		await expect(page.getByTestId(`draft-owner-${draftId}`)).toContainText('Demo Player');

		// Confirming the second time removes the draft (revoke deletes it; the player loses access).
		await page.getByTestId(`draft-revoke-${draftId}`).click();
		await page.getByTestId('draft-revoke-confirm').click();
		await expect(page.getByTestId('draft-list-empty')).toBeVisible();
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('no-draft')).toBeVisible();
	});
});
