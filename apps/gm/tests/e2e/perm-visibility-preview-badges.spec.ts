import { expect, test, type Page } from '@playwright/test';

/**
 * UX-PERM-001 / UX-PERM-006 / UX-PERM-007 / UX-PERM-008 — visibility controls, preview-as mode,
 * ambient badges, and session privacy status.
 *
 * NO-LEAK is the contract under test: the visibility toggle and badges resolve through DM-only
 * default-deny core choke points (null for any non-DM ⇒ not rendered), and preview mode renders the
 * shell through the SAME core actor-filtered queries a real player would get (a reserved zero-grant
 * actor, or a specific player's exact grants) — never a cosmetic overlay. Stacked list/card surfaces
 * render identically across profiles, so every test runs on BOTH Playwright projects.
 */

const FORBIDDEN_TITLE = 'forbidden-plot-XYZZY';

async function resetKnowledge(page: Page) {
	await page.goto('/knowledge/');
	await page.getByTestId('notes-workbench').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('notes-workbench').waitFor({ state: 'visible' });
}

/** DM creates a note via the workbench and returns its item id (from the row testid). */
async function createNote(
	page: Page,
	title: string,
	visibility: 'dm-only' | 'player-visible' | 'shared',
): Promise<string> {
	await page.getByTestId('note-new-title').fill(title);
	await page.getByTestId('note-new-visibility').selectOption(visibility);
	await page.getByTestId('note-create').click();
	// Creating opens the editor for the new note; the row also appears in the list.
	const row = page.locator('[data-testid^="note-row-"]', { hasText: title });
	await expect(row).toHaveCount(1);
	const rowTestId = await row.getAttribute('data-testid');
	return rowTestId!.replace('note-row-', '');
}

/** DM grants the named capability set on a content item to Demo Player (actor-player). */
async function grantContentItemToDemoPlayer(page: Page, itemId: string, set = 'viewer') {
	await page.goto('/settings/');
	await page.getByTestId('grant-manager').waitFor({ state: 'visible' });
	await page.getByTestId('grant-player').selectOption('actor-player');
	await page.getByTestId('grant-entity-type').selectOption('content-item');
	await page.getByTestId('grant-entity-id').fill(itemId);
	await page.getByTestId('grant-capability-set').selectOption(set);
	await page.getByTestId('grant-submit').click();
	await expect(page.locator('[data-testid^="grant-item-"]')).toHaveCount(1);
}

test.describe('UX-PERM visibility controls, preview, badges, privacy status', () => {
	test.beforeEach(async ({ page }) => {
		await resetKnowledge(page);
	});

	test('UX-PERM-001 AC1 — the editor toggle shows all three states with icon and label', async ({
		page,
	}) => {
		await createNote(page, 'Tavern Rumors', 'player-visible');
		await page.getByTestId('note-editor').waitFor({ state: 'visible' });
		// Edit mode ⇒ the full 3-segment group is persistently visible (never a dropdown).
		const group = page.getByTestId('note-visibility-group');
		await expect(group).toBeVisible();
		await expect(group).toHaveAttribute('aria-label', 'Content visibility');
		for (const [level, label] of [
			['shared', 'Shared with specific players'],
			['player-visible', 'Players can see this'],
			['dm-only', 'Hidden from players'],
		] as const) {
			const segment = page.getByTestId(`note-visibility-segment-${level}`);
			await expect(segment).toBeVisible();
			await expect(segment).toContainText(label);
			await expect(segment).toHaveAttribute('role', 'radio');
		}
		// The current state is marked via aria-checked (selection is never color alone).
		await expect(page.getByTestId('note-visibility-segment-player-visible')).toHaveAttribute(
			'aria-checked',
			'true',
		);
	});

	test('UX-PERM-001 AC2 — changing to dm-only with an active grant warns BEFORE dispatch', async ({
		page,
	}) => {
		const itemId = await createNote(page, 'Granted Note', 'player-visible');
		await grantContentItemToDemoPlayer(page, itemId);
		await page.goto('/knowledge/');
		await page.getByTestId(`note-open-${itemId}`).click();
		await page.getByTestId('note-visibility-group').waitFor({ state: 'visible' });

		// Initiating the dm-only change surfaces the inline conflict warning — not yet dispatched.
		await page.getByTestId('note-visibility-segment-dm-only').click();
		const warning = page.getByTestId('note-visibility-conflict');
		await expect(warning).toBeVisible();
		await expect(warning).toContainText('active player access grants');
		await expect(page.getByTestId(`note-visibility-badge-${itemId}`)).toHaveAttribute(
			'data-state',
			'player-visible', // unchanged: the command was intercepted
		);

		// Cancel keeps the current state.
		await page.getByTestId('note-visibility-conflict-cancel').click();
		await expect(warning).toHaveCount(0);
		await expect(page.getByTestId('note-visibility-segment-player-visible')).toHaveAttribute(
			'aria-checked',
			'true',
		);

		// Confirming proceeds: "Hide anyway and flag conflict".
		await page.getByTestId('note-visibility-segment-dm-only').click();
		await page.getByTestId('note-visibility-conflict-confirm').click();
		await expect(page.getByTestId(`note-visibility-badge-${itemId}`)).toHaveAttribute(
			'data-state',
			'dm-only',
		);
	});

	test('UX-PERM-001 AC3 / UX-PERM-007 AC3 — a player sees no toggle and no badges at all', async ({
		page,
	}) => {
		await createNote(page, FORBIDDEN_TITLE, 'dm-only');
		await createNote(page, 'Town Notice', 'player-visible');
		await page.getByTestId('view-as-select').selectOption('actor-player');

		// The player-visible note renders for the player…
		await expect(page.getByTestId('notes-list')).toContainText('Town Notice');
		// …with NO visibility toggle and NO badge anywhere on the surface (absent, not hidden).
		await expect(page.locator('[data-testid^="note-visibility-segment-"]')).toHaveCount(0);
		await expect(page.locator('[data-testid*="visibility-badge"]')).toHaveCount(0);
		// HARD no-leak: the dm-only note's existence never reaches the player's DOM.
		await expect(page.locator('body')).not.toContainText(FORBIDDEN_TITLE);
	});

	test('UX-PERM-001 AC4 — a dm-only SECTION on a player-visible entity vanishes from the player data', async ({
		page,
	}) => {
		// Seed the CONTENT-009 demo briefing (player-visible host with declared sections).
		await page.getByTestId('ve-seed').click();
		await expect(page.getByTestId('ve-host')).toBeVisible();
		await expect(page.getByTestId('ve-section-overview')).toBeVisible();

		// The DM expands the collapsed section toggle (at rest: current-state icon only) and sets
		// the `overview` section to dm-only through the 3-segment group.
		await page.getByTestId('ve-section-visibility-overview-expand').click();
		await page.getByTestId('ve-section-visibility-overview-segment-dm-only').click();
		await expect(
			page.getByTestId('ve-section-visibility-overview-segment-dm-only'),
		).toHaveAttribute('aria-checked', 'true');

		// The player still sees the entity — but the section is ABSENT from their data.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('ve-host')).toBeVisible();
		await expect(page.getByTestId('ve-host-title')).toHaveText('Region Briefing');
		await expect(page.getByTestId('ve-section-overview')).toHaveCount(0);
		// And the player has no section-visibility authoring surface at all (AC3).
		await expect(page.getByTestId('ve-section-visibility')).toHaveCount(0);
	});

	test('UX-PERM-007 AC1/AC2 — dm-only badge without hover; section overrides show Mixed', async ({
		page,
	}) => {
		const dmOnlyId = await createNote(page, 'Hidden Ledger', 'dm-only');
		// AC1: the amber "DM only" badge is visible in the list WITHOUT hovering.
		const dmBadge = page.getByTestId(`note-visibility-badge-${dmOnlyId}`);
		await expect(dmBadge).toBeVisible();
		await expect(dmBadge).toHaveAttribute('data-state', 'dm-only');
		await expect(dmBadge).toContainText('DM only');
		await expect(dmBadge).toHaveAttribute('aria-label', 'Visibility: Hidden from players');

		// AC2: the seeded briefing has section/field overrides ⇒ its row shows the Mixed badge.
		await page.getByTestId('ve-seed').click();
		await expect(page.getByTestId('ve-host')).toBeVisible();
		const briefingRow = page.locator('[data-testid^="note-row-"]', {
			hasText: 'Region Briefing',
		});
		await expect(briefingRow.locator('[data-testid^="note-visibility-badge-"]')).toHaveAttribute(
			'data-state',
			'mixed',
		);
		await expect(briefingRow).toContainText('Mixed');
	});

	test('UX-PERM-006 AC1 — generic player preview: banner, read-only writes, dm-only absent', async ({
		page,
	}) => {
		await createNote(page, FORBIDDEN_TITLE, 'dm-only');
		await expect(page.getByTestId('notes-list')).toContainText(FORBIDDEN_TITLE);

		await page.getByTestId('preview-as-select').selectOption('player');

		// The persistent amber banner, with the read-only statement and the exit affordance.
		const banner = page.getByTestId('preview-mode-banner');
		await expect(banner).toBeVisible();
		await expect(page.getByTestId('preview-mode-title')).toHaveText('Previewing as: Player');
		await expect(banner).toContainText('You cannot make changes in this mode');
		await expect(page.getByTestId('preview-mode-exit')).toBeVisible();
		// The URL gains the shareable parameter.
		await expect(page).toHaveURL(/preview=player/);

		// dm-only content is ABSENT — the preview renders the player's actor-filtered data.
		await expect(page.locator('body')).not.toContainText(FORBIDDEN_TITLE);
		// DM-only write chrome does not exist in the player's surface model (display:none class of
		// controls): no create form, no visibility toggles, no view-as switch while previewing.
		await expect(page.getByTestId('note-create-form')).toHaveCount(0);
		await expect(page.locator('[data-testid^="note-visibility-segment-"]')).toHaveCount(0);
		await expect(page.getByTestId('view-as-select')).toHaveCount(0);
	});

	test('UX-PERM-006 AC2 — Shift+Escape exits preview and restores the full DM view', async ({
		page,
	}) => {
		await createNote(page, FORBIDDEN_TITLE, 'dm-only');
		await page.getByTestId('preview-as-select').selectOption('player');
		await expect(page.getByTestId('preview-mode-banner')).toBeVisible();

		await page.keyboard.press('Shift+Escape');

		await expect(page.getByTestId('preview-mode-banner')).toHaveCount(0);
		await expect(page).not.toHaveURL(/preview=/);
		// The DM's full view is restored: the dm-only note is back, with its badge and form.
		await expect(page.getByTestId('notes-list')).toContainText(FORBIDDEN_TITLE);
		await expect(page.getByTestId('note-create-form')).toBeVisible();
	});

	test('UX-PERM-006 AC3 — previewing a specific player reflects their exact grants', async ({
		page,
	}) => {
		// A `shared` note is delivered ONLY through an explicit channel (here: a viewer grant).
		const sharedId = await createNote(page, 'Sealed Orders', 'shared');
		await grantContentItemToDemoPlayer(page, sharedId);
		await page.goto('/knowledge/');
		await page.getByTestId('notes-workbench').waitFor({ state: 'visible' });

		// Generic player (no grants): the shared note is ABSENT.
		await page.getByTestId('preview-as-select').selectOption('player');
		await expect(page.getByTestId('preview-mode-banner')).toBeVisible();
		await expect(page.locator('body')).not.toContainText('Sealed Orders');
		await page.getByTestId('preview-mode-exit').click();
		await expect(page.getByTestId('preview-mode-banner')).toHaveCount(0);

		// Demo Player's exact grants: the granted shared note IS present, and the banner names them.
		await page.getByTestId('preview-as-select').selectOption('player:actor-player');
		await expect(page.getByTestId('preview-mode-title')).toHaveText(
			'Previewing as: Demo Player (Player)',
		);
		await expect(page.getByTestId('notes-list')).toContainText('Sealed Orders');
	});

	test('UX-PERM-006 — observer preview is read-only and a shared preview URL opens in preview', async ({
		page,
	}) => {
		await createNote(page, FORBIDDEN_TITLE, 'dm-only');
		// Opening a "?preview=observer" deep link lands directly in preview mode (shareable URL).
		await page.goto('/knowledge/?preview=observer');
		await expect(page.getByTestId('preview-mode-banner')).toBeVisible();
		await expect(page.getByTestId('preview-mode-title')).toHaveText('Previewing as: Observer');
		await expect(page.locator('body')).not.toContainText(FORBIDDEN_TITLE);
	});

	test('UX-PERM-008 — privacy rows with advisory copy, all-purged empty state, DM-only panel', async ({
		page,
	}) => {
		await page.goto('/settings/');
		const panel = page.getByTestId('session-privacy-status');
		await panel.waitFor({ state: 'visible' });

		// AC1: the unconfirmed participant has an amber chip + the advisory copy, no device secrets.
		await expect(page.getByTestId('privacy-status-actor-player')).toContainText(
			'Purge unconfirmed',
		);
		await expect(page.getByTestId('privacy-advisory-actor-player')).toContainText(
			'could not confirm cache was cleared',
		);
		// The advisory names no device-level identifiers (keys/paths) — coarse status only.
		await expect(panel).not.toContainText('key');
		await expect(panel).not.toContainText('path');
		// The 25 h old departure is archived (24 h window): no row.
		await expect(page.getByTestId('privacy-row-actor-player-3')).toHaveCount(0);
		await expect(panel).toContainText('1 archived');

		// purge-failed: critical chip + the revoke-grants advisory + the remediation link.
		await page.getByTestId('privacy-simulate-actor-player').selectOption('purge-failed');
		await expect(page.getByTestId('privacy-status-actor-player')).toContainText('Purge failed');
		await expect(page.getByTestId('privacy-advisory-actor-player')).toContainText(
			'Consider revoking persistent grants',
		);
		await expect(page.getByTestId('privacy-review-grants-actor-player')).toBeVisible();

		// AC2: every departed participant confirmed purged ⇒ the empty-state copy.
		await page.getByTestId('privacy-simulate-actor-player').selectOption('purged');
		await expect(page.getByTestId('privacy-empty-state')).toHaveText(
			'All departed participants have been confirmed. No outstanding cache risks.',
		);

		// DM-only default-deny: the panel does not exist on a player's surface.
		await page.getByTestId('view-as-select').selectOption('actor-player');
		await expect(page.getByTestId('session-privacy-status')).toHaveCount(0);
	});
});
