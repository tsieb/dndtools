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
		const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> })
			.characters;
		return chars[cid] ?? null;
	}, id);
}

function charIdByName(page: Page, name: string): Promise<string | null> {
	return page.evaluate((n) => {
		const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> })
			.characters;
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

	test('the panel adds, steps, equips, and removes an item — reflected in core state', async ({
		page,
	}) => {
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
				const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> })
					.characters;
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
				const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> })
					.characters;
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
				const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> })
					.characters;
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

	test('currency adjusts up, and an overspend fails closed with state unchanged', async ({
		page,
	}) => {
		const pcId = await charIdByName(page, PC_NAME);
		await selectPc(page, pcId!);

		// Earn gold: three "Add one GP" clicks, each a durable set-currency (adjust) write.
		for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Add one GP' }).click();
		await page.waitForFunction(
			(cid) => {
				const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> })
					.characters;
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

	test('the encumbrance band crosses unencumbered → encumbered → heavily → overloaded with weight', async ({
		page,
	}) => {
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
					const chars = (
						window.__rt!.state.characters as { characters: Record<string, CharRecord> }
					).characters;
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

	test('authority: the PC owner and the DM may edit; a non-owner is refused (fail closed)', async ({
		page,
	}) => {
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
		await page.evaluate(() =>
			window.__rt!.enterPreview({ role: 'player', playerActorId: 'actor-player' }),
		);
		await page.waitForFunction(() => window.__rt?.preview?.role === 'player', null, {
			timeout: 5_000,
		});
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

// The vitals-bar HP stepper is the /player surface's only combat-resource write. It was ±1-ONLY, so
// taking 27 damage meant 27 separate durable commands (each a full-state persist plus an op-log
// entry), and a SUCCESSFUL write announced nothing at all — the number changed silently for anyone
// not watching that corner of the screen.
test.describe('player vitals: the HP stepper takes an amount and announces the result', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/player');
		await seedFresh(page);
		await page.goto('/#/player', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('applies a typed amount in one command and announces it politely', async ({ page }) => {
		const pcId = await charIdByName(page, PC_NAME);
		expect(pcId).toBeTruthy();
		await selectPc(page, pcId!);

		// `character.update-combat-resource` is gated on an ACTIVE session workflow, so the idle seed
		// would refuse the write and we would be asserting a rejection instead of the stepper.
		const live = await page.evaluate(async () => {
			const rt = window.__rt!;
			const state = rt.state as unknown as {
				commandCenter: { homeSceneId: string | null };
				scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
			};
			const activeSceneId =
				state.commandCenter.homeSceneId ??
				Object.values(state.scenes.scenes).find((sc) => !sc.isTemplate)?.id;
			return rt.dispatch({
				type: 'session.set-workflow',
				actorId: rt.defaultActorId,
				payload: { workflow: 'active', activeSceneId },
			});
		});
		expect(live.status, JSON.stringify(live)).toBe('accepted');

		const amount = page.getByLabel('Hit point change amount');
		await expect(amount).toBeVisible();
		// The buttons name the amount they will apply, so the control is not a mystery before pressing.
		await expect(page.getByRole('button', { name: 'Damage 1' })).toBeVisible();

		await amount.fill('7');
		await amount.blur();
		const damage = page.getByRole('button', { name: 'Damage 7' });
		await expect(damage).toBeVisible();

		const hpBefore = await page.evaluate((cid) => {
			const chars = (
				window.__rt!.state.characters as {
					characters: Record<string, { id: string; combat: { hp: number } }>;
				}
			).characters;
			return chars[cid]!.combat.hp;
		}, pcId!);

		await damage.click();

		// ONE command moved 7 points, and the success is announced rather than merely rendered.
		await expect
			.poll(async () =>
				page.evaluate((cid) => {
					const chars = (
						window.__rt!.state.characters as {
							characters: Record<string, { id: string; combat: { hp: number } }>;
						}
					).characters;
					return chars[cid]!.combat.hp;
				}, pcId!),
			)
			.toBe(Math.max(0, hpBefore - 7));
		await expect(page.getByRole('status').filter({ hasText: 'Took 7 damage.' })).not.toHaveCount(0);

		// A blank amount cannot silently become a no-op or a NaN write: it normalises back to 1.
		await amount.fill('');
		await amount.blur();
		await expect(amount).toHaveValue('1');
	});
});

test.describe('equipment: the quantity stepper has a floor', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/player');
		await seedFresh(page);
		await page.goto('/#/player', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	// "One fewer X" clamped at `Math.max(0, …)`, so at quantity 1 it wrote a ×0 item that STAYED in the
	// list — a ghost row you owned none of, whose own decrement button kept accepting presses. Removing
	// the item is a different, already-present action, so the control now says so instead of pretending
	// to work. Soft-disabled (aria-disabled), not `disabled`, so the reason is still reachable.
	test('the quantity stepper refuses to walk an item down to a x0 ghost', async ({ page }) => {
		const pcId = await charIdByName(page, PC_NAME);
		expect(pcId).toBeTruthy();
		await selectPc(page, pcId!);

		await page.getByLabel('Item').fill('Torch');
		await page.getByLabel('Qty').fill('1');
		await page.getByLabel('Weight (lb)').fill('1');
		await page.getByRole('button', { name: 'Add', exact: true }).click();
		await expect(page.getByLabel('Item')).toHaveValue('');
		await page.waitForFunction(
			(cid) => {
				const chars = (window.__rt!.state.characters as { characters: Record<string, CharRecord> })
					.characters;
				return chars[cid]?.inventory?.items.some((i) => i.name === 'Torch' && i.quantity === 1);
			},
			pcId,
			{ timeout: 10_000 },
		);

		// At quantity 1 the decrement explains itself rather than clamping to zero.
		const fewer = page.getByRole('button', { name: /^Cannot go below one Torch/ });
		await expect(fewer).toBeVisible();
		await expect(fewer).toHaveAttribute('aria-disabled', 'true');
		// A soft disable keeps the control natively enabled and focusable, so its reason stays reachable
		// — which also means Playwright's click() would refuse it. Dispatch the event directly.
		expect(await fewer.evaluate((el: HTMLButtonElement) => el.disabled)).toBe(false);
		await fewer.dispatchEvent('click');

		// The swallowed press changed nothing: still exactly one Torch, no x0 ghost.
		await expect
			.poll(() =>
				page.evaluate((cid) => {
					const chars = (
						window.__rt!.state.characters as { characters: Record<string, CharRecord> }
					).characters;
					const item = chars[cid]?.inventory?.items.find((i) => i.name === 'Torch');
					return item ? item.quantity : -1;
				}, pcId),
			)
			.toBe(1);

		// Above 1 it is a live control again, with its ordinary name back.
		await page.getByRole('button', { name: 'One more Torch' }).click();
		await expect(page.getByRole('button', { name: 'One fewer Torch' })).toBeVisible();
	});
});

test.describe('player sheet: death saves are readable, not colour-only', () => {
	// The six pips were filled-vs-transparent circles and nothing else: colour as the sole carrier of
	// the state (WCAG 1.4.1) with no text equivalent anywhere (1.1.1), so the count was simply
	// unavailable to assistive tech — and `forced-colors` flattens both tints to the same value, which
	// makes it unreadable for sighted users too. This is the panel that says whether a PC is dying.
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/player');
		await seedFresh(page);
		await page.goto('/#/player', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('each group names its own count, and the number is visible as text', async ({ page }) => {
		// The panel lives on the Resources tab, beside class resources and Rest.
		await page.getByRole('tab', { name: 'Resources' }).click();
		const successes = page.getByRole('img', { name: /of 3 successes$/ });
		const failures = page.getByRole('img', { name: /of 3 failures$/ });
		await expect(successes).toHaveCount(1);
		await expect(failures).toHaveCount(1);

		// The name carries the real count, not a fixed string.
		await expect(successes).toHaveAccessibleName(/^\d of 3 successes$/);
		await expect(failures).toHaveAccessibleName(/^\d of 3 failures$/);

		// And the same number is on screen for everyone, so the pips are no longer the only readout.
		await expect(successes.getByText(/^\d\/3$/)).toHaveCount(1);
		await expect(failures.getByText(/^\d\/3$/)).toHaveCount(1);
	});
});

// The DM-only marching order was move-UP-only: no `moveDown` existed anywhere in the screen, so
// pushing the front rank to the back of a five-person order meant pressing "Move X up" on the four
// below it in the right sequence, and the LAST member could not be moved down at all. The up control
// was also OMITTED on row 1 rather than disabled, which collapsed that row's right gutter and left
// its name column running wider than every other row. `SceneCardsPanel` and `Atlas` both ship the
// rendered-and-disabled pair; this brings the third list in line.
test.describe('party: the marching order can be reordered in both directions', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/player');
		await seedFresh(page);
		await page.goto('/#/player', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.getByRole('tab', { name: 'Party' }).click();
	});

	/**
	 * The rendered order, read off the reorder controls' own accessible names. It has to come from
	 * the DOM rather than `__rt.state.characters.party.marchingOrder`: the panel is driven by the
	 * DERIVED party overview, which falls back to the visible roster when no order has been stored,
	 * so the raw slice reads empty while five rows are on screen.
	 */
	const rowNames = (page: Page) =>
		page
			.getByRole('button', { name: /^Move .+ up$/ })
			.evaluateAll((els) =>
				els.map((el) => (el.getAttribute('aria-label') ?? '').replace(/^Move | up$/g, '')),
			);

	test('offers both chevrons on every row, disabled only at the ends', async ({ page }) => {
		const ups = page.getByRole('button', { name: /^Move .+ up$/ });
		const downs = page.getByRole('button', { name: /^Move .+ down$/ });

		// `evaluateAll`/`toBeDisabled` below need a retrying assertion in front of them, or they can
		// measure an unpainted list under full-suite load.
		await expect.poll(async () => await ups.count()).toBeGreaterThan(1);
		const rows = await ups.count();

		// Every row carries BOTH controls — that is what keeps the rows aligned. Move-down did not
		// exist at all before, so the last member could not be moved down by any means.
		await expect(downs).toHaveCount(rows);

		// Only the ends are unavailable, and they are still RENDERED so the gutter never collapses.
		// (`toBeDisabled()` honours `aria-disabled`, which is the form these now use.)
		await expect(ups.first()).toBeDisabled();
		await expect(ups.last()).toBeEnabled();
		await expect(downs.first()).toBeEnabled();
		await expect(downs.last()).toBeDisabled();

		// …and unavailable SOFTLY. Promoting a member to rank 1 is the normal way to use this, and a
		// native `disabled` applied at that moment took the button the DM had just pressed out of the
		// tab order, dropping focus to <body>. The bound keeps its tab stop and swallows the press.
		for (const bound of [ups.first(), downs.last()]) {
			expect(await bound.evaluate((el: HTMLButtonElement) => el.disabled)).toBe(false);
			await bound.focus();
			await expect(bound).toBeFocused();
		}
		const before = await rowNames(page);
		await ups.first().dispatchEvent('click');
		await page.waitForTimeout(200);
		expect(await rowNames(page)).toEqual(before);
	});

	test('Move down swaps the row with the one below it', async ({ page }) => {
		const ups = page.getByRole('button', { name: /^Move .+ up$/ });
		await expect.poll(async () => await ups.count()).toBeGreaterThan(1);

		const before = await rowNames(page);
		const expected = [...before];
		[expected[0], expected[1]] = [expected[1]!, expected[0]!];

		await page
			.getByRole('button', { name: /^Move .+ down$/ })
			.first()
			.click();

		await expect.poll(() => rowNames(page)).toEqual(expected);
	});

	test('clearing the order offers an Undo that puts it back', async ({ page }) => {
		// "Clear order" destroys DM-authored data from a ghost button in a Panel header, which reads
		// like a filter reset. The shared stash's Remove one column over already ships this toast.
		// Assert on the DURABLE slice: the rendered panel is the derived overview, which falls back to
		// the visible roster, so a cleared order still lists everyone on screen.
		const stored = (): Promise<string[]> =>
			page.evaluate(
				() =>
					(window.__rt!.state.characters as { party?: { marchingOrder?: string[] } }).party
						?.marchingOrder ?? [],
			);

		const ups = page.getByRole('button', { name: /^Move .+ up$/ });
		await expect.poll(async () => await ups.count()).toBeGreaterThan(1);

		// One reorder commits a real order, so there is something to lose.
		await page
			.getByRole('button', { name: /^Move .+ down$/ })
			.first()
			.click();
		await expect.poll(async () => (await stored()).length).toBeGreaterThan(1);
		const before = await stored();

		await page.getByRole('button', { name: 'Clear order' }).click();
		await expect.poll(async () => (await stored()).length).toBe(0);

		await page.getByRole('button', { name: 'Undo' }).click();
		await expect.poll(stored).toEqual(before);
	});
});
