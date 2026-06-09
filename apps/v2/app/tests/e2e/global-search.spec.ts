import { expect, test, type Page } from '@playwright/test';

/**
 * UX-SRCH-001 — the global search overlay: invocation, scope indicator, grouped results, and no-leak.
 *
 * The overlay opens from the header button or `Cmd/Ctrl+Shift+F`, shows a scope chip ("All visible
 * content") before the user types, and renders grouped results shortly after a query. Every candidate is
 * drawn from the single actor-filtered search read, so a player whose term matches ONLY DM-hidden content
 * sees the SAME zero-result state as a term that matches nothing — no count or group reveals a hidden hit.
 */

async function freshKnowledge(page: Page) {
	await page.goto('/knowledge/');
	await page.getByTestId('notes-workbench').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('notes-workbench').waitFor({ state: 'visible' });
}

async function viewAs(page: Page, actorId: string) {
	await page.getByTestId('view-as-select').selectOption(actorId);
}

async function createNote(page: Page, title: string, visibility: string, body: string) {
	await page.getByTestId('note-new-title').fill(title);
	await page.getByTestId('note-new-visibility').selectOption(visibility);
	await page.getByTestId('note-create').click();
	await expect(page.getByTestId('note-editor')).toContainText(`Editing: ${title}`);
	await page.getByTestId('note-body').fill(body);
	await page.getByTestId('note-save').click();
	await expect(page.getByTestId('note-save-status-value')).toHaveText('success');
}

async function openSearch(page: Page) {
	await page.getByTestId('open-global-search').click();
	await expect(page.getByTestId('global-search')).toBeVisible();
}

test.describe('UX-SRCH-001 global search — invocation, scope, and layout', () => {
	test('opening shows the scope chip and focuses the search field (AC1)', async ({ page }) => {
		await freshKnowledge(page);
		await openSearch(page);
		await expect(page.getByTestId('global-search-scope')).toHaveText('All visible content');
		await expect(page.getByTestId('global-search-input')).toBeFocused();
	});

	test('Ctrl+Shift+F opens the overlay from any route (AC1 keyboard parity)', async ({
		page,
	}, testInfo) => {
		test.skip(testInfo.project.name === 'mobile-chromium', 'Ctrl+Shift+F is the keyboard open path');
		await freshKnowledge(page);
		await page.keyboard.press('Control+Shift+F');
		await expect(page.getByTestId('global-search')).toBeVisible();
		await expect(page.getByTestId('global-search-input')).toBeFocused();
	});

	test('typing a term renders results grouped by type (AC2)', async ({ page }) => {
		await freshKnowledge(page);
		await createNote(page, 'Dragon Lore', 'player-visible', 'Wyrms of the north.');

		await openSearch(page);
		await page.getByTestId('global-search-input').fill('dragon');

		await expect(page.getByTestId('global-search-results')).toBeVisible();
		await expect(page.getByTestId('global-search-group-note')).toBeVisible();
		const result = page.locator('[data-testid^="global-search-result-note-"]');
		await expect(result).toContainText('Dragon Lore');
	});

	test('a short query shows the keep-typing hint, not results', async ({ page }) => {
		await freshKnowledge(page);
		await createNote(page, 'Dragon Lore', 'player-visible', 'Wyrms of the north.');
		await openSearch(page);
		await page.getByTestId('global-search-input').fill('dr');
		await expect(page.getByTestId('global-search-hint')).toBeVisible();
		await expect(page.getByTestId('global-search-results')).toHaveCount(0);
	});
});

test.describe('UX-SRCH-001 global search — actor safety / no leak (AC3)', () => {
	test('a player term matching only DM-hidden content yields the same zero-result state as no match', async ({
		page,
	}) => {
		await freshKnowledge(page);
		await createNote(page, 'Public Square', 'player-visible', 'A market gathers.');
		await createNote(page, 'Wyrm Hoard', 'dm-only', 'The dragon guards its gold.');

		// The DM can find the dm-only note.
		await openSearch(page);
		await page.getByTestId('global-search-input').fill('wyrm');
		await expect(
			page.locator('[data-testid^="global-search-result-"]').filter({ hasText: 'Wyrm Hoard' }),
		).toBeVisible();
		await page.getByTestId('global-search-input').press('Escape');
		await expect(page.getByTestId('global-search-input')).toHaveValue('');
		await page.getByTestId('global-search-input').press('Escape');
		await expect(page.getByTestId('global-search')).toHaveCount(0);

		// As a player, "wyrm" (matches ONLY hidden content) shows the identical zero-result state as a term
		// that matches nothing anywhere — no result row, no group, no count reveals the hidden hit.
		await viewAs(page, 'actor-player');
		await openSearch(page);
		await page.getByTestId('global-search-input').fill('wyrm');
		await expect(page.getByTestId('global-search-empty')).toBeVisible();
		await expect(page.locator('[data-testid^="global-search-result-"]')).toHaveCount(0);
		await expect(page.locator('[data-testid^="global-search-count-"]')).toHaveCount(0);
		await expect(page.getByTestId('global-search')).not.toContainText('Wyrm Hoard');

		// A guaranteed-no-match term produces the same empty state — indistinguishable from the hidden case.
		await page.getByTestId('global-search-input').fill('zzzznomatch');
		await expect(page.getByTestId('global-search-empty')).toBeVisible();
		await expect(page.locator('[data-testid^="global-search-result-"]')).toHaveCount(0);
	});
});
