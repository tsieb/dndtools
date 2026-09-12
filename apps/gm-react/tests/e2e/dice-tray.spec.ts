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
	// Scoped to the tray: on desktop the session rail shows the same roll in its quick panel.
	await expect(page.getByTestId('dice-last-roll')).toContainText('Natural 20');
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
	await expect(page.getByTestId('dice-last-roll')).toContainText('Natural 1');
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

// RC-SES-2.4 — dice drama. A natural 20 lands gold on the spring with a gold sweep, a natural 1
// pulses red, anything else is the clean chip; under reduced motion the chip rests on the static
// border. Read off the LIVE element (computed styles, `getAnimations()`), so the app-wide
// reduced-motion clamp in index.css is part of what is tested. The seeds land a natural 20 / 1 on a
// bare `1d20` (the same ones the tests above use).

async function roll(page: Page, expression: string, seed: string): Promise<void> {
	const result = await dispatch(page, {
		type: 'dice.roll',
		actorId: 'dm-1',
		payload: { expression, seed },
	});
	expect(result.status, result.rejection?.message ?? '').toBe('accepted');
}

/** What a roll chip is painting and running right now. */
function chipState(page: Page, testId: string) {
	return page.getByTestId(testId).evaluate((el) => {
		// Resolve the two drama colours the same way the border does, for a like-for-like compare.
		const probe = document.createElement('span');
		el.appendChild(probe);
		probe.style.color = 'var(--color-accent)';
		const gold = getComputedStyle(probe).color;
		probe.style.color = 'var(--color-status-error-text)';
		const red = getComputedStyle(probe).color;
		probe.remove();
		const cs = getComputedStyle(el);
		return {
			mode: el.getAttribute('data-drama-mode'),
			border: cs.borderTopColor,
			gold,
			red,
			animations: cs.animationName,
			timing: cs.animationTimingFunction,
			running: el.getAnimations().filter((a) => a.playState === 'running').length,
			transform: cs.transform,
			sheen: cs.backgroundPosition,
			ring: cs.boxShadow,
		};
	});
}

/** Open the quick panel for this viewport: desktop has the rail already, narrower tiers a sheet. */
async function openQuickPanel(page: Page): Promise<void> {
	const trigger = page.getByTestId('session-quick-trigger');
	if (await trigger.isVisible()) await trigger.click();
	await expect(page.getByTestId('quick-die-d20')).toBeVisible();
}

/**
 * Wait for the tray to mount before rolling. /session is a lazy route: a roll dispatched before the
 * tray exists is, correctly, already on screen when it mounts, and rests instead of playing.
 */
async function trayReady(page: Page): Promise<void> {
	await expect(page.getByLabel('Dice expression')).toBeVisible();
}

/**
 * Turn on Settings › Accessibility › Reduce motion — the app's own switch, which writes
 * `data-motion="reduced"` on <html> live — and come back to the tray. Both are hash navigations in
 * the same document, so the session stays live. (OS reduce-motion reaching `prepaint.js` is
 * settings.spec's subject.)
 */
async function reduceMotion(page: Page): Promise<void> {
	await gotoRoute(page, '/settings?tab=accessibility');
	const reduce = page.getByRole('switch', { name: 'Reduce motion' });
	await expect(reduce).toHaveAttribute('aria-checked', 'false');
	await reduce.click();
	await expect(reduce).toHaveAttribute('aria-checked', 'true');
	await gotoRoute(page, '/session');
}

test.describe('dice drama', () => {
	test('a natural 20 lands gold on the spring, a natural 1 pulses red, others stay clean', async ({
		page,
	}) => {
		const tray = page.getByTestId('dice-last-roll');
		await trayReady(page);

		await roll(page, '1d20', 'seed-12');
		await expect(tray).toHaveAttribute('data-drama', 'crit');
		const high = await chipState(page, 'dice-last-roll');
		expect(high.mode).toBe('play');
		expect(high.border).toBe(high.gold);
		expect(high.animations).toBe('dndDicePop, dndDiceSheen');
		// The pop (first animation) rides the spring; the curves are comma-separated lists themselves.
		expect(high.timing.startsWith('cubic-bezier(0.34, 1.56, 0.64, 1),')).toBe(true);

		await roll(page, '1d20', 'seed1-1');
		await expect(tray).toHaveAttribute('data-drama', 'fumble');
		const low = await chipState(page, 'dice-last-roll');
		expect(low.border).toBe(low.red);
		expect(low.animations).toBe('dndDicePulse');

		await roll(page, '1d8+2', 'seed-12');
		await expect(tray).toHaveAttribute('data-drama', 'plain');
		const plain = await chipState(page, 'dice-last-roll');
		expect(plain.animations).toBe('none');
		expect([plain.gold, plain.red]).not.toContain(plain.border);
	});

	test('the quick panel shows the roll that just landed, and never replays it on reopening', async ({
		page,
	}) => {
		await openQuickPanel(page);
		await roll(page, '1d20', 'seed-12');
		const quick = page.getByTestId('quick-last-roll');
		await expect(quick).toHaveAttribute('data-drama', 'crit');
		await expect(quick).toHaveAttribute('data-drama-mode', 'play');

		// Remount the panel: collapse and restore the desktop rail, or close and reopen the sheet.
		if (await page.getByTestId('session-rail').isVisible()) {
			await page.getByRole('button', { name: 'Hide the session panel' }).click();
			await page.getByRole('button', { name: 'Show the session panel' }).click();
		} else {
			await page.keyboard.press('Escape');
			await expect(page.getByTestId('session-quick-sheet')).toBeHidden();
			await openQuickPanel(page);
		}
		await expect(quick).toHaveAttribute('data-drama-mode', 'static');
		const rest = await chipState(page, 'quick-last-roll');
		expect(rest.animations).toBe('none');
		expect(rest.border).toBe(rest.gold);
	});
});

test.describe('dice drama under reduced motion', () => {
	test('a natural 20 rests on a static gold border and a natural 1 on a red one, nothing moving', async ({
		page,
	}) => {
		await reduceMotion(page);
		expect(await page.evaluate(() => document.documentElement.getAttribute('data-motion'))).toBe(
			'reduced',
		);
		const tray = page.getByTestId('dice-last-roll');
		await trayReady(page);

		await roll(page, '1d20', 'seed-12');
		await expect(tray).toHaveAttribute('data-drama', 'crit');
		// A fresh roll still mounts as `play`: the reduced-motion clamp is what must still it.
		await expect(tray).toHaveAttribute('data-drama-mode', 'play');
		await expect.poll(async () => (await chipState(page, 'dice-last-roll')).running).toBe(0);
		const high = await chipState(page, 'dice-last-roll');
		expect(high.border).toBe(high.gold);
		// The pop holds its `transform: none` end frame, which Chromium reports as the identity matrix.
		expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(high.transform);
		// The sheen is parked past the chip's right edge, where its sweep ends.
		expect(high.sheen).toMatch(/^250% 0(%|px)$/);

		await roll(page, '1d20', 'seed1-1');
		await expect(tray).toHaveAttribute('data-drama', 'fumble');
		await expect.poll(async () => (await chipState(page, 'dice-last-roll')).running).toBe(0);
		const low = await chipState(page, 'dice-last-roll');
		expect(low.border).toBe(low.red);
		// No ring: a zero-offset, zero-blur, zero-spread shadow, whatever colour syntax Chromium serialises
		// the held end frame in (the pulse interpolates through `color-mix`, so it reports oklab).
		expect(low.ring === 'none' || / 0px 0px 0px 0px$/.test(low.ring), low.ring).toBe(true);
	});
});
