import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

/**
 * RC-CHR-5.2 — character builder step polish: the ability-score methods (standard array dealt for
 * the class, point buy, a 4d6 roll), the class preview of the active package's features, the step
 * rail's navigation semantics, and the import review's diff against a same-named roster character.
 */

interface RosterCharacter {
	name: string;
	abilityScores: Record<string, number>;
	combat: { ac: number };
}

const roster = (page: Page): Promise<RosterCharacter[]> =>
	page.evaluate(() =>
		Object.values(
			(
				window as unknown as {
					__rt: { state: { characters: { characters: Record<string, RosterCharacter> } } };
				}
			).__rt.state.characters.characters,
		),
	);

async function openWizard(page: Page): Promise<Locator> {
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	await seedFresh(page);
	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	await page.getByRole('button', { name: /Build from scratch/ }).click();
	const wizard = page.getByRole('dialog', { name: 'New character wizard' });
	await expect(wizard).toBeVisible();
	return wizard;
}

/** An NPC needs no owner, so identity completes with a name; lands on the class step. */
async function startNpc(wizard: Locator, name: string): Promise<void> {
	await wizard.getByRole('button', { name: 'NPC', exact: true }).click();
	await wizard.getByLabel('Name').fill(name);
	await wizard.getByRole('button', { name: 'Continue' }).click();
}

const assigned = (wizard: Locator, ability: string) =>
	wizard.getByLabel(`${ability} score`).locator('option:checked');

test('ability scores: the standard array starts dealt for the class, and a 4d6 roll is assigned and created', async ({
	page,
}) => {
	const wizard = await openWizard(page);
	await startNpc(wizard, 'Roll Tester');
	const cont = wizard.getByRole('button', { name: 'Continue' });
	await cont.click(); // ability scores

	// Fighter wants STR, CON, DEX first — a complete array, so Continue is live without six picks.
	await expect(assigned(wizard, 'STR')).toHaveText('15');
	await expect(assigned(wizard, 'CON')).toHaveText('14');
	await expect(assigned(wizard, 'INT')).toHaveText('8');
	await expect(cont).not.toHaveAttribute('aria-disabled', 'true');

	// Picking a value another ability holds swaps the two instead of needing a clear first.
	await wizard.getByLabel('DEX score').selectOption({ label: '15 (swap with STR)' });
	await expect(assigned(wizard, 'DEX')).toHaveText('15');
	await expect(assigned(wizard, 'STR')).toHaveText('13');

	// Point buy announces its budget as it moves.
	await wizard.getByRole('radio', { name: 'Point buy' }).click();
	const budget = wizard.getByRole('status').filter({ hasText: 'points left' });
	await expect(budget).toHaveText('15 points left');
	await wizard.getByRole('button', { name: 'Raise STR' }).click();
	await expect(budget).toHaveText('14 points left');

	// Roll: nothing to assign until rolled, then six results dealt in the class order.
	await wizard.getByRole('radio', { name: 'Roll', exact: true }).click();
	await expect(cont).toHaveAttribute('aria-disabled', 'true');
	await expect(wizard.getByRole('alert')).toContainText('Roll the six scores');
	await wizard.getByRole('button', { name: 'Roll 4d6 × 6' }).click();
	await expect(
		wizard.getByRole('list', { name: 'Rolled scores' }).getByRole('listitem'),
	).toHaveCount(6);
	await expect(cont).not.toHaveAttribute('aria-disabled', 'true');

	const rolled: Record<string, number> = {};
	for (const ability of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']) {
		const value = Number(await assigned(wizard, ability).textContent());
		expect(value).toBeGreaterThanOrEqual(3);
		expect(value).toBeLessThanOrEqual(18);
		rolled[ability.toLowerCase()] = value;
	}

	for (let s = 0; s < 3; s += 1) await cont.click(); // kit, bio, review
	await wizard.getByRole('button', { name: 'Create character' }).click();
	await expect
		.poll(async () => (await roster(page)).find((c) => c.name === 'Roll Tester')?.abilityScores)
		.toEqual(rolled);
});

test('the class step previews what the active package gives the class at the chosen level', async ({
	page,
}) => {
	const wizard = await openWizard(page);
	await startNpc(wizard, 'Preview Tester');

	const fighter = wizard.getByRole('region', { name: 'Fighter preview' });
	await expect(fighter).toContainText('Class features in D&D 5e at level 1');
	const surge = fighter.getByRole('listitem').filter({ hasText: 'Action surge' });
	await expect(surge).toContainText('from level 2');
	await expect(fighter.getByRole('listitem').filter({ hasText: 'Superiority dice' })).toContainText(
		'with Battle Master',
	);

	const level = wizard.getByRole('spinbutton', { name: 'level', exact: true });
	await level.fill('2');
	await level.blur();
	await expect(fighter).toContainText('at level 2');
	await expect(surge).not.toContainText('from level');

	await wizard.getByRole('button', { name: /^Cleric/ }).click();
	const cleric = wizard.getByRole('region', { name: 'Cleric preview' });
	await expect(cleric.getByRole('listitem').filter({ hasText: 'Channel divinity' })).toContainText(
		'1',
	);
	await expect(cleric).toContainText('Spellcasting (WIS)');
});

test('the step rail is a named landmark that states each step and revisits completed ones', async ({
	page,
}) => {
	// The rail is desktop-only (the phone wizard keeps progress in its footer).
	await page.setViewportSize({ width: 1280, height: 800 });
	const wizard = await openWizard(page);
	const rail = wizard.getByRole('navigation', { name: 'Wizard steps' });
	const current = rail.locator('[aria-current="step"]');
	await expect(current).toHaveText('Identity, current step');
	await expect(rail.getByRole('listitem').nth(1)).toHaveText('Class & level, not started');
	await expect(rail.getByRole('button')).toHaveCount(0);

	await startNpc(wizard, 'Rail Tester');
	await expect(wizard.getByRole('status').filter({ hasText: 'Step 2 of 6' })).toHaveText(
		'Step 2 of 6: Class & level',
	);
	await expect(current).toHaveText('Class & level, current step');

	// A completed step is a real control; revisiting it lands focus on that step's title rather
	// than dropping it to <body> when the clicked row stops being a button.
	await rail.getByRole('button', { name: 'Identity, completed' }).click();
	await expect(wizard.getByRole('heading', { name: 'Identity' })).toBeFocused();
	await expect(current).toHaveText('Identity, current step');
	await expect(wizard.getByLabel('Name')).toHaveValue('Rail Tester');
});

test('the import review compares the file with a same-named roster character', async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	await seedFresh(page);
	const [existing] = await roster(page);
	expect(existing, 'the seeded roster needs a character to compare against').toBeTruthy();

	const importFile = async (trigger: Locator, character: Record<string, unknown>) => {
		const chooser = page.waitForEvent('filechooser');
		await trigger.click();
		await (
			await chooser
		).setFiles({
			name: 'character.json',
			mimeType: 'application/json',
			buffer: Buffer.from(
				JSON.stringify({ format: 'dndtools-character', kind: 'npc', hp: 9, ...character }),
			),
		});
	};

	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	await importFile(page.getByRole('button', { name: /Import character file/ }), {
		name: 'Nobody Imported Yet',
		ac: 12,
	});
	const review = page.getByRole('dialog', { name: 'Import character file' });
	await expect(review).toContainText('No character named Nobody Imported Yet on your roster yet');

	await importFile(review.getByRole('button', { name: 'Choose another file' }), {
		name: existing!.name,
		ac: existing!.combat.ac + 3,
	});
	const diff = review.getByRole('region', { name: 'Compared with your roster' });
	await expect(diff).toContainText(`${existing!.name} is already on your roster`);
	const acRow = diff.getByRole('row', { name: /Armor class/ });
	await expect(acRow.getByRole('cell').first()).toHaveText(String(existing!.combat.ac));
	await expect(acRow.getByRole('cell').last()).toHaveText(String(existing!.combat.ac + 3));
});
