import { expect, test, type Page } from '@playwright/test';

/**
 * UX-SESSION-combat-editing-conditions-and-player-tracker — combat editing hot paths + the safe
 * player tracker:
 *
 * - UX-SES-005: tap-to-edit HP via the INLINE STEPPER (absolute target, ≤2 actions, no context
 *   menu), the undo toast dispatching the core's inverse command, and the at-0 "Mark as defeated?"
 *   confirmation ("Yes — defeated" / "No — keep at 0").
 * - UX-SES-007: text-label condition chips visible without hover/menu, chip-tap removal, the
 *   concentration-check toast with the DC, and the death-save track for dying combatants.
 * - UX-SES-008: mid-combat quick-add (mass "Goblin 1…5"), hide/unhide with the player-side
 *   placeholder, explicit reorder controls, and remove behind one confirmation dialog.
 * - UX-SES-016: the player tracker — read-only everywhere the player lacks authority, HP stepper
 *   ONLY for their `combat-participant` character, and the hidden-combatant NO-LEAK guarantee
 *   (negative DOM assertions).
 *
 * The same stacked UI renders on desktop and compact profiles, so this runs on BOTH Playwright
 * projects. The "view as" header control switches the rendered actor against the shared local
 * runtime; reloads in the no-leak scenarios clear the single shared live region so DM-side
 * announcements never masquerade as player DOM content.
 */

const MARKER = 'DMSECRETSESEDIT7Q';

async function resetApp(page: Page): Promise<void> {
	await page.goto('/session/');
	await page.getByTestId('session-view').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('session-view').waitFor({ state: 'visible' });
}

/** Poll the persisted session document until `predicate` holds (avoids racing the durable write). */
async function waitForPersistedSession(page: Page, predicateBody: string): Promise<void> {
	await page.waitForFunction(async (body) => {
		const doc = await new Promise<{ doc?: Record<string, unknown> } | undefined>((resolve) => {
			const open = indexedDB.open('dndtools-v2');
			open.onsuccess = () => {
				try {
					const tx = open.result.transaction('documents', 'readonly');
					const get = tx.objectStore('documents').get('session-state');
					get.onsuccess = () => resolve(get.result);
					get.onerror = () => resolve(undefined);
				} catch {
					resolve(undefined);
				}
			};
			open.onerror = () => resolve(undefined);
		});
		if (!doc?.doc) return false;

		return new Function('doc', `return (${body});`)(doc.doc) === true;
	}, predicateBody);
}

/** Start an active session from the home workflow toolbar and land on /session. */
async function startActiveSession(page: Page): Promise<void> {
	await page.goto('/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
	await page.getByTestId('session-workflow-active').click();
	await expect(page.getByTestId('session-workflow-status')).toContainText('active');
	await waitForPersistedSession(page, `doc.workflow === 'active'`);
	await page.goto('/session/');
	await page.getByTestId('session-view').waitFor({ state: 'visible' });
}

/** Dismiss the (non-blocking) full-restore confirmation if it is showing. */
async function dismissRestoredBanner(page: Page): Promise<void> {
	const banner = page.getByTestId('ses-recovery-restored');
	if ((await banner.count()) > 0 && (await banner.isVisible())) {
		await page.getByTestId('ses-recovery-continue').click();
		await expect(banner).toHaveCount(0);
	}
}

async function clickInView(page: Page, testId: string): Promise<void> {
	const locator = page.getByTestId(testId);
	await locator.scrollIntoViewIfNeeded();
	await locator.click();
}

/** Build an encounter of named monsters (name, hp) and start combat from it. */
async function startCombat(
	page: Page,
	title: string,
	monsters: Array<{ name: string; hp: number; qty?: number }>,
): Promise<void> {
	await page.getByTestId('encounter-title').fill(title);
	for (const monster of monsters) {
		await page.getByTestId('combatant-name-input').fill(monster.name);
		await page.getByTestId('combatant-cr-input').fill('0.25');
		await page.getByTestId('combatant-qty-input').fill(String(monster.qty ?? 1));
		await page.getByTestId('combatant-hp-input').fill(String(monster.hp));
		await clickInView(page, 'add-combatant');
	}
	await clickInView(page, 'build-encounter');
	await expect(page.getByTestId('encounter-list')).toContainText(title);
	await page.getByTestId('start-encounter-select').selectOption({ index: 1 });
	await clickInView(page, 'start-combat');
	await expect(page.getByTestId('combat-round')).toContainText('Round 1');
	await waitForPersistedSession(page, `doc.combat && doc.combat.status === 'running'`);
}

/** The data-combatant-id of the row whose name cell shows `name`. */
async function rowIdByName(page: Page, name: string): Promise<string> {
	const row = page
		.getByTestId('initiative-order')
		.locator('li')
		.filter({ has: page.getByTestId('combatant-name').getByText(name, { exact: true }) });
	return (await row.first().getAttribute('data-combatant-id'))!;
}

test.describe('UX-SES combat editing, conditions, and the player tracker', () => {
	test.beforeEach(async ({ page }) => {
		await resetApp(page);
	});

	test('UX-SES-005 — tapping HP opens the inline stepper; an absolute value confirms with an undo toast', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await startCombat(page, 'Stepper', [{ name: 'Ogre', hp: 45 }]);
		const rowId = await rowIdByName(page, 'Ogre');

		// AC1 — tapping the HP number opens the in-place stepper without navigating away.
		await clickInView(page, `hp-edit-${rowId}`);
		await expect(page.getByTestId(`hp-stepper-${rowId}`)).toBeVisible();
		await expect(page.getByTestId('session-view')).toBeVisible();

		// The −/+ steppers adjust the draft value without dispatching.
		await page.getByTestId(`hp-minus-${rowId}`).click();
		await expect(page.getByTestId(`hp-input-${rowId}`)).toHaveValue('44');
		await page.getByTestId(`hp-plus-${rowId}`).click();
		await expect(page.getByTestId(`hp-input-${rowId}`)).toHaveValue('45');

		// AC2 — type 42 and confirm: the row immediately shows 42/45 and the undo toast appears.
		await page.getByTestId(`hp-input-${rowId}`).fill('42');
		await page.getByTestId(`apply-hp-${rowId}`).click();
		const hpCell = page.getByTestId(`combatant-${rowId}`).getByTestId('combatant-hp');
		await expect(hpCell).toContainText('42');
		await expect(hpCell).toContainText('/45');
		const toast = page.getByTestId('ses-toast').first();
		await expect(toast).toContainText('Ogre HP: 45 → 42. Undo?');

		// AC4 — Undo within the 8 s window restores via the core's inverse command.
		await toast.getByTestId('ses-toast-action').click();
		await expect(page.getByTestId('ses-toast-message').first()).toContainText('HP change undone.');
		await expect(hpCell).toContainText('45');

		// Escape cancels a reopened editor without dispatching (keyboard parity).
		await clickInView(page, `hp-edit-${rowId}`);
		await page.getByTestId(`hp-input-${rowId}`).press('Escape');
		await expect(page.getByTestId(`hp-stepper-${rowId}`)).toHaveCount(0);
		await expect(hpCell).toContainText('45');
	});

	test('UX-SES-005 AC3 / UX-SES-007 AC3 — at 0 HP: "No" keeps a dying combatant with death saves; "Yes" defeats', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await startCombat(page, 'Last stand', [
			{ name: 'Goblin', hp: 7 },
			{ name: 'Ogre', hp: 30 },
		]);
		const goblinId = await rowIdByName(page, 'Goblin');

		// Set the goblin to 0 through the stepper: the defeated confirmation appears.
		await clickInView(page, `hp-edit-${goblinId}`);
		await page.getByTestId(`hp-input-${goblinId}`).fill('0');
		await page.getByTestId(`apply-hp-${goblinId}`).click();
		await expect(page.getByTestId(`defeat-confirm-${goblinId}`)).toBeVisible();

		// "No — keep at 0" → NOT defeated; the death-save track renders (3 failures + 3 successes).
		await page.getByTestId(`defeat-no-${goblinId}`).click();
		const goblinRow = page.getByTestId(`combatant-${goblinId}`);
		await expect(goblinRow.getByTestId('defeated-badge')).toHaveCount(0);
		await expect(page.getByTestId(`death-saves-${goblinId}`)).toBeVisible();
		await expect(goblinRow.locator('[data-testid^="death-save-failure-box-"]')).toHaveCount(3);
		await expect(goblinRow.locator('[data-testid^="death-save-success-box-"]')).toHaveCount(3);

		// Tally one failure: the first failure box checks.
		await clickInView(page, `death-save-failure-box-${goblinId}-1`);
		await expect(page.getByTestId(`death-save-failure-box-${goblinId}-1`)).toHaveAttribute(
			'aria-checked',
			'true',
		);

		// AC3 — "Mark defeated" applies the defeated treatment and the row sinks below the living.
		await clickInView(page, `mark-defeated-${goblinId}`);
		await expect(goblinRow.getByTestId('defeated-badge')).toBeVisible();
		await expect(page.getByTestId(`death-saves-${goblinId}`)).toHaveCount(0);
		const lastRowId = await page
			.getByTestId('initiative-order')
			.locator('li')
			.last()
			.getAttribute('data-combatant-id');
		expect(lastRowId).toBe(goblinId);
	});

	test('UX-SES-007 AC1/AC2 — condition chips read as text in the row; damaging a concentrator raises the DC toast', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await startCombat(page, 'Conditions', [{ name: 'Ogre', hp: 30 }]);
		const ogreId = await rowIdByName(page, 'Ogre');

		// AC1 — the condition is visible as a text chip with no hover/tooltip/menu interaction.
		await page.getByTestId(`condition-input-${ogreId}`).fill('Paralyzed');
		await clickInView(page, `add-condition-${ogreId}`);
		await expect(
			page.getByTestId(`combatant-${ogreId}`).getByTestId('combatant-conditions'),
		).toContainText('Paralyzed');

		// Tapping the chip removes the condition (authorized row).
		await clickInView(page, `remove-condition-${ogreId}-Paralyzed`);
		await expect(
			page.getByTestId(`combatant-${ogreId}`).getByTestId('combatant-conditions'),
		).toHaveCount(0);

		// Concentration: the chip renders, and damage raises the DC toast within the action.
		await page.getByTestId(`concentration-input-${ogreId}`).fill('Bless');
		await clickInView(page, `set-concentration-${ogreId}`);
		await expect(
			page.getByTestId(`combatant-${ogreId}`).getByTestId('concentrating-badge'),
		).toBeVisible();

		// AC2 — 22 damage (30 → 8): DC = max(10, ⌊22/2⌋) = 11, prominent in the toast.
		await clickInView(page, `hp-edit-${ogreId}`);
		await page.getByTestId(`hp-input-${ogreId}`).fill('8');
		await page.getByTestId(`apply-hp-${ogreId}`).click();
		await expect(page.getByTestId('ses-toast-stack')).toContainText('Concentration check! DC 11 for Ogre.');
	});

	test('UX-SES-008 AC1 — quick-adding 5× Goblin mid-combat yields "Goblin 1" through "Goblin 5"', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await startCombat(page, 'Reinforcements', [{ name: 'Ogre', hp: 30 }]);

		await clickInView(page, 'add-combatant-open');
		await expect(page.getByTestId('add-combatant-dialog')).toBeVisible();
		await page.getByTestId('add-name').fill('Goblin');
		await page.getByTestId('add-hp').fill('7');
		await page.getByTestId('add-qty').fill('5');
		// Initiative left blank: the core auto-rolls 1d20 deterministically per combatant.
		await page.getByTestId('add-to-combat').click();

		await expect(page.getByTestId('add-combatant-dialog')).toHaveCount(0);
		const order = page.getByTestId('initiative-order');
		await expect(order.locator('li')).toHaveCount(6);
		for (const label of ['Goblin 1', 'Goblin 2', 'Goblin 3', 'Goblin 4', 'Goblin 5']) {
			await expect(order).toContainText(label);
		}
	});

	test('UX-SES-008 — explicit reorder controls move a combatant and announce the new position', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await startCombat(page, 'Order', [
			{ name: 'Goblin', hp: 7 },
			{ name: 'Ogre', hp: 30 },
		]);
		const goblinId = await rowIdByName(page, 'Goblin');
		const rows = page.getByTestId('initiative-order').locator('li');
		expect(await rows.first().getAttribute('data-combatant-id')).toBe(goblinId);

		// Move the goblin later: it becomes the second row; the move is announced politely.
		await clickInView(page, `move-later-${goblinId}`);
		await expect(rows.nth(1)).toHaveAttribute('data-combatant-id', goblinId);
		await expect(page.getByTestId('live-polite')).toContainText('Goblin moved to position 2');

		// And back up via the explicit control.
		await clickInView(page, `move-earlier-${goblinId}`);
		await expect(rows.first()).toHaveAttribute('data-combatant-id', goblinId);
	});

	test('UX-SES-008 AC3 — removing a combatant requires one confirmation; Cancel keeps the row', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await startCombat(page, 'Removal', [
			{ name: 'Goblin', hp: 7 },
			{ name: 'Ogre', hp: 30 },
		]);
		const goblinId = await rowIdByName(page, 'Goblin');

		// Cancel path: the dialog closes and the row stays.
		await clickInView(page, `remove-from-combat-${goblinId}`);
		const dialog = page.getByTestId('remove-combatant-confirm');
		await expect(dialog).toBeVisible();
		await expect(page.getByTestId('remove-combatant-message')).toContainText(
			'Remove Goblin from this combat? They can be re-added.',
		);
		await page.getByTestId('remove-combatant-cancel').click();
		await expect(dialog).toHaveCount(0);
		await expect(page.getByTestId(`combatant-${goblinId}`)).toBeVisible();

		// Confirm path: the row is removed from the tracker.
		await clickInView(page, `remove-from-combat-${goblinId}`);
		await page.getByTestId('remove-combatant-accept').click();
		await expect(page.getByTestId(`combatant-${goblinId}`)).toHaveCount(0);
		await expect(page.getByTestId('initiative-order').locator('li')).toHaveCount(1);
	});

	test('UX-SES-008 AC2 / UX-SES-016 AC2 — hiding mid-combat gives players a placeholder, never the identity', async ({
		page,
	}) => {
		await startActiveSession(page);
		await dismissRestoredBanner(page);
		// The marker combatant is added FIRST so it acts first — when the player views the tracker,
		// the ACTIVE combatant is the hidden one (UX-SES-016 §states active placeholder row).
		await startCombat(page, 'Ambush', [
			{ name: MARKER, hp: 66 },
			{ name: 'Goblin', hp: 7 },
		]);
		const markerId = await rowIdByName(page, MARKER);

		// The DM hides the combatant mid-combat: the DM keeps the real name + a hidden marker.
		await clickInView(page, `toggle-hidden-${markerId}`);
		await expect(page.getByTestId(`hidden-badge-${markerId}`)).toBeVisible();
		await expect(page.getByTestId('combat-hidden-count')).toContainText('1 hidden');
		await waitForPersistedSession(
			page,
			`doc.combat && Object.values(doc.combat.combatants).some((c) => c.hidden === true)`,
		);

		// Reload before switching actors: the shared live region carried DM-side announcements
		// (real names); a player client would never have received them.
		await page.reload();
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await dismissRestoredBanner(page);

		// Player client: a placeholder row with em-dash stats; the real name appears NOWHERE in the
		// DOM, including ARIA labels (AC2 negative assertions).
		await page.getByTestId('view-as-select').selectOption('actor-player');
		const order = page.getByTestId('initiative-order');
		await expect(order).toContainText('Unknown creature');
		await expect(order).not.toContainText(MARKER);
		await expect(page.getByTestId('combatant-hidden').first()).toContainText('HP — / —');
		const pageHtml = await page.content();
		expect(pageHtml).not.toContain(MARKER);

		// UX-SES-016 — the player tracker is read-only: no advance/add/reorder/remove/HP-edit
		// affordances anywhere, and the placeholder row exposes no menu at all.
		await expect(page.getByTestId('advance-turn')).toHaveCount(0);
		await expect(page.getByTestId('add-combatant-open')).toHaveCount(0);
		await expect(page.locator('[data-testid^="hp-edit-"]')).toHaveCount(0);
		await expect(page.locator('[data-testid^="move-earlier-"]')).toHaveCount(0);
		await expect(page.locator('[data-testid^="remove-from-combat-"]')).toHaveCount(0);
		await expect(page.locator('[data-testid^="toggle-hidden-"]')).toHaveCount(0);
		// The player tracker carries its own accessible label.
		await expect(order).toHaveAttribute('aria-label', 'Initiative order (player view)');
		// The ACTIVE combatant is the hidden one: the player sees the placeholder with the chip.
		const activeRow = order.locator('li[aria-current="true"]');
		await expect(activeRow).toContainText('Unknown creature');
		await expect(activeRow.getByTestId('active-badge')).toContainText('Active');

		// Back as the DM: unhide reveals the combatant to players again.
		await page.getByTestId('view-as-select').selectOption('local-dm');
		await clickInView(page, `toggle-hidden-${markerId}`);
		await expect(page.getByTestId(`hidden-badge-${markerId}`)).toHaveCount(0);
		await waitForPersistedSession(
			page,
			`doc.combat && Object.values(doc.combat.combatants).every((c) => c.hidden !== true)`,
		);
		await page.reload();
		await page.getByTestId('session-view').waitFor({ state: 'visible' });
		await dismissRestoredBanner(page);
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('initiative-order')).toContainText(MARKER);
	});

	test('UX-SES-016 AC1 — a combat-participant edits THEIR character HP via the stepper; nothing else', async ({
		page,
	}) => {
		// The DM quick-creates a player-visible sidekick and grants ownership (which carries
		// combat-participant) to Demo Player — the CHAR surface flow.
		await page.goto('/characters/');
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
		await page.getByTestId('qc-kind').selectOption('sidekick');
		await page.getByTestId('qc-name').fill('Pip');
		await page.getByTestId('qc-hp').fill('10');
		await page.getByTestId('qc-ac').fill('12');
		await page.getByTestId('qc-visibility').selectOption('player-visible');
		await page.getByTestId('qc-submit').click();
		await expect(page.getByTestId('qc-created')).toContainText('Pip');
		const card = page
			.getByTestId('collab-list')
			.locator('[data-testid^="collab-character-"]')
			.first();
		const characterId = (await card.getAttribute('data-testid'))!.replace('collab-character-', '');
		await page.getByTestId(`collab-grant-target-${characterId}`).selectOption('actor-player');
		await page.getByTestId(`collab-grant-${characterId}`).click();
		await expect(page.getByTestId(`collab-owner-${characterId}`)).toContainText('Demo Player');

		await startActiveSession(page);
		await dismissRestoredBanner(page);
		await startCombat(page, 'Party fight', [{ name: 'Goblin', hp: 7 }]);

		// Add Pip to the running combat from the vault-character path of the Add panel.
		await clickInView(page, 'add-combatant-open');
		await page.getByTestId('add-character-select').selectOption(characterId);
		await page.getByTestId('add-character').click();
		await expect(page.getByTestId('add-combatant-dialog')).toHaveCount(0);
		await expect(page.getByTestId('initiative-order')).toContainText('Pip');
		const pipRowId = await rowIdByName(page, 'Pip');

		// As Demo Player: ONLY Pip's HP is tappable (their combat-participant character).
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.locator('[data-testid^="hp-edit-"]')).toHaveCount(1);
		const ownHp = page.getByTestId(`hp-edit-${pipRowId}`);
		await expect(ownHp).toHaveAttribute('aria-label', 'Your HP for Pip — tap to edit');
		// No DM management affordances for the player (UX-SES-016).
		await expect(page.getByTestId('advance-turn')).toHaveCount(0);
		await expect(page.locator('[data-testid^="remove-from-combat-"]')).toHaveCount(0);

		// AC1 — tapping their HP opens the stepper for their character only; the edit lands.
		await ownHp.scrollIntoViewIfNeeded();
		await ownHp.click();
		await expect(page.getByTestId(`hp-stepper-${pipRowId}`)).toBeVisible();
		await page.getByTestId(`hp-input-${pipRowId}`).fill('6');
		await page.getByTestId(`apply-hp-${pipRowId}`).click();
		const pipHp = page.getByTestId(`combatant-${pipRowId}`).getByTestId('combatant-hp');
		await expect(pipHp).toContainText('6');
		await expect(pipHp).toContainText('/10');
		await expect(page.getByTestId('ses-toast').first()).toContainText('Pip HP: 10 → 6. Undo?');
	});
});
