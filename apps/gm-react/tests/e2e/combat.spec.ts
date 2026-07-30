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
	expect(result.status, `${result.step}: ${JSON.stringify(result.rejection ?? {})}`).toBe('accepted');
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
		await expect
			.poll(() => combatStatus(page), { timeout: 5_000 })
			.not.toBe('running');
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
