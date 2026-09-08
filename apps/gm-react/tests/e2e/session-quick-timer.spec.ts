import { expect, test, type Page } from '@playwright/test';
import {
	dispatch,
	enterPreview,
	exitPreview,
	gotoRoute,
	markOnboarded,
	seedFresh,
} from './_helpers';

// RC-SES-4.4 — the quick-panel TIMER: a DM-run countdown or break with lap marks. A countdown is a
// DM-only pacing tool; a break additionally projects a "Back in M:SS" card to players. Exercised off
// /session (like the rest of the quick panel, RC-SES-1.2) to prove it travels with the DM.

/**
 * Open the panel for this viewport: desktop has the rail already, narrower tiers use the trigger.
 * A no-op if the sheet is already open (e.g. carried over a hash-route navigation) — clicking the
 * trigger again would hit the sheet's own inert backdrop rather than the (still visible) button.
 */
async function openQuickPanel(page: Page): Promise<void> {
	if (await page.getByTestId('session-quick-sheet').isVisible()) return;
	const trigger = page.getByTestId('session-quick-trigger');
	if (await trigger.isVisible()) await trigger.click();
}

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
	expect(result.status, JSON.stringify(result.rejection ?? {})).toBe('accepted');
}

test.beforeEach(async ({ page }) => {
	await markOnboarded(page);
	await gotoRoute(page, '/knowledge');
	await seedFresh(page);
	await goLive(page);
	await openQuickPanel(page);
});

test.describe('quick-panel timer', () => {
	test('starts a countdown, pauses/resumes, takes a lap, and resets', async ({ page }) => {
		await page.getByLabel('Minutes').fill('5');
		await page.getByTestId('quick-timer-start').click();

		const display = page.getByTestId('quick-timer-display');
		await expect(display).toBeVisible();
		// The clock ticks in real time; assert it started at 5 minutes rather than pinning "5:00" exactly.
		await expect(display).toHaveText(/^(4:5\d|5:00)$/);

		await page.getByRole('button', { name: 'Lap' }).click();
		await expect(page.getByTestId('quick-timer-laps')).toHaveText('1 lap marks');

		await page.getByRole('button', { name: 'Pause' }).click();
		expect(
			await page.evaluate(
				() =>
					(window.__rt!.state.session as { quickTimer?: { status: string } }).quickTimer?.status,
			),
		).toBe('paused');

		await page.getByRole('button', { name: 'Resume' }).click();
		expect(
			await page.evaluate(
				() =>
					(window.__rt!.state.session as { quickTimer?: { status: string } }).quickTimer?.status,
			),
		).toBe('running');

		await page.getByRole('button', { name: 'Reset' }).click();
		await expect(page.getByTestId('quick-timer-display')).toHaveCount(0);
		expect(
			await page.evaluate(
				() => (window.__rt!.state.session as { quickTimer: unknown }).quickTimer,
			),
		).toBeNull();
	});

	test('a countdown is DM-only: a previewed player sees no timer at all', async ({ page }) => {
		await page.getByLabel('Minutes').fill('5');
		await page.getByTestId('quick-timer-start').click();
		await expect(page.getByTestId('quick-timer-display')).toBeVisible();

		await enterPreview(page, 'player');
		await expect(page.getByTestId('quick-timer-display')).toHaveCount(0);
		await expect(page.getByTestId('quick-timer-break-card')).toHaveCount(0);
		await exitPreview(page);
	});

	test('a break projects a "Back in M:SS" card to a previewed player', async ({ page }) => {
		// Switch to the Break segment before starting.
		await page.getByRole('radio', { name: 'Break' }).click();
		await page.getByLabel('Minutes').fill('10');
		await page.getByTestId('quick-timer-start').click();
		await expect(page.getByTestId('quick-timer-display')).toHaveText(/^(9:5\d|10:00)$/);

		await enterPreview(page, 'player');
		const card = page.getByTestId('quick-timer-break-card');
		await expect(card).toBeVisible();
		await expect(card).toContainText(/Back in (9:5\d|10:00)/);
		// The player gets no controls — just the card.
		await expect(page.getByTestId('quick-timer-display')).toHaveCount(0);
		await exitPreview(page);
	});

	test('the timer survives navigation off /session', async ({ page }) => {
		await page.getByLabel('Minutes').fill('5');
		await page.getByTestId('quick-timer-start').click();
		await expect(page.getByTestId('quick-timer-display')).toBeVisible();

		await gotoRoute(page, '/atlas');
		await openQuickPanel(page);
		await expect(page.getByTestId('quick-timer-display')).toBeVisible();
	});

	test('a player cannot start a timer even with the core dispatched directly', async ({
		page,
	}) => {
		await enterPreview(page, 'player');
		const result = await dispatch(page, {
			type: 'session.quick-timer.start',
			actorId: (await page.evaluate(() => window.__rt!.defaultActorId)) as unknown as string,
			payload: { kind: 'countdown', durationSeconds: 60 },
		});
		expect(result.status).toBe('rejected');
		await exitPreview(page);
	});
});
