import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-SES-3.5 — ENCOUNTER BUILDER v2. The builder's first version could only compose a roster and
// immediately start a fight with it: nothing the DM built survived the click, so prep had to be
// redone at the table. v2 makes the durable `encounter` object reachable from the dialog (save
// without starting, load back into the draft), puts −/+ steppers on the per-foe count, and lets the
// marching order seed an ambush. These specs drive the real dialog, and read the durable result out
// of the core through the `window.__rt` seam rather than trusting the rendered text alone.

/** Take the session live so the tracker's "Build encounter" button is not refusing. */
async function goLive(page: Page): Promise<void> {
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
		return await rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
	});
	expect(result.status, JSON.stringify(result.rejection ?? {})).toBe('accepted');
}

/** Every durable encounter the core holds, in id order (DM-scoped read through the seam). */
function savedEncounters(page: Page): Promise<Array<{ title: string; combatants: unknown[] }>> {
	return page.evaluate(() =>
		Object.values(
			(window.__rt!.state.encounters as { encounters: Record<string, never> }).encounters,
		),
	);
}

async function openBuilder(page: Page): Promise<void> {
	await page.getByRole('button', { name: /^Build encounter/ }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	await seedFresh(page);
	await goLive(page);
});

// The acceptance criterion: an encounter composed in the dialog is saved durably and comes back.
test('an encounter saves for reuse and loads back into the draft', async ({ page }) => {
	await openBuilder(page);
	const dialog = page.getByRole('dialog');

	await dialog.getByLabel('Encounter title').fill('Ambush at the weir');
	await dialog.getByLabel('Quick add').fill('Bog Lurker');
	await dialog.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(dialog.getByLabel('Bog Lurker quantity')).toBeVisible();

	// Count steppers — three lurkers, without typing into the number field.
	await dialog.getByRole('button', { name: 'One more Bog Lurker' }).click();
	await dialog.getByRole('button', { name: 'One more Bog Lurker' }).click();
	await expect(dialog.getByLabel('Bog Lurker quantity')).toHaveValue('3');

	await dialog.getByRole('button', { name: 'Save encounter' }).click();

	// Saving is DURABLE and does NOT start a fight — that is the whole point of the button.
	await expect.poll(() => savedEncounters(page), { timeout: 5_000 }).toHaveLength(1);
	const saved = await savedEncounters(page);
	expect(saved[0]!.title).toBe('Ambush at the weir');
	expect(
		await page.evaluate(
			() => (window.__rt!.state.session as { combat: { status: string } }).combat.status,
		),
	).not.toBe('running');

	// Close the dialog — the draft is gone — then reopen and load the saved encounter back. The
	// success toast sits over the dialog footer, so dismiss it before reaching for Cancel.
	await page.getByRole('button', { name: 'Dismiss' }).first().click();
	await dialog.getByRole('button', { name: 'Cancel' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0);

	await openBuilder(page);
	const reopened = page.getByRole('dialog');
	await expect(reopened.getByLabel('Bog Lurker quantity')).toHaveCount(0);

	// Index 0 is the "pick one" placeholder; index 1 is the only saved encounter. Its label carries
	// the difficulty band the active package computed, so match it loosely rather than by full text.
	const picker = reopened.getByLabel('Saved encounters');
	await expect(picker).toContainText('Ambush at the weir');
	await picker.selectOption({ index: 1 });
	await reopened.getByRole('button', { name: 'Load', exact: true }).click();

	await expect(reopened.getByLabel('Encounter title')).toHaveValue('Ambush at the weir');
	await expect(reopened.getByLabel('Bog Lurker quantity')).toHaveValue('3');
});

// Ambush seeding reads the party's marching order, so the front rank acts first and the foes that
// sprang the trap start hidden from the players.
test('a party-surprised opening seeds initiative and hides the foes', async ({ page }) => {
	await openBuilder(page);
	const dialog = page.getByRole('dialog');

	await dialog.getByLabel('Quick add').fill('Reed Stalker');
	await dialog.getByRole('button', { name: 'Add', exact: true }).click();
	await expect(dialog.getByLabel('Reed Stalker initiative')).toHaveValue('');
	await expect(dialog.getByRole('button', { name: /Reed Stalker starts visible/ })).toBeVisible();

	await dialog.getByRole('radio', { name: 'Party surprised' }).click();
	// The foes act first (the top of the seeded block) and are concealed until the DM reveals them.
	await expect(dialog.getByLabel('Reed Stalker initiative')).toHaveValue('30');
	await expect(dialog.getByRole('button', { name: /Reed Stalker starts hidden/ })).toBeVisible();

	// Going back to a straight fight restores exactly what the fields held before the seed.
	await dialog.getByRole('radio', { name: 'Straight fight' }).click();
	await expect(dialog.getByLabel('Reed Stalker initiative')).toHaveValue('');
	await expect(dialog.getByRole('button', { name: /Reed Stalker starts visible/ })).toBeVisible();
});

// "Place on map" is honest about having nothing to place on: a fresh session has no active map, so
// the toggle says so rather than pretending it will do something.
test('the place-on-map toggle refuses honestly with no active map', async ({ page }) => {
	await openBuilder(page);
	const dialog = page.getByRole('dialog');
	const toggle = dialog.getByRole('switch', { name: 'Place tokens on the map' });
	await expect(toggle).toHaveAttribute('aria-disabled', 'true');
	await expect(toggle).toHaveAttribute('aria-checked', 'false');
	await expect(dialog.getByText(/No active map in this session/)).toBeVisible();
});
