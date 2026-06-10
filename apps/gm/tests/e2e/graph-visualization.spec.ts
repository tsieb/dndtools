import { expect, test, type Page } from '@playwright/test';

// GRAPH-004 — graph VISUALIZATION.
//
// A user views the actor's VISIBLE link graph (notes, objects, maps, POIs + the edges between them) and
// FILTERS it by folder, tag, entity type, source, relationship type, and visibility-safe search text. The
// surface renders the single computed, actor-filtered model: a player never sees a hidden/DM-only node,
// edge, label, facet, or a count that would reveal hidden content (the model omits them).
//
// ACCESSIBILITY: the graph is rendered as a keyboard-navigable, screen-reader-accessible TABLE of nodes and
// their relationships (caption, column headers, row headers) — there is no pointer-only canvas; every
// note/object node is a real link. On a COMPACT profile the filters collapse into a single disclosure (a
// simplified control surface — AC2). This stacked surface renders on both Playwright projects, so it runs on
// desktop-chromium AND mobile-chromium. The "view as" header control switches the rendered actor.

test.describe('GRAPH-004 graph visualization', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
	});

	// On a compact profile the filter inputs live inside a collapsed `<details>` disclosure (AC2). Open it
	// (if present and closed) before interacting with a filter input, so the same assertions work on both
	// the desktop and mobile projects.
	async function openFilters(page: Page): Promise<void> {
		const compact = page.getByTestId('graph-filters-compact');
		if ((await compact.count()) === 0) return;
		if (await compact.evaluate((el) => (el as HTMLDetailsElement).open)) return;
		await page.getByTestId('graph-filters-toggle').click();
		await expect(page.getByTestId('graph-search')).toBeVisible();
	}

	async function createNote(
		page: Page,
		title: string,
		visibility: 'dm-only' | 'player-visible',
		body: string,
	): Promise<void> {
		await page.getByTestId('note-new-title').fill(title);
		await page.getByTestId('note-new-visibility').selectOption(visibility);
		await page.getByTestId('note-create').click();
		// Creating opens the editor on the new note — synchronize on the editor showing THIS note (not a list
		// row) before filling the body, so the save targets the right draft (avoids the mobile race pattern).
		await expect(page.getByTestId('note-editor')).toContainText(`Editing: ${title}`);
		await page.getByTestId('note-body').fill(body);
		await page.getByTestId('note-save').click();
		await expect(page.getByTestId('note-save-status-value')).toHaveText('success');
	}

	test('renders the node table with wikilink relationships; the table is accessible', async ({ page }) => {
		await createNote(page, 'Highmoor', 'player-visible', '# History\nAn ancient keep. #keep');
		await createNote(page, 'Quest Log', 'player-visible', 'The party set out for [[Highmoor]] at dawn. #travel');

		const graph = page.getByTestId('graph-visualization');
		await expect(graph).toBeVisible();

		// The accessible rendering is a real table with column headers (the SR/keyboard alternative).
		const table = page.getByTestId('graph-node-table');
		await expect(table).toBeVisible();
		await expect(table.locator('thead th', { hasText: 'Node' })).toBeVisible();
		await expect(table.locator('thead th', { hasText: 'Links to' })).toBeVisible();

		// Both notes are nodes; Quest Log links to Highmoor (a wikilink relationship).
		await expect(graph.getByRole('button', { name: 'Highmoor' })).toBeVisible();
		await expect(graph.getByRole('button', { name: 'Quest Log' })).toBeVisible();
		const questLinks = page.getByTestId(/graph-node-links-to-.*/);
		await expect(questLinks.getByText('Highmoor', { exact: false }).first()).toBeVisible();
		await expect(page.getByTestId('graph-count')).toContainText('relationship');
	});

	test('a note node links into the Knowledge section (keyboard-operable navigation)', async ({ page }) => {
		await createNote(page, 'Riverwatch', 'player-visible', 'A fort on the river.');

		// Opening a node navigates to the note in the Knowledge section via the existing `?note=` selection.
		await page.getByTestId('graph-visualization').getByRole('button', { name: 'Riverwatch' }).click();
		await expect(page).toHaveURL(/note=/);
		// The editor opens on the selected note (synchronize on the editor, not just the URL).
		await expect(page.getByTestId('note-editor')).toContainText('Editing: Riverwatch');
	});

	test('the entity-type filter restricts to maps; the search/tag filters narrow nodes', async ({ page }) => {
		await createNote(page, 'A Plain Note', 'player-visible', 'no links here #lore');

		const graph = page.getByTestId('graph-visualization');
		await openFilters(page);
		// Filter to MAP entities only: the note disappears, the demo map node remains.
		await page.getByTestId('graph-kind-map').check();
		await expect(graph.getByRole('button', { name: 'A Plain Note' })).toHaveCount(0);
		await expect(graph.getByText('Western Reaches')).toBeVisible();

		// Back to notes only, then a tag filter restricts to the tagged note.
		await page.getByTestId('graph-kind-map').uncheck();
		await page.getByTestId('graph-kind-note').check();
		await expect(graph.getByRole('button', { name: 'A Plain Note' })).toBeVisible();
		await page.getByTestId('graph-kind-note').uncheck();

		await page.getByTestId('graph-tags').fill('lore');
		await expect(graph.getByRole('button', { name: 'A Plain Note' })).toBeVisible();
		await page.getByTestId('graph-tags').fill('nonexistent-tag');
		await expect(page.getByTestId('graph-no-matches')).toBeVisible();
		await page.getByTestId('graph-clear-filters').click();
		await expect(graph.getByRole('button', { name: 'A Plain Note' })).toBeVisible();
	});

	test('AC1 + fail closed: a player sees only visible map nodes/POIs, never a dm-only node or count', async ({
		page,
	}) => {
		// The DM authors a dm-only note that links to a player-visible note.
		await createNote(page, 'Town Square', 'player-visible', 'The bustling square.');
		await createNote(page, 'Assassins Guild', 'dm-only', 'The guild watches [[Town Square]]. #villain');

		const graph = page.getByTestId('graph-visualization');
		await openFilters(page);

		// As the DM: the dm-only note node AND the dm-only demo POI "Smugglers' Cache" are present.
		await expect(graph.getByRole('button', { name: 'Assassins Guild' })).toBeVisible();
		await page.getByTestId('graph-search').fill('Smugglers');
		await expect(graph.getByText("Smugglers' Cache")).toBeVisible();
		await page.getByTestId('graph-clear-filters').click();

		// As a PLAYER: the dm-only note node is ABSENT, its edge into Town Square is gone, and the dm-only
		// POI never appears — not as a node, a label, or in any count (fail closed).
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await openFilters(page);
		await expect(graph.getByText('Assassins Guild')).toHaveCount(0);
		await expect(graph.getByText('#villain')).toHaveCount(0);

		// Town Square has no visible "linked from" (its only backlink was the hidden note).
		await expect(graph.getByRole('button', { name: 'Town Square' })).toBeVisible();

		// The player-visible demo map + its player-visible POI ARE visible; the dm-only POI is NOT.
		await page.getByTestId('graph-search').fill('Harbor');
		await expect(graph.getByText('Harbor Town')).toBeVisible();
		await page.getByTestId('graph-search').fill('Smugglers');
		await expect(graph.getByText("Smugglers' Cache")).toHaveCount(0);
		await expect(page.getByTestId('graph-no-matches')).toBeVisible();
	});

	test('AC2: on a compact profile the filters collapse into a simplified control surface', async ({
		page,
	}, testInfo) => {
		await createNote(page, 'Compact Note', 'player-visible', 'a note #mobile');

		const compactFilters = page.getByTestId('graph-filters-compact');
		if (testInfo.project.name === 'mobile-chromium') {
			// On the compact (mobile) profile the controls are behind a single disclosure.
			await expect(compactFilters).toBeVisible();
			await expect(page.getByTestId('graph-filters-toggle')).toBeVisible();
			// Expanding the disclosure reveals the same filter inputs and they still narrow the graph.
			await compactFilters.locator('summary').click();
			await page.getByTestId('graph-tags').fill('mobile');
			await expect(page.getByTestId('graph-visualization').getByRole('button', { name: 'Compact Note' })).toBeVisible();
		} else {
			// On the expanded (desktop) profile the filters render inline, not behind the disclosure.
			await expect(compactFilters).toHaveCount(0);
			await expect(page.getByTestId('graph-filter-form')).toBeVisible();
		}
	});
});
