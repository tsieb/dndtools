import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-SES-3.3 — the stat-block quick reference a DM pulls from a tracker row. The card has to come
// from the BOUND character (name, ability scores, attacks) rather than from the three numbers the
// encounter row carries, and it has to be honest when there is no bound character at all — a
// monster typed straight into the encounter must not look like a creature with no actions.

type Started = { characterId: string; characterName: string };

/** Give the first seeded character two attacks, take the session live, and roll initiative on it. */
async function startCombatWithCharacter(page: Page): Promise<Started> {
	const result = await page.evaluate(async () => {
		const rt = window.__rt!;
		const characters = Object.values(
			(rt.state.characters as { characters: Record<string, { id: string; name: string }> })
				.characters,
		);
		const character = characters[0];
		if (!character) return { step: 'find character', status: 'missing' as const };

		const attacks = await rt.dispatch({
			type: 'character.update-attacks',
			actorId: rt.defaultActorId,
			payload: {
				characterId: character.id,
				attacks: [
					{ name: 'Moonlit glaive', detail: '+7 to hit, 1d10+4 slashing' },
					{ name: 'Warding word', detail: 'DC 15 Wisdom save or frightened' },
				],
			},
		});
		if (attacks.status !== 'accepted') return { step: 'attacks', ...attacks };

		const state = rt.state as unknown as {
			session: { activeSceneId: string | null };
			commandCenter: { homeSceneId: string | null };
			scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
		};
		const sceneId =
			state.session.activeSceneId ??
			state.commandCenter.homeSceneId ??
			Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id;
		const live = await rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
		if (live.status !== 'accepted') return { step: 'go live', ...live };

		const combat = await rt.dispatch({
			type: 'combat.start',
			actorId: rt.defaultActorId,
			payload: {
				combatants: [
					{ kind: 'character', name: character.name, characterId: character.id, initiative: 20 },
					{ kind: 'monster', name: 'Bog Lurker', ac: 13, initiative: 9, maxHp: 22 },
				],
			},
		});
		if (combat.status !== 'accepted') return { step: 'start combat', ...combat };
		return {
			step: 'done',
			status: 'accepted' as const,
			characterId: character.id,
			characterName: character.name,
		};
	});
	expect(
		result.status,
		`${result.step}: ${JSON.stringify((result as { rejection?: unknown }).rejection ?? {})}`,
	).toBe('accepted');
	const started = result as unknown as Started;
	expect(started.characterName, 'the seeded vault must have at least one character').toBeTruthy();
	return started;
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	await seedFresh(page);
	await gotoRoute(page, '/session');
	await waitReady(page);
});

test.describe('combat quick reference', () => {
	test('a row action opens the bound character’s stat block with live hit points', async ({
		page,
	}) => {
		const { characterName } = await startCombatWithCharacter(page);
		await expect(page.getByRole('button', { name: 'End combat' })).toBeVisible();

		await page
			.getByRole('button', { name: `Quick reference — ${characterName}`, exact: true })
			.click();

		const sheet = page.getByRole('dialog');
		await expect(sheet).toBeVisible();
		// The card knows where it came from, and it is the character sheet — not the encounter row.
		await expect(sheet.getByText(`From the character sheet for ${characterName}.`)).toBeVisible();
		await expect(sheet.getByRole('heading', { name: characterName, exact: true })).toBeVisible();
		// The character's attacks are the card's actions.
		await expect(sheet.getByText('Moonlit glaive')).toBeVisible();
		await expect(sheet.getByText('+7 to hit, 1d10+4 slashing')).toBeVisible();
		// Live hit points from THIS combat, not a static maximum.
		await expect(sheet.getByText('This combatant')).toBeVisible();

		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});

	test('actions collapse and expand from the keyboard without closing the card', async ({
		page,
	}) => {
		const { characterName } = await startCombatWithCharacter(page);
		await expect(page.getByRole('button', { name: 'End combat' })).toBeVisible();

		await page
			.getByRole('button', { name: `Quick reference — ${characterName}`, exact: true })
			.click();
		const sheet = page.getByRole('dialog');
		const toggle = sheet.getByRole('button', { name: 'Actions (2)' });
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(sheet.getByText('Moonlit glaive')).toBeVisible();

		// Keyboard equivalent of the pointer press — same control, same state change (WCAG 2.2 AA).
		await toggle.focus();
		await page.keyboard.press('Enter');
		await expect(toggle).toHaveAttribute('aria-expanded', 'false');
		await expect(sheet.getByText('Moonlit glaive')).toHaveCount(0);
		// Collapsing hides the actions and nothing else: the card and its defences stay up.
		await expect(sheet.getByRole('heading', { name: characterName, exact: true })).toBeVisible();

		await page.keyboard.press('Enter');
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(sheet.getByText('Moonlit glaive')).toBeVisible();
	});

	test('a combatant with no bound character says so instead of showing an empty sheet', async ({
		page,
	}) => {
		await startCombatWithCharacter(page);
		await expect(page.getByRole('button', { name: 'End combat' })).toBeVisible();

		await page.getByRole('button', { name: 'Quick reference — Bog Lurker', exact: true }).click();

		const sheet = page.getByRole('dialog');
		await expect(sheet).toBeVisible();
		await expect(sheet.getByText(/No character is bound/)).toBeVisible();
		await expect(sheet.getByRole('heading', { name: 'Bog Lurker', exact: true })).toBeVisible();
		// Nothing was invented: an unbound row has no attack list, so no actions toggle is offered.
		await expect(sheet.getByRole('button', { name: /^Actions \(/ })).toHaveCount(0);
	});

	test('selecting a row puts the quick reference first in its detail panel', async ({ page }) => {
		const { characterName } = await startCombatWithCharacter(page);
		await expect(page.getByRole('button', { name: 'End combat' })).toBeVisible();

		await page.getByRole('button', { name: characterName, exact: true }).click();
		await expect(page.getByText(`Selected · ${characterName}`)).toBeVisible();

		const action = page.getByRole('button', { name: 'Quick reference', exact: true });
		await expect(action).toBeVisible();
		await action.click();
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(
			page.getByRole('dialog').getByRole('heading', { name: characterName, exact: true }),
		).toBeVisible();
	});
});
