import { expect, test, type Page } from '@playwright/test';

// UX-SES-009..015 — the supporting live-play session tools:
//
// - UX-SES-009: Encounter Builder — the live challenge banner (role="status") recomputes the
//   difficulty band as combatants are added (no button); a blank title leaves Build inactive
//   (aria-disabled) with an inline requirement message; a saved encounter starts combat with ONE
//   action, flowing its stored groups into the initiative tracker.
// - UX-SES-010: Dice Tools — the expression input is the panel's first tabbable control; the
//   3-state Advantage selector rewrites a d20-only expression to 2d20kh1/2d20kl1 semantics through
//   the pure core transform (with an inline clarification for non-d20 expressions); the history
//   renders newest-first.
// - UX-SES-011: roll-entry anatomy — actor · expression → total · dice values · label · the
//   "DM only" badge; a DM-only roll NEVER appears in any player DOM node (core read-model filter).
// - UX-SES-012: Timer — manager sets the duration; the countdown turns red (data-urgency danger)
//   inside the final 10 s; expiry renders the "Time's up!" role="alert" banner. (The operator
//   operate-vs-configure split is covered in session-handouts-and-tools.spec.ts.)
// - UX-SES-013: Quick Reference — guided empty state (pin persistence/degradation covered in
//   session-handouts-and-tools.spec.ts; the thread→digest flow in session-prep-recap-and-calendar).
// - UX-SES-014: Prep/Recap — a player sees ONLY the guard message: no mode selector, no section
//   headings, no empty lists (the recap auto-switch + draft CTA flow is covered in
//   session-lifecycle-recovery-combat-shell.spec.ts).
// - UX-SES-015: Campaign calendar — the canonical date string renders IDENTICALLY for the player;
//   an invalid day (31 in a 30-day month) fails closed with an inline error and no write.
//
// The same stacked surfaces render on desktop and compact profiles, so this runs on BOTH
// Playwright projects (desktop-chromium AND mobile-chromium).

test.describe('UX-SES session tools, dice, timers, prep, calendar', () => {
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
	// document for `active` before navigating away (the standard no-arbitrary-wait pattern).
	async function startActiveSession(page: Page): Promise<void> {
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

	async function gotoSession(page: Page): Promise<void> {
		await page.goto('/session/');
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
	}

	async function clickInView(page: Page, testId: string): Promise<void> {
		const locator = page.getByTestId(testId);
		await locator.scrollIntoViewIfNeeded();
		await locator.click();
	}

	async function addDraftCombatant(
		page: Page,
		name: string,
		cr: string,
		qty: string,
		hp: string,
	): Promise<void> {
		await page.getByTestId('combatant-name-input').fill(name);
		await page.getByTestId('combatant-cr-input').fill(cr);
		await page.getByTestId('combatant-qty-input').fill(qty);
		await page.getByTestId('combatant-hp-input').fill(hp);
		await clickInView(page, 'add-combatant');
	}

	test('UX-SES-009 AC1/AC3 — the challenge banner updates live to Deadly; blank-title Build is inactive with an inline error', async ({
		page,
	}) => {
		await page.getByTestId('encounter-builder').waitFor({ state: 'visible' });

		// AC3 — blank title: the Build button is INACTIVE (aria-disabled) but explains itself.
		// (Playwright treats aria-disabled as non-actionable, so activate via keyboard — the same
		// parity path a keyboard user takes.)
		const build = page.getByTestId('build-encounter');
		await expect(build).toHaveAttribute('aria-disabled', 'true');
		await build.scrollIntoViewIfNeeded();
		await build.focus();
		await page.keyboard.press('Enter');
		await expect(page.getByTestId('encounter-error')).toContainText('title');
		await expect(page.getByTestId('no-encounters')).toBeVisible();

		// AC1 — the persistent status banner recomputes as combatants are added (no button press).
		await expect(page.getByTestId('challenge-guidance')).toHaveAttribute('role', 'status');
		await page.getByTestId('party-size').fill('4');
		await page.getByTestId('party-level').fill('1');
		await addDraftCombatant(page, 'Adult Dragon', '17', '2', '200');
		await expect(page.getByTestId('guidance-difficulty')).toHaveText('deadly');

		// With a title the button is active and the build lands.
		await page.getByTestId('encounter-title').fill('Dragon lair');
		await expect(build).not.toHaveAttribute('aria-disabled', 'true');
		await clickInView(page, 'build-encounter');
		await expect(page.getByTestId('encounter-list')).toContainText('Dragon lair');
		await expect(page.getByTestId('encounter-difficulty').first()).toHaveText('deadly');
	});

	test('UX-SES-009 AC2 — Start combat on a saved encounter flows five combatants into the tracker', async ({
		page,
	}) => {
		await page.getByTestId('encounter-builder').waitFor({ state: 'visible' });
		await page.getByTestId('encounter-title').fill('War party');
		await addDraftCombatant(page, 'Goblin', '0.25', '5', '7');
		await clickInView(page, 'build-encounter');
		await expect(page.getByTestId('encounter-list')).toContainText('War party');

		// The saved card's Start combat is gated on the active session.
		const startButton = page.locator('[data-testid^="start-combat-encounter-"]').first();
		await expect(startButton).toBeDisabled();

		await startActiveSession(page);
		await gotoSession(page);
		await startButton.scrollIntoViewIfNeeded();
		await startButton.click();

		// ONE action: the tracker opens with all five combatants in initiative order.
		await expect(page.getByTestId('combat-round')).toContainText('Round 1');
		await expect(page.getByTestId('initiative-order').getByTestId('combatant-name')).toHaveCount(5);
	});

	test('UX-SES-010 AC1/AC2 — first Tab lands on the expression input; Advantage rolls 2d20kh1+5 with both dice shown', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);

		// AC1 — from the panel, ONE Tab focuses the expression input (the first tabbable control).
		await page.getByTestId('dice-tools').focus();
		await page.keyboard.press('Tab');
		await expect(page.getByTestId('dice-expression')).toBeFocused();

		// AC2 — select Advantage, type d20+5, Enter: the core transform rolls 2d20kh1+5.
		await page.getByTestId('dice-adv-advantage').click();
		await expect(page.getByTestId('dice-adv-advantage')).toHaveAttribute('aria-checked', 'true');
		await page.getByTestId('dice-expression').fill('d20+5');
		await page.getByTestId('dice-expression').press('Enter');

		const firstEntry = page.locator('[data-testid^="roll-entry-"]').first();
		await expect(firstEntry.getByTestId('roll-expression')).toHaveText('2d20kh1+5');
		// BOTH rolled d20 values are visible in the entry anatomy (the dropped die in parentheses).
		await expect(firstEntry.getByTestId('roll-dice-values')).toHaveText(
			/^\[(\d+, \(\d+\)|\(\d+\), \d+)\]$/,
		);

		// A non-d20 expression under Advantage rolls unchanged, with the inline clarification.
		await page.getByTestId('dice-expression').fill('2d6+3');
		await expect(page.getByTestId('dice-adv-hint')).toContainText('Advantage applies to d20 rolls');
		await page.getByTestId('dice-expression').press('Enter');
		await expect(
			page.locator('[data-testid^="roll-entry-"]').first().getByTestId('roll-expression'),
		).toHaveText('2d6+3');
	});

	test('UX-SES-010 AC4 / UX-SES-011 — newest-first history, DM-only badge + hidden count, zero player DOM trace', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);

		// Two session-visible rolls: the history renders newest-first.
		await page.getByTestId('dice-expression').fill('1d4');
		await page.getByTestId('dice-label').fill('first roll');
		await clickInView(page, 'roll-dice');
		await page.getByTestId('dice-expression').fill('1d4');
		await page.getByTestId('dice-label').fill('second roll');
		await clickInView(page, 'roll-dice');
		const entries = page.locator('[data-testid^="roll-entry-"]');
		await expect(entries.first().getByTestId('roll-label')).toContainText('second roll');

		// A DM-only roll: badge + the DM-only hidden count line + actor attribution (UX-SES-011 AC1).
		await page.getByTestId('dice-expression').fill('1d20');
		await page.getByTestId('dice-label').fill('AMBUSHSECRET7Q');
		await page.getByTestId('dice-visibility').selectOption('dm-only');
		await clickInView(page, 'roll-dice');
		await expect(entries.first().getByTestId('roll-visibility')).toHaveText('DM only');
		await expect(entries.first().getByTestId('roll-actor')).not.toBeEmpty();
		await expect(page.getByTestId('dice-hidden-count')).toContainText('1 hidden roll');

		// UX-SES-011 AC2 — as the player, the secret roll exists in NO DOM node (page.content()),
		// the visible rolls remain, and the hidden-count line is absent. Reload first: the test
		// harness shares ONE live region between the "view as" actors, so the DM's own roll
		// announcement would linger in the DOM; a real player client never receives it
		// (announcements are produced per-client from the actor-filtered view).
		await page.reload();
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('dice-tools')).toBeVisible();
		await expect(page.locator('[data-testid^="roll-entry-"]')).toHaveCount(2);
		expect(await page.content()).not.toContain('AMBUSHSECRET7Q');
		await expect(page.getByTestId('dice-hidden-count')).toHaveCount(0);
	});

	test('UX-SES-012 AC1/AC3 — manager duration, danger urgency in the final 10 s, expiry alert', async ({
		page,
	}) => {
		await startActiveSession(page);
		await gotoSession(page);
		await page.getByTestId('live-tools').waitFor({ state: 'visible' });

		// The DM (manager) sets an 8-second duration and starts: 8 s remaining is inside the final-10s
		// band, so the numerals/bar carry the danger urgency on every profile (AC1).
		await page.getByTestId('timer-duration-input').fill('8');
		await clickInView(page, 'timer-configure');
		await expect(page.getByTestId('live-tools-error')).toHaveCount(0);
		await clickInView(page, 'timer-start');
		await expect(page.getByTestId('session-timer')).toHaveAttribute('data-urgency', 'danger');
		// Sub-10-second display format "S.s".
		await expect(page.getByTestId('timer-display')).toHaveText(/^\d\.\d$/);
		await expect(page.getByTestId('timer-status')).toContainText('Running');

		// AC3 — a 1-second timer expires: "Time's up!" renders as a role="alert" banner at 0:00.
		await clickInView(page, 'timer-reset');
		await page.getByTestId('timer-duration-input').fill('1');
		await clickInView(page, 'timer-configure');
		await clickInView(page, 'timer-start');
		const expired = page.getByTestId('timer-expired');
		await expect(expired).toBeVisible();
		await expect(expired).toHaveAttribute('role', 'alert');
		await expect(expired).toContainText("Time's up!");
		await expect(page.getByTestId('timer-display')).toHaveText('0:00');
	});

	test('UX-SES-013 / UX-SES-014 — guided empty pin state; a player gets ONLY the digest guard message', async ({
		page,
	}) => {
		await page.getByTestId('quick-reference').waitFor({ state: 'visible' });
		// UX-SES-013 — the guided empty state names the next step.
		await expect(page.getByTestId('quick-reference-empty')).toContainText(
			'Use the form above to pin a note',
		);

		// UX-SES-014 AC2 — as a player: ONLY the guard message. No mode selector, no CTA, no section
		// headings, no empty lists inside the digest panel (fail closed).
		await page.getByTestId('view-as-select').selectOption('actor-player');
		const digestPanel = page.getByTestId('prep-recap-digest');
		await expect(page.getByTestId('digest-empty')).toContainText(
			'The prep/recap digest is available to the DM only.',
		);
		await expect(page.getByTestId('digest-mode-group')).toHaveCount(0);
		await expect(page.getByTestId('create-recap-notes')).toHaveCount(0);
		await expect(digestPanel.locator('h4')).toHaveCount(0);
		await expect(digestPanel.locator('ul, li')).toHaveCount(0);
		// The player also never sees the DM pin form or any pinned panel surface content.
		await expect(page.getByTestId('quick-reference-pin-form')).toHaveCount(0);
	});

	test('UX-SES-015 AC1/AC3 — the canonical date renders identically for the player; an invalid day fails inline', async ({
		page,
	}) => {
		await page.getByTestId('prep-recap').waitFor({ state: 'visible' });
		await clickInView(page, 'prep-define-calendar');

		// Set a valid date: 15 Ches (month 3, 31 days) 1372.
		await page.getByTestId('campaign-date-month').fill('3');
		await page.getByTestId('campaign-date-day').fill('15');
		await page.getByTestId('campaign-date-year').fill('1372');
		await clickInView(page, 'set-campaign-date');
		const currentDate = page.getByTestId('campaign-current-date');
		await expect(currentDate).toContainText('15 Ches 1372 DR');
		const dmDateText = (await currentDate.textContent())?.trim() ?? '';

		// AC3 — day 31 in Hammer (a 30-day month) is rejected fail-closed in the core: an inline
		// error appears at the form and the displayed date does NOT change.
		await page.getByTestId('campaign-date-month').fill('1');
		await page.getByTestId('campaign-date-day').fill('31');
		await clickInView(page, 'set-campaign-date');
		await expect(page.getByTestId('campaign-date-error')).toBeVisible();
		await expect(currentDate).toContainText('15 Ches 1372 DR');

		// AC1 — the player renders the IDENTICAL canonical date string (CONTENT-011 formatter).
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('campaign-current-date')).toBeVisible();
		const playerDateText =
			(await page.getByTestId('campaign-current-date').textContent())?.trim() ?? '';
		expect(playerDateText).toBe(dmDateText);
	});
});
