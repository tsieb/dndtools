import { expect, test, type Page } from '@playwright/test';

// SRCH-010 — calendar / custom-time DISCOVERY.
//
// The DM defines a custom campaign calendar (via the CONTENT-011 surface) and creates calendar-aware
// notes. The discovery surface then searches/filters those VISIBLE dated events by a custom-date RANGE
// and a text query. A visible event in the range appears with stable date formatting (AC1). A player
// never sees a dm-only dated event in the range, NOR a count that reveals it (AC2). This is a stacked
// list/form surface that renders identically on desktop and compact profiles, so it runs on BOTH
// Playwright projects. The "view as" header control switches the rendered actor over the shared runtime.

test.describe('SRCH-010 calendar/custom-time discovery', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
	});

	async function defineCalendar(page: Page): Promise<void> {
		await page.getByTestId('content-define-calendar').click();
		await expect(page.getByTestId('content-calendar-name')).toContainText('Calendar of Harptos');
	}

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
		await page.getByTestId('content-visibility').selectOption(visibility);
		await page.getByTestId('content-date-month').fill(String(month));
		await page.getByTestId('content-date-day').fill(String(day));
		await page.getByTestId('content-date-year').fill(String(year));
		await page.getByTestId('content-submit').click();
		await expect(page.getByTestId('content-items').getByText(title)).toBeVisible();
		await expect(titleInput).toHaveValue('');
	}

	test('AC1: a visible dated event appears in its date range with stable formatting', async ({
		page,
	}) => {
		await defineCalendar(page);
		await createNote(page, 'Founding Day', 'player-visible', 1, 5);
		await createNote(page, 'Harvest Feast', 'player-visible', 3, 20);

		// Filter to month 1 only (Hammer 1..30): Founding Day is in range, Harvest Feast (Ches) is not.
		await page.getByTestId('discovery-from-month').fill('1');
		await page.getByTestId('discovery-from-day').fill('1');
		await page.getByTestId('discovery-from-year').fill('1372');
		await page.getByTestId('discovery-to-month').fill('1');
		await page.getByTestId('discovery-to-day').fill('30');
		await page.getByTestId('discovery-to-year').fill('1372');

		const results = page.getByTestId('discovery-results');
		await expect(results.getByText('Founding Day')).toBeVisible();
		await expect(results.getByText('Harvest Feast')).toHaveCount(0);
		// Stable formatting from the calendar definition (Hammer / 1372), not a host-locale rendering.
		const date = page.locator('[data-testid^="discovery-result-date-"]').first();
		await expect(date).toContainText('Hammer');
		await expect(date).toContainText('1372');
		await expect(page.getByTestId('discovery-count')).toContainText('1 matching event');
	});

	test('AC2: a dm-only dated event in the range is hidden from the player and not counted', async ({
		page,
	}) => {
		await defineCalendar(page);
		await createNote(page, 'Public Festival', 'player-visible', 1, 10);
		await createNote(page, 'Secret Ritual', 'dm-only', 1, 12);

		// As the DM, the open-range discovery shows BOTH dated events.
		await expect(page.getByTestId('discovery-results').getByText('Public Festival')).toBeVisible();
		await expect(page.getByTestId('discovery-results').getByText('Secret Ritual')).toBeVisible();
		await expect(page.getByTestId('discovery-count')).toContainText('2 matching events');

		// As a player, the dm-only event is omitted AND the count is not inflated by it.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('discovery-results').getByText('Public Festival')).toBeVisible();
		await expect(page.getByTestId('discovery-results').getByText('Secret Ritual')).toHaveCount(0);
		await expect(page.getByTestId('discovery-count')).toContainText('1 matching event');
		// The hidden title appears nowhere in the discovery surface.
		await expect(page.getByTestId('calendar-discovery').getByText('Secret Ritual')).toHaveCount(0);
	});

	test('a text query filters the discovery results by visible title', async ({ page }) => {
		await defineCalendar(page);
		await createNote(page, 'Founding Day', 'player-visible', 1, 5);
		await createNote(page, 'Harvest Feast', 'player-visible', 3, 20);

		await page.getByTestId('discovery-query').fill('feast');
		const results = page.getByTestId('discovery-results');
		await expect(results.getByText('Harvest Feast')).toBeVisible();
		await expect(results.getByText('Founding Day')).toHaveCount(0);
		await expect(page.getByTestId('discovery-count')).toContainText('1 matching event');
	});
});
