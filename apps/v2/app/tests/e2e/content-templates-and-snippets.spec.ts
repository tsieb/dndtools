import { expect, test, type Page } from '@playwright/test';

// CONTENT-003 / CONTENT-004 — templates and snippets.
//
// CONTENT-003: an authorized editor creates content FROM A STARTER PRESET with VARIABLES. The generated
// content is VALIDATED through the EXISTING pipeline BEFORE the write; a missing required variable blocks
// creation with a validation message (AC1), and a template's visibility is explicit or defaults to dm-only
// (AC2).
// CONTENT-004: an authorized editor INSERTS a SNIPPET into a note. The inserted content funnels through the
// SAME validation + sanitization (the safe block-model preview, no raw HTML) + visibility pipeline as
// hand-typed content — a snippet cannot widen the note's visibility.
//
// This is a stacked form/list surface that renders identically on desktop and compact profiles, so it runs
// on BOTH Playwright projects. Authoring is DM-only; a player sees no template/snippet affordances.

test.describe('CONTENT-003/004 templates and snippets', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
	});

	// Seed a note with the given title + visibility via the NotesWorkbench (so the snippet note select has it).
	async function seedNote(page: Page, title: string, visibility: string, body: string): Promise<void> {
		await page.getByTestId('note-new-title').fill(title);
		await page.getByTestId('note-new-visibility').selectOption(visibility);
		await page.getByTestId('note-create').click();
		await expect(page.getByTestId('note-editor')).toContainText(`Editing: ${title}`);
		await page.getByTestId('note-body').fill(body);
		await page.getByTestId('note-save').click();
		await expect(page.getByTestId('note-save-status-value')).toHaveText('success');
	}

	test('CONTENT-003 AC1: a missing required variable blocks creation with a validation message', async ({
		page,
	}) => {
		const form = page.getByTestId('create-from-template-form');
		await expect(form).toBeVisible();
		await page.getByTestId('template-preset-select').selectOption('session-recap');

		// Fill only the session number; leave the required summary blank.
		await page.getByTestId('template-var-session').fill('12');
		// The render preview reports the block + the submit button is disabled.
		await expect(page.getByTestId('template-render-invalid')).toBeVisible();
		await expect(page.getByTestId('template-render-invalid')).toContainText('required');
		await expect(page.getByTestId('template-create-submit')).toBeDisabled();

		// Supplying the summary clears the block and enables creation.
		await page.getByTestId('template-var-summary').fill('The keep fell.');
		await expect(page.getByTestId('template-render-valid')).toBeVisible();
		await expect(page.getByTestId('template-create-submit')).toBeEnabled();
	});

	test('CONTENT-003: a valid template creates content and reports the generated title + visibility', async ({
		page,
	}) => {
		await page.getByTestId('template-preset-select').selectOption('session-recap');
		await page.getByTestId('template-var-session').fill('1');
		await page.getByTestId('template-var-summary').fill('The party arrives.');
		await expect(page.getByTestId('template-render-valid')).toContainText('Session 1 Recap');
		// The recap template is explicitly player-visible.
		await expect(page.getByTestId('template-render-valid')).toContainText('player-visible');

		await page.getByTestId('template-create-submit').click();
		await expect(page.getByTestId('template-create-summary')).toContainText('Created content');

		// The new note round-trips into the notes search list.
		await page.getByTestId('notes-search').fill('Session 1 Recap');
		await expect(page.getByTestId('notes-list')).toContainText('Session 1 Recap');
	});

	test('CONTENT-003 AC2: a dm-only template default produces a dm-only note', async ({ page }) => {
		await page.getByTestId('template-preset-select').selectOption('location-lore');
		await page.getByTestId('template-var-place').fill('Highmoor Keep');
		await expect(page.getByTestId('template-default-visibility')).toContainText('dm-only');
		await page.getByTestId('template-create-submit').click();
		await expect(page.getByTestId('template-create-summary')).toContainText('Created content');

		// The note exists for the DM and reports dm-only via the snippet note select label.
		await expect(page.getByTestId('snippet-note-select')).toContainText('Highmoor Keep (dm-only)');
	});

	test('CONTENT-004: inserting a snippet inherits the note visibility and cannot widen it', async ({
		page,
	}) => {
		await seedNote(page, 'Dungeon Notes', 'dm-only', 'A dark hall.');

		const form = page.getByTestId('insert-snippet-form');
		await expect(form).toBeVisible();
		await page.getByTestId('snippet-note-select').selectOption({ label: 'Dungeon Notes (dm-only)' });
		await page.getByTestId('snippet-select').selectOption('secret-door');

		// The inherited-visibility note states the snippet inherits dm-only and cannot widen it.
		await expect(page.getByTestId('snippet-inherited-visibility')).toContainText('dm-only');
		await expect(page.getByTestId('snippet-inherited-visibility')).toContainText('cannot widen');

		// The insert preview is the SAFE block model (no raw HTML), and the result is valid.
		await expect(page.getByTestId('snippet-insert-valid')).toBeVisible();
		await expect(page.getByTestId('snippet-insert-preview')).toContainText('Secret door');

		await page.getByTestId('snippet-insert-submit').click();
		await expect(page.getByTestId('snippet-insert-summary')).toContainText('visibility unchanged (dm-only)');

		// The note is STILL dm-only after the insert — the snippet did not widen it.
		await expect(page.getByTestId('snippet-note-select')).toContainText('Dungeon Notes (dm-only)');
	});

	test('CONTENT-004: an inserted snippet renders through the safe block-model preview (sanitization)', async ({
		page,
	}) => {
		await seedNote(page, 'Stat Block Host', 'player-visible', 'An ogre.');
		await page.getByTestId('snippet-note-select').selectOption({ label: 'Stat Block Host (player-visible)' });
		await page.getByTestId('snippet-select').selectOption('stat-line');

		// The preview is a list of typed blocks (heading/paragraph/list-item) — never raw HTML.
		const preview = page.getByTestId('snippet-insert-preview');
		await expect(preview).toBeVisible();
		await expect(preview).toContainText('STR');
		// Inserting preserves the player-visible note's visibility (no widening; no narrowing).
		await expect(page.getByTestId('snippet-inherited-visibility')).toContainText('player-visible');

		await page.getByTestId('snippet-insert-submit').click();
		await expect(page.getByTestId('snippet-insert-summary')).toContainText('visibility unchanged (player-visible)');
	});

	test('a player sees no template or snippet authoring affordances (authoring is DM-only)', async ({
		page,
	}) => {
		// Switch the rendered actor to a player via the header "view as" control.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('templates-and-snippets')).toHaveCount(0);
	});
});
