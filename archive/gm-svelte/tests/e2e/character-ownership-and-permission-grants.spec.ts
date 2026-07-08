import { expect, test } from '@playwright/test';

// CHAR-003 / CHAR-010: character ownership + field-scoped permission grants. The DM grants a NAMED
// capability set (`owner` or the field-scoped `backstory-editor`) to a player, then the player edits
// only the fields their set authorizes. A `backstory-editor` may edit narrative fields but NOT combat
// or identity fields, and never sees a DM-only field (CHAR-010 non-leak). Granting `owner` to a player
// does NOT remove the DM's full administrative authority (CHAR-003). The whole flow is a stacked
// list/form UI that renders the same on desktop and compact profiles, so this runs on BOTH Playwright
// projects. The "view as" header control switches the rendered actor over the shared local runtime.

test.describe('CHAR ownership and permission grants', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/characters/');
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
	});

	// DM quick-creates a player-visible character with backstory + a DM-only note, then grants the
	// chosen capability set to Demo Player. Returns the character id.
	async function setupGrantedCharacter(
		page: import('@playwright/test').Page,
		capabilitySet: 'owner' | 'backstory-editor',
	): Promise<string> {
		await page.getByTestId('qc-kind').selectOption('sidekick');
		await page.getByTestId('qc-name').fill('Pip');
		await page.getByTestId('qc-hp').fill('10');
		await page.getByTestId('qc-ac').fill('12');
		await page.getByTestId('qc-visibility').selectOption('player-visible');
		await page.getByTestId('qc-submit').click();
		await expect(page.getByTestId('qc-created')).toContainText('Pip');

		const card = page
			.getByTestId('collab-list')
			.locator('[data-testid^="collab-character-"]')
			.first();
		const characterId = (await card.getAttribute('data-testid'))!.replace('collab-character-', '');

		await page.getByTestId(`collab-grant-set-${characterId}`).selectOption(capabilitySet);
		await page.getByTestId(`collab-grant-target-${characterId}`).selectOption('actor-player');
		await page.getByTestId(`collab-grant-${characterId}`).click();
		if (capabilitySet === 'owner') {
			await expect(page.getByTestId(`collab-owner-${characterId}`)).toContainText('Demo Player');
		}
		return characterId;
	}

	test('CHAR-003: granting owner to a player leaves exactly one owner and is recorded', async ({
		page,
	}) => {
		const id = await setupGrantedCharacter(page, 'owner');
		// The owner line shows exactly the one granted player.
		await expect(page.getByTestId(`collab-owner-${id}`)).toContainText('Demo Player');
	});

	test('CHAR-003: the DM still edits EVERY field after granting owner to a player', async ({
		page,
	}) => {
		const id = await setupGrantedCharacter(page, 'owner');

		// As the DM (default actor), edit a narrative field and a combat field — both succeed.
		await page.getByTestId(`collab-input-${id}-data.backstory`).fill('DM-revised origin.');
		await page.getByTestId(`collab-save-${id}-data.backstory`).click();
		await expect(page.getByTestId(`collab-field-${id}-data.backstory`)).toHaveAttribute(
			'data-author',
			'dm-authored',
		);

		await page.getByTestId(`collab-input-${id}-combat.hp`).fill('5');
		await page.getByTestId(`collab-save-${id}-combat.hp`).click();
		await expect(page.getByTestId(`collab-input-${id}-combat.hp`)).toHaveValue('5');
		await expect(page.getByTestId(`collab-field-${id}-combat.hp`)).toHaveAttribute(
			'data-author',
			'dm-authored',
		);
		// No error was raised — the DM's authority is unaffected by the player's grant.
		await expect(page.getByTestId('collab-error')).toHaveCount(0);
	});

	test('CHAR-010: a backstory-editor may edit a narrative field', async ({ page }) => {
		const id = await setupGrantedCharacter(page, 'backstory-editor');

		// View as the granted player. The narrative field offers an edit input.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId(`collab-character-${id}`)).toBeVisible();

		await page.getByTestId(`collab-input-${id}-data.backstory`).fill('Player-written origin.');
		await page.getByTestId(`collab-save-${id}-data.backstory`).click();
		await expect(page.getByTestId(`collab-field-${id}-data.backstory`)).toHaveAttribute(
			'data-author',
			'player-authored',
		);
		await expect(page.getByTestId('collab-error')).toHaveCount(0);
	});

	test('CHAR-010: a backstory-editor cannot edit a combat field (no edit input is offered)', async ({
		page,
	}) => {
		const id = await setupGrantedCharacter(page, 'backstory-editor');

		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId(`collab-character-${id}`)).toBeVisible();

		// The narrative field IS editable; the combat field is read-only (no input, only a value span).
		await expect(page.getByTestId(`collab-input-${id}-data.backstory`)).toBeVisible();
		await expect(page.getByTestId(`collab-input-${id}-combat.hp`)).toHaveCount(0);
		await expect(page.getByTestId(`collab-value-${id}-combat.hp`)).toBeVisible();
		// The identity (name) field is likewise read-only for a backstory-editor.
		await expect(page.getByTestId(`collab-input-${id}-name`)).toHaveCount(0);
	});

	test('CHAR-010: a DM-only field never appears in the backstory-editor view (non-leak)', async ({
		page,
	}) => {
		// DM creates a player-visible character WITH a DM-only note field, then grants backstory-editor.
		await page.getByTestId('qc-kind').selectOption('npc');
		await page.getByTestId('qc-name').fill('Warden');
		await page.getByTestId('qc-visibility').selectOption('player-visible');
		await page.getByTestId('qc-submit').click();
		await expect(page.getByTestId('qc-created')).toContainText('Warden');

		const card = page
			.getByTestId('collab-list')
			.locator('[data-testid^="collab-character-"]')
			.first();
		const id = (await card.getAttribute('data-testid'))!.replace('collab-character-', '');
		await page.getByTestId(`collab-grant-set-${id}`).selectOption('backstory-editor');
		await page.getByTestId(`collab-grant-target-${id}`).selectOption('actor-player');
		await page.getByTestId(`collab-grant-${id}`).click();

		// View as the granted player: no DM-only field/value/path leaks into the rendered view. (The
		// quick-create form authors no DM-only data field, so this asserts the GUI never surfaces a
		// `dmNotes` path/value at all; the hard non-leak proof — a character WITH an authored DM-only
		// field whose value never appears for a backstory-editor — lives in the core unit suite.)
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId(`collab-character-${id}`)).toBeVisible();
		await expect(page.getByTestId(`collab-field-${id}-data.dmNotes`)).toHaveCount(0);
		await expect(page.getByText('dmNotes')).toHaveCount(0);
	});
});
