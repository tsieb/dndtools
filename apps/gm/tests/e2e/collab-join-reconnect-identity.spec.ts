import { expect, test } from '@playwright/test';

// COLLAB-001 / COLLAB-002 / COLLAB-013: the Session section's JOIN / RECONNECT / IDENTITY surface.
//
// - COLLAB-002: a participant reconnecting to an active session receives ONLY the catch-up operations
//   allowed by their CURRENT role/visibility/grants and sync cursor. The participant-facing reconnect
//   panel re-evaluates against current state (never the cache) and delivers the catch-up in dependency
//   order; DM-only content never enters the participant's catch-up stream (filtered in the Processing Core).
// - COLLAB-013: a mobile device waking after missing operations applies the catch-up IN DEPENDENCY ORDER
//   and DISABLES durable actions until the participant is provably caught up; a mid-stream failure shows
//   stale/reconnecting state. Selecting an earlier sync cursor simulates missing operations.
// - COLLAB-001 (join/identity) is the pure Processing-Core policy backing the participant identity; the
//   visible participant surface is the reconnect/catch-up status the joined participant sees.
//
// The reconnect panel is PARTICIPANT-ONLY (a player/observer surface), so the DM never sees it. The same
// stacked surface renders on desktop and compact profiles, so this runs on BOTH Playwright projects.

test.describe('COLLAB join, reconnect, and identity', () => {
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
		await page.goto('/board/');
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
		await page.getByTestId('handout-delivery').waitFor({ state: 'visible' });
	}

	test('the reconnect/catch-up surface is participant-only and the DM never sees it', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);

		// As the DM, the participant reconnect surface is absent (it is a player/observer surface).
		await expect(page.getByTestId('reconnect-status')).toHaveCount(0);

		// View as a PLAYER: the reconnect/catch-up surface appears.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('reconnect-status')).toBeVisible();
	});

	test('COLLAB-002/013: a caught-up participant has durable actions enabled; reconnecting from an earlier cursor shows catch-up', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);

		// Deliver a handout to Demo Player — this appends durable operations to the session log.
		await page.getByTestId('handout-title').fill('A torn map fragment');
		await page.getByTestId('handout-recipient-actor-player').check();
		await page.getByTestId('deliver-handout').click();
		await expect(page.getByTestId('handout-error')).toHaveCount(0);

		// View as the PLAYER.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('reconnect-status')).toBeVisible();

		// Default cursor (caught up to the latest op): the participant is up to date — status live, durable
		// actions enabled, nothing to catch up.
		await expect(page.getByTestId('reconnect-ui-status-value')).toContainText('live');
		await expect(page.getByTestId('reconnect-controls-state')).toContainText('enabled');
		await expect(page.getByTestId('reconnect-durable-action')).toBeEnabled();
		await expect(page.getByTestId('reconnect-catchup-empty')).toBeVisible();

		// Simulate reconnecting from a FRESH JOIN (no prior state): the participant has catch-up to apply,
		// delivered in dependency order. There must be at least one operation to catch up on.
		await page.getByTestId('reconnect-cursor').selectOption('');
		await expect(page.getByTestId('reconnect-catchup-list')).toBeVisible();
		await expect(page.getByTestId('reconnect-catchup-list').locator('li')).not.toHaveCount(0);
	});
});
