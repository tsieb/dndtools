import { expect, test } from '@playwright/test';

// COLLAB-005 / COLLAB-011: the Session section's PLAYER VIEW + OBSERVER ACCESS surface.
//
// - COLLAB-005: the DM controls DIFFERENT player-view assignments for DIFFERENT players during the SAME
//   session. Each participant sees ONLY their own assigned subset (actor-filtered in the Processing Core).
// - COLLAB-011: observers join as READ-ONLY participants with access only to explicitly shared scenes,
//   no character data, and no write controls. The observer surface shows the read-only shared-scene list
//   and a read-only note; observer write commands are rejected before mutation by the core.
//
// The panel is PARTICIPANT-ONLY (a player/observer surface), so the DM never sees it. The same stacked
// surface renders on desktop and compact profiles, so this runs on BOTH Playwright projects.

test.describe('COLLAB player views and observer access', () => {
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

	test('the player-view/observer surface is participant-only and the DM never sees it', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);

		// As the DM, the participant player-view surface is absent (it is a player/observer surface).
		await expect(page.getByTestId('player-view-access')).toHaveCount(0);

		// View as a PLAYER: the surface appears.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('player-view-access')).toBeVisible();
	});

	test('COLLAB-005: a player with no projection sees an explicit "no active player view" state', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);

		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('player-view-access')).toBeVisible();
		// With nothing projected, the participant sees an explicit empty state (no default DM layout leaks).
		await expect(page.getByTestId('player-view-none')).toBeVisible();
	});

	test('COLLAB-011: an observer sees a read-only surface with a shared-scene list and no controls', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);

		// View as the OBSERVER: the read-only note is shown and the surface is present.
		await page.getByTestId('view-as-select').selectOption('actor-observer');
		await expect(page.getByTestId('player-view-access')).toBeVisible();
		await expect(page.getByTestId('observer-readonly-note')).toBeVisible();
		await expect(page.getByTestId('observer-readonly-note')).toContainText('read-only');

		// The observer sees a shared-scene list (empty until a scene is shared) — never DM-only content.
		await expect(page.getByTestId('observer-scenes-empty')).toBeVisible();

		// The observer never sees a DM-only control surface (e.g. the DM-only Player Groups panel).
		await expect(page.getByTestId('player-groups')).toHaveCount(0);
	});
});
