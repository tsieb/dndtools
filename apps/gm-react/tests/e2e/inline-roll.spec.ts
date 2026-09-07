import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-SES-2.2 — an inline `[[roll:1d20+5]]` written into a note body renders a real control on the
// Knowledge note viewer. Pressing it rolls, shows the number, and — when a session is live —
// records the roll in the durable session history with `sourceKind: 'inline'`. Outside a session
// the control still rolls and says plainly that the result was not recorded.

const BODY = 'Squeeze through the grate: [[roll:1d20+5|Acrobatics]].';

/** Take the session live on the first available scene, as the DM would. */
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
		return rt.dispatch({
			type: 'session.set-workflow',
			actorId: rt.defaultActorId,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
	});
	expect(result.status, result.rejection?.message ?? '').toBe('accepted');
}

/** Create a note through the core and open its viewer. Returns the note id. */
async function openNoteWithRoll(page: Page): Promise<string> {
	const actorId = await page.evaluate(() => window.__rt!.defaultActorId);
	const result = await dispatch(page, {
		type: 'content.create-item',
		actorId,
		payload: {
			kind: 'note',
			title: `Grate ${Date.now()}`,
			body: BODY,
			visibility: 'dm-only',
		},
	});
	expect(result.status, result.rejection?.message ?? '').toBe('accepted');
	const id = (result.events ?? []).find(
		(e: Record<string, unknown>) => e.kind === 'content.item-changed',
	)?.itemId as string;
	expect(id).toBeTruthy();
	await gotoRoute(page, `/knowledge/${id}`);
	await waitReady(page);
	return id;
}

/** How many rolls the durable session history holds, and the kind of the newest one. */
function diceHistory(page: Page): Promise<{ count: number; last: Record<string, unknown> | null }> {
	return page.evaluate(() => {
		const rolls = (
			window.__rt!.state.session as unknown as { diceHistory: Record<string, unknown>[] }
		).diceHistory;
		return { count: rolls.length, last: rolls.length > 0 ? rolls[rolls.length - 1]! : null };
	});
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/knowledge');
	await seedFresh(page);
	await gotoRoute(page, '/knowledge');
});

test('an inline roll renders as a control, not as bracket syntax', async ({ page }) => {
	await openNoteWithRoll(page);
	const control = page.getByRole('button', { name: /Roll 1d20\+5/ });
	await expect(control).toBeVisible();
	await expect(control).toContainText('Acrobatics');
	await expect(page.getByText('[[roll:')).toHaveCount(0);
});

test('pressing it in a live session records an inline roll in the session history', async ({
	page,
}) => {
	await goLive(page);
	await openNoteWithRoll(page);
	const before = (await diceHistory(page)).count;

	await page.getByRole('button', { name: /Roll 1d20\+5/ }).click();

	await page.waitForFunction(
		(n) =>
			(window.__rt!.state.session as unknown as { diceHistory: unknown[] }).diceHistory.length > n,
		before,
		{ timeout: 10_000 },
	);
	const { last } = await diceHistory(page);
	expect(last?.sourceKind).toBe('inline');
	expect(last?.expression).toBe('1d20+5');
	expect(last?.label).toBe('Acrobatics');

	// The chip shows the SAME total the log recorded — the control hands its seed to the command,
	// so the number the presser sees is never a second, different roll.
	const chip = page.locator('[role="status"]').first();
	await expect(chip).toContainText(String(last?.total));
});

test('the control is keyboard-operable and reachable by Enter', async ({ page }) => {
	await goLive(page);
	await openNoteWithRoll(page);
	const before = (await diceHistory(page)).count;

	await page.getByRole('button', { name: /Roll 1d20\+5/ }).focus();
	await page.keyboard.press('Enter');

	await page.waitForFunction(
		(n) =>
			(window.__rt!.state.session as unknown as { diceHistory: unknown[] }).diceHistory.length > n,
		before,
		{ timeout: 10_000 },
	);
	expect((await diceHistory(page)).last?.sourceKind).toBe('inline');
});

test('outside a session it still rolls and says the result was not recorded', async ({ page }) => {
	await openNoteWithRoll(page);
	const before = (await diceHistory(page)).count;

	await page.getByRole('button', { name: /Roll 1d20\+5/ }).click();

	const chip = page.locator('[role="status"]').first();
	await expect(chip).toBeVisible();
	await expect(chip).toContainText('not recorded');
	// Nothing durable was written — no fake log entry.
	expect((await diceHistory(page)).count).toBe(before);
});
