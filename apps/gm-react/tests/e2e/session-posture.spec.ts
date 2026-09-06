import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { dispatch, gotoRoute, markOnboarded, seedFresh } from './_helpers';

// RC-SES-1.1 — SESSION-LIVE SHELL POSTURE. The shell changes shape when the Core's session workflow
// is `active`, and every tier has to say so in the way that tier can afford: the desktop gets a top
// bar status and a right rail that opens itself, the phone gets a status strip above its tab bar.
// Both profiles run here because the posture is DIFFERENT per profile, not merely narrower.

const phone = (info: TestInfo) => info.project.name === 'mobile-chromium';

/** Take the session live on the first available scene through the Core, as the DM would. */
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

test.describe('session-live shell posture', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/');
		await seedFresh(page);
		await gotoRoute(page, '/');
	});

	test('an idle session leaves the shell in its resting posture', async ({ page }, info) => {
		await expect(page.getByTestId('topbar-session-live')).toHaveCount(0);
		await expect(page.getByTestId('session-rail')).toHaveCount(0);
		await expect(page.getByTestId('phone-session-strip')).toHaveCount(0);
		if (!phone(info)) await expect(page.getByTestId('sidebar-session-live')).toHaveCount(0);
	});

	test('going live changes the shell posture for this profile', async ({ page }, info) => {
		await goLive(page);

		if (phone(info)) {
			// The phone posture: a 16px accent strip above the tab bar carrying the elapsed time, and
			// no top-bar chip (a 375px top bar has no room for a fourth element).
			const strip = page.getByTestId('phone-session-strip');
			await expect(strip).toBeVisible();
			await expect(strip).toContainText(/Session live/);
			await expect(strip).toHaveText(/\d\d:\d\d/);
			expect(await strip.evaluate((el) => Math.round(el.getBoundingClientRect().height))).toBe(16);
			await expect(page.getByTestId('topbar-session-live')).toHaveCount(0);
			return;
		}

		// The desktop posture: a status-only top bar label with the running clock…
		const chip = page.getByTestId('topbar-session-live');
		await expect(chip).toBeVisible();
		await expect(chip).toHaveText(/Session live · \d\d:\d\d/);
		// …TOPBAR_CHARTER: status only. The label carries no control of its own.
		expect(await chip.locator('button, a[href], [role="button"]').count()).toBe(0);

		// …the Session nav entry marked live…
		await expect(page.getByTestId('sidebar-session-live')).toBeVisible();

		// …and the right rail, open without being asked for.
		const rail = page.getByTestId('session-rail');
		await expect(rail).toBeVisible();
		await expect(rail.getByTestId('session-rail-elapsed')).toHaveText(/\d\d:\d\d/);
	});

	test('the desktop rail collapses and reopens from the keyboard', async ({ page }, info) => {
		test.skip(phone(info), 'the phone shows the status strip instead of the rail');
		await goLive(page);
		const rail = page.getByTestId('session-rail');
		await expect(rail).toBeVisible();

		const hide = page.getByRole('button', { name: 'Hide the session panel' });
		await hide.focus();
		await page.keyboard.press('Enter');
		await expect(rail).toHaveCount(0);

		const show = page.getByRole('button', { name: 'Show the session panel' });
		await show.focus();
		await page.keyboard.press('Enter');
		await expect(rail).toBeVisible();
	});

	test('ending the session restores the resting posture', async ({ page }, info) => {
		await goLive(page);
		if (phone(info)) await expect(page.getByTestId('phone-session-strip')).toBeVisible();
		else await expect(page.getByTestId('session-rail')).toBeVisible();

		const ended = await dispatch(page, {
			type: 'session.set-workflow',
			actorId: 'dm-1',
			payload: { workflow: 'idle' },
		});
		expect(ended.status, ended.rejection?.message ?? '').toBe('accepted');

		await expect(page.getByTestId('topbar-session-live')).toHaveCount(0);
		await expect(page.getByTestId('session-rail')).toHaveCount(0);
		await expect(page.getByTestId('phone-session-strip')).toHaveCount(0);
	});
});
