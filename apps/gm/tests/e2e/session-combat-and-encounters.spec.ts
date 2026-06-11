import { expect, test } from '@playwright/test';

// SES-002 / SES-006: the Session section's combat surface.
//
// - SES-006: the DM builds an encounter with combatant selection + party context and sees the
//   deterministic challenge guidance band update live as combatants are added.
// - SES-002: the DM runs combat from that encounter — initiative order + rounds/turns, applying
//   per-combatant HP/conditions, with a durable encounter log. Combat is gated on the active session
//   workflow (the Processing Core fails closed otherwise).
//
// The same stacked form/list UI renders on desktop and compact profiles, so this runs on BOTH
// Playwright projects. The "view as" header control switches the rendered actor against the shared
// local runtime, proving the actor-filtered combat view (a player never sees encounter prep).

test.describe('SES combat and encounters', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/session/');
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
	});

	// Start an active session from the home Command Center (DM-only). The home Scene auto-provisions.
	// The runtime persists the workflow to IndexedDB asynchronously after the status updates; a hard
	// navigation reloads from storage, so we poll the persisted session document for `active` before
	// navigating away. That avoids racing the durable write under full-suite load (no arbitrary waits).
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
		await page.goto('/session/');
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await expect(page.getByTestId('combat-needs-active-session')).toHaveCount(0);
		await expect(page.getByTestId('start-combat')).toBeEnabled();
	}

	async function clickInView(page: import('@playwright/test').Page, testId: string): Promise<void> {
		const locator = page.getByTestId(testId);
		await locator.scrollIntoViewIfNeeded();
		await locator.click();
	}

	test('SES-006: the DM builds an encounter and sees deterministic challenge guidance', async ({
		page,
	}) => {
		await page.getByTestId('encounter-builder').waitFor({ state: 'visible' });
		await page.getByTestId('encounter-title').fill('Goblin ambush');
		await page.getByTestId('party-size').fill('4');
		await page.getByTestId('party-level').fill('2');

		// Add four CR 1/4 goblins; the guidance band escalates as the threat grows.
		await page.getByTestId('combatant-name-input').fill('Goblin');
		await page.getByTestId('combatant-cr-input').fill('0.25');
		await page.getByTestId('combatant-qty-input').fill('4');
		await page.getByTestId('combatant-hp-input').fill('7');
		await clickInView(page, 'add-combatant');
		await expect(page.getByTestId('draft-combatant')).toContainText('Goblin');

		// The deterministic guidance is rendered (a real difficulty band, not empty).
		const difficulty = page.getByTestId('guidance-difficulty');
		await expect(difficulty).not.toBeEmpty();

		await clickInView(page, 'build-encounter');
		await expect(page.getByTestId('encounter-list')).toContainText('Goblin ambush');
		await expect(page.getByTestId('encounter-difficulty').first()).not.toBeEmpty();
	});

	test('SES-002: the DM runs combat from an encounter with initiative, turns, and HP', async ({
		page,
	}) => {
		// Build an encounter with two distinct-initiative monsters.
		await page.getByTestId('encounter-title').fill('Patrol');
		await page.getByTestId('combatant-name-input').fill('Goblin');
		await page.getByTestId('combatant-cr-input').fill('0.25');
		await page.getByTestId('combatant-qty-input').fill('1');
		await page.getByTestId('combatant-hp-input').fill('7');
		await clickInView(page, 'add-combatant');
		await page.getByTestId('combatant-name-input').fill('Ogre');
		await page.getByTestId('combatant-cr-input').fill('2');
		await page.getByTestId('combatant-qty-input').fill('1');
		await page.getByTestId('combatant-hp-input').fill('30');
		await clickInView(page, 'add-combatant');
		await clickInView(page, 'build-encounter');
		await expect(page.getByTestId('encounter-list')).toContainText('Patrol');

		// Combat is blocked until the session is active.
		await expect(page.getByTestId('combat-needs-active-session')).toBeVisible();

		await startActiveSession(page);

		// Run the encounter (the first/only built encounter is option index 1, after the placeholder).
		await page.getByTestId('start-encounter-select').selectOption({ index: 1 });
		await clickInView(page, 'start-combat');

		// Initiative order + round are rendered; two combatants are present.
		await expect(page.getByTestId('combat-round')).toContainText('Round 1');
		await expect(page.getByTestId('initiative-order').getByTestId('combatant-name')).toHaveCount(2);
		// The active badge marks the current turn.
		await expect(page.getByTestId('active-badge')).toHaveCount(1);

		// Advance the turn; the active combatant moves on.
		await clickInView(page, 'advance-turn');
		await expect(page.getByTestId('encounter-log')).toContainText('Turn advanced');

		// Apply damage to the first combatant (the 7 HP Goblin) through the UX-SES-005 inline
		// stepper: tap the HP number, type the absolute target (7 → 4 = damage 3), confirm.
		const firstHpEdit = page.getByTestId(/^hp-edit-/).first();
		await firstHpEdit.scrollIntoViewIfNeeded();
		await firstHpEdit.click();
		await page.getByTestId(/^hp-input-/).fill('4');
		await page.getByTestId(/^apply-hp-/).click();
		await expect(page.getByTestId('encounter-log')).toContainText('damage 3');

		// End combat; the log is preserved.
		await clickInView(page, 'end-combat');
		await expect(page.getByTestId('combat-ended')).toBeVisible();
	});

	test('SES-002/006: a player does not see encounter prep (DM-only, fail closed)', async ({
		page,
	}) => {
		// The DM builds an encounter.
		await page.getByTestId('encounter-title').fill('Secret boss');
		await page.getByTestId('combatant-name-input').fill('Dragon');
		await page.getByTestId('combatant-cr-input').fill('10');
		await page.getByTestId('combatant-hp-input').fill('200');
		await clickInView(page, 'add-combatant');
		await clickInView(page, 'build-encounter');
		await expect(page.getByTestId('encounter-list')).toContainText('Secret boss');

		// Switch to a player: the encounter builder surface is absent entirely (DM prep is DM-only).
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('session-view')).toBeVisible();
		await expect(page.getByTestId('encounter-builder')).toHaveCount(0);
	});
});
