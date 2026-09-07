import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-CHR-1.2 — the REST workflow, driven through the two surfaces that own it: the player's rest
// dialog on `/player` (`app/character/RestDialog.tsx`), which spends hit dice, and the DM's
// party-wide "Call a rest" on `/session` (`screens/session/Lifecycle.tsx`). Both read their result
// off the durable `characters` slice through `__rt`, never off a label.

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

/** The hit points, hit dice and exhaustion the durable record carries for one character. */
function storedRestState(
	page: Page,
	characterId: string,
): Promise<{ hp: number; maxHp: number; spent: number; exhaustion: number }> {
	return page.evaluate((id) => {
		const character = (
			window.__rt!.state.characters as {
				characters: Record<
					string,
					{
						combat: { hp: number; maxHp: number };
						proficiencies?: { hitDice?: { spent: number } };
						resources?: { exhaustion?: number };
					}
				>;
			}
		).characters[id]!;
		return {
			hp: character.combat.hp,
			maxHp: character.combat.maxHp,
			spent: character.proficiencies?.hitDice?.spent ?? 0,
			exhaustion: character.resources?.exhaustion ?? 0,
		};
	}, characterId);
}

/** The CON modifier the core adds to each spent hit die, from the seeded PC's own score. */
function conModifier(page: Page, characterId: string): Promise<number> {
	return page.evaluate((id) => {
		const character = (
			window.__rt!.state.characters as {
				characters: Record<string, { abilityScores: { con?: number } }>;
			}
		).characters[id]!;
		return Math.floor(((character.abilityScores.con ?? 10) - 10) / 2);
	}, characterId);
}

/** Move the workflow with the core directly — the shortcut for arranging a state, never the assertion. */
async function goLive(page: Page): Promise<void> {
	const result = await page.evaluate(async () => {
		const rt = window.__rt!;
		const state = rt.state as unknown as {
			session: { activeSceneId: string | null };
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
		};
		const sceneId =
			state.session.activeSceneId ??
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id;
		return rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
	});
	expect(result.status, result.rejection?.message ?? '').toBe('accepted');
}

/** Give the PC hit dice and a wound to heal, straight through the core commands. */
async function woundWithHitDice(page: Page, characterId: string, hp: number): Promise<void> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	for (const command of [
		{
			type: 'character.set-proficiencies',
			actorId,
			payload: { characterId, hitDice: { die: 'd8', total: 4, spent: 0 } },
		},
		{ type: 'character.set-combat', actorId, payload: { characterId, hp, maxHp: 30 } },
	]) {
		const result = await dispatch(page, command);
		expect(result.status, JSON.stringify(result.rejection ?? {})).toBe('accepted');
	}
}

test.describe('resting is a flow that says what it will do', () => {
	test.beforeEach(async ({ page }) => {
		test.slow();
		await markOnboarded(page);
		await gotoRoute(page, '/player');
		await seedFresh(page);
		await waitReady(page);
	});

	test('a short rest spends the hit dice the player chose and heals by their average', async ({
		page,
	}) => {
		const pc = await firstPcId(page);
		await woundWithHitDice(page, pc, 6);

		await page.getByRole('tab', { name: 'Resources' }).click();
		await page.getByRole('button', { name: 'Short rest' }).click();

		// The dialog states the outcome before it is taken, and it is the arithmetic the core applies.
		const spend = page.getByLabel('Hit dice to spend');
		await expect(spend).toBeVisible();
		await spend.selectOption({ label: '2 d8' });
		// The average of a d8 is 5, plus this character's CON modifier, for each of the two dice.
		const healed = 2 * Math.max(0, 5 + (await conModifier(page, pc)));
		await expect(
			page.getByText(`Spends 2 hit dice and regains ${healed} hit points.`),
		).toBeVisible();

		await page.getByRole('button', { name: 'Take a short rest' }).click();
		await expect
			.poll(async () => (await storedRestState(page, pc)).hp, { timeout: 5000 })
			.toBe(6 + healed);
		expect((await storedRestState(page, pc)).spent).toBe(2);
	});

	test('a character with no hit dice is told so rather than offered a dead stepper', async ({
		page,
	}) => {
		const pc = await firstPcId(page);
		const before = await storedRestState(page, pc);
		await page.getByRole('tab', { name: 'Resources' }).click();
		await page.getByRole('button', { name: 'Short rest' }).click();
		await expect(page.getByText(/No hit dice are recorded/)).toBeVisible();
		await expect(page.getByLabel('Hit dice to spend')).toHaveCount(0);

		// The rest is still offered — it recovers short-rest resources — and it heals nothing it has
		// no dice for, rather than reporting hit points the character never got back.
		await page.getByRole('button', { name: 'Take a short rest' }).click();
		await expect
			.poll(async () => (await storedRestState(page, pc)).hp, { timeout: 5000 })
			.toBe(before.hp);
	});

	test('the DM calls a long rest for the party, and it lands on the session timeline', async ({
		page,
	}) => {
		const pc = await firstPcId(page);
		await woundWithHitDice(page, pc, 6);
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		// Two levels of exhaustion, so the long rest has one to remove. Exhaustion is a combat-resource
		// write, which the core accepts only while the session is live.
		await goLive(page);
		const exhausted = await dispatch(page, {
			type: 'character.update-combat-resource',
			actorId,
			payload: { characterId: pc, kind: 'exhaustion', level: 2 },
		});
		expect(exhausted.status, JSON.stringify(exhausted.rejection ?? {})).toBe('accepted');

		await gotoRoute(page, '/session');
		await waitReady(page);
		await page.getByRole('button', { name: 'Call a rest' }).click();
		await page.getByRole('radio', { name: 'Long rest' }).click();
		await page.getByRole('button', { name: 'Call the rest' }).click();

		await expect.poll(async () => (await storedRestState(page, pc)).hp, { timeout: 5000 }).toBe(30);
		expect((await storedRestState(page, pc)).exhaustion).toBe(1);
		// The rest is on the session's rest timeline, read back from the durable history.
		await expect(page.getByText('Rests this session')).toBeVisible();
		await expect(page.getByText(/Long rest/).first()).toBeVisible();
	});
});
