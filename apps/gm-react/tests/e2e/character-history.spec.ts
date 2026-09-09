import { promises as fs } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-CHR-2.3 — the character history timeline (`app/character/History.tsx`): a chronological feed
// of the character journal (real entries, including the structured `downtime` kind), exported as a
// markdown journal. See History.tsx's docstring for the scope decision on what "history" covers.

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

test.describe('character history timeline', () => {
	test.beforeEach(async ({ page }) => {
		test.slow();
		await markOnboarded(page);
		await gotoRoute(page, '/player');
		await seedFresh(page);
		await waitReady(page);
	});

	test('shows the journal chronologically and exports it as markdown', async ({ page }) => {
		const pc = await firstPcId(page);
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);

		// Two real journal entries, dispatched straight through the core (the add-form itself is
		// covered by the journal/downtime specs) — a plain note, and a downtime activity.
		const noteResult = await dispatch(page, {
			type: 'character.add-journal-entry',
			actorId,
			payload: {
				characterId: pc,
				kind: 'note',
				title: 'Met a strange merchant',
				body: 'Offered a map to somewhere.',
				visibility: 'dm-only',
			},
		});
		expect(noteResult.status).toBe('accepted');
		const downtimeResult = await dispatch(page, {
			type: 'character.add-journal-entry',
			actorId,
			payload: {
				characterId: pc,
				kind: 'downtime',
				title: 'Recovering from the ambush',
				body: '',
				visibility: 'dm-only',
				downtime: { activityType: 'Resting', days: 3 },
			},
		});
		expect(downtimeResult.status).toBe('accepted');

		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.getByRole('tab', { name: 'History' }).click();

		await expect(page.getByText('Met a strange merchant')).toBeVisible();
		await expect(page.getByText('Recovering from the ambush')).toBeVisible();

		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Export as markdown' }).click();
		const download = await downloadPromise;

		expect(download.suggestedFilename()).toMatch(/-history-\d{4}-\d{2}-\d{2}\.md$/);
		const path = await download.path();
		const markdown = await fs.readFile(path!, 'utf8');
		expect(markdown).toContain('Met a strange merchant');
		expect(markdown).toContain('Recovering from the ambush');
		expect(markdown).toContain('Activity: Resting');
		expect(markdown).toContain('Days: 3');
	});

	test('the export button is disabled with no entries yet', async ({ page }) => {
		await page.getByRole('tab', { name: 'History' }).click();
		await expect(page.getByRole('button', { name: 'Export as markdown' })).toBeDisabled();
		await expect(page.getByText('No history yet')).toBeVisible();
	});
});
