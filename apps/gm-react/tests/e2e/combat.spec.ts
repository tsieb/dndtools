import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// COMBAT — the /session initiative tracker. Before this spec the running tracker had NO e2e coverage
// at all: every other spec sees an idle session, so nothing exercised the surface that appears once
// combat is live. Reaching it needs the session to be live first (`combat.start` is gated on the
// active workflow), which is done here through the Core rather than the EncounterBuilder dialog.

/** Take the session live on the first available scene, then roll a two-combatant initiative. */
async function startCombat(page: Page): Promise<void> {
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
		const live = await rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
		if (live.status !== 'accepted') return { step: 'go live', ...live };
		return {
			step: 'start combat',
			...(await rt.dispatch({
				type: 'combat.start',
				actorId: rt.defaultActorId,
				payload: {
					combatants: [
						{ kind: 'monster', name: 'Bog Lurker', ac: 13, initiative: 18, maxHp: 22 },
						{ kind: 'monster', name: 'Reed Stalker', ac: 12, initiative: 9, maxHp: 14 },
					],
				},
			})),
		};
	});
	expect(result.status, `${result.step}: ${JSON.stringify(result.rejection ?? {})}`).toBe(
		'accepted',
	);
}

function combatStatus(page: Page): Promise<string | undefined> {
	return page.evaluate(
		() => (window.__rt!.state.session as { combat?: { status?: string } }).combat?.status,
	);
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	await seedFresh(page);
	await startCombat(page);
	await expect(page.getByRole('button', { name: 'End combat' })).toBeVisible();
});

// `combat.end` throws away the round counter, the whole initiative order, and every combatant's
// current HP and conditions — and the Core has no restore command. It was a single unguarded click
// on a ghost button sitting right beside "Add".
test.describe('ending combat is confirmed, not instant', () => {
	test('one click on End combat asks first and leaves the tracker running', async ({ page }) => {
		const before = await combatStatus(page);
		expect(before).toBe('running');

		await page.getByRole('button', { name: 'End combat' }).click();

		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		await expect(dialog.getByText('End this combat?')).toBeVisible();
		// The consequences have to be spelled out — this is the only warning the DM gets.
		await expect(dialog.getByText(/no undo/i)).toBeVisible();
		// Nothing was dispatched yet.
		expect(await combatStatus(page)).toBe('running');
	});

	test('Escape and Keep running both back out without ending combat', async ({ page }) => {
		await page.getByRole('button', { name: 'End combat' }).click();
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toHaveCount(0);
		expect(await combatStatus(page)).toBe('running');

		await page.getByRole('button', { name: 'End combat' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Keep running' }).click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		expect(await combatStatus(page)).toBe('running');
		// The tracker is still there and still usable.
		await expect(page.getByRole('button', { name: 'End combat' })).toBeVisible();
	});

	test('confirming in the dialog really ends combat', async ({ page }) => {
		await page.getByRole('button', { name: 'End combat' }).click();
		// Both the panel button and the dialog's destructive button are named "End combat", so the
		// confirm MUST be scoped to the dialog (Playwright strict mode would fail otherwise).
		await page.getByRole('dialog').getByRole('button', { name: 'End combat' }).click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect.poll(() => combatStatus(page), { timeout: 5_000 }).not.toBe('running');
		// The panel falls back to its idle affordance.
		await expect(page.getByRole('button', { name: /^Build encounter/ })).toBeVisible();
	});
});

// The tracker's own controls, which nothing covered before.
test('the initiative order is exposed with a round and turn readout', async ({ page }) => {
	await expect(page.getByText('Bog Lurker')).not.toHaveCount(0);
	await expect(page.getByText('Reed Stalker')).not.toHaveCount(0);

	const round = await page.evaluate(
		() => (window.__rt!.state.session as { combat?: { round?: number } }).combat?.round,
	);
	expect(round).toBe(1);

	// Advancing a turn is a durable write, and returning is its documented undo (UX-SES-006).
	const advance = await dispatch(page, {
		type: 'combat.advance-turn',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: {},
	});
	expect(advance.status).toBe('accepted');
	await expect
		.poll(() =>
			page.evaluate(
				() => (window.__rt!.state.session as { combat?: { turn?: number } }).combat?.turn,
			),
		)
		.toBe(1);
});

// Each combat row used to be a `role="button"` with `aria-label={`Select ${name}`}`. An aria-label
// on a role=button REPLACES the entire descendant subtree, so a screen-reader DM heard only
// "Select Bog Lurker, toggle button" — no HP, no AC, no conditions, no whose-turn — while the
// nested condition-remove and Heal/Damage buttons made it an axe `nested-interactive` violation
// (serious). The name is now the control and the row is a plain list item.
test('a combat row exposes its stats and selects via a real control, not a wrapper button', async ({
	page,
}) => {
	// The row is no longer a button, so nothing named "Select <name>" exists any more…
	await expect(page.getByRole('button', { name: 'Select Bog Lurker' })).toHaveCount(0);
	// …and the initiative order announces itself as a list of combatants.
	const order = page.getByRole('list').filter({ hasText: 'Bog Lurker' }).first();
	await expect(order.getByRole('listitem')).toHaveCount(2);

	// The row's content is reachable to assistive tech instead of being erased by the label.
	const row = order.getByRole('listitem').filter({ hasText: 'Bog Lurker' });
	await expect(row).toContainText('AC 13');
	// Both quick-HP controls are real, non-nested buttons within the row.
	await expect(row.getByRole('button', { name: 'Heal 1' })).toHaveCount(1);
	await expect(row.getByRole('button', { name: 'Damage 1' })).toHaveCount(1);

	// The name is the selection control, and it carries the toggle state the row used to hold.
	const nameButton = page.getByRole('button', { name: 'Bog Lurker', exact: true });
	await expect(nameButton).toHaveAttribute('aria-pressed', 'false');
	await nameButton.click();
	await expect(nameButton).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('Selected · Bog Lurker')).toBeVisible();

	// It is keyboard-operable in its own right (the old row relied on a hand-rolled key handler).
	const other = page.getByRole('button', { name: 'Reed Stalker', exact: true });
	await other.focus();
	await expect(other).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByText('Selected · Reed Stalker')).toBeVisible();
	await expect(other).toHaveAttribute('aria-pressed', 'true');
	await expect(nameButton).toHaveAttribute('aria-pressed', 'false');

	// Whose turn it is survives as machine-readable state, not just a coloured rail.
	await expect(order.locator('li[aria-current="true"]')).toHaveCount(1);
	await expect(order.locator('li[aria-current="true"]')).toContainText('Bog Lurker');
});

// The name + badge row had no `flexWrap`, and every child in it is shrinkable (the name button sets
// minWidth:0 + text-overflow:ellipsis; Badge sets minWidth:0 + overflow-wrap:anywhere). On a 391px
// phone the row is left roughly 183px after the initiative span, avatar, quick-HP buttons and
// paddings — less than the "Active" and "Bloodied" badges alone need — so the thing that gave way
// was the COMBATANT'S NAME. A DM on a phone could not read who was up.
test('a long combatant name is not squeezed away by its status badges', async ({ page }) => {
	const LONG = 'Grand Vizier of the Sunken Reliquary';
	const restarted = await page.evaluate(async (name) => {
		const rt = window.__rt!;
		const ended = await rt.dispatch({
			type: 'combat.end',
			actorId: rt.defaultActorId,
			payload: {},
		});
		if (ended.status !== 'accepted') return { step: 'end', ...ended };
		return {
			step: 'restart',
			...(await rt.dispatch({
				type: 'combat.start',
				actorId: rt.defaultActorId,
				payload: {
					combatants: [
						{ kind: 'monster', name, ac: 17, initiative: 20, maxHp: 60 },
						{ kind: 'monster', name: 'Reed Stalker', ac: 12, initiative: 9, maxHp: 14 },
					],
				},
			})),
		};
	}, LONG);
	expect(restarted.status, `${restarted.step}: ${JSON.stringify(restarted.rejection ?? {})}`).toBe(
		'accepted',
	);

	// It is the active combatant, so it also carries the "Active" badge.
	const nameButton = page.getByRole('button', { name: LONG, exact: true });
	await expect(nameButton).toBeVisible();
	await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();

	const geometry = await nameButton.evaluate((el) => {
		const line = el.parentElement!;
		const badge = [...line.children].find((c) => c !== el && /Active/.test(c.textContent ?? ''));
		const name = el.getBoundingClientRect();
		return {
			clipped: el.scrollWidth - el.clientWidth,
			nameWidth: name.width,
			nameBottom: name.bottom,
			lineWidth: line.getBoundingClientRect().width,
			badgeTop: badge ? badge.getBoundingClientRect().top : null,
		};
	});

	if (geometry.clipped > 0) {
		// A name longer than a whole line legitimately ellipsizes — but it must own the ENTIRE line,
		// i.e. the badges wrapped below instead of competing for the same ~183px. That is the fix.
		expect(geometry.nameWidth).toBeGreaterThan(geometry.lineWidth * 0.95);
		expect(geometry.badgeTop).not.toBeNull();
		expect(geometry.badgeTop!).toBeGreaterThanOrEqual(geometry.nameBottom - 1);
	} else {
		// Wide enough for both: nothing is hidden behind an ellipsis at all.
		expect(geometry.clipped).toBeLessThanOrEqual(1);
	}
});

// Next turn / Previous turn / Heal / Damage were the only durable writes on /session that pass no
// `ok` string to the dispatch helper, so no toast fired — and `aria-current` moving between list
// items is not announced either. A screen-reader DM pressed "Next turn" and heard nothing at all.
test('the tracker announces whose turn it is, and the HP controls name their combatant', async ({
	page,
}) => {
	// The readout is permanently mounted (a status node inserted together with its text is routinely
	// dropped) and lives OUTSIDE the initiative <ul> so it cannot join the list's text.
	const order = page.getByRole('list').filter({ hasText: 'Bog Lurker' }).first();
	const readout = page
		.getByRole('status')
		.filter({ hasText: /Round \d+, turn \d+/ })
		.first();
	await expect(readout).toHaveCount(1);
	await expect(readout).toContainText('Bog Lurker');
	await expect(order.getByRole('status')).toHaveCount(0);

	// Advancing the turn changes the region's CONTENTS, which is what makes it announce.
	await page.getByRole('button', { name: 'Next turn' }).click();
	await expect(readout).toContainText('Reed Stalker');

	// With six combatants, six buttons all named "Heal 1" gave a screen-reader DM no way to tell
	// which creature's durable HP they were about to write.
	const row = order.getByRole('listitem').filter({ hasText: 'Bog Lurker' });
	await expect(row.getByRole('button', { name: 'Heal 1 HP — Bog Lurker' })).toHaveCount(1);
	await expect(row.getByRole('button', { name: 'Damage 1 HP — Bog Lurker' })).toHaveCount(1);
	// Distinct per row — the whole point.
	await expect(page.getByRole('button', { name: 'Heal 1 HP — Reed Stalker' })).toHaveCount(1);
});
