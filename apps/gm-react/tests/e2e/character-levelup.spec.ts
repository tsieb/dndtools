import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-CHR-2.1 — the guided level-up wizard (`app/character/LevelUp.tsx`). The acceptance is that it
// takes a PC from level 1 to level 2 through the staged CHAR-009 advancement, so every assertion
// here reads the durable `characters` slice through `__rt` rather than trusting the screen.

/** The PC `/player` selects: the first by name, the order `listCharactersForActor` returns. */
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

/** The stored level and maximum hit points, straight off the durable character record. */
function stored(page: Page, characterId: string): Promise<{ level: unknown; maxHp: number }> {
	return page.evaluate((id) => {
		const character = (
			window.__rt!.state.characters as {
				characters: Record<string, { data: Record<string, unknown>; combat: { maxHp: number } }>;
			}
		).characters[id]!;
		return { level: character.data.level ?? 1, maxHp: character.combat.maxHp };
	}, characterId);
}

test.describe('guided level-up wizard', () => {
	test.beforeEach(async ({ page }) => {
		test.slow();
		await markOnboarded(page);
		await gotoRoute(page, '/player');
		await seedFresh(page);
		await waitReady(page);
		await page.getByRole('tab', { name: 'Level up' }).click();
	});

	test('walks a PC from level 1 to level 2 and stores the result', async ({ page }) => {
		const pc = await firstPcId(page);
		const before = await stored(page, pc);

		// Milestone advancement has no experience gate, so it is the entry a table without XP uses.
		await page.getByRole('button', { name: 'Level up (milestone)' }).click();

		// Step 1 — the class gaining the level. The wizard opens on the first unresolved step.
		const steps = page.getByRole('list', { name: 'Level-up steps' });
		await expect(steps).toBeVisible();
		await page.getByLabel('Class', { exact: true }).fill('Fighter');
		await page.getByRole('button', { name: 'Choose', exact: true }).click();
		await expect(page.getByText('Class saved as Fighter.')).toBeVisible();

		// Step 2 — hit points. Rolling needs a live session; the average is always available and is
		// the d8 hit die's 5, so the button states the number it will store.
		await page.getByRole('button', { name: 'Next', exact: true }).click();
		await expect(page.getByText('Hit die d8')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Roll d8' })).toBeDisabled();
		await expect(
			page.getByText('Start the session to roll here, or take the average.'),
		).toBeVisible();
		await page.getByRole('button', { name: 'Take the average (5)' }).click();

		// Steps 3 and 4 — what the level grants, derived from the active package rather than typed in.
		await page.getByRole('button', { name: 'Next', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Unlocked' })).toBeVisible();
		await page.getByRole('button', { name: 'Next', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Slots and resources' })).toBeVisible();

		// Step 5 — review carries both choices, and finishing commits the advancement.
		await page.getByRole('button', { name: 'Next', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Review' })).toBeVisible();
		await expect(page.getByText('Fighter', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Finish — become level 2' }).click();

		// The durable write really happened: level 2, and the maximum hit points grew by the five.
		await expect.poll(async () => (await stored(page, pc)).level).toBe(2);
		expect((await stored(page, pc)).maxHp).toBe(before.maxHp + 5);
		// And the wizard is back at its entry card for the next level.
		await expect(page.getByText('Level 2', { exact: true })).toBeVisible();
	});

	test('leaving the screen keeps the draft and resumes on the unfinished step', async ({
		page,
	}) => {
		const pc = await firstPcId(page);
		await page.getByRole('button', { name: 'Level up (milestone)' }).click();
		await page.getByLabel('Class', { exact: true }).fill('Rogue');
		await page.getByRole('button', { name: 'Choose', exact: true }).click();

		// Off the screen and back — the staged draft lives on the character, not in the component.
		await gotoRoute(page, '/');
		await gotoRoute(page, '/player');
		await waitReady(page);
		await page.getByRole('tab', { name: 'Level up' }).click();

		// It resumes on hit points, the first choice still missing, with the class already made.
		await expect(page.getByRole('heading', { name: 'Hit points' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Take the average (5)' })).toBeVisible();

		// Discarding leaves the character exactly where it was.
		await page.getByRole('button', { name: 'Discard level-up' }).click();
		await expect(page.getByRole('button', { name: 'Level up (milestone)' })).toBeVisible();
		expect((await stored(page, pc)).level).toBe(1);
	});
});
