import { expect, test } from '@playwright/test';

// CHAR-001 / CHAR-002 / CHAR-013: the Characters section. The DM quick-creates an NPC (defaulting
// dm-only, so a player never sees it), creates and transfers PC drafts (exactly one owner), and a
// player builds their PC through a guided, RESUMABLE flow that only the single owner may edit.
//
// The whole flow renders the same on desktop and compact profiles (it is a stacked list/form UI), so
// this runs on BOTH Playwright projects. The "view as" header control switches the rendered actor;
// the shared local runtime persists state, so DM and player actions interleave in one session.

test.describe('CHAR character creation and drafts', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/characters/');
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('characters-view').waitFor({ state: 'visible' });
	});

	test('CHAR-001: a DM quick-created NPC defaults to dm-only and is not visible to a player', async ({
		page,
	}) => {
		// The DM quick-creates an NPC, leaving visibility at its dm-only default.
		await page.getByTestId('qc-kind').selectOption('npc');
		await page.getByTestId('qc-name').fill('Goblin Sentry');
		await page.getByTestId('qc-hp').fill('7');
		await page.getByTestId('qc-ac').fill('13');
		await page.getByTestId('qc-submit').click();
		await expect(page.getByTestId('qc-created')).toContainText('Goblin Sentry');

		// The DM sees it in the roster.
		await expect(page.getByTestId('roster-list')).toContainText('Goblin Sentry');

		// View as a player: the dm-only NPC is omitted entirely (fail closed, not just hidden text).
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('characters-view')).toBeVisible();
		await expect(page.getByTestId('roster-list')).toHaveCount(0);
		await expect(page.getByTestId('roster-empty')).toBeVisible();
		await expect(page.getByText('Goblin Sentry')).toHaveCount(0);
	});

	test('CHAR-002: a draft owner can resume an in-progress PC draft; a non-owner cannot edit', async ({
		page,
	}) => {
		// DM creates a draft owned by Demo Player.
		await page.getByTestId('draft-owner').selectOption('actor-player');
		await page.getByTestId('draft-create').click();
		await expect(page.getByTestId('draft-list')).toContainText('Demo Player');

		// View as the owning player and start the guided flow: save the identity step.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('draft-flow')).toBeVisible();
		await page.getByTestId('field-name').fill('Aria');
		await page.getByTestId('field-background').selectOption('sage');
		await page.getByTestId('step-save').click();
		await expect(page.getByTestId('step-done-identity')).toBeVisible();

		// Resume round-trip: reload the app. The completed step is restored from the durable draft.
		await page.reload();
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('draft-flow')).toBeVisible();
		await expect(page.getByTestId('step-done-identity')).toBeVisible();
		// The saved value is restored into the resumed step's field.
		await page.getByTestId('step-tab-identity').click();
		await expect(page.getByTestId('field-name')).toHaveValue('Aria');

		// A NON-OWNER player cannot edit the draft: Demo Player 2 does not even see the flow, and
		// sees the "ask your DM" empty state instead (fail closed — no draft fields for a non-owner).
		await page.getByTestId('view-as-select').selectOption('actor-player-2');
		await expect(page.getByTestId('no-draft')).toBeVisible();
		await expect(page.getByTestId('draft-flow')).toHaveCount(0);
	});

	test('CHAR-002: completing every valid step finalizes the PC into the roster', async ({ page }) => {
		await page.getByTestId('draft-owner').selectOption('actor-player');
		await page.getByTestId('draft-create').click();

		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('draft-flow')).toBeVisible();

		// Identity.
		await page.getByTestId('step-tab-identity').click();
		await page.getByTestId('field-name').fill('Aria');
		await page.getByTestId('field-background').selectOption('sage');
		await page.getByTestId('step-save').click();

		// Abilities — a legal point-buy spread (15/14/13/12/10/8 = 27 points).
		await page.getByTestId('step-tab-abilities').click();
		await page.getByTestId('field-str').fill('15');
		await page.getByTestId('field-dex').fill('14');
		await page.getByTestId('field-con').fill('13');
		await page.getByTestId('field-int').fill('12');
		await page.getByTestId('field-wis').fill('10');
		await page.getByTestId('field-cha').fill('8');
		await page.getByTestId('step-save').click();

		// Class.
		await page.getByTestId('step-tab-class').click();
		await page.getByTestId('field-class').selectOption('wizard');
		await page.getByTestId('step-save').click();

		// Now ready to finalize.
		await expect(page.getByTestId('draft-ready')).toHaveAttribute('data-ready', 'true');
		await page.getByTestId('draft-finalize').click();

		// The finalized PC appears in the player's roster, and the in-progress draft flow is gone
		// (the draft is finalized, so it no longer appears as an editable draft).
		await expect(page.getByTestId('roster-list')).toContainText('Aria');
		await expect(page.getByTestId('draft-flow')).toHaveCount(0);
		await expect(page.getByTestId('no-draft')).toBeVisible();
	});

	test('CHAR-002: an over-budget abilities step blocks finalize with restored validation issues', async ({
		page,
	}) => {
		await page.getByTestId('draft-owner').selectOption('actor-player');
		await page.getByTestId('draft-create').click();

		await page.getByTestId('view-as-select').selectOption('actor-player');
		await page.getByTestId('step-tab-abilities').click();
		// All 15s spends far more than the 27-point budget.
		for (const ability of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
			await page.getByTestId(`field-${ability}`).fill('15');
		}
		await page.getByTestId('step-save').click();

		// The unresolved validation issue is shown and the draft is not ready to finalize.
		await expect(page.getByTestId('step-issues')).toBeVisible();
		await expect(page.getByTestId('draft-ready')).toHaveAttribute('data-ready', 'false');
		await expect(page.getByTestId('draft-finalize')).toBeDisabled();
	});

	test('CHAR-013: transferring draft ownership leaves exactly one owner', async ({ page }) => {
		// DM creates a draft for Demo Player.
		await page.getByTestId('draft-owner').selectOption('actor-player');
		await page.getByTestId('draft-create').click();
		await expect(page.getByTestId('draft-list')).toContainText('Demo Player');

		// Choose the transfer target (Demo Player 2) on the draft's own picker and transfer it. Transfer
		// is safety-critical, so it takes a confirmation dialog that names the players before dispatch.
		const draftItem = page.getByTestId('draft-list').locator('li').first();
		const draftId = (await draftItem.getAttribute('data-testid'))!.replace('draft-item-', '');
		await page.getByTestId(`draft-transfer-target-${draftId}`).selectOption('actor-player-2');
		await page.getByTestId(`draft-transfer-${draftId}`).click();
		await expect(page.getByTestId('draft-transfer-dialog')).toBeVisible();
		await page.getByTestId('draft-transfer-confirm').click();

		// Exactly one owner remains — Demo Player 2 — and the prior owner (Demo Player) is gone.
		const owners = page.getByTestId('draft-list').locator('[data-testid^="draft-owner-"]');
		await expect(owners).toHaveCount(1);
		await expect(owners.first()).toContainText('Demo Player 2');

		// The prior owner can no longer edit: viewing as Demo Player shows the no-draft empty state.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('no-draft')).toBeVisible();
		// The new owner can resume it.
		await page.getByTestId('view-as-select').selectOption('actor-player-2');
		await expect(page.getByTestId('draft-flow')).toBeVisible();
	});
});
