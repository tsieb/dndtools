import { promises as fs } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-CHR-2.3 — the character history timeline (`app/character/History.tsx`): a chronological feed
// of the character journal (real entries, including the structured `downtime` kind), exported as a
// markdown journal. RC-ENG-8.12 — rests, combats and level-ups append their own dated entries.

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

	test('records a rest, a combat and a level-up as they happen', async ({ page }) => {
		const pc = await firstPcId(page);
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		const level = await page.evaluate((id) => {
			const chars = (
				window.__rt!.state.characters as {
					characters: Record<string, { data: Record<string, unknown> }>;
				}
			).characters;
			return Number(chars[id]!.data['level'] ?? 1) || 1;
		}, pc);
		const toLevel = level + 1;

		const rest = await dispatch(page, {
			type: 'character.rest',
			actorId,
			payload: { characterId: pc, rest: 'long' },
		});
		expect(rest.status, rest.rejection?.message).toBe('accepted');

		const started = await dispatch(page, {
			type: 'combat.start',
			actorId,
			payload: {
				combatants: [
					{ kind: 'character', name: 'Hero', characterId: pc, initiative: 14, maxHp: 20 },
					{ kind: 'monster', name: 'Bandit', initiative: 9, maxHp: 11 },
				],
			},
		});
		expect(started.status, started.rejection?.message).toBe('accepted');
		const ended = await dispatch(page, { type: 'combat.end', actorId, payload: {} });
		expect(ended.status, ended.rejection?.message).toBe('accepted');

		// The level the PC reaches decides which extra choices the advancement must carry.
		const levelUp = await dispatch(page, {
			type: 'character.apply-advancement',
			actorId,
			payload: {
				characterId: pc,
				mode: 'milestone',
				className: 'Fighter',
				hitPointsGained: 6,
				...(toLevel === 3 ? { subclass: 'Champion' } : {}),
				...([4, 8, 12, 16, 19].includes(toLevel) ? { abilityOrFeat: 'Tough' } : {}),
			},
		});
		expect(levelUp.status, levelUp.rejection?.message).toBe('accepted');
		// Each event announced its new journal entry.
		for (const result of [rest, ended, levelUp]) {
			expect(result.events?.some((e) => e.kind === 'character.journal-changed')).toBe(true);
		}

		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.getByRole('tab', { name: 'History' }).click();

		// Each entry's row carries its title and its kind badge.
		for (const [title, kind] of [
			['Long rest', 'Rest'],
			['Fought a combat (1 round)', 'Combat'],
			[`Reached level ${toLevel}`, 'Level up'],
		] as const) {
			const titleText = page.getByText(title, { exact: true });
			await expect(titleText).toBeVisible();
			await expect(titleText.locator('..').getByText(kind, { exact: true })).toBeVisible();
		}

		const downloadPromise = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Export as markdown' }).click();
		const markdown = await fs.readFile((await (await downloadPromise).path())!, 'utf8');
		expect(markdown).toContain('## Long rest\n_Rest — ');
		expect(markdown).toContain('## Fought a combat (1 round)\n_Combat — ');
		expect(markdown).toContain(`## Reached level ${toLevel}\n_Level up — `);
	});

	test('the export button is disabled with no entries yet', async ({ page }) => {
		await page.getByRole('tab', { name: 'History' }).click();
		await expect(page.getByRole('button', { name: 'Export as markdown' })).toBeDisabled();
		await expect(page.getByText('No history yet')).toBeVisible();
	});
});
