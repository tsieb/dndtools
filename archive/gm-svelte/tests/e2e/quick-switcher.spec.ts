import { expect, test, type Page } from '@playwright/test';

/**
 * SRCH-002 — the QUICK SWITCHER: title-first navigation across visible content AND commands.
 *
 * The switcher composes the same actor-filtered visible search index and command-availability surface the
 * rest of SRCH/CMD use. These e2e tests prove the visible flow across both profiles: title-first content
 * navigation (AC1), executing the current selection (AC2), a player never discovering DM-only content or
 * commands (AC3), and keyboard-only operation with accessible combobox/listbox semantics.
 */

/** Reset to a known-empty vault on the Knowledge route so notes can be seeded. */
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

/** Create a note via the visible Knowledge form, then set + save its body in the editor. */
async function createNote(page: Page, title: string, visibility: string, body: string) {
	await page.getByTestId('note-new-title').fill(title);
	await page.getByTestId('note-new-visibility').selectOption(visibility);
	await page.getByTestId('note-create').click();
	// Creating dispatches asynchronously and only then repoints the editor at the NEW note. Wait for the
	// editor itself to show this note (not merely its row in the list) before filling its body — otherwise
	// the fill can race the editor switch and land on / be cleared by the previously-open note, leaving the
	// new note with an empty body so a body-only search never matches it.
	await expect(page.getByTestId('note-editor')).toContainText(`Editing: ${title}`);
	// The newly created note opens in the editor; set its body (so body-only matching can be exercised)
	// and persist it through the visible Save control.
	await page.getByTestId('note-body').fill(body);
	await page.getByTestId('note-save').click();
	await expect(page.getByTestId('note-save-status-value')).toHaveText('success');
}

async function openSwitcher(page: Page) {
	await page.getByTestId('open-quick-switcher').click();
	await expect(page.getByTestId('quick-switcher')).toBeVisible();
}

test.describe('SRCH-002 quick switcher — title-first navigation (AC1)', () => {
	test('a title match ranks above a body-only match', async ({ page }) => {
		await freshKnowledge(page);
		// "Dragon" in the TITLE.
		await createNote(page, 'Dragon Cult', 'player-visible', 'Followers gather in shadow.');
		// "dragon" only in the BODY.
		await createNote(page, 'Harbor Watch', 'player-visible', 'A dragon was sighted offshore.');

		await openSwitcher(page);
		await page.getByTestId('quick-switcher-search').fill('dragon');

		const list = page.getByTestId('quick-switcher-list');
		await expect(list.getByText('Dragon Cult')).toBeVisible();
		await expect(list.getByText('Harbor Watch')).toBeVisible();

		// The title hit appears before the body-only hit in document order.
		const options = list.locator('[role="option"]');
		const titles = await options.allInnerTexts();
		const dragonIdx = titles.findIndex((t) => t.includes('Dragon Cult'));
		const harborIdx = titles.findIndex((t) => t.includes('Harbor Watch'));
		expect(dragonIdx).toBeGreaterThanOrEqual(0);
		expect(harborIdx).toBeGreaterThanOrEqual(0);
		expect(dragonIdx).toBeLessThan(harborIdx);
	});
});

test.describe('SRCH-002 quick switcher — execute the current selection (AC2)', () => {
	test('selecting a content entry navigates to its section', async ({ page }) => {
		await freshKnowledge(page);
		await createNote(page, 'Town of Highmoor', 'player-visible', 'A walled town.');
		// Navigate away so the switcher navigation is observable.
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });

		await openSwitcher(page);
		await page.getByTestId('quick-switcher-search').fill('highmoor');
		await page.getByTestId('quick-switcher-list').getByText('Town of Highmoor').click();

		await expect(page.getByTestId('quick-switcher')).toHaveCount(0);
		await expect(page).toHaveURL(/\/knowledge\/?$/);
		await expect(page.getByTestId('notes-workbench')).toBeVisible();
	});

	test('keyboard-only: open, arrow to the second result, Enter runs the CURRENT entry', async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name === 'mobile-chromium',
			'keyboard shortcut + arrow navigation is a pointer-free path',
		);
		await freshKnowledge(page);
		await createNote(page, 'Alpha Keep', 'player-visible', 'Stone walls.');
		await createNote(page, 'Beta Keep', 'player-visible', 'Wooden palisade.');
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });

		// Open with the global shortcut (distinct from the command palette's Ctrl+K).
		await page.keyboard.press('Control+o');
		await expect(page.getByTestId('quick-switcher')).toBeVisible();
		await page.getByTestId('quick-switcher-search').fill('keep');

		// The first option is highlighted; ArrowDown moves the active descendant to the second.
		const search = page.getByTestId('quick-switcher-search');
		const options = page.getByTestId('quick-switcher-list').locator('[role="option"]');
		await expect(options.first()).toHaveAttribute('aria-selected', 'true');
		const firstId = await options.first().getAttribute('id');
		await expect(search).toHaveAttribute('aria-activedescendant', firstId ?? '');

		await search.press('ArrowDown');
		const secondId = await options.nth(1).getAttribute('id');
		await expect(search).toHaveAttribute('aria-activedescendant', secondId ?? '');
		await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');

		// Enter runs the CURRENT (second) selection and navigates — a stale first selection is never used.
		await search.press('Enter');
		await expect(page.getByTestId('quick-switcher')).toHaveCount(0);
		await expect(page).toHaveURL(/\/knowledge\/?$/);
	});

	test('Escape closes the switcher without navigating', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name === 'mobile-chromium', 'Escape dismissal is a keyboard path');
		await freshKnowledge(page);
		await openSwitcher(page);
		await page.getByTestId('quick-switcher-search').press('Escape');
		await expect(page.getByTestId('quick-switcher')).toHaveCount(0);
		await expect(page).toHaveURL(/\/knowledge\/?$/);
	});
});

test.describe('SRCH-005 quick switcher — `>` command mode lists commands, not titles (AC3)', () => {
	test('a `>` query shows matching commands and never an entity title', async ({ page }) => {
		await freshKnowledge(page);
		// A note whose title contains "scene" would normally be a navigation hit.
		await createNote(page, 'Scene Prep Notes', 'player-visible', 'Stage the ambush.');
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });

		await openSwitcher(page);
		const list = page.getByTestId('quick-switcher-list');

		// A bare "scene" query surfaces the note (navigation) alongside the command.
		await page.getByTestId('quick-switcher-search').fill('scene');
		await expect(list.getByText('Scene Prep Notes')).toBeVisible();

		// ">scene" switches to command mode: the note title is gone; only commands remain.
		await page.getByTestId('quick-switcher-search').fill('>scene');
		await expect(page.getByTestId('quick-switcher-section')).toHaveText('Commands');
		await expect(list).not.toContainText('Scene Prep Notes');
		await expect(list.getByText('Create Scene', { exact: true })).toBeVisible();
		// Every visible option in command mode is a command entry, never a navigation entry.
		await expect(list.locator('[role="option"][data-kind="navigation"]')).toHaveCount(0);
	});
});

test.describe('SRCH-002 quick switcher — a player discovers neither hidden content nor DM-only commands (AC3)', () => {
	test('a dm-only note is absent for a player and its title never leaks', async ({ page }) => {
		await freshKnowledge(page);
		await createNote(page, 'Public Festival', 'player-visible', 'Music in the square.');
		await createNote(page, 'Secret Ritual', 'dm-only', 'A forbidden rite.');

		// The DM can switch to the dm-only note.
		await openSwitcher(page);
		await page.getByTestId('quick-switcher-search').fill('ritual');
		await expect(page.getByTestId('quick-switcher-list').getByText('Secret Ritual')).toBeVisible();
		await page.getByTestId('quick-switcher-search').press('Escape');

		// As a player, the dm-only note is absent and its title leaks nowhere in the switcher.
		await viewAs(page, 'actor-player');
		await openSwitcher(page);
		await page.getByTestId('quick-switcher-search').fill('ritual');
		const list = page.getByTestId('quick-switcher-list');
		await expect(list).not.toContainText('Secret Ritual');
		await expect(page.getByTestId('quick-switcher-empty')).toBeVisible();
	});

	test('DM-only commands are absent (not disabled) for a player in the switcher', async ({ page }) => {
		await freshKnowledge(page);
		// Ensure the Command Center home exists so DM action commands are available.
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });

		// The DM switcher offers the DM-only "Create Scene" command.
		await openSwitcher(page);
		await page.getByTestId('quick-switcher-search').fill('create scene');
		await expect(
			page.getByTestId('quick-switcher-list').getByText('Create Scene', { exact: true }),
		).toBeVisible();
		await page.getByTestId('quick-switcher-search').press('Escape');

		// As a player, the Scene-authoring command is absent entirely (no disabled entry, no label).
		await viewAs(page, 'actor-player');
		await openSwitcher(page);
		await page.getByTestId('quick-switcher-search').fill('create scene');
		await expect(page.getByTestId('quick-switcher-list')).not.toContainText('Create Scene');
		await expect(
			page.locator('[data-testid^="quick-switcher-option-cmd:scene.create"]'),
		).toHaveCount(0);
	});
});

test.describe('SRCH-002 quick switcher — compact profile (Mobile: yes)', () => {
	test('the switcher renders as a compact sheet and exposes the same entries', async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== 'mobile-chromium',
			'covers the compact (mobile) switcher sheet',
		);
		await freshKnowledge(page);
		await createNote(page, 'Mobile Lore', 'player-visible', 'Reachable on a phone.');
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });

		await openSwitcher(page);
		const switcher = page.getByTestId('quick-switcher');
		await expect(switcher).toHaveAttribute('data-profile', 'compact');
		await page.getByTestId('quick-switcher-search').fill('mobile lore');
		await page.getByTestId('quick-switcher-list').getByText('Mobile Lore').click();
		await expect(page.getByTestId('quick-switcher')).toHaveCount(0);
		await expect(page).toHaveURL(/\/knowledge\/?$/);
	});
});
