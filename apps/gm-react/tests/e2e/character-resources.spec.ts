import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-CHR-1.1 — the class-resource economy on the Player screen's Resources tab
// (`app/character/Resources.tsx`). The point of the panel is that it names nothing 5e-specific: it
// renders whatever the ACTIVE system package declares. So this file drives the same UI twice — a
// monk's ki under D&D 5e and a stress clock under Generic — and reads the result off the durable
// `characters` slice through `__rt`, never off a test id.

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

/** The stored counters for one resource key, straight off the durable character record. */
function storedResource(
	page: Page,
	characterId: string,
	key: string,
): Promise<{ max: number; expended: number } | null> {
	return page.evaluate(
		({ id, resourceKey }) => {
			const character = (
				window.__rt!.state.characters as {
					characters: Record<
						string,
						{
							resources?: {
								classResources?: Record<string, { max: number; expended: number }>;
							};
						}
					>;
				}
			).characters[id];
			const stored = character?.resources?.classResources?.[resourceKey];
			return stored ? { max: stored.max, expended: stored.expended } : null;
		},
		{ id: characterId, resourceKey: key },
	);
}

/** Put the chosen PC at a level, so a package formula over `level` has something to resolve. */
async function setLevel(page: Page, characterId: string, level: number): Promise<void> {
	const result = await dispatch(page, {
		type: 'character.edit-field',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: { characterId, path: 'data.level', value: String(level) },
	});
	expect(result.status, JSON.stringify(result.rejection ?? {})).toBe('accepted');
}

/** Open the Resources tab and the panel's add form. */
async function openAddForm(page: Page): Promise<void> {
	await page.getByRole('tab', { name: 'Resources' }).click();
	await page.getByRole('button', { name: 'Add a resource' }).click();
	await expect(page.getByLabel('From the active system')).toBeVisible();
}

/** Add a resource the active package declares, by its label in the picker. */
async function addSystemResource(page: Page, label: string): Promise<void> {
	await page.getByLabel('From the active system').selectOption({ label });
	await page.getByRole('button', { name: 'Add', exact: true }).click();
}

test.describe('class resources come from the active system package', () => {
	test.beforeEach(async ({ page }) => {
		// A fresh vault per test, and each one pays the dev server's cold compile in parallel.
		test.slow();
		await markOnboarded(page);
		await gotoRoute(page, '/player');
		await seedFresh(page);
		await waitReady(page);
	});

	test('a monk adds ki, spends a point, and the maximum follows a level-up', async ({ page }) => {
		const pc = await firstPcId(page);
		// 5e's ki is `level` from level 2 (`systems/dnd5e.ts` — `level*max(0,min(1,level-1))`).
		await setLevel(page, pc, 5);

		await openAddForm(page);
		// Nothing is carried yet: the panel says so rather than drawing an empty economy.
		await expect(page.getByText('No class resources')).toBeVisible();
		await addSystemResource(page, 'Ki points');

		// The package's formula gave the maximum — five pips at level five, none of them spent.
		const row = page.getByRole('group', { name: 'Ki points' });
		const pips = row.getByRole('button', { name: /^Ki points use \d+ / });
		await expect(pips).toHaveCount(5);
		await expect(row).toContainText('5/5');
		expect(await storedResource(page, pc, 'ki')).toEqual({ max: 5, expended: 0 });

		// Spending is a pip click, and it lands as a durable write on the character record.
		await page.getByRole('button', { name: 'Ki points use 5 available' }).click();
		await expect(row).toContainText('4/5');
		expect(await storedResource(page, pc, 'ki')).toEqual({ max: 5, expended: 1 });

		// Recovering the same pip is the other half of the same control.
		await page.getByRole('button', { name: 'Ki points use 5 expended' }).click();
		await expect(row).toContainText('5/5');
		expect(await storedResource(page, pc, 'ki')).toEqual({ max: 5, expended: 0 });

		// A level-up moves the maximum, because the panel reads the package's formula rather than a
		// number copied onto the sheet once.
		await setLevel(page, pc, 7);
		await expect(pips).toHaveCount(7);
		await expect(row).toContainText('7/7');
	});

	test('a Generic character tracks a stress clock that fills as it is marked', async ({ page }) => {
		const pc = await firstPcId(page);
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
		// Generic declares `stress`: a six-step track that clears at the end of a scene, and no ki.
		const switched = await dispatch(page, {
			type: 'system.select',
			actorId,
			payload: { packageId: 'builtin:generic', acknowledgeLoss: true },
		});
		expect(switched.status, JSON.stringify(switched.rejection ?? {})).toBe('accepted');

		await openAddForm(page);
		// The picker offers what THIS package declares — the 5e class resources are gone with it.
		await expect(page.getByLabel('From the active system')).toContainText('Stress');
		await expect(page.getByLabel('From the active system')).not.toContainText('Ki points');
		await addSystemResource(page, 'Stress');

		const row = page.getByRole('group', { name: 'Stress' });
		const steps = row.getByRole('button', { name: /^Stress step \d+ / });
		await expect(steps).toHaveCount(6);
		await expect(row).toContainText('Clears at the end of a scene');

		// A clock FILLS as it is marked: marking the third step marks the first three with it.
		await page.getByRole('button', { name: 'Stress step 3 clear' }).click();
		await expect(page.getByRole('button', { name: /^Stress step \d+ marked/ })).toHaveCount(3);
		expect(await storedResource(page, pc, 'stress')).toEqual({ max: 6, expended: 3 });

		// Clearing step 3 clears it and everything above it, leaving two marked.
		await page.getByRole('button', { name: 'Stress step 3 marked' }).click();
		expect(await storedResource(page, pc, 'stress')).toEqual({ max: 6, expended: 2 });
	});

	test('a homebrew resource is added by name and lives on this character', async ({ page }) => {
		const pc = await firstPcId(page);
		await openAddForm(page);

		await page.getByLabel('Name').fill('Luck points');
		await page.getByLabel('Maximum').fill('3');
		await page.getByLabel('Recovers on').selectOption({ label: 'Recovers on a long rest' });
		await page.getByRole('button', { name: 'Add your own' }).click();

		const row = page.getByRole('group', { name: 'Luck points' });
		await expect(row.getByRole('button', { name: /^Luck points use \d+ / })).toHaveCount(3);
		await expect(row).toContainText('Recovers on a long rest');

		const stored = await page.evaluate((id) => {
			const character = (
				window.__rt!.state.characters as {
					characters: Record<
						string,
						{ resources?: { classResources?: Record<string, { name: string; max: number }> } }
					>;
				}
			).characters[id];
			return Object.values(character?.resources?.classResources ?? {}).map((r) => ({
				name: r.name,
				max: r.max,
			}));
		}, pc);
		expect(stored).toEqual([{ name: 'Luck points', max: 3 }]);
	});
});
