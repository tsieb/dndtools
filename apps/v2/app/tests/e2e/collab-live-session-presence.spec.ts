import { expect, test } from '@playwright/test';

// COLLAB-003 / COLLAB-004: the Session section's LIVE SESSION STATE + PRESENCE surface.
//
// - COLLAB-003: participants share near-real-time session state (combat, dice, timers, handouts, visible
//   map updates). The participant-facing surface shows the live/syncing/stale/reconnecting status the
//   Processing Core derives — so a behind view is marked STALE when the live channel drops or updates pend.
// - COLLAB-004: ephemeral presence (online status + device) of co-participants is projected FAIL CLOSED by
//   the Processing Core — a participant the viewer may not see is never listed; presence never persists or
//   replays as authoritative history.
//
// The panel is PARTICIPANT-ONLY (a player/observer surface), so the DM never sees it. The same stacked
// surface renders on desktop and compact profiles, so this runs on BOTH Playwright projects.

test.describe('COLLAB live session state and presence', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/session/');
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
	});

	async function startActiveSession(page: import('@playwright/test').Page): Promise<void> {
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await page.getByTestId('session-workflow-active').click();
		await expect(page.getByTestId('session-workflow-status')).toContainText('active');
	}

	async function gotoSession(page: import('@playwright/test').Page): Promise<void> {
		await page.goto('/session/');
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await page.getByTestId('handout-delivery').waitFor({ state: 'visible' });
	}

	test('the live session surface is participant-only and the DM never sees it', async ({ page }) => {
		await startActiveSession(page);
		await gotoSession(page);

		// As the DM, the participant live-session surface is absent (it is a player/observer surface).
		await expect(page.getByTestId('live-session-status')).toHaveCount(0);

		// View as a PLAYER: the live-session surface appears.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('live-session-status')).toBeVisible();
	});

	test('COLLAB-003: a connected, caught-up participant is live; disconnecting marks the view stale/reconnecting', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);

		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('live-session-status')).toBeVisible();

		// Connected and caught up ⇒ live.
		await expect(page.getByTestId('live-status-value')).toContainText('live');

		// Disconnect the live channel ⇒ reconnecting (the view may be behind).
		await page.getByTestId('live-connected').uncheck();
		await expect(page.getByTestId('live-status-value')).toContainText('reconnecting');

		// Reconnect, then add a pending update ⇒ syncing (view catching up).
		await page.getByTestId('live-connected').check();
		await page.getByTestId('live-pending').fill('2');
		await page.getByTestId('live-pending').blur();
		await expect(page.getByTestId('live-status-value')).toContainText('syncing');

		// An out-of-order (held) update ⇒ stale even while connected.
		await page.getByTestId('live-undeliverable').fill('1');
		await page.getByTestId('live-undeliverable').blur();
		await expect(page.getByTestId('live-status-value')).toContainText('stale');
	});

	test('COLLAB-004: presence lists co-participants for an authorized viewer', async ({ page }) => {
		await startActiveSession(page);
		await gotoSession(page);

		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('live-session-status')).toBeVisible();

		// The presence list shows the participant's own presence and the DM's (authorized co-participant).
		await expect(page.getByTestId('presence-list')).toBeVisible();
		await expect(page.getByTestId('presence-actor-player')).toBeVisible();
		await expect(page.getByTestId('presence-local-dm')).toBeVisible();
	});
});
