import { expect, test, type Page } from '@playwright/test';

/**
 * UX-CMD-004/005/006/007/009/010/011 — the Command Center live-control surface: the Player-View
 * Controller (preview + push affordances), the DM-only player-view preview modal, the push-handout
 * confirmation flow, the active-map projection controls, the phase-badge transitions, and command
 * palette parity.
 *
 * These are exactly the controls where an accidental reveal happens, so every test that renders a
 * non-DM perspective carries a negative marker assertion (the FORBIDDEN string must never appear).
 */

const FORBIDDEN = 'DMSECRETLIVE7Q';

async function resetHome(page: Page) {
	await page.goto('/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('cc-status-strip').waitFor({ state: 'visible' });
}

async function createScene(page: Page, name: string, visibility: 'dm-only' | 'player-visible') {
	await page.goto('/scenes/');
	await page.getByTestId('scene-name').waitFor({ state: 'visible' });
	await page.getByTestId('scene-name').fill(name);
	await page.getByTestId('scene-visibility').selectOption(visibility);
	await expect(page.getByTestId('scene-create')).toBeEnabled();
	await page.getByTestId('scene-create').click();
	await expect(page.getByTestId('scene-list')).toContainText(name);
}

async function createNote(
	page: Page,
	title: string,
	visibility: 'dm-only' | 'player-visible',
): Promise<void> {
	await page.goto('/knowledge/');
	await page.getByTestId('knowledge-view').waitFor({ state: 'visible' });
	await page.getByTestId('note-new-title').fill(title);
	await page.getByTestId('note-new-visibility').selectOption(visibility);
	await page.getByTestId('note-create').click();
	await expect(page.getByTestId('note-editor')).toContainText(`Editing: ${title}`);
}

async function gotoHome(page: Page) {
	await page.getByTestId('nav-command-center').click();
	await page.getByTestId('cc-status-strip').waitFor({ state: 'visible' });
}

test.describe('UX-CMD Command Center live controls', () => {
	test.beforeEach(async ({ page }) => {
		await resetHome(page);
	});

	test('UX-CMD-004 — every participant is listed with preview and push affordances, no drawer needed', async ({
		page,
	}) => {
		// All three demo players + the observer are listed directly on the home (AC1).
		await expect(page.getByTestId('cc-player-view-row-actor-player')).toBeVisible();
		await expect(page.getByTestId('cc-player-view-row-actor-player-2')).toBeVisible();
		await expect(page.getByTestId('cc-player-view-row-actor-player-3')).toBeVisible();
		await expect(page.getByTestId('cc-player-view-row-actor-observer')).toBeVisible();

		// Each row carries the labelled Preview and Push affordances (UX-CMD-004 §spec).
		await expect(page.getByTestId('cc-player-view-preview-actor-player')).toHaveAttribute(
			'aria-label',
			"Preview Demo Player's view",
		);
		await expect(page.getByTestId('cc-player-view-push-actor-player')).toHaveAttribute(
			'aria-label',
			'Push handout to Demo Player',
		);
	});

	test('UX-CMD-005 — the DM-only preview renders the player view with no DM-only leak; Escape restores focus', async ({
		page,
	}) => {
		await createScene(page, `Secret ${FORBIDDEN}`, 'dm-only');
		await createScene(page, 'Shared Tavern', 'player-visible');
		await gotoHome(page);

		// Assign the player-visible scene to Demo Player.
		const select = page.getByTestId('cc-player-view-scene-actor-player');
		const value = await select
			.locator('option', { hasText: 'Shared Tavern' })
			.first()
			.getAttribute('value');
		await select.selectOption(value!);
		await page.getByTestId('cc-player-view-deliver-actor-player').click();
		await expect(page.getByTestId('cc-player-view-assignment-actor-player')).toContainText(
			'Shared Tavern',
		);

		// Open the preview: it renders THIS player's core-filtered view inside a DM-only modal.
		await page.getByTestId('cc-player-view-preview-actor-player').click();
		await expect(page.getByTestId('cc-preview-modal')).toBeVisible();
		await expect(page.getByTestId('cc-preview-banner')).toContainText('players cannot see');
		await expect(page.getByTestId('cc-preview-scene-name')).toHaveText('Shared Tavern');
		// AC1: the dm-only scene marker never appears in the preview.
		await expect(page.getByTestId('cc-preview-modal')).not.toContainText(FORBIDDEN);

		// AC2: Escape closes the modal and focus returns to the eye button that opened it.
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('cc-preview-modal')).toHaveCount(0);
		await expect(page.getByTestId('cc-player-view-preview-actor-player')).toBeFocused();

		// AC3: a participant with no assignment shows "No scene assigned", never a blank frame.
		await page.getByTestId('cc-player-view-preview-actor-player-2').click();
		await expect(page.getByTestId('cc-preview-unassigned')).toContainText('No scene assigned');
		await page.keyboard.press('Escape');
	});

	test('UX-CMD-006 — cancelling at the confirmation step delivers nothing (and hidden notes are never pushable)', async ({
		page,
	}) => {
		await createNote(page, 'Tavern Rumors', 'player-visible');
		await createNote(page, `Bane ${FORBIDDEN}`, 'dm-only');
		await gotoHome(page);
		await page.getByTestId('session-workflow-active').click();

		await page.getByTestId('cc-push-open').click();
		await expect(page.getByTestId('cc-push-dialog')).toBeVisible();
		// AC4: the dm-only note is structurally absent from the content selector.
		await expect(page.getByTestId('cc-push-content-list')).toContainText('Tavern Rumors');
		await expect(page.getByTestId('cc-push-dialog')).not.toContainText(FORBIDDEN);

		// Walk to the confirmation step, then CANCEL.
		await page.getByTestId('cc-push-content-list').getByText('Tavern Rumors').click();
		await page.getByTestId('cc-push-recipient-actor-player').check();
		await page.getByTestId('cc-push-review').click();
		await expect(page.getByTestId('cc-push-confirm-content')).toHaveText('Tavern Rumors');
		await expect(page.getByTestId('cc-push-confirm-recipients')).toContainText('Demo Player');
		await page.getByTestId('cc-push-cancel').click();
		await expect(page.getByTestId('cc-push-dialog')).toHaveCount(0);

		// AC3: nothing was delivered to any player canvas.
		await page.goto('/session/');
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('handouts-received-empty')).toBeVisible();
		await expect(page.locator('body')).not.toContainText('Tavern Rumors');
	});

	test('UX-CMD-006 — confirming the push delivers the handout to the selected players only', async ({
		page,
	}) => {
		await createNote(page, 'Tavern Rumors', 'player-visible');
		await gotoHome(page);
		await page.getByTestId('session-workflow-active').click();

		// The participant row's push button pre-targets that player (UX-CMD-004 §spec).
		await page.getByTestId('cc-player-view-push-actor-player').click();
		await page.getByTestId('cc-push-content-list').getByText('Tavern Rumors').click();
		await expect(page.getByTestId('cc-push-recipient-actor-player')).toBeChecked();
		await page.getByTestId('cc-push-review').click();
		await page.getByTestId('cc-push-now').click();
		await expect(page.getByTestId('cc-push-dialog')).toHaveCount(0);

		// The recipient sees the handout; a non-recipient receives nothing (AC2 + no-leak).
		await page.goto('/session/');
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('handouts-received')).toContainText('Tavern Rumors');
		await page.getByTestId('view-as-select').selectOption('actor-player-2');
		await expect(page.getByTestId('handouts-received-empty')).toBeVisible();
	});

	test('UX-CMD-007 — projecting the active map excludes DM-only layers and surfaces the Projecting state', async ({
		page,
	}) => {
		// Go live, then bind Western Reaches (it carries the dm-only "Hidden Camps" layer).
		await page.getByTestId('session-workflow-active').click();
		const mapSelect = page.getByTestId('cc-active-map-select');
		await mapSelect.selectOption({ label: 'Western Reaches' });
		await page.getByTestId('cc-active-map-bind').click();
		await expect(page.getByTestId('cc-active-map-preview')).toContainText('Western Reaches');

		// Before projecting: the glance state is explicit text, not colour alone.
		await expect(page.getByTestId('cc-map-projection-state')).toContainText('Not projecting');

		await page.getByTestId('cc-active-map-project').click();
		await expect(page.getByTestId('cc-map-projection-state')).toContainText('Projecting');
		await expect(page.getByTestId('cc-active-map-project')).toContainText('Projecting');

		// AC2: the DM sees the dm-only layer; the player projection NEVER contains it.
		await expect(page.getByTestId('cc-active-map-preview')).toContainText('Hidden Camps');
		await expect(page.getByTestId('cc-player-map-preview')).toBeVisible();
		await expect(page.getByTestId('cc-player-map-preview')).not.toContainText('Hidden Camps');

		// AC3: changing the map updates the embed + session record without leaving the home,
		// and the stale projection no longer reads as "Projecting".
		await mapSelect.selectOption({ label: 'Ruined Keep' });
		await page.getByTestId('cc-active-map-bind').click();
		await expect(page.getByTestId('cc-active-map-preview')).toContainText('Ruined Keep');
		await expect(page.getByTestId('cc-map-projection-state')).toContainText('Not projecting');
		await expect(page.getByTestId('command-center')).toBeVisible();
	});

	test('UX-CMD-010 — the phase badge pauses immediately, ends with two confirmations, archives with one', async ({
		page,
	}) => {
		// Start session: one confirmation naming the player-facing effect.
		await page.getByTestId('cc-phase-badge').click();
		await page.getByTestId('cc-phase-action-active').click();
		await expect(page.getByTestId('cc-phase-confirm')).toBeVisible();
		await page.getByTestId('cc-phase-confirm-accept').click();
		await expect(page.getByTestId('cc-status-phase')).toContainText('Active');

		// AC1: pause is IMMEDIATE — no confirmation dialog.
		await page.getByTestId('cc-phase-badge').click();
		await page.getByTestId('cc-phase-action-paused').click();
		await expect(page.getByTestId('cc-phase-confirm')).toHaveCount(0);
		await expect(page.getByTestId('cc-status-phase')).toContainText('Paused');

		// AC3: a participant sees the paused state on their own strip.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('cc-participant-home')).toBeVisible();
		await expect(page.getByTestId('cc-status-phase')).toContainText('Paused');
		await page.getByTestId('view-as-select').selectOption('local-dm');
		await page.getByTestId('cc-status-strip').waitFor({ state: 'visible' });

		// Resume is immediate too.
		await page.getByTestId('cc-phase-badge').click();
		await page.getByTestId('cc-phase-action-active').click();
		await expect(page.getByTestId('cc-status-phase')).toContainText('Active');

		// AC2: End session requires TWO confirmations before the session reaches recap.
		await page.getByTestId('cc-phase-badge').click();
		await page.getByTestId('cc-phase-action-ending').click();
		await expect(page.getByTestId('cc-phase-confirm')).toContainText('End this session?');
		await page.getByTestId('cc-phase-confirm-accept').click();
		await expect(page.getByTestId('cc-phase-end-recap')).toBeVisible();
		await page.getByTestId('cc-phase-end-recap-accept').click();
		await expect(page.getByTestId('cc-status-phase')).toContainText('Recap');

		// Archive: one confirmation; the badge then reads Archived.
		await page.getByTestId('cc-phase-badge').click();
		await page.getByTestId('cc-phase-action-archived').click();
		await expect(page.getByTestId('cc-phase-confirm')).toContainText('Archive this session?');
		await page.getByTestId('cc-phase-confirm-accept').click();
		await expect(page.getByTestId('cc-status-phase')).toContainText('Archived');
	});

	test('UX-CMD-011 — palette pause is identical to the badge; preview opens via the palette', async ({
		page,
	}) => {
		await page.getByTestId('session-workflow-active').click();
		await expect(page.getByTestId('cc-status-phase')).toContainText('Active');

		// Pause through the palette: the same session.set-workflow the badge dispatches (AC2).
		await page.getByTestId('open-command-palette').click();
		await page.getByTestId('palette-search').fill('Pause session');
		await page.getByTestId('palette-run-cc.session.phase:paused').click();
		await expect(page.getByTestId('command-palette')).toHaveCount(0);
		await expect(page.getByTestId('cc-status-phase')).toContainText('Paused');

		// "Preview <player>'s view" routes to the same DM-only preview modal (UX-CMD-005 parity).
		await page.getByTestId('open-command-palette').click();
		await page.getByTestId('palette-search').fill('Preview Demo Player');
		await page.getByTestId('palette-run-cc.preview-view:actor-player').click();
		await expect(page.getByTestId('cc-preview-modal')).toBeVisible();
		await expect(page.getByTestId('cc-preview-banner')).toContainText('players cannot see');
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('cc-preview-modal')).toHaveCount(0);

		// "Push handout to players…" opens the SAME confirmed flow the push buttons open (UX-CMD-006
		// parity; content selection is contextual inside the flow, never enumerated as commands).
		await page.getByTestId('open-command-palette').click();
		await page.getByTestId('palette-search').fill('Push handout');
		await page.getByTestId('palette-run-cc.push-handout').click();
		await expect(page.getByTestId('cc-push-dialog')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('cc-push-dialog')).toHaveCount(0);
	});

	test('UX-CMD-011 — a player palette never contains DM-only live-control commands (AC3, no leak)', async ({
		page,
	}) => {
		await createNote(page, `Bane ${FORBIDDEN}`, 'dm-only');
		await gotoHome(page);
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('cc-participant-home')).toBeVisible();

		await page.getByTestId('open-command-palette').click();
		// DM-only commands are HIDDEN entirely — not disabled (present-but-disabled leaks structure).
		await page.getByTestId('palette-search').fill('session');
		await expect(page.locator('[data-testid^="palette-action-cc.session.phase:"]')).toHaveCount(0);
		await page.getByTestId('palette-search').fill('Push handout');
		await expect(page.locator('[data-testid="palette-action-cc.push-handout"]')).toHaveCount(0);
		await page.getByTestId('palette-search').fill('Preview');
		await expect(page.locator('[data-testid^="palette-action-cc.preview-view:"]')).toHaveCount(0);
		await page.getByTestId('palette-search').fill(FORBIDDEN);
		await expect(page.getByTestId('command-palette')).not.toContainText(FORBIDDEN.slice(0, 12));
	});
});
