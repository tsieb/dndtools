import { expect, test } from '@playwright/test';

// SES-004 / SES-005 / SES-007: the Session section's HANDOUTS + LIVE TOOLS + QUICK-REFERENCE surfaces.
//
// - SES-004: the DM delivers a HANDOUT as a Scene widget to SELECTED recipients with delivery history,
//   visibility enforcement (a non-recipient receives NOTHING — proven by the "view as" control), and an
//   optional/progressive reveal of a shared section. Visibility is enforced in the Processing Core; the
//   GUI renders the actor-filtered read.
// - SES-005: a participant with a timer/tool widget `operator` grant may OPERATE the tool (start/pause/
//   resume/reset/advance) but NOT CONFIGURE it (set-duration requires `manager`). The boundary is enforced
//   fail-closed in the core (operate-allowed / configure-denied).
// - SES-007: the DM CREATES, PINS, and uses quick-reference panels (notes / session context). Pins are
//   durable (survive a hard navigation); a pinned reference to a deleted note degrades to an unavailable
//   state without crashing.
//
// The same stacked surfaces render on desktop and compact profiles, so this runs on BOTH Playwright
// projects.

test.describe('SES handouts, live tools, and quick reference', () => {
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

	test('SES-004: a handout is delivered to a selected player; a non-recipient sees nothing', async ({
		page,
	}) => {
		await expect(page.getByTestId('handout-needs-active-session')).toBeVisible();

		await startActiveSession(page);
		await gotoSession(page);

		// Deliver to Demo Player only, revealing the cipher section.
		await page.getByTestId('handout-title').fill('The cryptic letter');
		await page.getByTestId('handout-recipient-actor-player').check();
		await page.getByTestId('handout-reveal-cipher').check();
		await page.getByTestId('deliver-handout').click();
		await expect(page.getByTestId('handout-error')).toHaveCount(0);

		// Delivery history records the delivery (DM view).
		await expect(page.getByTestId('handout-delivery-history')).toContainText('The cryptic letter');
		await expect(page.getByTestId('handout-history-row').first()).toContainText('actor-player');

		// View as the RECIPIENT (Demo Player): they see the handout with the revealed cipher.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('handouts-received')).toContainText('The cryptic letter');
		await expect(page.getByTestId('handouts-received')).toContainText('cipher is unsolved');

		// View as a NON-recipient (Demo Player 2): they receive NOTHING (no title, no sections).
		await page.getByTestId('view-as-select').selectOption('actor-player-2');
		await expect(page.getByTestId('handouts-received-empty')).toBeVisible();
		await expect(page.getByTestId('handouts-received')).not.toContainText('The cryptic letter');
		await expect(page.getByTestId('handouts-received')).not.toContainText('cipher is unsolved');
	});

	test('SES-005: an operator can operate the timer but cannot configure it (fail closed)', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);
		await page.getByTestId('live-tools').waitFor({ state: 'visible' });

		// As the DM: grant OPERATOR to Demo Player on the timer and project it to them.
		await page.getByTestId('grant-player-select').selectOption('actor-player');
		await page.getByTestId('grant-set-select').selectOption('operator');
		await page.getByTestId('grant-timer').click();
		await page.getByTestId('project-timer').click();
		await expect(page.getByTestId('live-tools-error')).toHaveCount(0);

		// View as the operator player.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('timer-effective-sets')).toContainText('operator');

		// The operator can START and PAUSE the timer (operate is allowed). The controls are
		// contextual (UX-SES-012): Start while stopped, Pause while running.
		await page.getByTestId('timer-start').click();
		await expect(page.getByTestId('live-tools-error')).toHaveCount(0);
		await expect(page.getByTestId('timer-status')).toContainText('Running');
		await page.getByTestId('timer-pause').click();
		await expect(page.getByTestId('timer-status')).toContainText('Paused');
		await expect(page.getByTestId('timer-resume')).toBeVisible();

		// UX-SES-012 AC2 — the operator NEVER sees "Set duration" (manager-only; the core would
		// also reject it fail-closed — covered by the core widget-operator-authority tests).
		await expect(page.getByTestId('timer-configure')).toHaveCount(0);
		await expect(page.getByTestId('timer-duration-input')).toHaveCount(0);
	});

	test('SES-007: the DM pins a quick-reference note; the pin survives navigation and degrades when deleted', async ({
		page,
	}) => {
		await startActiveSession(page);

		// Author a note to pin (the real Knowledge route).
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await page.getByTestId('note-new-title').fill('Tavern rumors');
		await page.getByTestId('note-new-visibility').selectOption('player-visible');
		await page.getByTestId('note-create').click();
		await expect(page.getByTestId('notes-list')).toContainText('Tavern rumors');

		// Pin it on the Session quick-reference surface.
		await gotoSession(page);
		await page.getByTestId('quick-reference').waitFor({ state: 'visible' });
		await page.getByTestId('qr-kind-select').selectOption('note');
		await page.getByTestId('qr-target-select').selectOption({ label: 'Tavern rumors' });
		await page.getByTestId('qr-label').fill('Rumors');
		await page.getByTestId('pin-quick-reference').click();
		await expect(page.getByTestId('quick-reference-panels')).toContainText('Tavern rumors');

		// Durable pin: a hard navigation away and back keeps the panel (SES-007 AC1).
		await page.goto('/board/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await gotoSession(page);
		await expect(page.getByTestId('quick-reference-panels')).toContainText('Tavern rumors');

		// Delete the pinned note: the panel degrades to an unavailable state without crashing (AC2).
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
		await expect(page.getByTestId('notes-list')).toContainText('Tavern rumors');
		const deleteButton = page.locator('[data-testid^="note-delete-"]').first();
		await deleteButton.click();
		// Wait for the soft-delete to land in the durable content document before navigating (the reload
		// rehydrates from IndexedDB, so the write must be persisted first — no arbitrary wait).
		await page.waitForFunction(async () => {
			const doc = await new Promise<{ doc?: { items?: Record<string, { deletedAt?: string | null }> } } | undefined>(
				(resolve) => {
					const open = indexedDB.open('dndtools-v2');
					open.onsuccess = () => {
						const dbInstance = open.result;
						try {
							const tx = dbInstance.transaction('documents', 'readonly');
							const get = tx.objectStore('documents').get('content-state');
							get.onsuccess = () => resolve(get.result);
							get.onerror = () => resolve(undefined);
						} catch {
							resolve(undefined);
						}
					};
					open.onerror = () => resolve(undefined);
				},
			);
			const items = doc?.doc?.items ?? {};
			return Object.values(items).some((item) => item.deletedAt != null);
		});

		await gotoSession(page);
		await expect(page.getByTestId('qr-panel-unavailable')).toBeVisible();
		await expect(page.getByTestId('quick-reference-panels')).not.toContainText('Tavern rumors');
	});
});
