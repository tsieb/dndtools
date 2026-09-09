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

	// Advancing the turn changes the region's CONTENTS, which is what makes it announce. Scoped to
	// the console: RC-SES-1.2's quick panel carries its own "Next turn" in the desktop right rail,
	// which is a sibling landmark, not a second copy of this one.
	await page.locator('#main-content').getByRole('button', { name: 'Next turn' }).click();
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

// RC-MAP-2.6 — archiving a session (`session.set-workflow {workflow:'recap'}`) snapshots the WHOLE
// `combat` slice, so a map that had combat tokens on it at archive time carries them into
// `SessionArchiveSnapshot.combat.tokens` untouched (RC-MAP-1.1's auto-place-on-`combat.start` put them
// there). `PrepRecap.tsx`'s `ArchiveFinalMap` reads that straight off the selected archive.
test.describe('session: the archived encounter shows its final map', () => {
	test('the recap panel shows a positions thumbnail for the map combat ended on', async ({
		page,
	}) => {
		await markOnboarded(page);
		await gotoRoute(page, '/session');
		await seedFresh(page);
		await gotoRoute(page, '/session');

		const result = await page.evaluate(async () => {
			const rt = window.__rt!;
			const state = rt.state as unknown as {
				commandCenter: { homeSceneId: string | null };
				scenes: { scenes: Record<string, { id: string; isTemplate?: boolean }> };
			};
			const sceneId =
				state.commandCenter.homeSceneId ??
				Object.values(state.scenes.scenes).find((s) => !s.isTemplate)?.id;

			const map = await rt.dispatch({
				type: 'map.create',
				actorId: rt.defaultActorId,
				payload: {
					name: 'Final Stand',
					visibility: 'dm-only',
					projection: { kind: 'flat', rotationDegrees: 0 },
					initialLayers: [{ name: 'Base', category: 'base', visibility: 'dm-only' }],
				},
			});
			if (map.status !== 'accepted') return { step: 'create map', ...map };
			const mapId = (map.events?.find((e) => e.kind === 'map.created') as { mapId?: string })
				?.mapId;

			// session.set-active-map requires a Command Center home Scene to exist first.
			const home = await rt.dispatch({
				type: 'command-center.ensure-home',
				actorId: rt.defaultActorId,
				payload: {},
			});
			if (home.status !== 'accepted') return { step: 'ensure command center home', ...home };

			const activated = await rt.dispatch({
				type: 'session.set-active-map',
				actorId: rt.defaultActorId,
				payload: { mapId },
			});
			if (activated.status !== 'accepted') return { step: 'set active map', ...activated };

			const live = await rt.dispatch({
				type: 'session.set-workflow',
				actorId: rt.defaultActorId,
				payload: { workflow: 'active', activeSceneId: sceneId },
			});
			if (live.status !== 'accepted') return { step: 'go live', ...live };

			// combat.start auto-places tokens on the active map (RC-MAP-1.1).
			const started = await rt.dispatch({
				type: 'combat.start',
				actorId: rt.defaultActorId,
				payload: {
					combatants: [
						{ kind: 'character', name: 'Ardyn', ac: 16, initiative: 15, maxHp: 24 },
						{ kind: 'monster', name: 'Bog Lurker', ac: 13, initiative: 9, maxHp: 22 },
					],
				},
			});
			if (started.status !== 'accepted') return { step: 'start combat', ...started };

			const recap = await rt.dispatch({
				type: 'session.set-workflow',
				actorId: rt.defaultActorId,
				payload: { workflow: 'recap' },
			});
			if (recap.status !== 'accepted') return { step: 'recap', ...recap };
			return { step: 'done', status: 'accepted', mapId };
		});
		expect(result.status, `${result.step}: ${JSON.stringify(result.rejection ?? {})}`).toBe(
			'accepted',
		);

		// The panel's own map-name label, from the archive's `activeMap.mapId` resolved against
		// the actor's map list — proves the thumbnail is keyed to the right archive/map.
		await expect(page.getByText('Final board — Final Stand')).toBeVisible();

		const tokensPersisted = await page.evaluate(() => {
			const archives = window.__rt!.state.session.archives as Record<
				string,
				{ combat: { tokens: Record<string, { mapId: string }> } }
			>;
			const archive = Object.values(archives)[0];
			return archive ? Object.keys(archive.combat.tokens).length : 0;
		});
		expect(tokensPersisted).toBe(2);
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

// The top bar's own live-session control performed the IDENTICAL `session.set-workflow {idle}`
// teardown as the phase rail above — from every route in the app, and on a phone as a single
// icon-only 48x48 tap — with no confirmation at all. Its glyph was `audio-off`, a muted speaker, so
// the app's most destructive control read as "mute audio".
test.describe('the top bar cannot end a live session by accident', () => {
	const endControl = (page: Page) => page.getByRole('button', { name: 'End live session' });
	// On a phone the whole top-bar control cluster collapses into the "Table controls" bottom sheet
	// (`AppShell.tsx`), so the control only exists once that is open.
	const reachTopBar = async (page: Page) => {
		const opener = page.getByRole('button', { name: 'Table controls' });
		if ((await opener.count()) > 0) await opener.click();
		await expect(endControl(page)).toBeVisible();
	};

	test.beforeEach(async ({ page }) => {
		await reachTopBar(page);
	});

	test('asks first, and Stay live leaves the session and the combat untouched', async ({
		page,
	}) => {
		expect(await page.evaluate(() => window.__rt!.state.session.workflow)).toBe('active');
		expect(await combatStatus(page)).toBe('running');

		await endControl(page).click();
		const confirm = page.getByRole('dialog', { name: 'End the live session?' });
		await expect(confirm).toBeVisible();
		// Nothing has moved yet — that is the whole point of the guard.
		expect(await page.evaluate(() => window.__rt!.state.session.workflow)).toBe('active');
		expect(await combatStatus(page)).toBe('running');

		await confirm.getByRole('button', { name: 'Stay live' }).click();
		await expect(confirm).toBeHidden();
		expect(await page.evaluate(() => window.__rt!.state.session.workflow)).toBe('active');
		expect(await combatStatus(page)).toBe('running');
	});

	test('confirming from the top bar really does end it', async ({ page }) => {
		await endControl(page).click();
		await page
			.getByRole('dialog', { name: 'End the live session?' })
			.getByRole('button', { name: 'End session' })
			.click();
		await expect.poll(() => page.evaluate(() => window.__rt!.state.session.workflow)).toBe('idle');
	});

	// A muted speaker is the wrong sign for "tear the session down" — and on the compact phone form
	// the glyph is the only thing the control shows.
	test('does not wear a muted-speaker glyph', async ({ page }) => {
		await expect(endControl(page).locator('svg.lucide-volume-x')).toHaveCount(0);
		await expect(endControl(page).locator('svg.lucide-x')).toHaveCount(1);
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

// RC-SES-1.2 — the session quick panel. The point of the panel is that it is NOT on /session: the
// DM can look something up in the knowledge base and still run the turn order, so the acceptance
// case advances a turn from /knowledge on both profiles.
test.describe('session quick panel', () => {
	/** Open the panel for this viewport: desktop has the rail already, narrower tiers use the trigger. */
	async function openQuickPanel(page: Page): Promise<void> {
		const trigger = page.getByTestId('session-quick-trigger');
		if (await trigger.isVisible()) await trigger.click();
	}

	/** `combat.turn` is the index into the initiative order — advancing a turn must move it. */
	function turnCursor(page: Page): Promise<string> {
		return page.evaluate(() => {
			const combat = (window.__rt!.state.session as { combat: { round: number; turn: number } })
				.combat;
			return `${combat.round}:${combat.turn}`;
		});
	}

	test('advances a turn from /knowledge', async ({ page }) => {
		await gotoRoute(page, '/knowledge');
		await openQuickPanel(page);

		const before = await turnCursor(page);
		const next = page.getByTestId('quick-next-turn');
		await expect(next).toBeVisible();
		await next.click();

		await expect.poll(() => turnCursor(page)).not.toBe(before);
		// Still off /session — the whole point of the panel.
		expect(page.url()).toContain('/knowledge');
	});

	test('rolls a die from the quick dice bar while off /session', async ({ page }) => {
		await gotoRoute(page, '/knowledge');
		await openQuickPanel(page);

		const rolls = () =>
			page.evaluate(
				() => (window.__rt!.state.session as { diceHistory?: unknown[] }).diceHistory?.length ?? 0,
			);
		const before = await rolls();
		await page.getByTestId('quick-die-d20').click();
		await expect.poll(rolls).toBeGreaterThan(before);
	});
});

// RC-SES-3.2 — the one-handed HP sheet. The row's ±1 steps are fine for chip damage; a real hit
// lands for 14, and the only way to enter 14 used to be fourteen taps. Tap-and-hold the HP bar (or
// press `d`/`h`) for a keypad, and every write it makes is reversible for five seconds.
test.describe('one-handed HP sheet and undo', () => {
	/** Read a combatant's live HP out of the core rather than off the bar's rendered width. */
	function hpOf(page: Page, name: string): Promise<number | undefined> {
		return page.evaluate((n) => {
			const combat = (
				window.__rt!.state.session as {
					combat?: {
						combatants?: Record<
							string,
							{ name: string; resources?: { hp: number; tempHp: number } }
						>;
					};
				}
			).combat;
			return Object.values(combat?.combatants ?? {}).find((c) => c.name === n)?.resources?.hp;
		}, name);
	}

	function tempHpOf(page: Page, name: string): Promise<number | undefined> {
		return page.evaluate((n) => {
			const combat = (
				window.__rt!.state.session as {
					combat?: {
						combatants?: Record<
							string,
							{ name: string; resources?: { hp: number; tempHp: number } }
						>;
					};
				}
			).combat;
			return Object.values(combat?.combatants ?? {}).find((c) => c.name === n)?.resources?.tempHp;
		}, name);
	}

	test('the HP bar opens a keypad that applies a whole hit, then undoes it exactly', async ({
		page,
	}) => {
		expect(await hpOf(page, 'Bog Lurker')).toBe(22);
		await page.getByRole('button', { name: 'Adjust hit points — Bog Lurker' }).click();

		const sheet = page.getByRole('dialog').filter({ hasText: 'Hit points — Bog Lurker' });
		await expect(sheet).toBeVisible();
		await sheet.getByRole('button', { name: 'Digit 1' }).click();
		await sheet.getByRole('button', { name: 'Digit 4' }).click();
		await sheet.getByRole('button', { name: 'Damage', exact: true }).click();

		await expect.poll(() => hpOf(page, 'Bog Lurker')).toBe(8);
		await expect(sheet).toHaveCount(0);

		// The undo chip names what it will reverse — with six combatants "Undo" alone is a guess.
		const undo = page.getByRole('button', { name: 'Undo Damage 14 · Bog Lurker' });
		await expect(undo).toBeVisible();
		await undo.click();
		await expect.poll(() => hpOf(page, 'Bog Lurker')).toBe(22);
		await expect(undo).toHaveCount(0);
	});

	test('d damages and h heals the selected combatant from the keyboard', async ({ page }) => {
		await page.getByRole('button', { name: 'Reed Stalker', exact: true }).click();
		await expect(page.getByText('Selected · Reed Stalker')).toBeVisible();

		await page.keyboard.press('d');
		const damageSheet = page.getByRole('dialog').filter({ hasText: 'Hit points — Reed Stalker' });
		await expect(damageSheet).toBeVisible();
		// Typed, not tapped: Enter applies the intent the sheet was opened with.
		await page.keyboard.type('5');
		await page.keyboard.press('Enter');
		await expect.poll(() => hpOf(page, 'Reed Stalker')).toBe(9);

		await page.keyboard.press('h');
		const healSheet = page.getByRole('dialog').filter({ hasText: 'Hit points — Reed Stalker' });
		await expect(healSheet).toBeVisible();
		await page.keyboard.type('3');
		await page.keyboard.press('Enter');
		await expect.poll(() => hpOf(page, 'Reed Stalker')).toBe(12);
	});

	test('a press-and-hold on the HP bar opens the same sheet', async ({ page }) => {
		const bar = page.getByRole('button', { name: 'Adjust hit points — Reed Stalker' });
		// Synthesised mouse coordinates are VIEWPORT coordinates, so the bar has to be on screen
		// before its box is read. On a phone the second row sits below the fold as soon as the rows
		// grow (RC-SES-3.3 added a third row action), and the press then landed on nothing.
		await bar.scrollIntoViewIfNeeded();
		const box = await bar.boundingBox();
		expect(box).not.toBeNull();
		await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
		await page.mouse.down();
		await page.waitForTimeout(700);
		await page.mouse.up();

		const sheet = page.getByRole('dialog').filter({ hasText: 'Hit points — Reed Stalker' });
		await expect(sheet).toBeVisible();
		// The trailing click of the hold must not re-open or double-fire anything.
		await expect(page.getByRole('dialog')).toHaveCount(1);
	});

	test('temporary hit points say plainly that they cannot be undone', async ({ page }) => {
		await page.getByRole('button', { name: 'Adjust hit points — Bog Lurker' }).click();
		const sheet = page.getByRole('dialog').filter({ hasText: 'Hit points — Bog Lurker' });
		await sheet.getByRole('button', { name: 'Digit 6' }).click();
		await sheet.getByRole('button', { name: 'Temp', exact: true }).click();

		await expect.poll(() => tempHpOf(page, 'Bog Lurker')).toBe(6);
		// No dead undo control: the core keeps the higher temp HP and has no command to lower it.
		await expect(page.getByText('Temporary hit points keep the higher value')).toBeVisible();
		await expect(page.getByRole('button', { name: /^Undo / })).toHaveCount(0);
	});
});

// RC-SES-3.4 — the tracker keyboard model: `n`/`p` advance/retreat the turn, arrow keys move the
// row cursor, Enter opens the selected row's detail panel, and Alt+Arrow reorders with an
// announcement (the earlier/later buttons have none of their own).
test.describe('tracker keyboard model', () => {
	function turnCursor(page: Page): Promise<string> {
		return page.evaluate(() => {
			const combat = (window.__rt!.state.session as { combat: { round: number; turn: number } })
				.combat;
			return `${combat.round}:${combat.turn}`;
		});
	}

	function order(page: Page): Promise<string> {
		return page.evaluate(
			() =>
				(window.__rt!.state.session as { combat: { order: string[] } }).combat.order?.join(',') ??
				'',
		);
	}

	test('n advances the turn, p retreats it', async ({ page }) => {
		const before = await turnCursor(page);
		await page.keyboard.press('n');
		await expect.poll(() => turnCursor(page)).not.toBe(before);
		await page.keyboard.press('p');
		await expect.poll(() => turnCursor(page)).toBe(before);
	});

	test('arrow keys move the row cursor down and up the initiative order', async ({ page }) => {
		await expect(page.getByText(/^Selected · /)).toHaveCount(0);
		await page.keyboard.press('ArrowDown');
		await expect(page.getByText('Selected · Bog Lurker')).toBeVisible();
		await page.keyboard.press('ArrowDown');
		await expect(page.getByText('Selected · Reed Stalker')).toBeVisible();
		await page.keyboard.press('ArrowUp');
		await expect(page.getByText('Selected · Bog Lurker')).toBeVisible();
	});

	test('Enter opens the selected row detail by moving focus into it', async ({ page }) => {
		await page.keyboard.press('ArrowDown');
		await expect(page.getByText('Selected · Bog Lurker')).toBeVisible();
		await page.keyboard.press('Enter');
		const focused = await page.evaluate(() => document.activeElement?.tagName);
		expect(focused).toBe('BUTTON');
		// The row's own name toggle is a BUTTON too — Enter must have moved focus somewhere inside the
		// detail panel below the list, not left it on the row.
		await expect(page.locator(':focus')).not.toHaveText('Bog Lurker');
	});

	test('Alt+ArrowDown reorders the selected combatant later, and announces it', async ({
		page,
	}) => {
		const before = await order(page);
		await page.keyboard.press('ArrowDown'); // selects the first combatant in the order
		await page.keyboard.press('Alt+ArrowDown');

		await expect.poll(() => order(page)).not.toBe(before);
		await expect(
			page.getByRole('status').filter({ hasText: /moved later in initiative/ }),
		).toBeVisible();
	});
});

// RC-CHR-1.3 — CONCENTRATION AND DEATH SAVES on the tracker. The tracker view has derived
// `isConcentrating`/`isDying` since SES-002 and painted neither, and damage taken by a concentrating
// caster asked for nothing at all. Both are now on the row, and the check is a real prompt: the app
// states the DC, the table rolls, and one of two buttons records what happened.
test.describe('concentration and death saves on the tracker', () => {
	/** Put the first combatant on a concentration effect through the Core. */
	async function concentrateOnBlur(page: Page): Promise<void> {
		const result = await page.evaluate(async () => {
			const rt = window.__rt!;
			const combat = (rt.state.session as { combat: { order: string[] } }).combat;
			return rt.dispatch({
				type: 'combat.apply-resource',
				actorId: rt.defaultActorId,
				payload: { combatantId: combat.order[0], kind: 'concentration', effect: 'Blur' },
			});
		});
		expect(result.status).toBe('accepted');
	}

	test('a concentrating combatant says so, and damage asks for the check with its DC', async ({
		page,
	}) => {
		await concentrateOnBlur(page);
		await expect(page.getByText('Concentrating on Blur')).toBeVisible();
		// Nothing is owed yet — the prompt only appears once damage lands.
		await expect(page.getByText(/Concentration check, DC/)).toHaveCount(0);

		await page.getByRole('button', { name: /^Damage 1 HP.*Bog Lurker/ }).click();
		await expect(page.getByText('Concentration check, DC 10')).toBeVisible();
		// The effect is still running: the app asked a question, it did not decide the answer.
		await expect(page.getByText('Concentrating on Blur')).toBeVisible();
	});

	test('Kept it clears the prompt and leaves the effect running', async ({ page }) => {
		await concentrateOnBlur(page);
		await page.getByRole('button', { name: /^Damage 1 HP.*Bog Lurker/ }).click();
		await expect(page.getByText('Concentration check, DC 10')).toBeVisible();

		await page.getByRole('button', { name: 'Keep concentration for Bog Lurker' }).click();
		await expect(page.getByText(/Concentration check, DC/)).toHaveCount(0);
		await expect(page.getByText('Concentrating on Blur')).toBeVisible();
	});

	test('Lost it ends the concentration, and the durable state agrees', async ({ page }) => {
		await concentrateOnBlur(page);
		await page.getByRole('button', { name: /^Damage 1 HP.*Bog Lurker/ }).click();
		await page.getByRole('button', { name: 'Drop concentration for Bog Lurker' }).click();

		await expect(page.getByText(/Concentration check, DC/)).toHaveCount(0);
		await expect(page.getByText('Concentrating on Blur')).toHaveCount(0);
		await expect
			.poll(() =>
				page.evaluate(() => {
					const combat = (
						window.__rt!.state.session as {
							combat: {
								order: string[];
								combatants: Record<
									string,
									{ resources: { concentration: { effect: string | null } } }
								>;
							};
						}
					).combat;
					return combat.combatants[combat.order[0]!]!.resources.concentration.effect;
				}),
			)
			.toBe(null);
	});

	test('a combatant kept at 0 HP reads as dying and its death saves are recordable', async ({
		page,
	}) => {
		const down = await page.evaluate(async () => {
			const rt = window.__rt!;
			const combat = (rt.state.session as { combat: { order: string[] } }).combat;
			const combatantId = combat.order[0];
			const damaged = await rt.dispatch({
				type: 'combat.apply-resource',
				actorId: rt.defaultActorId,
				payload: { combatantId, kind: 'hp', delta: -99 },
			});
			if (damaged.status !== 'accepted') return damaged;
			return rt.dispatch({
				type: 'combat.apply-resource',
				actorId: rt.defaultActorId,
				payload: { combatantId, kind: 'defeated', value: false },
			});
		});
		expect(down.status).toBe('accepted');

		await expect(page.getByText('Dying')).toBeVisible();
		await expect(page.getByText('Death saves 0 of 3 kept, 0 of 3 failed')).toBeVisible();

		await page.getByRole('button', { name: 'Record a death save success for Bog Lurker' }).click();
		await expect(page.getByText('Death saves 1 of 3 kept, 0 of 3 failed')).toBeVisible();
		await page.getByRole('button', { name: 'Record a death save failure for Bog Lurker' }).click();
		await expect(page.getByText('Death saves 1 of 3 kept, 1 of 3 failed')).toBeVisible();
	});
});

// RC-SES-3.1 — a condition with a duration wears its countdown on the badge, and when the round tick
// runs it out the tracker SAYS so. A badge quietly vanishing between rounds is indistinguishable
// from a bug, and the DM has no other place to find out why the poison stopped applying.
test('a timed condition counts down on its badge and announces when it wears off', async ({
	page,
}) => {
	const combatantId = await page.evaluate(
		() => (window.__rt!.state.session as { combat: { order: string[] } }).combat.order[0]!,
	);
	const applied = await dispatch(page, {
		type: 'combat.apply-resource',
		actorId: await page.evaluate(() => window.__rt!.defaultActorId),
		payload: { combatantId, kind: 'condition', condition: 'poisoned', present: true, rounds: 2 },
	});
	expect(applied.status, JSON.stringify(applied.rejection ?? {})).toBe('accepted');

	const row = page
		.getByRole('list')
		.filter({ hasText: 'Bog Lurker' })
		.first()
		.getByRole('listitem')
		.filter({ hasText: 'Bog Lurker' });
	// The countdown is on the badge, and it is named for a screen reader rather than left a bare "2".
	await expect(row.getByLabel('2 rounds left')).toBeVisible();

	const nextTurn = page.locator('#main-content').getByRole('button', { name: 'Next turn' });
	// Two presses wrap round 1 into round 2 — one tick, one round left.
	await nextTurn.click();
	await nextTurn.click();
	await expect(row.getByLabel('1 round left')).toBeVisible();

	// Two more presses run it out. The badge goes, and a toast names what wore off and whose it was.
	await nextTurn.click();
	await nextTurn.click();
	await expect(page.getByText('Poisoned wore off Bog Lurker')).toBeVisible();
	await expect(row.getByLabel(/rounds? left/)).toHaveCount(0);
	const remaining = await page.evaluate(
		(id) =>
			(
				window.__rt!.state.session as {
					combat: { combatants: Record<string, { resources: { conditions: string[] } }> };
				}
			).combat.combatants[id]!.resources.conditions,
		combatantId,
	);
	expect(remaining).toEqual([]);
});

// ── RC-MAP-2.1 · tracker ↔ map token selection ───────────────────────────────────────────────────
//
// "Which combatant am I looking at" is one question asked in two places: the map's token layer and the
// editor's initiative list. Before RC-MAP-2.1 they were unrelated, so finding a creature on the map
// told the tracker nothing and the DM re-found it by eye every time. This is the sync case: the two
// surfaces share one selection through `SessionSelection`, in both directions.

test('a combatant selected on the map is the combatant selected in the initiative list, and back', async ({
	page,
}, testInfo) => {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const mapName = `Sync Bog ${Date.now()}`;
	const created = await dispatch(page, {
		type: 'map.create',
		actorId,
		payload: {
			name: mapName,
			visibility: 'dm-only',
			projection: { kind: 'flat', rotationDegrees: 0 },
			initialLayers: [{ name: 'Base', category: 'base', visibility: 'dm-only' }],
		},
	});
	expect(created.status, JSON.stringify(created.rejection ?? {})).toBe('accepted');
	const mapId = (created.events ?? []).find((e) => e.kind === 'map.created')?.mapId as string;
	expect(mapId).toBeTruthy();

	const combatantIds = await page.evaluate(
		() => (window.__rt!.state.session as { combat: { order: string[] } }).combat.order,
	);
	const spots = [
		{ x: 0.35, y: 0.35 },
		{ x: 0.65, y: 0.65 },
	];
	for (const [index, combatantId] of combatantIds.entries()) {
		const placed = await dispatch(page, {
			type: 'combat.place-token',
			actorId,
			payload: { combatantId, mapId, ...spots[index]! },
		});
		expect(placed.status, JSON.stringify(placed.rejection ?? {})).toBe('accepted');
	}

	// Reach the editor by moving the HashRouter fragment: a full navigation would reload the app and
	// re-hydrate, and this spec is about the LIVE session's combat.
	await page.evaluate(() => {
		window.location.hash = '#/atlas';
	});
	await expect(page.getByRole('button', { name: mapName, exact: true })).toBeVisible();
	await page.getByRole('button', { name: mapName, exact: true }).click();
	await page.getByRole('button', { name: 'Open in map editor' }).click();
	await expect(page.getByRole('dialog', { name: `Map editor — ${mapName}` })).toBeVisible();

	const layer = page.getByRole('group', { name: 'Combat tokens' });
	const lurker = layer.getByRole('button', { name: /^Bog Lurker\./ });
	const stalker = layer.getByRole('button', { name: /^Reed Stalker\./ });

	// On the phone the dock lives behind a MODAL bottom sheet, which hides the canvas from the
	// accessibility tree while it is open — so the two halves of the sync are asserted with the sheet
	// closed, exactly as a DM on a phone sees them.
	const phone = testInfo.project.name === 'mobile-chromium';
	const panels = page.getByRole('button', { name: 'Panels' });
	const openDock = async () => {
		if (!phone) return;
		await panels.click();
		await expect(page.getByRole('dialog', { name: 'Map panels' })).toBeVisible();
	};
	const closeDock = async () => {
		if (!phone) return;
		// The sheet is modal, so the Panels toggle behind it is out of the accessibility tree: the
		// sheet's own Close is the way out, exactly as it is for the DM.
		await page
			.getByRole('dialog', { name: 'Map panels' })
			.getByRole('button', { name: 'Close' })
			.click();
		await expect(page.getByRole('dialog', { name: 'Map panels' })).toBeHidden();
	};

	// Map → tracker: activating a token hands the Inspector to that combatant.
	await lurker.click();
	await openDock();
	await expect(page.getByText('Combatant', { exact: true })).toBeVisible();
	await closeDock();
	await expect(lurker).toHaveAttribute('aria-pressed', 'true');
	await expect(stalker).toHaveAttribute('aria-pressed', 'false');

	// Tracker → map: clearing returns the initiative list, and picking the other row moves the ring on
	// the canvas without the DM touching the canvas at all.
	await openDock();
	await page.getByRole('button', { name: 'Clear combatant selection' }).click();
	await page
		.getByRole('list', { name: 'Combat' })
		.getByRole('button', { name: /Reed Stalker/ })
		.click();
	await closeDock();
	await expect(stalker).toHaveAttribute('aria-pressed', 'true');
	await expect(lurker).toHaveAttribute('aria-pressed', 'false');
});
