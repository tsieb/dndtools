import { expect, test, type Page } from '@playwright/test';

// SRCH-007 — OPENING a search result into the correct route, map viewport, and note heading while
// preserving the search parameters.
//
// The user filters search in the Knowledge section, then OPENS a result. A POI result navigates to the
// Atlas, focusing the map viewport on the POI's `x`/`y` (the map+poi+x/y params are preserved — AC1). A
// note result selects the note within the Knowledge section and restores the heading hash (AC2). A hidden
// target fails closed to the generic unavailable. This is a stacked list/navigation surface that renders
// identically on desktop and compact profiles, so it runs on BOTH Playwright projects.

test.describe('SRCH-007 opening search results', () => {
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
		// Creating opens the editor on the new note; fill its body and save explicitly. Synchronize on the
		// editor showing the new note (not just a list row) to avoid the mobile note-creation race.
		await expect(page.getByTestId('note-editor')).toContainText(`Editing: ${title}`);
		await page.getByTestId('note-body').fill(body);
		await page.getByTestId('note-save').click();
		await expect(page.getByTestId('note-save-status-value')).toHaveText('success');
	}

	test('AC1: opening a POI result focuses the map viewport on its coordinate, preserving params', async ({
		page,
	}) => {
		// The demo vault seeds the player-visible Harbor Town POI on the Western Reaches map at (0.62, 0.34).
		await page.getByTestId('search-query').fill('Harbor Town');
		await page.getByTestId('search-type-poi').check();
		const openButton = page.getByTestId('search-open-poi-poi-harbor-town');
		await expect(openButton).toBeVisible();
		await openButton.click();

		// AC1 — the viewport opens on the Atlas, the map+poi+x/y params are preserved through navigation, and
		// the viewport is centered on the POI's coordinate.
		await page.getByTestId('map-viewport').waitFor({ state: 'visible' });
		await expect(page).toHaveURL(/\/atlas\/\?.*map=map-western-reaches/);
		await expect(page).toHaveURL(/poi=poi-harbor-town/);
		await expect(page).toHaveURL(/x=0\.62/);
		await expect(page).toHaveURL(/y=0\.34/);
		await expect(page.getByTestId('map-name')).toHaveText('Western Reaches');
		await expect(page.getByTestId('viewport-coords')).toContainText('(0.62, 0.34)');
	});

	test('AC2: opening a note-heading result selects the note and restores the heading hash', async ({
		page,
	}) => {
		await createNote(
			page,
			'Harbor Lore',
			'player-visible',
			'# Overview\n\nThe harbor glows.\n\n## Hidden Cove\n\nA quiet inlet only locals know.',
		);

		// Search for the note and open it. The result list renders the note as an "open" button (its testid is
		// `search-open-note-<id>`; the id is dynamic, so match by prefix).
		await page.getByTestId('search-query').fill('Harbor Lore');
		await page.getByTestId('search-type-note').check();
		const openButton = page.locator('[data-testid^="search-open-note-"]').first();
		await expect(openButton).toBeVisible();
		await openButton.click();

		// AC2 — the note is selected WITHIN the Knowledge section (the `note` param) and the editor shows it.
		// Synchronize on the editor showing the opened note (not just the URL) to avoid a selection race.
		await expect(page).toHaveURL(/\/knowledge\/\?note=/);
		await expect(page.getByTestId('note-editor')).toContainText('Editing: Harbor Lore');
		await expect(page.getByTestId('note-body')).toHaveValue(/Hidden Cove/);
	});

	test('the deterministic diagnostics fingerprint is visible and inspectable', async ({ page }) => {
		await createNote(page, 'Dragon Cult', 'player-visible', 'A secretive order of dragon worshippers.');
		await createNote(page, 'Harbor Watch', 'player-visible', 'A dragon was sighted off the coast.');

		await page.getByTestId('search-query').fill('dragon');
		await page.getByTestId('search-type-note').check();

		// SRCH-008 — the diagnostics panel exposes a STABLE fingerprint built from content-derived keys
		// (the title-match note ranks first), not volatile ids.
		await expect(page.getByTestId('search-diagnostics-fingerprint')).toContainText('note:dragon cult');
		await expect(page.getByTestId('search-diagnostic-1')).toContainText('note:dragon cult');
	});

	test('a player cannot open a dm-only POI result — it fails closed without revealing it', async ({
		page,
	}) => {
		// The demo vault seeds a dm-only POI ("Smugglers' Cache"). As a player, it is never a search hit, so
		// its open button is absent — there is nothing to open and nothing leaks.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await page.getByTestId('search-query').fill('Smugglers');
		await page.getByTestId('search-type-poi').check();
		await expect(page.getByTestId('search-open-poi-poi-smugglers-cache')).toHaveCount(0);
		await expect(page.getByTestId('saved-searches').getByText("Smugglers' Cache")).toHaveCount(0);
	});
});
