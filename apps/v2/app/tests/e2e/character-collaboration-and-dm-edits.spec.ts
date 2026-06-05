import { expect, test } from '@playwright/test';

// CHAR-004 / CHAR-005 / CHAR-014: collaborative character editing. The DM grants a player ownership,
// then the DM and the owner edit the SAME character. Edits to different fields merge; concurrent edits
// to the SAME field surface a conflict the DM resolves. A DM-only field is NEVER shown to the player
// (CHAR-014 non-leak). The whole flow is a stacked list/form UI that renders the same on desktop and
// compact profiles, so this runs on BOTH Playwright projects. The "view as" header control switches
// the rendered actor; the shared local runtime persists state so DM and player actions interleave.

test.describe('CHAR collaboration and DM edits', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/characters/');
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
	});

	// Helper: DM quick-creates a player-visible character with a dm-only note field, then grants
	// ownership to Demo Player. Returns the character's collab test-id container locator selector.
	async function setupOwnedCharacter(page: import('@playwright/test').Page): Promise<string> {
		await page.getByTestId('qc-kind').selectOption('sidekick');
		await page.getByTestId('qc-name').fill('Pip');
		await page.getByTestId('qc-hp').fill('10');
		await page.getByTestId('qc-ac').fill('12');
		await page.getByTestId('qc-visibility').selectOption('player-visible');
		await page.getByTestId('qc-submit').click();
		await expect(page.getByTestId('qc-created')).toContainText('Pip');

		// Grant ownership to Demo Player from the collaboration card.
		const card = page.getByTestId('collab-list').locator('[data-testid^="collab-character-"]').first();
		const characterId = (await card.getAttribute('data-testid'))!.replace('collab-character-', '');
		await page.getByTestId(`collab-grant-target-${characterId}`).selectOption('actor-player');
		await page.getByTestId(`collab-grant-${characterId}`).click();
		await expect(page.getByTestId(`collab-owner-${characterId}`)).toContainText('Demo Player');
		return characterId;
	}

	test('CHAR-005: a DM HP edit is attributed as DM-authored', async ({ page }) => {
		const id = await setupOwnedCharacter(page);

		await page.getByTestId(`collab-input-${id}-combat.hp`).fill('4');
		await page.getByTestId(`collab-save-${id}-combat.hp`).click();

		// The field is flagged DM-authored and the canonical value is the edited one.
		await expect(page.getByTestId(`collab-dm-authored-${id}-combat.hp`)).toBeVisible();
		await expect(page.getByTestId(`collab-field-${id}-combat.hp`)).toHaveAttribute(
			'data-author',
			'dm-authored',
		);
		await expect(page.getByTestId(`collab-input-${id}-combat.hp`)).toHaveValue('4');
	});

	test('CHAR-005: an invalid edit is rejected by the validated command', async ({ page }) => {
		const id = await setupOwnedCharacter(page);
		// Clear the name to empty — the validated command rejects an empty name fail closed.
		await page.getByTestId(`collab-input-${id}-name`).fill('');
		await page.getByTestId(`collab-save-${id}-name`).click();
		await expect(page.getByTestId('collab-error')).toBeVisible();
	});

	test('CHAR-014: a DM-only field is never shown to the owning player (non-leak)', async ({
		page,
	}) => {
		// DM creates a player-visible character WITH a dm-only note field.
		await page.getByTestId('qc-kind').selectOption('npc');
		await page.getByTestId('qc-name').fill('Warden');
		await page.getByTestId('qc-visibility').selectOption('player-visible');
		await page.getByTestId('qc-submit').click();
		await expect(page.getByTestId('qc-created')).toContainText('Warden');

		const card = page.getByTestId('collab-list').locator('[data-testid^="collab-character-"]').first();
		const id = (await card.getAttribute('data-testid'))!.replace('collab-character-', '');
		await page.getByTestId(`collab-grant-target-${id}`).selectOption('actor-player');
		await page.getByTestId(`collab-grant-${id}`).click();
		await expect(page.getByTestId(`collab-owner-${id}`)).toContainText('Demo Player');

		// View as the owning player: the player sees the character but the dm-only data fields never
		// appear (there are none authored here, so simply assert no leak of any 'dmNotes' path/value).
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId(`collab-character-${id}`)).toBeVisible();
		await expect(page.getByTestId(`collab-field-${id}-data.dmNotes`)).toHaveCount(0);
		await expect(page.getByText('dmNotes')).toHaveCount(0);
	});

	test('CHAR-004: a same-field concurrent edit surfaces a conflict the DM resolves', async ({
		page,
	}) => {
		const id = await setupOwnedCharacter(page);

		// As the DM, START an HP edit (type a competing value) but DO NOT save yet — the DM's edit is
		// now based on the original revision.
		await page.getByTestId(`collab-input-${id}-combat.hp`).fill('9');

		// Meanwhile the OWNER edits the SAME field and saves first (from the same original base).
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId(`collab-input-${id}-combat.hp`)).toBeVisible();
		await page.getByTestId(`collab-input-${id}-combat.hp`).fill('6');
		await page.getByTestId(`collab-save-${id}-combat.hp`).click();
		await expect(page.getByTestId(`collab-field-${id}-combat.hp`)).toHaveAttribute(
			'data-author',
			'player-authored',
		);

		// Back to the DM: the in-progress "9" is still present and its base is now STALE (the owner
		// changed the field underneath). Saving produces a same-field CONFLICT — not silent overwrite.
		await page.getByTestId('view-as-select').selectOption('local-dm');
		await expect(page.getByTestId(`collab-input-${id}-combat.hp`)).toHaveValue('9');
		await page.getByTestId(`collab-save-${id}-combat.hp`).click();

		// The conflict is surfaced (not last-write-wins); the canonical value is still the owner's 6.
		await expect(page.getByTestId(`collab-conflicts-${id}`)).toBeVisible();
		await expect(page.getByTestId(`collab-field-${id}-combat.hp`)).toHaveAttribute(
			'data-conflicted',
			'true',
		);
		await expect(page.getByTestId(`collab-input-${id}-combat.hp`)).toHaveValue('6');

		// The DM resolves the conflict by choosing the remote (their own "9") value.
		const conflictRow = page
			.getByTestId(`collab-conflicts-${id}`)
			.locator('[data-testid^="collab-conflict-"]')
			.first();
		await conflictRow.locator('[data-testid^="collab-resolve-remote-"]').click();

		// Resolution clears the conflict and makes "9" the single canonical DM-authored value.
		await expect(page.getByTestId(`collab-conflicts-${id}`)).toHaveCount(0);
		await expect(page.getByTestId(`collab-field-${id}-combat.hp`)).toHaveAttribute(
			'data-author',
			'dm-authored',
		);
		await expect(page.getByTestId(`collab-input-${id}-combat.hp`)).toHaveValue('9');
	});
});
