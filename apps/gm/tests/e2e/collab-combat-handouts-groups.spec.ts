import { expect, test } from '@playwright/test';

// COLLAB-006 / COLLAB-007 / COLLAB-012: the Session section's COLLABORATION surfaces.
//
// - COLLAB-006: participants VIEW shared combat state ACCORDING TO ROLE AND GRANTS. The DM runs combat
//   and sees every combatant + the advance/end controls; a player sees the live tracker filtered to the
//   combatants they may see, with NO advance/end controls and no per-combatant edit controls unless
//   granted `combat-participant`. Visibility + permitted controls are decided in the Processing Core
//   (`getSharedCombatView`); the GUI only renders the computed model.
// - COLLAB-007: the DM delivers handouts (here a cipher) to a SELECTED player with per-recipient
//   delivered/opened status; the recipient CONFIRMS receipt; the DM REVOKES → the recipient is SEALED
//   and the read returns NOTHING (no content leak). A non-recipient never sees it.
// - COLLAB-012: the DM creates a PLAYER GROUP (delivery target only). Delivering to the group reaches
//   only current members; membership confers no visibility (a member of a group that received a later
//   delivery does NOT retroactively gain a prior handout). The group surface is DM-only.
//
// The same stacked surfaces render on desktop and compact profiles, so this runs on BOTH Playwright
// projects (desktop-chromium + mobile-chromium).

test.describe('COLLAB combat view, handouts, and player groups', () => {
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

	test('COLLAB-006: a player sees the shared combat view but no DM controls (role/grant-gated, fail closed)', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);

		// Build a small encounter and run combat as the DM.
		await page.getByTestId('encounter-title').fill('Ambush');
		await page.getByTestId('combatant-name-input').fill('Goblin');
		await page.getByTestId('combatant-cr-input').fill('1');
		await page.getByTestId('combatant-qty-input').fill('1');
		await page.getByTestId('combatant-hp-input').fill('12');
		await page.getByTestId('add-combatant').click();
		await page.getByTestId('build-encounter').click();
		await page.getByTestId('start-encounter-select').selectOption({ index: 1 });
		await page.getByTestId('start-combat').click();

		// The DM sees the advance/end controls.
		await expect(page.getByTestId('advance-turn')).toBeVisible();
		await expect(page.getByTestId('end-combat')).toBeVisible();

		// View as a PLAYER: they see the live tracker (round + the visible combatant) but NO DM controls.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('combat-round')).toContainText('Round 1');
		await expect(page.getByTestId('initiative-order')).toContainText('Goblin');
		await expect(page.getByTestId('advance-turn')).toHaveCount(0);
		await expect(page.getByTestId('end-combat')).toHaveCount(0);
		// No per-combatant edit control for a player without a combat-participant grant (fail closed).
		await expect(page.locator('[data-testid^="apply-hp-"]')).toHaveCount(0);
	});

	test('COLLAB-007: a delivered handout is acknowledged, then revoked → the recipient is sealed (no leak)', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);

		// Deliver a handout to Demo Player only.
		await page.getByTestId('handout-title').fill('The cryptic letter');
		await page.getByTestId('handout-recipient-actor-player').check();
		await page.getByTestId('handout-reveal-cipher').check();
		await page.getByTestId('deliver-handout').click();
		await expect(page.getByTestId('handout-error')).toHaveCount(0);

		// The DM-only status surface shows the recipient as delivered (not yet opened), with a Revoke button.
		await expect(page.getByTestId('handout-status')).toContainText('actor-player');
		await expect(page.getByTestId('handout-status-ack').first()).toContainText('delivered');

		// View as the RECIPIENT and CONFIRM RECEIPT.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('handouts-received')).toContainText('The cryptic letter');
		await expect(page.getByTestId('handout-card-kind').first()).toBeVisible();
		await page.locator('[data-testid^="acknowledge-"]').first().click();
		await expect(page.locator('[data-testid^="handout-acknowledged-"]').first()).toBeVisible();

		// Back as the DM: the status now reads opened.
		await page.getByTestId('view-as-select').selectOption('local-dm');
		await expect(page.getByTestId('handout-status-ack').first()).toContainText('opened');

		// The DM REVOKES the recipient.
		await page.locator('[data-testid^="revoke-"]').first().click();
		await expect(page.getByTestId('handout-error')).toHaveCount(0);
		await expect(page.getByTestId('handout-status-sealed')).toBeVisible();

		// View as the (now revoked) recipient: they receive NOTHING — sealed, indistinguishable from a
		// non-recipient. No title, no content leak.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('handouts-received-empty')).toBeVisible();
		await expect(page.getByTestId('handouts-received')).not.toContainText('The cryptic letter');
	});

	test('COLLAB-012: a player group is a delivery target only; membership grants no visibility', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);
		await page.getByTestId('player-groups').waitFor({ state: 'visible' });

		// Deliver a handout to Demo Player ONLY (no group involved).
		await page.getByTestId('handout-title').fill('Solo secret');
		await page.getByTestId('handout-recipient-actor-player').check();
		await page.getByTestId('deliver-handout').click();
		await expect(page.getByTestId('handout-error')).toHaveCount(0);

		// Demo Player 2 is NOT a recipient: they see nothing.
		await page.getByTestId('view-as-select').selectOption('actor-player-2');
		await expect(page.getByTestId('handouts-received-empty')).toBeVisible();

		// Back as the DM: create a group containing BOTH Demo Player and Demo Player 2.
		await page.getByTestId('view-as-select').selectOption('local-dm');
		await page.getByTestId('player-group-name').fill('The Front Line');
		await page.getByTestId('player-group-member-actor-player').check();
		await page.getByTestId('player-group-member-actor-player-2').check();
		await page.getByTestId('create-player-group').click();
		await expect(page.getByTestId('player-group-error')).toHaveCount(0);
		await expect(page.getByTestId('player-group-list')).toContainText('The Front Line');

		// HARD ASSERTION: adding Demo Player 2 to a group did NOT retroactively deliver the prior handout —
		// membership confers no visibility.
		await page.getByTestId('view-as-select').selectOption('actor-player-2');
		await expect(page.getByTestId('handouts-received-empty')).toBeVisible();
		await expect(page.getByTestId('handouts-received')).not.toContainText('Solo secret');

		// A LATER delivery to the GROUP now reaches BOTH members (delivery target resolution).
		await page.getByTestId('view-as-select').selectOption('local-dm');
		await page.getByTestId('handout-title').fill('Group rally');
		await page.getByTestId('handout-recipient-actor-player').uncheck();
		await page.getByTestId('handout-group-the-front-line').check();
		await page.getByTestId('deliver-handout').click();
		await expect(page.getByTestId('handout-error')).toHaveCount(0);

		// Demo Player 2 now sees the GROUP delivery (but still not the prior solo secret).
		await page.getByTestId('view-as-select').selectOption('actor-player-2');
		await expect(page.getByTestId('handouts-received')).toContainText('Group rally');
		await expect(page.getByTestId('handouts-received')).not.toContainText('Solo secret');
	});

	test('COLLAB-012: the player-group surface is DM-only (a player cannot manage groups)', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);
		await page.getByTestId('player-groups').waitFor({ state: 'visible' });

		// View as a player: the DM-only player-group management surface is absent entirely.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('session-view')).toBeVisible();
		await expect(page.getByTestId('player-groups')).toHaveCount(0);
	});
});
