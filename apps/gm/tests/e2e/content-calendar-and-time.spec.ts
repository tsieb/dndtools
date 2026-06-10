import { expect, test, type Page } from '@playwright/test';

// CONTENT-011 — calendar/custom-time content.
//
// An authorized editor (the DM) defines a CUSTOM campaign calendar, then creates calendar-aware notes
// with custom-date fields. Dates render deterministically from the calendar definition (no host
// locale/timezone/clock), the same string in the item list and the timeline (AC1). A player sees only
// the items their visibility permits — a dm-only dated note is OMITTED from the player timeline (AC2).
// Authoring is fail-closed: a player has no authoring affordances. This is a stacked list/form surface
// that renders identically on desktop and compact profiles, so it runs on BOTH Playwright projects.
// The "view as" header control switches the rendered actor over the shared local runtime.

test.describe('CONTENT-011 calendar/custom-time content', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
	});

	// DM defines the demo calendar (idempotent: the button only shows when no calendar exists).
	async function defineCalendar(page: Page): Promise<void> {
		await page.getByTestId('content-define-calendar').click();
		await expect(page.getByTestId('content-calendar-name')).toContainText('Calendar of Harptos');
	}

	// DM creates a calendar-aware note with a custom date (month/day/year) and a visibility. The DM
	// always sees its own authored item, so the post-create assertion confirms the durable write
	// committed before the next step (the form clears its title on success).
	async function createNote(
		page: Page,
		title: string,
		visibility: 'dm-only' | 'player-visible' | 'shared',
		month: number,
		day: number,
		year = 1372,
	): Promise<void> {
		const titleInput = page.getByTestId('content-title');
		await expect(titleInput).toHaveValue('');
		await titleInput.fill(title);
		await expect(titleInput).toHaveValue(title);
		await page.getByTestId('content-visibility').selectOption(visibility);
		await page.getByTestId('content-date-month').fill(String(month));
		await page.getByTestId('content-date-day').fill(String(day));
		await page.getByTestId('content-date-year').fill(String(year));
		await page.getByTestId('content-submit').click();
		await expect(page.getByTestId('content-items').getByText(title)).toBeVisible();
		// The title clears on a successful, committed create — wait for it before the next note.
		await expect(titleInput).toHaveValue('');
	}

	test('AC1: a custom date renders the same stable string in the item and the timeline', async ({
		page,
	}) => {
		await defineCalendar(page);
		await createNote(page, 'Public Festival', 'player-visible', 1, 5);

		// The item's date and the timeline row's date are identical, formatted from the calendar
		// definition (5 Hammer, year 1372 DR) — not a Gregorian/host-locale rendering.
		const itemDate = page.locator('[data-testid^="content-item-date-"]').first();
		const timelineDate = page.locator('[data-testid^="content-timeline-date-"]').first();
		await expect(itemDate).toContainText('Hammer');
		await expect(itemDate).toContainText('1372');
		const itemText = (await itemDate.textContent())!.trim();
		const timelineText = (await timelineDate.textContent())!.trim();
		expect(itemText).toBe(timelineText);
	});

	test('AC2: a dm-only dated note is omitted from the player timeline', async ({ page }) => {
		await defineCalendar(page);
		await createNote(page, 'Public Festival', 'player-visible', 1, 5);
		await createNote(page, 'Secret Ritual', 'dm-only', 2, 14);

		// As the DM, both dated events appear in the timeline, ordered by date (Hammer before Alturiak).
		const timeline = page.getByTestId('content-timeline');
		await expect(timeline.locator('li')).toHaveCount(2);
		await expect(timeline.getByText('Secret Ritual')).toBeVisible();

		// As a player, the dm-only dated note is omitted entirely from the timeline and item list.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(timeline.locator('li')).toHaveCount(1);
		await expect(timeline.getByText('Public Festival')).toBeVisible();
		await expect(timeline.getByText('Secret Ritual')).toHaveCount(0);
		await expect(page.getByTestId('content-items').getByText('Secret Ritual')).toHaveCount(0);
	});

	test('fail closed: a player has no content authoring affordances', async ({ page }) => {
		await defineCalendar(page);
		await createNote(page, 'Public Festival', 'player-visible', 1, 5);

		await page.getByTestId('view-as-select').selectOption('actor-player');
		// The create form and per-item editor controls are DM-only ergonomic affordances; the core
		// re-checks fail-closed regardless.
		await expect(page.getByTestId('content-create-form')).toHaveCount(0);
		await expect(page.locator('[data-testid^="content-item-remove-"]')).toHaveCount(0);
	});

	test('an observer never sees dm-only or shared calendar content', async ({ page }) => {
		await defineCalendar(page);
		// Only DM-only and shared (player-A-targeted) dated notes exist — nothing an observer may read.
		await createNote(page, 'Secret Ritual', 'dm-only', 2, 14);
		await createNote(page, 'Whispered Rumor', 'shared', 3, 3);

		await page.getByTestId('view-as-select').selectOption('actor-observer');
		await expect(page.getByTestId('content-items-empty')).toBeVisible();
		await expect(page.getByTestId('content-timeline-empty')).toBeVisible();
		await expect(page.getByText('Secret Ritual')).toHaveCount(0);
		await expect(page.getByText('Whispered Rumor')).toHaveCount(0);
	});

	test('content persists across reload (durable)', async ({ page }) => {
		await defineCalendar(page);
		await createNote(page, 'Founding Day', 'player-visible', 3, 1);

		await page.reload();
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await expect(page.getByTestId('content-calendar-name')).toContainText('Calendar of Harptos');
		await expect(page.getByTestId('content-items').getByText('Founding Day')).toBeVisible();
	});
});
