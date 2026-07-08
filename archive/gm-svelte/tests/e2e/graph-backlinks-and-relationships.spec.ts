import { expect, test, type Page } from '@playwright/test';

// GRAPH-002 — backlinks and navigation relationships.
//
// From a visible note a user inspects BACKLINKS (visible notes that link to it, with context snippets and an
// optional cross-section), and RELATED-NOTE jumps (the visible notes the note links to). Every relationship is
// computed in the Processing Core over the actor's VISIBLE link graph: a hidden/deleted backlink source is
// absent (never redacted), and the relationships of a note the actor cannot see come back empty (fail closed).
// This is a stacked read surface that renders identically on desktop and compact profiles, so it runs on BOTH
// Playwright projects. The "view as" header control switches the rendered actor.

test.describe('GRAPH-002 backlinks and navigation relationships', () => {
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
		visibility: string,
		body?: string,
	): Promise<void> {
		await page.getByTestId('note-new-title').fill(title);
		await page.getByTestId('note-new-visibility').selectOption(visibility);
		await page.getByTestId('note-create').click();
		// Creating opens the editor on the new note — synchronize on the editor showing THIS note (not a list
		// row) before continuing, so the save below targets the right draft (avoids the mobile race).
		await expect(page.getByTestId('note-editor')).toContainText(`Editing: ${title}`);
		if (body !== undefined) {
			await page.getByTestId('note-body').fill(body);
			await expect(page.getByTestId('note-validation-ok')).toBeVisible();
			await page.getByTestId('note-save').click();
			await expect(page.getByTestId('note-save-status-value')).toHaveText('success');
		}
	}

	async function openNote(page: Page, title: string): Promise<void> {
		await page.getByTestId('notes-search').fill(title);
		const list = page.getByTestId('notes-list');
		await expect(list).toContainText(title);
		await list.getByRole('button', { name: title, exact: true }).click();
		// Synchronize on the relationships panel reflecting the open note.
		await expect(page.getByTestId('note-relationships')).toBeVisible();
	}

	test('AC1: opening a note shows its visible backlinks with context snippets and a cross-section', async ({
		page,
	}) => {
		await createNote(page, 'Highmoor', 'player-visible', '# History\nAn ancient keep.');
		await createNote(page, 'Quest Log', 'player-visible', 'The party set out for [[Highmoor#History]] at dawn.');
		await createNote(page, 'Town Crier', 'player-visible', 'News of [[Highmoor]] reached the square.');

		await openNote(page, 'Highmoor');

		const backlinks = page.getByTestId('note-backlinks');
		await expect(backlinks).toContainText('Quest Log');
		await expect(backlinks).toContainText('Town Crier');
		// The cross-section link resolves to the target's History heading.
		await expect(page.getByTestId(/note-backlink-section-.*/).first()).toContainText('#History');
		// A context snippet quotes the surrounding text of the link.
		await expect(backlinks.getByText('set out for')).toBeVisible();
	});

	test('related-note jumps navigate to the linked note', async ({ page }) => {
		await createNote(page, 'Town', 'player-visible', 'A small town.');
		await createNote(page, 'Hub', 'player-visible', 'A road leads to [[Town]].');

		await openNote(page, 'Hub');

		const related = page.getByTestId('note-related');
		await expect(related).toContainText('Town');
		// Jumping opens the related note; the relationships panel re-renders for it.
		await page.getByTestId(/note-related-open-.*/).first().click();
		await expect(page.getByTestId('note-relationships')).toBeVisible();
		// Town has one backlink (Hub) — proving we navigated to Town's relationship view.
		await expect(page.getByTestId('note-backlinks')).toContainText('Hub');
	});

	test('AC2: a player never sees a dm-only backlink source', async ({ page }) => {
		await createNote(page, 'Highmoor', 'player-visible', 'An ancient keep.');
		await createNote(page, 'Secret Plot', 'dm-only', 'The villain lurks in [[Highmoor]].');
		await createNote(page, 'Town Crier', 'player-visible', 'News of [[Highmoor]] reached the square.');

		// As the DM, both backlinks appear.
		await openNote(page, 'Highmoor');
		await expect(page.getByTestId('note-backlinks')).toContainText('Secret Plot');
		await expect(page.getByTestId('note-backlinks')).toContainText('Town Crier');

		// As a player, the dm-only source is ABSENT; only the visible one remains.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await openNote(page, 'Highmoor');
		const backlinks = page.getByTestId('note-backlinks');
		await expect(backlinks).toContainText('Town Crier');
		await expect(backlinks.getByText('Secret Plot')).toHaveCount(0);
	});
});
