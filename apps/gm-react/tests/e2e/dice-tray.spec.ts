import { expect, test, type Page } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-SES-2.1 — the /session dice tray: roll labels, a per-die breakdown, natural-20/natural-1
// flags, and "Export roll log" (a clipboard copy of the visible history — the durable copy already
// rides along on every session archive automatically, `SessionArchiveSnapshot.diceHistory`).

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

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/session');
	await seedFresh(page);
	await gotoRoute(page, '/session');
	await goLive(page);
});

test('a labeled roll shows its label on the readout and the history line', async ({ page }) => {
	await page.getByLabel('Dice expression').fill('1d20+5');
	await page.getByLabel('Roll label').fill('Stealth check');
	await page.getByRole('button', { name: 'Roll', exact: true }).click();

	await expect(page.getByText('Stealth check', { exact: true })).toBeVisible();
});

test('a natural 20 flags the latest roll', async ({ page }) => {
	// Seed chosen (offline, against `rollExpression`) to land a natural 20 on a bare `1d20` —
	// deterministic, so this does not depend on a real UI roll landing the face by chance.
	const nat20 = await dispatch(page, {
		type: 'dice.roll',
		actorId: 'dm-1',
		payload: { expression: '1d20', seed: 'seed-12' },
	});
	expect(nat20.status, nat20.rejection?.message ?? '').toBe('accepted');
	await expect(page.getByText('Natural 20', { exact: false })).toBeVisible();
});

test('a natural 1 flags the latest roll, and an older nat-20 still reads in the history', async ({
	page,
}) => {
	const nat20 = await dispatch(page, {
		type: 'dice.roll',
		actorId: 'dm-1',
		payload: { expression: '1d20', seed: 'seed-12' },
	});
	expect(nat20.status, nat20.rejection?.message ?? '').toBe('accepted');
	const nat1 = await dispatch(page, {
		type: 'dice.roll',
		actorId: 'dm-1',
		payload: { expression: '1d20', seed: 'seed1-1' },
	});
	expect(nat1.status, nat1.rejection?.message ?? '').toBe('accepted');

	// The newest roll (nat 1) leads the readout; the nat-20 dropped into the compact history list,
	// which flags it with its own "Nat 20" tag rather than repeating the big readout.
	await expect(page.getByText('Natural 1', { exact: false })).toBeVisible();
	await expect(page.getByText(/Nat 20/)).toBeVisible();
});

test('per-die breakdown expands and collapses from a keyboard-reachable toggle', async ({
	page,
}) => {
	await page.getByLabel('Dice expression').fill('2d6+3');
	await page.getByRole('button', { name: 'Roll', exact: true }).click();

	const toggle = page.getByRole('button', { name: 'Per-die breakdown' }).first();
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
	await toggle.focus();
	await page.keyboard.press('Enter');
	await expect(toggle).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByText(/2d6: \[\d, \d\]/)).toBeVisible();

	await page.keyboard.press('Enter');
	await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('export roll log copies the visible history to the clipboard', async ({
	page,
	context,
	browserName,
}) => {
	test.skip(browserName !== 'chromium', 'clipboard-read permission is Chromium-only');
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);

	await page.getByLabel('Dice expression').fill('1d8+2');
	await page.getByLabel('Roll label').fill('Longsword');
	await page.getByRole('button', { name: 'Roll', exact: true }).click();

	await page.getByRole('button', { name: 'Export roll log' }).click();
	await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

	const clip = await page.evaluate(() => navigator.clipboard.readText());
	expect(clip).toContain('Longsword: 1d8+2 →');
});
