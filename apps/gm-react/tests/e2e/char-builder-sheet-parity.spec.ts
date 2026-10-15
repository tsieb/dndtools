import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

/**
 * RC-ENG-8.8 — a PC built in the wizard opens on a sheet that says what the Review card said: the
 * scores WITH the ancestry bonus the Identity tile named, initiative, the class's hit dice and its
 * proficient saving throws. Before this, a Dwarf from the standard array was stored with CON 14,
 * Init read "—", a level 1 Fighter had "0/0 d8" hit dice and no save proficiency; and a rolled
 * spread could not be finalized as a PC at all (DEBT-2026-006).
 */

const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
type Ability = (typeof ABILITIES)[number];
const FULL: Record<Ability, string> = {
	STR: 'Strength',
	DEX: 'Dexterity',
	CON: 'Constitution',
	INT: 'Intelligence',
	WIS: 'Wisdom',
	CHA: 'Charisma',
};

interface ReviewCard {
	scores: Record<Ability, number>;
	init: string;
	hitDice: string;
	/** `[['STR', '+4'], ['CON', '+5']]` */
	saves: [Ability, string][];
}

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

/** PC is the default kind and the seeded roster supplies the owning player. */
async function identity(wizard: Locator, name: string, ancestry: string): Promise<void> {
	await wizard.getByLabel('Name').fill(name);
	await wizard.getByRole('button', { name: new RegExp(`^${ancestry}`) }).click();
	await wizard.getByRole('button', { name: 'Continue' }).click();
}

/** Read the Review step's card off the DOM, as the user sees it. */
async function readReview(wizard: Locator): Promise<ReviewCard> {
	const scores = {} as Record<Ability, number>;
	for (const k of ABILITIES) {
		const cell = (await wizard.getByText(k, { exact: true }).locator('..').textContent()) ?? '';
		scores[k] = Number(new RegExp(`^${k}(\\d+)`).exec(cell)?.[1]);
	}
	const after = async (label: string) =>
		((await wizard.getByText(label, { exact: true }).locator('..').textContent()) ?? '').replace(
			label,
			'',
		);
	const saves = (await after('Saving throws')).split(',').map((save) => {
		const [k, bonus] = save.trim().split(' ');
		return [k as Ability, bonus!] as [Ability, string];
	});
	return { scores, init: await after('Init'), hitDice: await after('Hit dice'), saves };
}

/** Create, land on the new sheet, and check every Review value is what the sheet shows. */
async function createAndMatchSheet(page: Page, wizard: Locator, card: ReviewCard, name: string) {
	await wizard.getByRole('button', { name: 'Create character' }).click();
	await expect(wizard).toBeHidden();
	await expect(page.getByTestId('character-sheet')).toBeVisible();

	const abilities = page.locator('[data-sheet-panel="abilities"]');
	for (const k of ABILITIES) {
		await expect(abilities.getByLabel(FULL[k], { exact: true })).toHaveText(
			new RegExp(`^${k}${card.scores[k]}\\D`),
		);
	}
	// "1d10" on the card is one d10 hit die, none spent.
	const [, count, die] = /^(\d+)(d\d+)$/.exec(card.hitDice)!;
	await expect(abilities).toContainText(`Hit dice${count}/${count} ${die}`);
	const saving = abilities.locator('section').filter({ hasText: 'Saving throws' });
	for (const [k, bonus] of card.saves) await expect(saving).toContainText(`${FULL[k]} •${bonus}`);
	await expect(page.locator('[data-sheet-panel="combat"]')).toContainText(
		new RegExp(`Init\\s*\\${card.init}`),
	);

	// …and the durable record agrees (no display-only bonus).
	const stored = await page.evaluate(
		(n) =>
			Object.values(
				(
					window as unknown as {
						__rt: {
							state: {
								characters: {
									characters: Record<
										string,
										{ name: string; kind: string; abilityScores: Record<string, number> }
									>;
								};
							};
						};
					}
				).__rt.state.characters.characters,
			).find((c) => c.name === n),
		name,
	);
	expect(stored?.kind).toBe('pc');
	expect(stored?.abilityScores).toEqual(
		Object.fromEntries(ABILITIES.map((k) => [k.toLowerCase(), card.scores[k]])),
	);
}

test('a standard-array Dwarf Fighter keeps its +2 CON, initiative, hit die and saves', async ({
	page,
}) => {
	const wizard = await openWizard(page);
	const cont = wizard.getByRole('button', { name: 'Continue' });
	await identity(wizard, 'Brom Ironfoot', 'Dwarf');
	await cont.click(); // Fighter is the default class → ability scores

	// The array is dealt for a Fighter (CON 14); the Dwarf bonus is shown on the score it raises.
	await expect(wizard.getByLabel('CON score').locator('option:checked')).toHaveText('14');
	await expect(wizard).toContainText('Dwarf +2 CON — added on top of these scores.');
	await expect(wizard).toContainText('CON 16 with the Dwarf +2');
	await expect(cont).not.toHaveAttribute('aria-disabled', 'true');

	for (let s = 0; s < 3; s += 1) await cont.click(); // kit, bio, review
	const card = await readReview(wizard);
	expect(card).toEqual({
		scores: { STR: 15, DEX: 13, CON: 16, INT: 8, WIS: 12, CHA: 10 },
		init: '+1',
		hitDice: '1d10',
		saves: [
			['STR', '+4'],
			['CON', '+5'],
		],
	});
	await createAndMatchSheet(page, wizard, card, 'Brom Ironfoot');
});

test('a rolled Half-elf Rogue finalizes from its dice, beyond point buy, and its sheet matches', async ({
	page,
}) => {
	const wizard = await openWizard(page);
	const cont = wizard.getByRole('button', { name: 'Continue' });
	await identity(wizard, 'Vel Thornwhistle', 'Half-elf');
	await wizard.getByRole('button', { name: /^Rogue/ }).click();
	await cont.click(); // ability scores

	await wizard.getByRole('radio', { name: 'Roll', exact: true }).click();
	await wizard.getByRole('button', { name: 'Roll 4d6 × 6' }).click();
	const rolledList = wizard.getByRole('list', { name: 'Rolled scores' }).getByRole('listitem');
	await expect(rolledList).toHaveCount(6);
	// Reroll until the spread holds a score point buy would refuse (8–15) — the case the core used
	// to reject at finalize. Six scores all inside 8–15 happens roughly one roll in seven.
	// Each result's first span is its total (the dice and the screen-reader detail follow it).
	const totals = async () =>
		(await rolledList.locator(':scope > span:first-child').allTextContents()).map(Number);
	for (let attempt = 0; attempt < 20; attempt += 1) {
		if ((await totals()).some((total) => total < 8 || total > 15)) break;
		await wizard.getByRole('button', { name: 'Reroll all' }).click();
	}
	expect((await totals()).some((total) => total < 8 || total > 15)).toBe(true);
	await expect(cont).not.toHaveAttribute('aria-disabled', 'true');
	await expect(wizard.getByRole('alert')).toHaveCount(0);

	// The half-elf's two free +1s default to the Rogue's first abilities other than CHA.
	await expect(wizard.getByLabel('Half-elf bonus 1')).toHaveValue('DEX');
	await expect(wizard.getByLabel('Half-elf bonus 2')).toHaveValue('INT');
	await wizard.getByLabel('Half-elf bonus 2').selectOption('CON');

	for (let s = 0; s < 3; s += 1) await cont.click(); // kit, bio, review
	const card = await readReview(wizard);
	expect(card.hitDice).toBe('1d8');
	expect(card.saves.map(([k]) => k)).toEqual(['DEX', 'INT']);
	await createAndMatchSheet(page, wizard, card, 'Vel Thornwhistle');
});
