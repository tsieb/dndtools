import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, ops, seedFresh, waitReady } from './_helpers';

// CHARACTER SHEET — /characters/:id. This file exists for one reason: the sheet holds a dozen pieces
// of PER-CHARACTER draft state (editMode, shareDraft, attackRows, acDraft, xpInput, error) and used
// to be mounted WITHOUT a `key`, with no effect keyed on `id` either. React therefore reused the same
// component instance across a sheet -> sheet navigation — which the command palette performs directly
// — and carried character A's drafts onto character B's sheet. `applySharing` and `saveAttacks` are
// both full replacements addressed by `characterId: id`, so the very next Apply/Save wrote A's
// sharing list, or A's entire attack list, onto B. Silently, durably, with no undo.

/** Ids of two distinct seeded characters, in roster order. */
async function twoCharacterIds(page: import('@playwright/test').Page): Promise<[string, string]> {
	const ids = await page.evaluate(() =>
		Object.values(
			(
				window.__rt!.state.characters as {
					characters: Record<string, { id: string; name: string }>;
				}
			).characters,
		).map((c) => c.id),
	);
	expect(ids.length, 'the seeded vault must have at least two characters').toBeGreaterThan(1);
	return [ids[0]!, ids[1]!];
}

test.describe('character sheet: per-character state is not shared between characters', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/characters');
		await seedFresh(page);
		await page.goto('/#/characters', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('navigating sheet to sheet remounts, dropping the previous character’s drafts', async ({
		page,
	}) => {
		const [first, second] = await twoCharacterIds(page);

		// Put character A into edit mode — the entry point for every draft this sheet holds.
		await page.goto(`/#/characters/${first}`, { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		const edit = page.getByRole('button', { name: 'Edit', exact: true });
		await expect(edit).toBeVisible();
		await edit.click();
		await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();

		// Straight to character B's sheet, without passing back through the roster — exactly what
		// the command palette's character results do.
		await page.goto(`/#/characters/${second}`, { waitUntil: 'domcontentloaded' });
		await waitReady(page);

		// B opens read-only. Before the fix the shared instance survived and B opened mid-edit,
		// holding A's drafts and one Apply away from writing them to B.
		await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0);
	});

	test('each sheet renders its own character, not the one opened before it', async ({ page }) => {
		const [first, second] = await twoCharacterIds(page);
		const names = await page.evaluate(
			(ids) =>
				ids.map(
					(id) =>
						(
							window.__rt!.state.characters as {
								characters: Record<string, { id: string; name: string }>;
							}
						).characters[id]!.name,
				),
			[first, second],
		);
		expect(names[0]).not.toBe(names[1]);

		await page.goto(`/#/characters/${first}`, { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(page.locator('#main-content').getByText(names[0]!).first()).toBeVisible();

		await page.goto(`/#/characters/${second}`, { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(page.locator('#main-content').getByText(names[1]!).first()).toBeVisible();
	});
});

test.describe('character sheet: validation is reported at the control it belongs to', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/characters');
		await seedFresh(page);
	});

	test('"Set AC" with a blank field explains itself next to the field, not off-screen', async ({
		page,
	}) => {
		// The sheet had ONE screen-level `role="alert"` under the BackBar carrying both core rejections
		// and every field's validation message. All three validation writers live deep inside edit-mode
		// panels, so pressing "Set AC" with an empty field printed its reason hundreds of pixels above
		// the fold — the button read as dead. Validation is now scoped to its own control.
		const [first] = await twoCharacterIds(page);
		await page.goto(`/#/characters/${first}`, { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const setAc = page.getByRole('button', { name: 'Set AC', exact: true });
		await expect(setAc).toBeVisible();
		await setAc.click();

		const message = page.getByRole('alert').filter({ hasText: 'Enter an armour class' });
		await expect(message).toHaveCount(1);
		// The whole point: it is in view alongside the control the user just pressed.
		await expect(message).toBeInViewport();

		// And it sits below the Set AC row rather than at the top of the page.
		const [buttonBox, messageBox] = await Promise.all([setAc.boundingBox(), message.boundingBox()]);
		expect(buttonBox, 'Set AC must have a box').not.toBeNull();
		expect(messageBox, 'the message must have a box').not.toBeNull();
		expect(
			Math.abs(messageBox!.y - buttonBox!.y),
			'the validation message must be adjacent to its control',
		).toBeLessThan(80);
	});
});

test.describe('character sheet: durable writes announce themselves', () => {
	// The DM's primary authoring surface had NO `role="status"` anywhere in the file: HP, AC,
	// conditions, rename, prepared spells, slot totals, attacks, sharing, XP and every advancement
	// step each change only a number or a pill, which is invisible to assistive tech. Ten durable
	// writes succeeded in complete silence. `Player.tsx` already carried the one-node pattern.
	//
	// Scoped to `#main-content`: `ToastViewport` mounts a permanent app-wide polite region, so a bare
	// `getByRole('status')` is ambiguous everywhere in this suite.
	const sheetStatus = (page: import('@playwright/test').Page) =>
		page.locator('#main-content').getByRole('status');

	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/characters');
		await seedFresh(page);
	});

	test('"Set AC" announces the value it stored', async ({ page }) => {
		const [first] = await twoCharacterIds(page);
		await page.goto(`/#/characters/${first}`, { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		// The status host must PRE-EXIST for its change to be announced: a live region inserted
		// together with its own text is routinely dropped by screen readers.
		const status = sheetStatus(page);
		await expect(status).toHaveCount(1);
		await expect(status).toHaveText('');

		await page.getByLabel('Set AC', { exact: true }).fill('17');
		await page.getByRole('button', { name: 'Set AC', exact: true }).click();

		await expect(status).toHaveText('Armour class set to 17.');
		// And the durable write really happened — the announcement is not decorative.
		await expect
			.poll(async () =>
				page.evaluate(
					(id) =>
						(
							window.__rt!.state.characters as {
								characters: Record<string, { combat?: { ac?: number } }>;
							}
						).characters[id]?.combat?.ac,
					first,
				),
			)
			.toBe(17);
	});

	test('a damage press announces the resulting hit points', async ({ page }) => {
		const [first] = await twoCharacterIds(page);
		await page.goto(`/#/characters/${first}`, { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const status = sheetStatus(page);
		await expect(status).toHaveCount(1);
		await page.getByRole('button', { name: 'Damage', exact: true }).click();

		await expect(status).toHaveText(/Damaged 1\. \d+ of \d+ hit points\./);
	});

	test('a press that cannot change the hit points says so instead of claiming it did', async ({
		page,
	}) => {
		// `clamp(hp + delta, 0, maxHp)` meant that at full HP a Heal press, and at 0 HP a Damage
		// press, dispatched `character.set-combat` with the UNCHANGED hp — a durable no-op the op log
		// recorded — and then announced "Healed 1. 24 of 24 hit points." The number was real; the
		// verb was not.
		const [first] = await twoCharacterIds(page);
		await page.goto(`/#/characters/${first}`, { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.getByRole('button', { name: 'Edit', exact: true }).click();

		const status = sheetStatus(page);
		await expect(status).toHaveCount(1);
		const hpOf = () =>
			page.evaluate(
				(id) =>
					(
						window.__rt!.state.characters as {
							characters: Record<string, { combat?: { hp?: number; maxHp?: number } }>;
						}
					).characters[id]?.combat,
				first,
			);

		// Put the character at full health through the real control, then press Heal again.
		const combat = await hpOf();
		expect(combat?.maxHp, 'the seeded character must have a max HP').toBeGreaterThan(0);
		if ((combat?.hp ?? 0) < (combat?.maxHp ?? 0)) {
			await page.getByRole('button', { name: 'Heal', exact: true }).click();
			await expect(status).toHaveText(/Healed 1\./);
		}
		await expect.poll(async () => (await hpOf())?.hp).toBe(combat?.maxHp);

		const before = await ops(page);
		await page.getByRole('button', { name: 'Heal', exact: true }).click();

		// Truthful message...
		await expect(status).toHaveText(/Already at full health/);
		// ...and NOT a claim that healing happened.
		await expect(status).not.toHaveText(/Healed/);
		// ...and no durable write at all.
		expect(await ops(page)).toBe(before);
	});
});
