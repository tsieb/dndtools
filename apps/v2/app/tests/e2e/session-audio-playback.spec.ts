import { expect, test } from '@playwright/test';

// AUDIO-002 / AUDIO-003: the Session section's SESSION-OWNED AUDIO PLAYBACK surface.
//
// - AUDIO-002: the DM controls playback through the audio widget — play, pause, stop, volume, crossfade,
//   and the active-track display. The currently-playing audio is SESSION state (not widget-private), so it
//   is shown to the DM and (via the "view as" control) to a recipient. The license/scope/offline gates and
//   the per-participant degradation decision are enforced in the Processing Core; the GUI dispatches command
//   intents and renders the computed read model.
// - AUDIO-002 AC2 / AUDIO-007: a participant whose device has not consented sees a user-action-required
//   degraded state and a consent prompt; granting device-local consent never mutates session audio.
// - AUDIO-003: the active track persists as session state (survives a hard navigation), and projecting to an
//   offline participant QUEUES the delivery without blocking local playback.
//
// The same stacked surfaces render on desktop and compact profiles, so this runs on BOTH Playwright
// projects (desktop-chromium + mobile-chromium).

test.describe('AUDIO session playback and session state', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/session/');
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
	});

	// Start an active session from the home Command Center (DM-only), polling the durable session document
	// for `active` before navigating, so a hard navigation reloads the active workflow from storage.
	async function startActiveSession(page: import('@playwright/test').Page): Promise<void> {
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await page.getByTestId('session-workflow-active').click();
		await expect(page.getByTestId('session-workflow-status')).toContainText('active');
		await page.waitForFunction(async () => {
			const doc = await new Promise<{ doc?: { workflow?: string } } | undefined>((resolve) => {
				const open = indexedDB.open('dndtools-v2');
				open.onsuccess = () => {
					const dbInstance = open.result;
					try {
						const tx = dbInstance.transaction('documents', 'readonly');
						const get = tx.objectStore('documents').get('session-state');
						get.onsuccess = () => resolve(get.result);
						get.onerror = () => resolve(undefined);
					} catch {
						resolve(undefined);
					}
				};
				open.onerror = () => resolve(undefined);
			});
			return doc?.doc?.workflow === 'active';
		});
	}

	async function gotoSession(page: import('@playwright/test').Page): Promise<void> {
		await page.goto('/session/');
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await page.getByTestId('audio-playback').waitFor({ state: 'visible' });
	}

	// Configure a demo (bundled-preset) source + asset and select it, then wait for the source dropdown to
	// hold the playable option — synchronizing on the actual editor state, not a transient list row.
	async function configureDemoSourceAndPlay(page: import('@playwright/test').Page): Promise<void> {
		await page.getByTestId('audio-configure-demo').click();
		await expect(page.getByTestId('audio-error')).toHaveCount(0);
		// The source dropdown now holds the demo source; play it.
		await expect(page.getByTestId('audio-source-select').locator('option')).toHaveCount(2);
		await page.getByTestId('audio-play').click();
		await expect(page.getByTestId('audio-error')).toHaveCount(0);
		await expect(page.getByTestId('audio-track-status')).toContainText('playing');
	}

	test('AUDIO-002: the DM plays, pauses, resumes, sets volume, and stops session audio', async ({
		page,
	}) => {
		await expect(page.getByTestId('audio-needs-active-session')).toBeVisible();

		await startActiveSession(page);
		await gotoSession(page);

		await expect(page.getByTestId('audio-idle')).toBeVisible();
		await configureDemoSourceAndPlay(page);

		// AUDIO-002 AC1 — the active track is recorded in session audio state.
		await expect(page.getByTestId('audio-track-source')).toBeVisible();
		await expect(page.getByTestId('audio-session-volume')).toBeVisible();

		// Pause → resume.
		await page.getByTestId('audio-pause').click();
		await expect(page.getByTestId('audio-track-status')).toContainText('paused');
		await page.getByTestId('audio-resume').click();
		await expect(page.getByTestId('audio-track-status')).toContainText('playing');

		// Volume (authoritative session volume).
		await page.getByTestId('audio-volume-input').fill('0.3');
		await page.getByTestId('audio-volume-input').dispatchEvent('change');
		await expect(page.getByTestId('audio-session-volume')).toContainText('0.30');

		// Stop clears the active track.
		await page.getByTestId('audio-stop').click();
		await expect(page.getByTestId('audio-idle')).toBeVisible();
	});

	test('AUDIO-003: the active track persists across a hard navigation (session-owned, not widget-private)', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);
		await configureDemoSourceAndPlay(page);

		// Wait for the durable session document to record the playing track before navigating.
		await page.waitForFunction(async () => {
			const doc = await new Promise<{ doc?: { audioPlayback?: { track?: { status?: string } } } } | undefined>(
				(resolve) => {
					const open = indexedDB.open('dndtools-v2');
					open.onsuccess = () => {
						const dbInstance = open.result;
						try {
							const tx = dbInstance.transaction('documents', 'readonly');
							const get = tx.objectStore('documents').get('session-state');
							get.onsuccess = () => resolve(get.result);
							get.onerror = () => resolve(undefined);
						} catch {
							resolve(undefined);
						}
					};
					open.onerror = () => resolve(undefined);
				},
			);
			return doc?.doc?.audioPlayback?.track?.status === 'playing';
		});

		// Hard navigation away and back: the active track is restored from session state (AUDIO-003 AC1).
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await gotoSession(page);
		await expect(page.getByTestId('audio-track-status')).toContainText('playing');
	});

	test('AUDIO-002/003: a player sees the participant view + consent path; never the DM playback form or roster', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);
		await configureDemoSourceAndPlay(page);

		// The DM sees the per-participant delivery roster.
		await expect(page.getByTestId('audio-delivery-roster')).toBeVisible();

		// View as a player: the DM-only playback form + delivery roster are NOT shown; the participant view is.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('audio-participant')).toBeVisible();
		await expect(page.getByTestId('audio-playback-form')).toHaveCount(0);
		await expect(page.getByTestId('audio-delivery-roster')).toHaveCount(0);

		// AUDIO-002 AC2 / AUDIO-007 — the player's device has not consented ⇒ user-action-required + a consent
		// prompt; the audio element is NOT sounding (it is driven by the core-computed delivery state).
		await expect(page.getByTestId('audio-participant-disposition')).toContainText('user-action-required');
		await expect(page.getByTestId('audio-consent-prompt')).toBeVisible();
		await expect(page.getByTestId('audio-element')).toHaveAttribute('data-sounding', 'false');

		// Granting device-local consent flips this device to playing WITHOUT mutating session audio state.
		await page.getByTestId('audio-grant-consent').click();
		await expect(page.getByTestId('audio-participant-disposition')).toContainText('playing');
		await expect(page.getByTestId('audio-element')).toHaveAttribute('data-sounding', 'true');

		// The authoritative session track is unchanged by the player's local consent (view as DM again).
		await page.getByTestId('view-as-select').selectOption('local-dm');
		await expect(page.getByTestId('audio-track-status')).toContainText('playing');
	});

	test('AUDIO-003 AC3: projecting to an offline participant queues the delivery without blocking playback', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);
		await configureDemoSourceAndPlay(page);

		// Project to a player while OFFLINE → the delivery is queued; local playback is unaffected.
		await page.getByTestId('audio-recipient-actor-player').check();
		await page.getByTestId('audio-connection-select').selectOption('offline');
		await page.getByTestId('audio-project-button').click();
		await expect(page.getByTestId('audio-error')).toHaveCount(0);

		await expect(page.getByTestId('audio-delivery-queue')).toBeVisible();
		await expect(page.getByTestId('audio-queue-actor-player')).toContainText('queued');
		// Local playback is unaffected by the queued (undelivered) projection.
		await expect(page.getByTestId('audio-track-status')).toContainText('playing');
	});
});
