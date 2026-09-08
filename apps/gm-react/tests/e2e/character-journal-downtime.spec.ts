import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-CHR-2.2 (HANDOFF resolved) — the `downtime` journal-entry kind's UI: the add-entry form's
// structured activity/days/cost/outcome fields (`screens/player/Journal.tsx`) and the dedicated
// "Downtime" panel projection. The acceptance is a real durable write, so this reads the character's
// journal through `__rt` rather than trusting the screen.

async function firstPcId(page: Page): Promise<string> {
	const id = await page.evaluate(() => {
		const chars = (
			window.__rt!.state.characters as {
				characters: Record<string, { id: string; kind: string; name: string }>;
			}
		).characters;
		return (
			Object.values(chars)
				.filter((c) => c.kind === 'pc')
				.sort((a, b) => a.name.localeCompare(b.name))[0]?.id ?? null
		);
	});
	expect(id, 'the seeded vault must contain a PC').not.toBeNull();
	return id!;
}

function storedJournal(
	page: Page,
	characterId: string,
): Promise<
	{
		kind: string;
		title: string;
		downtime?: { activityType: string; days: number; cost?: number };
	}[]
> {
	return page.evaluate((id) => {
		const journals = (
			window.__rt!.state.characters as {
				journals?: {
					journals: Record<
						string,
						{
							entries: {
								kind: string;
								title: string;
								downtime?: { activityType: string; days: number; cost?: number };
							}[];
						}
					>;
				};
			}
		).journals;
		return journals?.journals[id]?.entries ?? [];
	}, characterId);
}

test.describe('character journal: downtime entries', () => {
	test.beforeEach(async ({ page }) => {
		test.slow();
		await markOnboarded(page);
		await gotoRoute(page, '/player');
		await seedFresh(page);
		await waitReady(page);
		await page.getByRole('tab', { name: 'Journal' }).click();
	});

	test('records a downtime activity with its structured fields', async ({ page }) => {
		const pc = await firstPcId(page);

		await page.getByLabel('Entry title', { exact: true }).fill('Forging a longsword');
		await page.getByLabel('Entry kind', { exact: true }).selectOption({ label: 'Downtime' });
		await page.getByLabel('Downtime activity', { exact: true }).fill('Crafting');
		await page.getByLabel('Days spent', { exact: true }).fill('5');
		await page.getByLabel('Cost', { exact: true }).fill('50');
		await page.getByLabel('Outcome', { exact: true }).fill('A fine blade, ready to wield.');
		await page.getByRole('button', { name: 'Add entry' }).click();

		// The durable write really happened, with the structured downtime fields attached.
		await expect.poll(async () => (await storedJournal(page, pc)).length).toBeGreaterThan(0);
		const entries = await storedJournal(page, pc);
		const entry = entries.find((e) => e.title === 'Forging a longsword');
		expect(entry?.kind).toBe('downtime');
		expect(entry?.downtime).toMatchObject({ activityType: 'Crafting', days: 5, cost: 50 });

		// The dedicated Downtime panel projects it (activity badge + day count).
		await expect(page.getByText('Crafting', { exact: true })).toBeVisible();
		await expect(page.getByText('5 days')).toBeVisible();
	});

	test('rejects a downtime entry with no activity type', async ({ page }) => {
		await page.getByLabel('Entry title', { exact: true }).fill('Idle time');
		await page.getByLabel('Entry kind', { exact: true }).selectOption({ label: 'Downtime' });
		// The add button silently no-ops without an activity type — same pattern as an empty title.
		await page.getByRole('button', { name: 'Add entry' }).click();
		await expect(page.getByText('Idle time')).not.toBeVisible();
	});
});
