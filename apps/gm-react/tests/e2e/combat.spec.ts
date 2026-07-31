import { expect, test, type Page } from '@playwright/test';
import { dispatch, enterPreview, gotoRoute, markOnboarded, seedFresh } from './_helpers';

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

// The `recap` workflow was a DEAD END. `recap`'s only legal transitions are recap/archived/idle, so
// the phase Seg had Prep and Live disabled and Recap already checked — no enabled exit — while the
// standby card's "Go live" was fully enabled and every press produced a guaranteed core rejection.
// A DM who ended one session into Recap could not start another without editing IndexedDB.
test.describe('session: Recap is not a dead end', () => {
	test('offers Standby as a real exit and explains why Go live is unavailable', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);
		await gotoRoute(page, '/session');

		const toRecap = await page.evaluate(async () => {
			const rt = window.__rt!;
			const state = rt.state as unknown as {
				commandCenter: { homeSceneId: string | null };
				scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
			};
			const sceneId =
				state.commandCenter.homeSceneId ??
				Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id;
			const live = await rt.dispatch({
				type: 'session.set-workflow',
				actorId: rt.defaultActorId,
				payload: { workflow: 'active', activeSceneId: sceneId },
			});
			if (live.status !== 'accepted') return { step: 'go live', ...live };
			return {
				step: 'recap',
				...(await rt.dispatch({
					type: 'session.set-workflow',
					actorId: rt.defaultActorId,
					payload: { workflow: 'recap' },
				})),
			};
		});
		expect(toRecap.status, `${toRecap.step}: ${toRecap.rejection?.message ?? ''}`).toBe('accepted');

		const phases = page.getByRole('radiogroup', { name: 'Session phase' });
		await expect(phases.getByRole('radio', { name: 'Recap' })).toHaveAttribute(
			'aria-checked',
			'true',
		);
		// The exit. Before this it did not exist at all, and the other three were disabled/checked.
		const standby = phases.getByRole('radio', { name: 'Standby' });
		await expect(standby).toBeEnabled();

		// The card names the state it is actually in, and Go live explains itself rather than firing
		// a transition the core forbids. Soft-disabled: still focusable, still announced.
		await expect(page.getByText(/Session is in Recap/)).toHaveCount(1);
		const goLive = page.getByRole('button', { name: 'Go live', exact: true });
		await expect(goLive).toHaveAttribute('aria-disabled', 'true');
		expect(await goLive.evaluate((el: HTMLButtonElement) => el.disabled)).toBe(false);
		await expect(goLive).toHaveAttribute('title', /return to Standby/i);

		// It really is swallowed: no rejection toast, and the workflow does not move.
		await goLive.dispatchEvent('click');
		await page.waitForTimeout(200);
		expect(await page.evaluate(() => window.__rt!.state.session.workflow)).toBe('recap');

		// And Standby genuinely gets the DM out.
		await standby.click();
		await expect.poll(() => page.evaluate(() => window.__rt!.state.session.workflow)).toBe('idle');
	});
});

// The phase Seg's "Standby" option was added to give the `recap` workflow an exit, but it is offered
// from `active` too — and from there `session.set-workflow {workflow:'idle'}` runs the core's
// `resetLiveSessionFields`, which nulls the active scene and map and wipes combat (the round, the
// whole initiative order, every combatant's HP and conditions), the delivered handouts, the timers
// and the dice log — WITHOUT writing an archive. That is a strict superset of what `combat.end`
// discards, and `combat.end` has had a danger confirm since run #5. Worse, `Seg` is
// selection-follows-focus, so from Live it was one ArrowLeft away.
test.describe('leaving a LIVE session for standby is confirmed', () => {
	const phases = (page: Page) => page.getByRole('radiogroup', { name: 'Session phase' });

	test('choosing Standby while live asks first and keeps the combat running', async ({ page }) => {
		expect(await combatStatus(page)).toBe('running');
		await phases(page).getByRole('radio', { name: 'Standby' }).click();

		const confirm = page.getByRole('dialog', { name: 'End the live session?' });
		await expect(confirm).toBeVisible();
		// Nothing has moved yet.
		expect(await page.evaluate(() => window.__rt!.state.session.workflow)).toBe('active');
		expect(await combatStatus(page)).toBe('running');

		await confirm.getByRole('button', { name: 'Stay live' }).click();
		await expect(confirm).toBeHidden();
		expect(await page.evaluate(() => window.__rt!.state.session.workflow)).toBe('active');
		expect(await combatStatus(page)).toBe('running');
		await expect(page.getByRole('button', { name: 'End combat' })).toBeVisible();
	});

	test('confirming really does end it', async ({ page }) => {
		await phases(page).getByRole('radio', { name: 'Standby' }).click();
		await page
			.getByRole('dialog', { name: 'End the live session?' })
			.getByRole('button', { name: 'End session' })
			.click();
		await expect.poll(() => page.evaluate(() => window.__rt!.state.session.workflow)).toBe('idle');
	});

	// Moving to Prep or Recap is not destructive, so those stay one press — but they were also
	// completely silent, while the identical transition fired from the top bar toasts.
	test('a non-destructive phase change goes straight through, and says so', async ({ page }) => {
		await phases(page).getByRole('radio', { name: 'Recap' }).click();
		await expect(page.getByRole('dialog', { name: 'End the live session?' })).toHaveCount(0);
		await expect.poll(() => page.evaluate(() => window.__rt!.state.session.workflow)).toBe('recap');
		await expect(page.getByText('Session archived into Recap')).toBeVisible();
	});
});

// The phase Seg was the ONLY control on /session with no `previewing` / `isDm` gate — every one of
// the file's ~50 other `previewing` references has one. So previewing as a player on a LIVE session
// and pressing Standby (one ArrowLeft away, since Seg is selection-follows-focus) raised the full-red
// "End the live session?" dialog describing a teardown that discards the round, every combatant's HP
// and conditions, the handouts, the timers and the dice log — and then the core refused it read-only.
// The loudest possible lie about what a press was about to do.
test.describe('session: the phase rail respects player preview', () => {
	test('locks the phase options while previewing and never raises the teardown dialog', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);
		await gotoRoute(page, '/session');
		await startCombat(page);

		const phases = page.getByRole('radiogroup', { name: 'Session phase' });
		const standby = phases.getByRole('radio', { name: 'Standby' });
		// As the DM this is a real exit — that contract is asserted elsewhere and must not regress.
		await expect(standby).toBeEnabled();

		await enterPreview(page, 'player');

		// Every option except the one the session is actually in is now unavailable, and each says why
		// rather than being a mute 0.4-opacity dead control.
		await expect(standby).toBeDisabled();
		await expect(standby).toHaveAttribute('title', /player preview/i);
		await expect(phases.getByRole('radio', { name: 'Prep' })).toBeDisabled();
		await expect(phases.getByRole('radio', { name: 'Live' })).toHaveAttribute(
			'aria-checked',
			'true',
		);

		// Driving the click past the disabled attribute must still not open the danger dialog, and
		// the workflow must not move: the handler is guarded too, not only the rendering.
		await standby.dispatchEvent('click');
		await page.waitForTimeout(200);
		await expect(page.getByRole('alertdialog')).toHaveCount(0);
		await expect(page.getByText('End the live session?')).toHaveCount(0);
		expect(await page.evaluate(() => window.__rt!.state.session.workflow)).toBe('active');
	});
});

// Two /session controls hard-disabled themselves at exactly the moment the DM used them, dropping
// focus to <body> so the next Tab restarted at the top of the document: "Push to players" clears the
// handout title on success, and the initiative reorder chevrons run out of room at either end. Both
// are normal ways to use them, not error paths.
test.describe('/session controls do not disable themselves under the user’s focus', () => {
	test('Push to players stays focusable after a successful push, and says why when it is unavailable', async ({
		page,
	}) => {
		const push = page.getByRole('button', { name: 'Push to players' });
		await expect(push).toBeVisible();

		// Empty title: soft-disabled with a reason rather than removed from the tab order.
		await expect(push).toHaveAttribute('aria-disabled', 'true');
		await expect(push).toHaveAttribute('title', /Give the handout a title first/i);
		expect(await push.evaluate((el: HTMLButtonElement) => el.disabled)).toBe(false);
		await push.focus();
		await expect(push).toBeFocused();

		const title = `Torn Ledger Page ${Date.now()}`;
		await page.getByLabel('Handout title').fill(title);
		await expect(push).not.toHaveAttribute('aria-disabled', 'true');
		await push.click();

		// The push landed…
		await expect
			.poll(() =>
				page.evaluate(
					(t) =>
						Object.values(
							(window.__rt!.state.session as { handouts: Record<string, { title: string }> })
								.handouts,
						).some((h) => h.title === t),
					title,
				),
			)
			.toBe(true);
		// …and the button that did it is still there, still focusable, explaining its new state.
		await expect(push).toHaveAttribute('aria-disabled', 'true');
		expect(await push.evaluate((el: HTMLButtonElement) => el.disabled)).toBe(false);
		await push.focus();
		await expect(push).toBeFocused();
	});

	test('the initiative reorder chevrons stay focusable at the ends of the order', async ({
		page,
	}) => {
		// Select the first combatant so the reorder controls render for it.
		const rows = page.getByRole('button', { name: /Bog Lurker|Sable/ });
		await rows.first().click();

		const up = page.getByRole('button', { name: /Move .* earlier in initiative/ });
		await expect(up).toBeVisible();
		// The selected row is at one end for one of the two directions; whichever it is, the control
		// stays a real tab stop instead of vanishing from the order.
		const soft = await up.getAttribute('aria-disabled');
		expect(await up.evaluate((el: HTMLButtonElement) => el.disabled)).toBe(false);
		await up.focus();
		await expect(up).toBeFocused();

		if (soft === 'true') {
			// A press on the soft-disabled bound must not dispatch — the order is unchanged.
			const before = await page.evaluate(
				() =>
					(window.__rt!.state.session as { combat: { order: string[] } }).combat.order?.join(',') ??
					'',
			);
			await up.dispatchEvent('click');
			await page.waitForTimeout(200);
			expect(
				await page.evaluate(
					() =>
						(window.__rt!.state.session as { combat: { order: string[] } }).combat.order?.join(
							',',
						) ?? '',
				),
			).toBe(before);
		}
	});
});
