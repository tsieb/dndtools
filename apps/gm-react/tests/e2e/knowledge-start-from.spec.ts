import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-KNW-6.4 — templates at the moment of creation, and the Notes filter that says what it is:
// the composer's "Start from" row, saved searches as chips above the grid, the palette's
// "Refine in Notes" handoff, the Graph's filter box and Ctrl/⌘+N on Notes. Assertions read the live
// core state (`__rt.state.content`) where a write is claimed, never the rendered text alone.

/** Loose content-item shape read off `__rt.state.content.items` (raw, NOT actor-filtered). */
interface ItemLite {
	id: string;
	title: string;
	body: string;
	visibility: string;
	deletedAt: string | null;
}

function findItem(page: Page, title: string): Promise<ItemLite | null> {
	return page.evaluate((t) => {
		const items = (window.__rt!.state.content as { items: Record<string, ItemLite> }).items;
		return Object.values(items).find((i) => i.title === t && !i.deletedAt) ?? null;
	}, title);
}

function savedSearchIds(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		Object.keys(
			(window.__rt!.state.content as { savedSearches: Record<string, unknown> }).savedSearches,
		),
	);
}

const notesGrid = (page: Page) => page.getByRole('list', { name: 'Notes' });

test.describe('knowledge: start from a template, filter, refine', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/knowledge');
		await seedFresh(page);
		await page.goto('/#/knowledge', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('the composer creates a session recap in three actions', async ({ page }) => {
		// Action 1 — New note.
		await page.getByRole('button', { name: 'New note', exact: true }).first().click();
		const composer = page.getByTestId('knowledge-composer');
		await expect(composer).toBeVisible();
		const startFrom = composer.getByRole('group', { name: 'Start from' });
		// Blank comes first and is the default, so a plain note still costs nothing extra.
		const chips = startFrom.getByRole('button');
		await expect(chips.first()).toHaveText('Blank');
		await expect(chips.first()).toHaveAttribute('aria-pressed', 'true');
		await expect(composer.getByLabel('New note title')).toBeFocused();

		// Action 2 — the Session recap chip. Its required fields open inline, the first focused.
		await startFrom.getByRole('button', { name: 'Session recap' }).click();
		await expect(startFrom.getByRole('button', { name: 'Session recap' })).toHaveAttribute(
			'aria-pressed',
			'true',
		);
		const session = composer.getByLabel('Session number');
		await expect(session).toBeFocused();
		const create = composer.getByTestId('composer-create');
		// Create stays refused until every required variable is filled.
		await expect(create).toBeDisabled();
		await session.fill('12');
		await composer.getByLabel('One-line summary').fill('The party sealed the reliquary.');

		// The open composer with its chip row and inline fields passes axe.
		expect((await new AxeBuilder({ page }).include('#main-content').analyze()).violations).toEqual(
			[],
		);

		// Action 3 — Create.
		await create.click();
		await page.waitForURL(/#\/knowledge\/[^/]+$/);
		await expect(composer).toHaveCount(0);
		const note = await findItem(page, 'Session 12 Recap');
		expect(note).not.toBeNull();
		expect(note!.body).toContain('The party sealed the reliquary.');
		// The preset's own visibility, decided by the core — not the composer's dm-only default.
		expect(note!.visibility).toBe('player-visible');
		expect(page.url()).toContain(`/knowledge/${note!.id}`);
	});

	test('Blank still creates a titled note from its title alone', async ({ page }) => {
		await page.getByRole('button', { name: 'New note', exact: true }).first().click();
		const composer = page.getByTestId('knowledge-composer');
		await composer.getByLabel('New note title').fill('Tide tables');
		await composer.getByLabel('New note title').press('Enter');
		await page.waitForURL(/#\/knowledge\/[^/]+$/);
		expect(await findItem(page, 'Tide tables')).not.toBeNull();
	});

	test('a saved search chip above the grid filters it, panel open or not', async ({ page }) => {
		const filterToggle = page.getByTestId('knowledge-filters-toggle');
		// "Search" became "Filter": the panel narrows the list, the palette is search.
		await expect(filterToggle).toHaveAccessibleName('Filter');
		await expect(page.getByTestId('knowledge-saved-chips')).toHaveCount(0);

		await filterToggle.click();
		await expect(page.getByTestId('filters-panel')).toBeVisible();
		await page.getByTestId('filters-query').fill('Sunken Crypt');
		await page.getByTestId('filters-save-name').fill('Crypt notes');
		await page.getByTestId('filters-save').click();
		await expect.poll(async () => (await savedSearchIds(page)).length).toBe(1);
		const [searchId] = await savedSearchIds(page);

		const chip = page.getByTestId(`knowledge-saved-chip-${searchId}`);
		await expect(chip).toBeVisible();
		// Close the panel: the chip stays above the grid.
		await filterToggle.click();
		await expect(page.getByTestId('filters-panel')).toHaveCount(0);
		await expect(chip).toBeVisible();
		await expect(chip).toHaveAttribute('aria-pressed', 'false');
		await expect(notesGrid(page)).toContainText('Campaign Primer');
		const before = await notesGrid(page).getByRole('listitem').count();

		await chip.click();
		await expect(chip).toHaveAttribute('aria-pressed', 'true');
		await expect(notesGrid(page)).toContainText('The Sunken Crypt — DM notes');
		await expect(notesGrid(page)).not.toContainText('Campaign Primer');
		const after = await notesGrid(page).getByRole('listitem').count();
		expect(after).toBeLessThan(before);
		// The chip's number is the notes it leaves, and the list heading agrees with the grid.
		await expect(chip).toContainText(`Crypt notes · ${after}`);
		await expect(
			page.getByRole('heading', { level: 2, name: new RegExp(`^${after} notes?$`) }),
		).toBeVisible();

		expect((await new AxeBuilder({ page }).include('#main-content').analyze()).violations).toEqual(
			[],
		);

		// Pressing it again shows every note.
		await chip.click();
		await expect(chip).toHaveAttribute('aria-pressed', 'false');
		await expect(notesGrid(page).getByRole('listitem')).toHaveCount(before);
	});

	test('the palette hands its query to the Notes filter panel', async ({ page }) => {
		await gotoRoute(page, '/');
		await page.locator('#main-content').waitFor({ state: 'attached' });
		await page.keyboard.press('Control+k');
		const palette = page.getByRole('dialog', { name: 'Command palette' });
		await expect(palette).toBeVisible();
		// Nothing found, nothing to refine: the empty state stays the answer. (A negative check, so
		// it waits out the palette's search debounce before asserting the row never arrived.)
		await palette.getByRole('combobox').fill('zzzz-no-such-words');
		await expect(palette.getByText('No matches')).toBeVisible();
		await page.waitForTimeout(600);
		await expect(palette.getByRole('option', { name: /^Refine in Notes/ })).toHaveCount(0);

		await palette.getByRole('combobox').fill('Sunken Crypt');
		const refine = palette.getByRole('option', { name: /^Refine in Notes/ });
		await expect(refine).toBeVisible();
		// It trails the hits: the first (Enter) row is still something that was found.
		await expect(palette.getByRole('option').first()).not.toHaveAccessibleName(/Refine in Notes/);
		await refine.click();

		await page.waitForURL((url) => url.hash === '#/knowledge');
		await expect(palette).toHaveCount(0);
		await expect(page.getByTestId('filters-panel')).toBeVisible();
		// The words arrive exactly as typed, case included, and the panel answers them.
		await expect(page.getByTestId('filters-query')).toHaveValue('Sunken Crypt');
		await expect(page.getByTestId('filters-results')).toContainText('The Sunken Crypt — DM notes');
		await expect(page.getByTestId('knowledge-filters-toggle')).toHaveAttribute(
			'aria-expanded',
			'true',
		);
	});

	test('Ctrl/⌘+N opens the composer on Notes and is listed in the ? overlay', async ({ page }) => {
		await page.keyboard.press('?');
		const overlay = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
		await expect(overlay).toBeVisible();
		const row = overlay.locator('dl > div').filter({ hasText: 'Ctrl/⌘+N' });
		await expect(row).toHaveCount(1);
		await expect(row).toContainText('Start a new note (on Notes)');
		await overlay.getByRole('button', { name: 'Done' }).click();
		await expect(overlay).toHaveCount(0);

		await expect(page.getByTestId('knowledge-composer')).toHaveCount(0);
		await page.keyboard.press('Control+n');
		await expect(page.getByTestId('knowledge-composer')).toBeVisible();
		await expect(page.getByLabel('New note title')).toBeFocused();

		// Typing in a field keeps the key: the caret is never hijacked.
		await page.getByLabel('New note title').fill('Half a thought');
		await page.keyboard.press('Control+n');
		await expect(page.getByLabel('New note title')).toHaveValue('Half a thought');

		// From an open note it returns to the list with the composer open.
		await page.getByRole('button', { name: 'Cancel', exact: true }).click();
		await notesGrid(page).getByText('Campaign Primer').click();
		await page.waitForURL(/#\/knowledge\/[^/]+$/);
		await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		await page.keyboard.press('Control+n');
		await page.waitForURL((url) => url.hash === '#/knowledge');
		await expect(page.getByTestId('knowledge-composer')).toBeVisible();
	});

	test('the Graph box says it filters the graph', async ({ page }) => {
		await gotoRoute(page, '/graph');
		await page.locator('#main-content').waitFor({ state: 'attached' });
		const box = page.getByLabel('Search the graph');
		await expect(box).toHaveAttribute('placeholder', 'Filter the graph…');
		await box.fill('Sunken');
		await page.getByRole('button', { name: 'Refine in Notes' }).click();
		await expect(page.getByTestId('filters-query')).toHaveValue('Sunken');
	});
});
