import { expect, test } from '@playwright/test';

// SES-003 / SES-008: the Session section's DICE + TABLES surface.
//
// - SES-003: a participant rolls dice expressions through the shared dice command. The OUTCOME is
//   computed once in the Processing Core from a recorded seed (reproducible), malformed expressions fail
//   closed, and roll visibility composes with PERM — a DM-only (secret) roll never reaches a player's
//   history (the core read model filters it before render).
// - SES-008: the DM draws a rollable `dice-table` Vault Object as a session asset; the recorded result
//   is attributed and can be appended to a note through the existing content write path.
//
// The same stacked form/list UI renders on desktop and compact profiles, so this runs on BOTH Playwright
// projects. The "view as" header control switches the rendered actor against the shared local runtime,
// proving the actor-filtered roll history (a player never sees the DM's secret roll).

test.describe('SES dice and tables', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/session/');
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
	});

	// Start an active session from the home Command Center (DM-only), polling the durable session
	// document for `active` before navigating away (the same no-arbitrary-wait pattern the combat spec
	// uses), so a hard navigation reloads the active workflow from storage.
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
		await page.getByTestId('dice-tools').waitFor({ state: 'visible' });
		await expect(page.getByTestId('dice-needs-active-session')).toHaveCount(0);
	}

	test('SES-003: the DM rolls an expression and the recorded result appears in history', async ({
		page,
	}) => {
		// Dice are gated on the active session workflow.
		await expect(page.getByTestId('dice-needs-active-session')).toBeVisible();

		await startActiveSession(page);
		await gotoSession(page);

		await page.getByTestId('dice-expression').fill('2d20kh1+5');
		await page.getByTestId('dice-label').fill('Stealth');
		await page.getByTestId('roll-dice').click();

		// The recorded roll renders: expression, a total, and the label.
		const history = page.getByTestId('roll-history');
		await expect(history.getByTestId('roll-expression').first()).toContainText('2d20kh1+5');
		await expect(history.getByTestId('roll-label').first()).toContainText('Stealth');
		await expect(history.getByTestId('roll-total').first()).not.toBeEmpty();
	});

	test('SES-003: a malformed expression is rejected fail-closed and records no roll', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);

		await page.getByTestId('dice-expression').fill('2d6++bad');
		await page.getByTestId('roll-dice').click();

		await expect(page.getByTestId('dice-error')).toContainText('Invalid dice expression');
		await expect(page.getByTestId('dice-history-empty')).toBeVisible();
	});

	test('SES-003: a DM-only secret roll is hidden from a player history (fail closed)', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);

		// The DM makes a secret roll.
		await page.getByTestId('dice-expression').fill('1d20');
		await page.getByTestId('dice-visibility').selectOption('dm-only');
		await page.getByTestId('dice-label').fill('ambush check');
		await page.getByTestId('roll-dice').click();
		await expect(page.getByTestId('roll-history').getByTestId('roll-label').first()).toContainText(
			'ambush check',
		);
		// The DM sees the hidden count is 0 (their own view) and the secret roll.
		await expect(page.getByTestId('roll-history')).toContainText('1d20');

		// Switch to a player: the secret roll is OMITTED entirely (no expression/label/total leak).
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('dice-tools')).toBeVisible();
		await expect(page.getByTestId('dice-history-empty')).toBeVisible();
		await expect(page.getByTestId('roll-history')).not.toContainText('ambush check');
	});

	test('SES-008: the DM draws a rollable table and appends the result to a note', async ({ page }) => {
		await startActiveSession(page);

		// Author a dice-table Vault Object and a session-log note on the Knowledge route (the real path).
		await page.goto('/knowledge/');
		await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });

		// A plain note to append into.
		await page.getByTestId('note-new-title').fill('Session log');
		await page.getByTestId('note-create').click();
		await expect(page.getByTestId('notes-list')).toContainText('Session log');

		// A dice-table object: subtype + the declared frontmatter (dice expression + entries rows).
		await page.getByTestId('object-subtype-select').selectOption('dice-table');
		await page.getByTestId('object-title-input').fill('Wandering monsters');
		await page
			.getByTestId('object-fields-input')
			.fill(
				JSON.stringify({
					title: 'Wandering monsters',
					dice: '1d6',
					entries: ['Goblins', 'Merchant', 'Storm', 'Nothing', 'Bandits', 'Shrine'],
				}),
			);
		await expect(page.getByTestId('object-valid')).toBeVisible();
		await page.getByTestId('object-create-submit').click();
		await expect(page.getByTestId('object-create-summary')).toBeVisible();

		// Back to the session: draw the table.
		await gotoSession(page);
		await page.getByTestId('dice-table-select').selectOption({ label: 'Wandering monsters' });
		await page.getByTestId('draw-table').click();

		// The recorded draw shows the selected row text.
		const drawn = page.getByTestId('roll-history').getByTestId('roll-row').first();
		await expect(drawn).not.toBeEmpty();

		// Capture the drawn row text so we can assert it was appended to the note.
		const rowText = (await drawn.textContent())?.replace(/[()]/g, '').trim() ?? '';
		expect(rowText.length).toBeGreaterThan(0);

		// Append the recorded result to the note.
		await page.getByTestId('append-roll-select').selectOption({ index: 1 });
		await page.getByTestId('append-note-select').selectOption({ label: 'Session log' });
		await page.getByTestId('append-roll').click();
		await expect(page.getByTestId('dice-error')).toHaveCount(0);

		// The note now carries the appended result line. Verify on the durable content document — the
		// append went through the existing content write path (no clone), so the persisted note body holds
		// the row text. This polls the IndexedDB document directly (the same durable-state inspection the
		// combat spec uses for session-state), avoiding any race with the async write.
		await page.waitForFunction(async (expectedRow) => {
			const doc = await new Promise<{ doc?: { items?: Record<string, { body?: string }> } } | undefined>(
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
			return Object.values(items).some((item) => (item.body ?? '').includes(expectedRow));
		}, rowText);
	});
});
