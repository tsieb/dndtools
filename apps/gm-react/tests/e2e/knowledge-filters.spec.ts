import { expect, test, type Page } from '@playwright/test';
import { enterPreview, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-KNW-2.1 — the faceted vault search + saved searches, driven through the REAL UI on /knowledge.
// Every assertion checks the live core state (`__rt.state.content.savedSearches`) or the core's own
// rendered result, never a control that merely looked like it worked.

/** Loose saved-search shape read off `__rt.state.content.savedSearches` (raw, NOT actor-filtered). */
interface SavedLite {
	id: string;
	name: string;
	visibility: string;
	pinned: boolean;
	filter: { query?: string; contentTypes?: string[] };
}

function savedSearches(page: Page): Promise<SavedLite[]> {
	return page.evaluate(() =>
		Object.values(
			(window.__rt!.state.content as { savedSearches: Record<string, SavedLite> }).savedSearches,
		),
	);
}

// Opening a note is a same-document hash navigation, so the screen keeps its disclosure state:
// only click when the toggle actually reports itself collapsed.
async function openFilters(page: Page) {
	const toggle = page.getByTestId('knowledge-filters-toggle');
	await toggle.waitFor({ state: 'visible' });
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
	await expect(page.getByTestId('filters-panel')).toBeVisible();
}

test.describe('knowledge: filters and saved searches', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/knowledge');
		await seedFresh(page);
		await page.goto('/#/knowledge', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('text and kind facets narrow the result to what the core matched', async ({ page }) => {
		await openFilters(page);

		// An untouched panel is "everything I can see", not an empty result.
		await expect(page.getByTestId('filters-count')).not.toHaveText('0 matches');
		await expect(page.getByTestId('filters-panel')).toContainText('No filters');

		await page.getByTestId('filters-query').fill('Sunken');
		const results = page.getByTestId('filters-results');
		await expect(results).toContainText('Sunken Crypt');

		// Restricting the kind facet to story entries drops the note hit — the core re-evaluates,
		// the panel does not filter its own list.
		await page.getByTestId('filters-type-object').click();
		await expect(page.getByTestId('filters-type-object')).toHaveAttribute('aria-pressed', 'true');
		await expect(results).not.toContainText('Sunken Crypt');

		// Clearing puts every facet back and the applied-facet count says so.
		await page.getByTestId('filters-clear').click();
		await expect(page.getByTestId('filters-query')).toHaveValue('');
		await expect(page.getByTestId('filters-panel')).toContainText('No filters');
	});

	test('a saved search stores the query, and pin, rename, apply and delete are real', async ({
		page,
	}) => {
		await openFilters(page);
		await page.getByTestId('filters-query').fill('Hollow King');
		await page.getByTestId('filters-save-name').fill('Hollow King threads');
		await page.getByTestId('filters-save').click();

		await expect.poll(async () => (await savedSearches(page)).length).toBe(1);
		const [created] = await savedSearches(page);
		// It stored the QUERY and nothing resembling a result set.
		expect(created.filter.query).toBe('Hollow King');
		expect(created.visibility).toBe('dm-only');
		expect(created.pinned).toBe(false);

		await page.getByTestId(`filters-pin-${created.id}`).click();
		await expect.poll(async () => (await savedSearches(page))[0].pinned).toBe(true);

		await page.getByTestId(`filters-rename-${created.id}`).click();
		await page.getByTestId('filters-rename-input').fill('Hollow King leads');
		await page.getByTestId('filters-rename-save').click();
		await expect.poll(async () => (await savedSearches(page))[0].name).toBe('Hollow King leads');

		// Applying loads the stored criteria back into the editor.
		await page.getByTestId('filters-clear').click();
		await expect(page.getByTestId('filters-query')).toHaveValue('');
		await page.getByTestId(`filters-apply-${created.id}`).click();
		await expect(page.getByTestId('filters-query')).toHaveValue('Hollow King');

		await page.getByTestId(`filters-delete-${created.id}`).click();
		await expect.poll(async () => (await savedSearches(page)).length).toBe(0);
		await expect(page.getByTestId('filters-saved-empty')).toBeVisible();
	});

	test('a dm-only saved search is absent from a player view, a shared one is not', async ({
		page,
	}) => {
		await openFilters(page);
		await page.getByTestId('filters-query').fill('Ashen Hand');
		await page.getByTestId('filters-save-name').fill('Cult watch');
		await page.getByTestId('filters-save').click();
		await expect.poll(async () => (await savedSearches(page)).length).toBe(1);

		await page.getByTestId('filters-save-name').fill('Table handouts');
		await page.getByTestId('filters-save-visibility').selectOption('player-visible');
		await page.getByTestId('filters-save').click();
		await expect.poll(async () => (await savedSearches(page)).length).toBe(2);

		// As a player, the DM-only criteria are not blanked — the saved search is not there at all,
		// while the player-visible one is.
		await enterPreview(page, 'player');
		await openFilters(page);
		const list = page.getByTestId('filters-saved-list');
		await expect(list).toContainText('Table handouts');
		await expect(list).not.toContainText('Cult watch');
		// A player cannot author saved searches, so the save form is absent rather than dead.
		await expect(page.getByTestId('filters-save')).toHaveCount(0);
	});

	// RC-KNW-2.1 — the palette half of the story: a saved search is reachable from ⌘K behind the
	// `>` action sigil, and running it restores the STORED CRITERIA into the filter editor rather
	// than just carrying its name over.
	test('the command palette runs a saved search from `>search saved`', async ({ page }) => {
		await openFilters(page);
		await page.getByTestId('filters-query').fill('Hollow King');
		await page.getByTestId('filters-save-name').fill('Hollow King threads');
		await page.getByTestId('filters-save').click();
		await expect.poll(async () => (await savedSearches(page)).length).toBe(1);

		// Clear the editor so the restore below can only have come from the stored filter.
		await page.getByTestId('filters-clear').click();
		await expect(page.getByTestId('filters-query')).toHaveValue('');

		await page.keyboard.press('Control+k');
		const dialog = page.getByRole('dialog', { name: 'Command palette' });
		await expect(dialog).toBeVisible();
		// Scoped to the overlay: the filter editor behind it has comboboxes of its own.
		await dialog.getByRole('combobox').fill('>search saved');

		const row = page.getByRole('option', { name: 'Hollow King threads' });
		await expect(row).toBeVisible();
		await row.click();

		await expect(dialog).toHaveCount(0);
		await expect(page.getByTestId('filters-panel')).toBeVisible();
		await expect(page.getByTestId('filters-query')).toHaveValue('Hollow King');
		await expect(page.getByTestId('filters-results')).toContainText('Hollow King');
	});

	test('a player is offered no dm-only saved search in the palette', async ({ page }) => {
		await openFilters(page);
		await page.getByTestId('filters-query').fill('Ashen Hand');
		await page.getByTestId('filters-save-name').fill('Cult watch');
		await page.getByTestId('filters-save').click();
		await expect.poll(async () => (await savedSearches(page)).length).toBe(1);

		await enterPreview(page, 'player');
		await page.keyboard.press('Control+k');
		const dialog = page.getByRole('dialog', { name: 'Command palette' });
		await expect(dialog).toBeVisible();
		await dialog.getByRole('combobox').fill('>search saved');
		// Absent, not blanked: the dm-only saved search is never a candidate for this actor.
		await expect(page.getByRole('option', { name: 'Cult watch' })).toHaveCount(0);
	});

	test('the graph hands its typed query to the vault search', async ({ page }) => {
		await gotoRoute(page, '/graph');
		await page.locator('#main-content').waitFor({ state: 'attached' });
		const vault = page.getByTestId('graph-search-vault');
		// Nothing typed, nothing to hand over — the control says so instead of navigating empty.
		await expect(vault).toBeDisabled();

		await page.getByLabel('Search the graph').fill('Sunken');
		await vault.click();

		await expect(page.getByTestId('filters-panel')).toBeVisible();
		await expect(page.getByTestId('filters-query')).toHaveValue('Sunken');
		await expect(page.getByTestId('filters-results')).toContainText('Sunken Crypt');
	});
});
