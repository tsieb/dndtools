import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-CHR-3.2 — party stash v2 (`app/character/PartyStash.tsx`): quantity/weight per item, claiming
// an item onto the selected PC, depositing a PC's equipment into the stash, and the encumbrance
// baseline. Durable assertions read `__rt` directly rather than trusting the screen.

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

function storedEquipment(
	page: Page,
	characterId: string,
): Promise<{ id: string; name: string; quantity: number }[]> {
	return page.evaluate((id) => {
		const character = (
			window.__rt!.state.characters as {
				characters: Record<
					string,
					{ inventory?: { items: { id: string; name: string; quantity: number }[] } }
				>;
			}
		).characters[id]!;
		return character.inventory?.items ?? [];
	}, characterId);
}

function storedStash(
	page: Page,
): Promise<{ id: string; name: string; quantity: number; weight: number }[]> {
	return page.evaluate(() => {
		const party = (
			window.__rt!.state.characters as {
				party?: { inventory: { id: string; name: string; quantity: number; weight: number }[] };
			}
		).party;
		return party?.inventory ?? [];
	});
}

test.describe('party stash v2', () => {
	test.beforeEach(async ({ page }) => {
		test.slow();
		await markOnboarded(page);
		await gotoRoute(page, '/player');
		await seedFresh(page);
		await waitReady(page);
		await page.getByRole('tab', { name: 'Party' }).click();
	});

	test('DM adds a stash item with quantity and weight, then a PC claims it', async ({ page }) => {
		const pc = await firstPcId(page);

		await page.getByLabel('Item name', { exact: true }).fill('Potion of healing');
		await page.getByLabel('Quantity', { exact: true }).fill('3');
		await page.getByLabel('Weight (lb)', { exact: true }).fill('0.5');
		await page.getByRole('button', { name: 'Add to stash' }).click();

		await expect.poll(async () => (await storedStash(page)).length).toBeGreaterThan(0);
		const stash = await storedStash(page);
		const item = stash.find((i) => i.name === 'Potion of healing');
		expect(item).toMatchObject({ quantity: 3, weight: 0.5 });

		await page.getByRole('button', { name: /^Claim for/ }).click();

		// Atomic claim: the stash item is gone (whole stack claimed) and the PC now carries it.
		await expect.poll(async () => (await storedStash(page)).length).toBe(0);
		const equipment = await storedEquipment(page, pc);
		const claimed = equipment.find((i) => i.name === 'Potion of healing');
		expect(claimed).toMatchObject({ quantity: 3 });
	});

	test('depositing from the selected PC moves the item into the stash', async ({ page }) => {
		const pc = await firstPcId(page);
		const actorId = await page.evaluate(() => window.__rt!.defaultActorId);

		// Give the PC an equipment item directly through the core (the equipment tab itself is
		// covered by equipment.spec.ts).
		await page.evaluate(
			async ({ characterId, actorId: actor }) => {
				await window.__rt!.dispatch({
					type: 'character.upsert-equipment-item',
					actorId: actor,
					payload: { characterId, name: 'Spare torches', quantity: 4, weight: 1 },
				});
			},
			{ characterId: pc, actorId },
		);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.getByRole('tab', { name: 'Party' }).click();

		await page
			.getByLabel('Item to deposit', { exact: true })
			.selectOption({ label: 'Spare torches ×4' });
		await page.getByLabel('Quantity to deposit', { exact: true }).fill('4');
		await page.getByRole('button', { name: /^Deposit from/ }).click();

		await expect.poll(async () => (await storedStash(page)).length).toBeGreaterThan(0);
		const stash = await storedStash(page);
		expect(stash.find((i) => i.name === 'Spare torches')).toMatchObject({ quantity: 4 });
		const equipment = await storedEquipment(page, pc);
		expect(equipment.find((i) => i.name === 'Spare torches')).toBeUndefined();
	});
});
