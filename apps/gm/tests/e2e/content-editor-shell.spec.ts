import { expect, test, type Page } from '@playwright/test';

// UX-CONTENT-001/002/003/004/007 — the editor shell + writing controls: a markdown formatting toolbar,
// a slash insert menu, a persistent autosave chip, and a distraction-free focus mode. Renders the same
// on desktop and compact profiles, so this runs on BOTH Playwright projects.

test.describe('UX-CONTENT editor shell', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
	});

	async function openNote(page: Page): Promise<void> {
		await page.getByTestId('note-new-title').fill('Draft');
		await page.getByTestId('note-new-visibility').selectOption('player-visible');
		await page.getByTestId('note-create').click();
		await expect(page.getByTestId('note-editor')).toContainText('Editing: Draft');
	}

	test('UX-CONTENT-002: the Bold toolbar button inserts markdown emphasis', async ({ page }) => {
		await openNote(page);
		await page.getByTestId('note-fmt-bold').click();
		await expect(page.getByTestId('note-body')).toHaveValue('****');
	});

	test('UX-CONTENT-003: typing "/" opens the slash insert menu and inserts a block', async ({ page }) => {
		await openNote(page);
		await page.getByTestId('note-body').fill('/');
		await expect(page.getByTestId('note-slash-menu')).toBeVisible();
		await page.getByTestId('note-slash-h2').click();
		await expect(page.getByTestId('note-body')).toHaveValue('## ');
		await expect(page.getByTestId('note-slash-menu')).toHaveCount(0);
	});

	test('UX-CONTENT-004: the autosave chip reflects unsaved → saved after a save', async ({ page }) => {
		await openNote(page);
		await page.getByTestId('note-body').fill('Some prose.');
		await expect(page.getByTestId('note-save-status')).toHaveAttribute('data-state', 'unsaved');
		await page.getByTestId('note-save').click();
		await expect(page.getByTestId('note-save-status')).toHaveAttribute('data-state', 'saved');
	});

	test('UX-CONTENT-007: focus mode hides chrome and shows a word count; the save chip stays', async ({ page }) => {
		await openNote(page);
		await page.getByTestId('note-body').fill('one two three');
		await page.getByTestId('note-focus-toggle').click();
		await expect(page.getByTestId('note-editor')).toHaveAttribute('data-focus', 'true');
		await expect(page.getByTestId('note-word-count')).toContainText('3 words');
		// The save chip must never be hidden in focus mode (safety requirement).
		await expect(page.getByTestId('note-save-status')).toBeVisible();
	});
});
