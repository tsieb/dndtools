import { expect, test, type Page } from '@playwright/test';
import { dispatch, exitPreview, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// EQUIPMENT — the /player sheet's structured equipment / currency / encumbrance panel (I10 S10.1.3 /
// S10.4.2) against the live Processing Core. Every mutation is a durable `character.*` command
// (`upsert-equipment-item` / `remove-equipment-item` / `set-currency`); carried weight and the
// encumbrance band are DERIVED on read (`computeEncumbrance`), so they can never drift from the
// underlying items + coins + STR. The panel is driven through the REAL UI (add form, steppers, equip
// toggle, coin adjusters) and asserted against raw `__rt.state.characters` AND the rendered view.
// Authority (owner-or-DM, PERM-004) is proven through the appropriate actor at the dispatch choke point.

// The demo seed's rogue PC has STR 8 → tight variant-encumbrance thresholds: encumbered > 40 lb,
// heavily encumbered > 80 lb, overloaded > 120 lb (carry capacity STR × 15 = 120). That makes the
// band transitions cheap to cross with a couple of stepper clicks.
const PC_NAME = 'Sera Duskwhisper';
const PC_STRENGTH = 8;

interface EquipItem {
	id: string;
	name: string;
	quantity: number;
	weight: number;
	equipped: boolean;
}
interface CharRecord {
	id: string;
	name: string;
	inventory?: { items: EquipItem[]; currency: Record<string, number> };
}

/** Raw character record off `__rt.state.characters` (unfiltered — the DM device owner sees it whole). */
function charById(page: Page, id: string): Promise<CharRecord | null> {
	return page.evaluate((cid) => {
		const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> }).characters;
		return chars[cid] ?? null;
	}, id);
}

function charIdByName(page: Page, name: string): Promise<string | null> {
	return page.evaluate((n) => {
		const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> }).characters;
		return Object.values(chars).find((c) => c.name === n)?.id ?? null;
	}, name);
}

/** Select the target PC in the sticky vitals-bar switcher (the DM sees the whole party). */
async function selectPc(page: Page, pcId: string): Promise<void> {
	await page.getByLabel('Switch character').selectOption(pcId);
	// The Equipment panel re-renders for the chosen PC; wait for its heading before driving it.
	await expect(page.getByText(/^Equipment \(\d+\)$/)).not.toHaveCount(0);
}

test.describe('equipment: structured inventory, currency & encumbrance', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/player');
		await seedFresh(page);
		await page.goto('/#/player', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('the panel adds, steps, equips, and removes an item — reflected in core state', async ({ page }) => {
		const pcId = await charIdByName(page, PC_NAME);
		expect(pcId).toBeTruthy();
		await selectPc(page, pcId!);

		// Add through the REAL form. The handler clears the Item input only AFTER the awaited dispatch
		// (and its persistFullState) resolves — that clearing is our post-persist barrier.
		await page.getByLabel('Item').fill('Longsword');
		await page.getByLabel('Qty').fill('2');
		await page.getByLabel('Weight (lb)').fill('3');
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByLabel('Item')).toHaveValue('');

		// It landed in the character's durable inventory (raw core state), not just the view.
		let record = await charById(page, pcId!);
		expect(record?.inventory?.items.length).toBe(1);
		const item = record!.inventory!.items[0];
		expect(item.name).toBe('Longsword');
		expect(item.quantity).toBe(2);
		expect(item.weight).toBe(3);
		expect(item.equipped).toBe(false);
		// ...and renders, with the derived per-line total weight (2 × 3 = 6 lb).
		await expect(page.getByText('Longsword')).not.toHaveCount(0);
		await expect(page.getByText(/6 lb total/)).not.toHaveCount(0);
		await expect(page.getByText('Equipment (1)')).not.toHaveCount(0);

		// Step the quantity up through the PATCH-semantics upsert (id preserved).
		await page.getByRole('button', { name: 'One more Longsword' }).click();
		await page.waitForFunction(
			(cid) => {
				const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> }).characters;
				return chars[cid]?.inventory?.items[0]?.quantity === 3;
			},
			pcId,
			{ timeout: 10_000 },
		);
		await expect(page.getByText(/9 lb total/)).not.toHaveCount(0); // 3 × 3 lb

		// Toggle equipped — a durable flag write; the badge + button label both flip.
		await page.getByRole('button', { name: 'Equip', exact: true }).click();
		await page.waitForFunction(
			(cid) => {
				const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> }).characters;
				return chars[cid]?.inventory?.items[0]?.equipped === true;
			},
			pcId,
			{ timeout: 10_000 },
		);
		await expect(page.getByRole('button', { name: 'Equipped' })).not.toHaveCount(0);
		await expect(page.getByText('equipped', { exact: true })).not.toHaveCount(0);

		// Remove it — the item leaves core state and the panel returns to its honest empty state.
		await page.getByRole('button', { name: 'Remove Longsword' }).click();
		await page.waitForFunction(
			(cid) => {
				const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> }).characters;
				return (chars[cid]?.inventory?.items.length ?? 0) === 0;
			},
			pcId,
			{ timeout: 10_000 },
		);
		record = await charById(page, pcId!);
		expect(record?.inventory?.items.length).toBe(0);
		await expect(page.getByText('No equipment carried yet.')).not.toHaveCount(0);
		await expect(page.getByText('Equipment (0)')).not.toHaveCount(0);
	});

	test('currency adjusts up, and an overspend fails closed with state unchanged', async ({ page }) => {
		const pcId = await charIdByName(page, PC_NAME);
		await selectPc(page, pcId!);

		// Earn gold: three "Add one GP" clicks, each a durable set-currency (adjust) write.
		for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Add one GP' }).click();
		await page.waitForFunction(
			(cid) => {
				const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> }).characters;
				return chars[cid]?.inventory?.currency.gp === 3;
			},
			pcId,
			{ timeout: 10_000 },
		);
		let record = await charById(page, pcId!);
		expect(record?.inventory?.currency.gp).toBe(3);

		// Overspend: the purse holds zero copper, so "Spend one CP" is rejected by the core
		// (insufficient-funds). The error surfaces in the sheet banner and the count stays at 0.
		expect(record?.inventory?.currency.cp).toBe(0);
		await page.getByRole('button', { name: 'Spend one CP' }).click();
		await expect(page.getByText(/Not enough CP/)).not.toHaveCount(0);
		record = await charById(page, pcId!);
		expect(record?.inventory?.currency.cp).toBe(0); // fail closed — no silent mutation
		expect(record?.inventory?.currency.gp).toBe(3); // and the accepted gold is untouched
	});

	test('the encumbrance band crosses unencumbered → encumbered → heavily → overloaded with weight', async ({ page }) => {
		const pcId = await charIdByName(page, PC_NAME);
		const record = await charById(page, pcId!);
		expect(record?.name).toBe(PC_NAME); // sanity: the STR-8 thresholds below assume this PC
		await selectPc(page, pcId!);

		// Empty inventory ⇒ unencumbered, and the capacity meter reads STR × 15 = 120 lb.
		await expect(page.getByText('Unencumbered', { exact: true })).not.toHaveCount(0);
		await expect(page.getByText(`0 / ${PC_STRENGTH * 15} lb`)).not.toHaveCount(0);

		// One 45-lb item (> 40) tips the character into "Encumbered"; the meter reflects carried weight.
		await page.getByLabel('Item').fill('Boulder');
		await page.getByLabel('Qty').fill('1');
		await page.getByLabel('Weight (lb)').fill('45');
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByLabel('Item')).toHaveValue('');
		await expect(page.getByText('Encumbered', { exact: true })).not.toHaveCount(0);
		await expect(page.getByText(`45 / ${PC_STRENGTH * 15} lb`)).not.toHaveCount(0);

		const stepTo = async (qty: number, band: string) => {
			await page.getByRole('button', { name: 'One more Boulder' }).click();
			await page.waitForFunction(
				(arg) => {
					const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> }).characters;
					return chars[arg.cid]?.inventory?.items[0]?.quantity === arg.qty;
				},
				{ cid: pcId, qty },
				{ timeout: 10_000 },
			);
			await expect(page.getByText(band, { exact: true })).not.toHaveCount(0);
		};
		// 2 × 45 = 90 lb (> 80) ⇒ heavily encumbered; 3 × 45 = 135 lb (> 120 capacity) ⇒ overloaded.
		await stepTo(2, 'Heavily encumbered');
		await stepTo(3, 'Overloaded');
	});

	test('authority: the PC owner and the DM may edit; a non-owner is refused (fail closed)', async ({ page }) => {
		const pcId = await charIdByName(page, PC_NAME);
		expect(pcId).toBeTruthy();

		// The DM (the device-owner default actor) edits successfully through the choke point.
		const dmId = await page.evaluate(() => window.__rt!.defaultActorId);
		const asDm = await dispatch(page, {
			type: 'character.upsert-equipment-item',
			actorId: dmId,
			payload: { characterId: pcId, name: 'Torch', quantity: 5, weight: 1 },
		});
		expect(asDm.status).toBe('accepted');

		// The granted OWNER of this PC (the seeded player actor) may also edit — real PERM-004 authority.
		const asOwner = await dispatch(page, {
			type: 'character.upsert-equipment-item',
			actorId: 'actor-player',
			payload: { characterId: pcId, name: "Thieves' Tools", quantity: 1, weight: 1 },
		});
		expect(asOwner.status).toBe('accepted');

		// A DIFFERENT player with no grant on this PC is rejected, and nothing is written for them.
		const before = await charById(page, pcId!);
		const asStranger = await dispatch(page, {
			type: 'character.upsert-equipment-item',
			actorId: 'actor-player-2',
			payload: { characterId: pcId, name: 'Contraband', quantity: 1, weight: 1 },
		});
		expect(asStranger.status).toBe('rejected');
		expect(asStranger.rejection?.message ?? '').toMatch(/owner/i);
		const after = await charById(page, pcId!);
		expect(after?.inventory?.items.length).toBe(before?.inventory?.items.length);
		expect(after?.inventory?.items.some((i) => i.name === 'Contraband')).toBe(false);

		// The UI grants the owner edit affordances: previewing as the specific owning player shows the
		// manage form for their own PC (writes are preview-read-only, so we assert the control's presence).
		await page.evaluate(() => window.__rt!.enterPreview({ role: 'player', playerActorId: 'actor-player' }));
		await page.waitForFunction(() => window.__rt?.preview?.role === 'player', null, { timeout: 5_000 });
		await expect(page.getByText(PC_NAME).first()).not.toHaveCount(0);
		await expect(page.getByLabel('Item')).toHaveCount(1);
		await exitPreview(page);
	});

	test('an added item survives a full reload (durable, not display state)', async ({ page }) => {
		const pcId = await charIdByName(page, PC_NAME);
		await selectPc(page, pcId!);

		await page.getByLabel('Item').fill('Bedroll');
		await page.getByLabel('Qty').fill('1');
		await page.getByLabel('Weight (lb)').fill('7');
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		// Barrier: the Item input clears only after the awaited dispatch + persistFullState resolve.
		await expect(page.getByLabel('Item')).toHaveValue('');

		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitReady(page);

		const record = await charById(page, pcId!);
		expect(record?.inventory?.items.some((i) => i.name === 'Bedroll' && i.weight === 7)).toBe(true);
		await selectPc(page, pcId!);
		await expect(page.getByText('Bedroll')).not.toHaveCount(0);
	});
});
