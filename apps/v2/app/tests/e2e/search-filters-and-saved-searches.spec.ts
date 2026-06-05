import { expect, test, type Page } from '@playwright/test';

// SRCH-003 / SRCH-004 — FILTERS + SAVED SEARCHES.
//
// The DM creates notes with different visibility, filters search by text/type/tag, then saves a named
// search and pins it. A dm-only note never appears in a player's filtered results NOR inflates a count
// (SRCH-003 AC1/AC4). A dm-only saved search is absent from a player's saved-search list (SRCH-004 AC2),
// while a player-visible saved search re-runs LIVE for the player and shows only their visible hits. This
// is a stacked list/form surface that renders identically on desktop and compact profiles, so it runs on
// BOTH Playwright projects. The "view as" header control switches the rendered actor over the shared runtime.

test.describe('SRCH-003/004 filters and saved searches', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
	});

	async function createNote(
		page: Page,
		title: string,
		visibility: 'dm-only' | 'player-visible',
		body: string,
	): Promise<void> {
		await page.getByTestId('note-new-title').fill(title);
		await page.getByTestId('note-new-visibility').selectOption(visibility);
		await page.getByTestId('note-create').click();
		// Creating opens the editor on the new note; fill its body (with any #hashtags) and save explicitly.
		await expect(page.getByTestId('note-editor')).toContainText(`Editing: ${title}`);
		await page.getByTestId('note-body').fill(body);
		await page.getByTestId('note-save').click();
		await expect(page.getByTestId('note-save-status-value')).toHaveText('success');
	}

	test('AC1/AC4: a text filter returns visible hits; a dm-only note is hidden from the player + not counted', async ({
		page,
	}) => {
		await createNote(page, 'Beacon of Hope', 'player-visible', 'The beacon shines over the harbor.');
		await createNote(page, 'Beacon of Doom', 'dm-only', 'The beacon hides a beacon trap.');

		// As the DM, filter by "beacon": both notes match.
		await page.getByTestId('search-query').fill('beacon');
		const results = page.getByTestId('search-results');
		await expect(results.getByText('Beacon of Hope')).toBeVisible();
		await expect(results.getByText('Beacon of Doom')).toBeVisible();

		// As a player, the dm-only note is omitted AND the count is not inflated by it.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('search-results').getByText('Beacon of Hope')).toBeVisible();
		await expect(page.getByTestId('search-results').getByText('Beacon of Doom')).toHaveCount(0);
		await expect(page.getByTestId('search-count')).toContainText('1 matching result');
		// The hidden title appears nowhere in the search surface.
		await expect(page.getByTestId('saved-searches').getByText('Beacon of Doom')).toHaveCount(0);
	});

	test('AC3: the content-type facet restricts results to the selected type', async ({ page }) => {
		await createNote(page, 'A Note Item', 'player-visible', 'plain body');

		// Filter to POIs only: the note disappears, only map POIs remain (the demo map seeds POIs).
		await page.getByTestId('search-type-poi').check();
		await expect(page.getByTestId('search-results').getByText('A Note Item')).toHaveCount(0);

		// Filter to notes only: the note is back.
		await page.getByTestId('search-type-poi').uncheck();
		await page.getByTestId('search-type-note').check();
		await expect(page.getByTestId('search-results').getByText('A Note Item')).toBeVisible();
	});

	test('SRCH-001: the expanded searchable domains (handout, session artifact) are selectable facets', async ({
		page,
	}) => {
		await createNote(page, 'Searchable Note', 'player-visible', 'plain body');

		// SRCH-001 — the content-type facet exposes the full searchable DOMAIN set: note/object/POI plus the
		// new HANDOUT and SESSION-ARTIFACT domains. Restricting to handouts/session-artifacts (which the demo
		// vault has none of yet) yields an empty result WITHOUT failing the search (the note is excluded).
		await expect(page.getByTestId('search-type-handout')).toBeVisible();
		await expect(page.getByTestId('search-type-session-artifact')).toBeVisible();

		await page.getByTestId('search-type-handout').check();
		await page.getByTestId('search-type-session-artifact').check();
		await expect(page.getByTestId('search-results').getByText('Searchable Note')).toHaveCount(0);
		await expect(page.getByTestId('search-empty')).toBeVisible();

		// Restoring the note facet brings the note back — the search never failed, only filtered.
		await page.getByTestId('search-type-handout').uncheck();
		await page.getByTestId('search-type-session-artifact').uncheck();
		await page.getByTestId('search-type-note').check();
		await expect(page.getByTestId('search-results').getByText('Searchable Note')).toBeVisible();
	});

	test('SRCH-004 AC2: a dm-only saved search is absent for the player; a player-visible one re-runs live', async ({
		page,
	}) => {
		await createNote(page, 'Public Quest', 'player-visible', 'find the lost relic');

		// The DM saves a player-visible search for "quest" and a dm-only search.
		await page.getByTestId('search-query').fill('quest');
		await page.getByTestId('save-search-name').fill('Open quests');
		await page.getByTestId('save-search-visibility').selectOption('player-visible');
		await page.getByTestId('save-search-submit').click();
		await expect(page.getByTestId('saved-search-list').getByText('Open quests')).toBeVisible();

		await page.getByTestId('search-query').fill('relic');
		await page.getByTestId('save-search-name').fill('DM relic tracker');
		await page.getByTestId('save-search-visibility').selectOption('dm-only');
		await page.getByTestId('save-search-submit').click();
		await expect(page.getByTestId('saved-search-list').getByText('DM relic tracker')).toBeVisible();

		// As a player: the dm-only saved search is ABSENT; the player-visible one appears and runs live.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('saved-search-list').getByText('Open quests')).toBeVisible();
		await expect(page.getByTestId('saved-search-list').getByText('DM relic tracker')).toHaveCount(0);
		// The dm-only saved search's name never leaks anywhere on the surface.
		await expect(page.getByTestId('saved-searches').getByText('DM relic tracker')).toHaveCount(0);
	});

	test('SRCH-004 AC1: the DM can pin/unpin a saved search', async ({ page }) => {
		await createNote(page, 'Thread A', 'player-visible', 'an open plot thread');

		await page.getByTestId('search-query').fill('thread');
		await page.getByTestId('save-search-name').fill('Plot threads');
		await page.getByTestId('save-search-submit').click();

		const savedItem = page.getByTestId('saved-search-list').getByText('Plot threads');
		await expect(savedItem).toBeVisible();
		// Pin it: the pinned marker appears.
		const pinButton = page.locator('[data-testid^="saved-search-pin-"]').first();
		await pinButton.click();
		await expect(page.locator('[data-testid^="saved-search-pinned-"]').first()).toBeVisible();
		// Unpin it: the pinned marker disappears.
		await pinButton.click();
		await expect(page.locator('[data-testid^="saved-search-pinned-"]')).toHaveCount(0);
	});
});
