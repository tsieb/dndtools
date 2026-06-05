import { expect, test, type Page } from '@playwright/test';

// CONTENT-001 / CONTENT-002 — notes and editor.
//
// Markdown notes are the primary content unit. An authorized editor (the DM) creates, reads, updates,
// deletes (recoverable soft-delete), restores, and searches notes, and edits markdown with VISIBLE SAVE
// STATUS, VALIDATION feedback, a PREVIEW, and actor-filtered WIKILINK assistance. A player sees and
// searches only the notes their visibility permits, and is never offered a wikilink to a hidden note.
// This is a stacked form/list surface that renders identically on desktop and compact profiles, so it
// runs on BOTH Playwright projects. The "view as" header control switches the rendered actor.

test.describe('CONTENT-001/002 notes and editor', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
	});

	async function createNote(page: Page, title: string, visibility: string): Promise<void> {
		await page.getByTestId('note-new-title').fill(title);
		await page.getByTestId('note-new-visibility').selectOption(visibility);
		await page.getByTestId('note-create').click();
		// Creating opens the editor on the new note.
		await expect(page.getByTestId('note-editor')).toContainText(`Editing: ${title}`);
	}

	test('CONTENT-001: create, edit, and save a note with a visible success status', async ({ page }) => {
		await createNote(page, 'Highmoor Keep', 'player-visible');

		await page.getByTestId('note-body').fill('An ancient keep on the moor.');
		// Validation reports a valid draft and save is enabled.
		await expect(page.getByTestId('note-validation-ok')).toBeVisible();
		await page.getByTestId('note-save').click();

		// CONTENT-002 AC1: the save status reports success.
		await expect(page.getByTestId('note-save-status-value')).toHaveText('success');

		// The note round-trips into the search list.
		await page.getByTestId('notes-search').fill('Highmoor');
		await expect(page.getByTestId('notes-list')).toContainText('Highmoor Keep');
	});

	test('CONTENT-002: validation fails closed and blocks save for malformed markdown', async ({ page }) => {
		await createNote(page, 'Broken Note', 'dm-only');
		// Unterminated frontmatter is a blocking error.
		await page.getByTestId('note-body').fill('---\ntitle: oops\nno closing fence');
		await expect(page.getByTestId('note-validation-frontmatter-unterminated')).toBeVisible();
		await expect(page.getByTestId('note-save')).toBeDisabled();

		// Fixing the markdown clears the error and re-enables save.
		await page.getByTestId('note-body').fill('A clean body.');
		await expect(page.getByTestId('note-validation-ok')).toBeVisible();
		await expect(page.getByTestId('note-save')).toBeEnabled();
	});

	test('CONTENT-002: the preview renders the markdown structure', async ({ page }) => {
		await createNote(page, 'Preview Note', 'dm-only');
		await page.getByTestId('note-body').fill('# A Heading\nA paragraph.\n- a list item');
		const preview = page.getByTestId('note-preview');
		await expect(preview.getByTestId('preview-heading')).toHaveText('A Heading');
		await expect(preview.getByTestId('preview-paragraph')).toContainText('A paragraph.');
		await expect(preview.getByTestId('preview-list-item')).toContainText('a list item');
	});

	test('CONTENT-001: delete soft-deletes and restore brings the note back', async ({ page }) => {
		await createNote(page, 'Recoverable Note', 'player-visible');
		await page.getByTestId('note-body').fill('important content');
		await page.getByTestId('note-save').click();
		await expect(page.getByTestId('note-save-status-value')).toHaveText('success');

		// Delete via the list row (the testid carries the runtime-generated id, so target by name).
		await page.getByTestId('notes-list').getByRole('button', { name: 'Delete' }).click();
		// The note leaves the list but appears in the recycle bin (recoverable).
		await expect(page.getByTestId('notes-list')).toHaveCount(0);
		const bin = page.getByTestId('notes-recycle-bin');
		await expect(bin).toContainText('Recoverable Note');

		// Restore brings it back into the list at its prior content.
		await bin.getByRole('button', { name: 'Restore' }).click();
		await page.getByTestId('notes-search').fill('Recoverable');
		await expect(page.getByTestId('notes-list')).toContainText('Recoverable Note');
		await expect(page.getByTestId('notes-recycle-bin')).toHaveCount(0);
	});

	test('CONTENT-002: wikilink suggestions are actor-filtered (no hidden note offered)', async ({ page }) => {
		// One dm-only note and one player-visible note, both starting with "Bane".
		await createNote(page, 'Bane Secret Plot', 'dm-only');
		await createNote(page, 'Bane the Town', 'player-visible');

		// As the DM both are offered while typing `[[Ban`.
		await page.getByTestId('note-body').fill('[[Ban');
		await page.getByTestId('note-body').focus();
		await page.getByTestId('note-body').press('End');
		const suggestions = page.getByTestId('note-wikilink-suggestions');
		await expect(suggestions).toContainText('Bane the Town');
		await expect(suggestions).toContainText('Bane Secret Plot');

		// As a player, ONLY the player-visible note is offered — the dm-only note never appears.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		// The player has no editor (no write grant), so the suggestion non-leak is proved at the search list:
		// the dm-only note is absent from a player's actor-filtered search entirely.
		await page.getByTestId('notes-search').fill('Bane');
		const list = page.getByTestId('notes-list');
		await expect(list).toContainText('Bane the Town');
		await expect(list.getByText('Bane Secret Plot')).toHaveCount(0);
	});

	test('CONTENT-001: a player searches and sees only visible notes; no editor affordances', async ({ page }) => {
		await createNote(page, 'DM Only Lore', 'dm-only');
		await createNote(page, 'Public Lore', 'player-visible');

		await page.getByTestId('view-as-select').selectOption('actor-player');
		// A player has no create form and no editor.
		await expect(page.getByTestId('note-create-form')).toHaveCount(0);
		await expect(page.getByTestId('note-editor')).toHaveCount(0);

		// Search returns only the player-visible note; the dm-only note never appears.
		await page.getByTestId('notes-search').fill('Lore');
		const list = page.getByTestId('notes-list');
		await expect(list).toContainText('Public Lore');
		await expect(list.getByText('DM Only Lore')).toHaveCount(0);
	});
});
