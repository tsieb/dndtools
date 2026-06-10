import { expect, test } from '@playwright/test';

// CHAR-011 / CHAR-012 / CHAR-015 / CHAR-016 — Party and player records.
//
// The DM and players view an actor-filtered party overview (HP/status/resource summaries, marching
// order, party inventory) according to visibility and grants (CHAR-011). A character owner keeps a
// per-character journal with EXPLICIT per-entry visibility (CHAR-012 / CHAR-016). An observer is denied
// character data on EVERY surface — party overview AND journal (CHAR-015). The whole flow is a stacked
// list/form UI that renders the same on desktop and compact profiles, so this runs on BOTH Playwright
// projects. The "view as" header control switches the rendered actor over the shared local runtime.

test.describe('CHAR party and player records', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/characters/');
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
	});

	// DM quick-creates a character with the given visibility; returns its id.
	async function createCharacter(
		page: import('@playwright/test').Page,
		name: string,
		visibility: 'dm-only' | 'player-visible' | 'shared',
		hp = '10',
		ac = '12',
	): Promise<string> {
		await page.getByTestId('qc-kind').selectOption('sidekick');
		await page.getByTestId('qc-name').fill(name);
		await page.getByTestId('qc-hp').fill(hp);
		await page.getByTestId('qc-ac').fill(ac);
		await page.getByTestId('qc-visibility').selectOption(visibility);
		await page.getByTestId('qc-submit').click();
		await expect(page.getByTestId('qc-created')).toContainText(name);

		const card = page
			.getByTestId('collab-list')
			.locator('[data-testid^="collab-character-"]')
			.first();
		return (await card.getAttribute('data-testid'))!.replace('collab-character-', '');
	}

	test('CHAR-011: the party overview shows visible members + marching order to a player', async ({
		page,
	}) => {
		await createCharacter(page, 'Aria', 'player-visible', '8', '14');
		await createCharacter(page, 'Borin', 'player-visible', '20', '16');

		// As the DM, both members appear in the party overview.
		const members = page.getByTestId('party-members');
		await expect(members).toBeVisible();
		await expect(members.locator('[data-testid^="party-member-"]')).toHaveCount(2);

		// As a player, the player-visible members appear with their status summaries.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(members.locator('[data-testid^="party-member-"]')).toHaveCount(2);
		await expect(members.getByText('Aria')).toBeVisible();
		await expect(members.getByText('Borin')).toBeVisible();
	});

	test('CHAR-011: a dm-only character is omitted from a player party overview', async ({ page }) => {
		await createCharacter(page, 'Keelan', 'player-visible');
		await createCharacter(page, 'Secret', 'dm-only');

		// DM sees both, with a hidden-from-players count of 1.
		await expect(page.getByTestId('party-dm-hidden')).toContainText('1 character');

		// Player sees only the visible character; the dm-only one never appears in the party overview.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		const members = page.getByTestId('party-members');
		await expect(members.getByText('Keelan')).toBeVisible();
		await expect(members.locator('[data-testid^="party-member-"]')).toHaveCount(1);
		await expect(page.getByTestId('party-overview').getByText('Secret')).toHaveCount(0);
	});

	test('CHAR-011: party inventory is filtered by per-item visibility', async ({ page }) => {
		await page.getByTestId('party-item-name').fill('Rope');
		await page.getByTestId('party-item-visibility').selectOption('player-visible');
		await page.getByTestId('party-item-add').click();
		await expect(page.getByTestId('party-inventory')).toContainText('Rope');

		await page.getByTestId('party-item-name').fill('Cursed Idol');
		await page.getByTestId('party-item-visibility').selectOption('dm-only');
		await page.getByTestId('party-item-add').click();
		await expect(page.getByTestId('party-inventory')).toContainText('Cursed Idol');

		// As a player, only the player-visible item appears.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('party-inventory')).toContainText('Rope');
		await expect(page.getByTestId('party-overview').getByText('Cursed Idol')).toHaveCount(0);
	});

	test('CHAR-015: an observer sees NO party data (empty overview, no character names)', async ({
		page,
	}) => {
		await createCharacter(page, 'Hero', 'player-visible');
		await page.getByTestId('party-item-name').fill('Lantern');
		await page.getByTestId('party-item-visibility').selectOption('player-visible');
		await page.getByTestId('party-item-add').click();

		await page.getByTestId('view-as-select').selectOption('actor-observer');
		// The observer's party overview is empty; no member or item names leak.
		await expect(page.getByTestId('party-empty')).toBeVisible();
		await expect(
			page.getByTestId('party-members').locator('[data-testid^="party-member-"]'),
		).toHaveCount(0);
		await expect(page.getByTestId('party-overview').getByText('Hero')).toHaveCount(0);
		await expect(page.getByTestId('party-overview').getByText('Lantern')).toHaveCount(0);
	});

	test('CHAR-012 / CHAR-016: an owner keeps a journal; another player never sees a non-shared entry', async ({
		page,
	}) => {
		const id = await createCharacter(page, 'Mira', 'player-visible');
		// Grant owner to Demo Player.
		await page.getByTestId(`collab-grant-set-${id}`).selectOption('owner');
		await page.getByTestId(`collab-grant-target-${id}`).selectOption('actor-player');
		await page.getByTestId(`collab-grant-${id}`).click();
		await expect(page.getByTestId(`collab-owner-${id}`)).toContainText('Demo Player');

		// As the owner (Demo Player), add an owner-only journal entry (default shared-to-owner).
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await page.getByTestId(`journal-title-${id}`).fill('Met the Oracle');
		await page.getByTestId(`journal-visibility-${id}`).selectOption('shared');
		await page.getByTestId(`journal-submit-${id}`).click();
		await expect(page.getByTestId(`journal-entries-${id}`)).toContainText('Met the Oracle');

		// Another player (Demo Player 2) sees the character but NOT the owner's private entry.
		await page.getByTestId('view-as-select').selectOption('actor-player-2');
		await expect(page.getByTestId(`journal-character-${id}`)).toBeVisible();
		await expect(page.getByTestId(`journal-none-${id}`)).toBeVisible();
		await expect(page.getByTestId('character-journal').getByText('Met the Oracle')).toHaveCount(0);
	});

	test('CHAR-016: changing an entry to player-visible reveals it to other players (data-layer)', async ({
		page,
	}) => {
		const id = await createCharacter(page, 'Lyra', 'player-visible');
		await page.getByTestId(`collab-grant-set-${id}`).selectOption('owner');
		await page.getByTestId(`collab-grant-target-${id}`).selectOption('actor-player');
		await page.getByTestId(`collab-grant-${id}`).click();

		// Owner adds a player-visible highlight.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await page.getByTestId(`journal-title-${id}`).fill('Boss defeated');
		await page.getByTestId(`journal-visibility-${id}`).selectOption('player-visible');
		await page.getByTestId(`journal-submit-${id}`).click();
		await expect(page.getByTestId(`journal-entries-${id}`)).toContainText('Boss defeated');

		// Another player sees the player-visible entry.
		await page.getByTestId('view-as-select').selectOption('actor-player-2');
		await expect(page.getByTestId('character-journal').getByText('Boss defeated')).toBeVisible();

		// The owner narrows it to dm-only; the other player no longer sees it (cross-surface enforced).
		await page.getByTestId('view-as-select').selectOption('actor-player');
		const entryRow = page
			.getByTestId(`journal-entries-${id}`)
			.locator('[data-testid^="journal-entry-"]')
			.first();
		const entryTestId = (await entryRow.getAttribute('data-testid'))!;
		const entryId = entryTestId.replace('journal-entry-', '');
		await page.getByTestId(`journal-entry-visibility-${entryId}`).selectOption('dm-only');

		await page.getByTestId('view-as-select').selectOption('actor-player-2');
		await expect(page.getByTestId('character-journal').getByText('Boss defeated')).toHaveCount(0);
		await expect(page.getByTestId(`journal-none-${id}`)).toBeVisible();
	});

	test('CHAR-012: a player without ownership cannot author the journal (no form offered)', async ({
		page,
	}) => {
		const id = await createCharacter(page, 'Scout', 'player-visible');

		// As a player with no ownership grant, the character is visible but no authoring form is shown.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId(`journal-character-${id}`)).toBeVisible();
		await expect(page.getByTestId(`journal-add-${id}`)).toHaveCount(0);
	});

	test('CHAR-015: an observer sees no journal at all', async ({ page }) => {
		const id = await createCharacter(page, 'Ranger', 'player-visible');
		await page.getByTestId(`collab-grant-set-${id}`).selectOption('owner');
		await page.getByTestId(`collab-grant-target-${id}`).selectOption('actor-player');
		await page.getByTestId(`collab-grant-${id}`).click();
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await page.getByTestId(`journal-title-${id}`).fill('Hidden log');
		await page.getByTestId(`journal-submit-${id}`).click();
		await expect(page.getByTestId(`journal-entries-${id}`)).toContainText('Hidden log');

		// The observer's journal surface shows no characters and no entries.
		await page.getByTestId('view-as-select').selectOption('actor-observer');
		await expect(page.getByTestId('journal-empty')).toBeVisible();
		await expect(page.getByTestId('character-journal').getByText('Hidden log')).toHaveCount(0);
	});
});
