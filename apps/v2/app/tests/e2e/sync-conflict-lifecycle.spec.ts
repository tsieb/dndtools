import { expect, test, type Page } from '@playwright/test';

/**
 * SYNC-006 / SYNC-013 — the vault-wide conflict LIFECYCLE surface on the PLAT-owned Settings route.
 *
 * A real same-field character conflict is produced on the characters route (the established CHAR-004
 * flow), then surfaced as a DURABLE VAULT conflict record on the sync-status panel:
 *
 *   - SYNC-006: the DM sees the conflict in the lifecycle surface with its diverging values + per-entity
 *     publication status; a player/observer sees only STRUCTURAL facts (no conflicting values).
 *   - SYNC-013: resolution is the DM-authorized `conflict.resolve` administrative command — the DM
 *     selects an explicit value (+ optional note), and the entity becomes non-conflicted with an audit.
 *
 * The shared local runtime persists state across routes, so the conflict created on /characters/ is
 * visible on /settings/. The surface is presentation-equivalent across profiles, so the same testids
 * run on BOTH Playwright projects (desktop-chromium AND mobile-chromium); nothing here is
 * profile-scoped.
 */

async function freshCharacters(page: Page) {
	await page.goto('/characters/');
	await page.getByTestId('characters-view').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('characters-view').waitFor({ state: 'visible' });
}

/** Reproduce the CHAR-004 same-field conflict and return the character id it landed on. */
async function createBackstoryConflict(page: Page): Promise<string> {
	await page.getByTestId('qc-kind').selectOption('sidekick');
	await page.getByTestId('qc-name').fill('Pip');
	await page.getByTestId('qc-hp').fill('10');
	await page.getByTestId('qc-ac').fill('12');
	await page.getByTestId('qc-visibility').selectOption('player-visible');
	await page.getByTestId('qc-submit').click();
	await expect(page.getByTestId('qc-created')).toContainText('Pip');

	const card = page.getByTestId('collab-list').locator('[data-testid^="collab-character-"]').first();
	const id = (await card.getAttribute('data-testid'))!.replace('collab-character-', '');
	await page.getByTestId(`collab-grant-target-${id}`).selectOption('actor-player');
	await page.getByTestId(`collab-grant-${id}`).click();
	await expect(page.getByTestId(`collab-owner-${id}`)).toContainText('Demo Player');

	// DM starts an HP edit (based on the original revision) but does not save.
	await page.getByTestId(`collab-input-${id}-combat.hp`).fill('9');
	// Owner edits the SAME field first from the same base, creating a stale base for the DM.
	await page.getByTestId('view-as-select').selectOption('actor-player');
	await expect(page.getByTestId(`collab-input-${id}-combat.hp`)).toBeVisible();
	await page.getByTestId(`collab-input-${id}-combat.hp`).fill('6');
	await page.getByTestId(`collab-save-${id}-combat.hp`).click();
	await expect(page.getByTestId(`collab-field-${id}-combat.hp`)).toHaveAttribute(
		'data-author',
		'player-authored',
	);
	// DM saves the now-stale edit ⇒ durable same-path conflict (not last-write-wins).
	await page.getByTestId('view-as-select').selectOption('local-dm');
	await expect(page.getByTestId(`collab-input-${id}-combat.hp`)).toHaveValue('9');
	await page.getByTestId(`collab-save-${id}-combat.hp`).click();
	await expect(page.getByTestId(`collab-conflicts-${id}`)).toBeVisible();
	return id;
}

async function gotoSettings(page: Page) {
	await page.goto('/settings/');
	await page.getByTestId('settings-view').waitFor({ state: 'visible' });
}

test.describe('SYNC-006 conflict lifecycle display', () => {
	test('the DM sees the durable conflict on the sync-status lifecycle surface', async ({ page }) => {
		await freshCharacters(page);
		await createBackstoryConflict(page);

		await gotoSettings(page);
		await expect(page.getByTestId('conflict-lifecycle')).toBeVisible();
		await expect(page.getByTestId('conflict-unresolved-count')).toHaveText('1');
		// The DM detail layer renders with resolution controls for the character conflict.
		await expect(page.getByTestId('conflict-lifecycle-dm')).toBeVisible();
		const row = page
			.getByTestId('conflict-lifecycle-dm')
			.locator('[data-testid^="conflict-dm-"]')
			.first();
		await expect(row).toContainText('character');
		await expect(row.locator('[data-testid^="conflict-resolve-local-"]')).toBeVisible();
		await expect(row.locator('[data-testid^="conflict-resolve-remote-"]')).toBeVisible();
	});

	test('a clean fresh vault shows no conflicts (per-entity isolation baseline)', async ({ page }) => {
		await freshCharacters(page);
		await gotoSettings(page);
		await expect(page.getByTestId('conflict-lifecycle-empty')).toBeVisible();
	});

	test('a player sees only structural conflict facts — never the diverging values (non-leak)', async ({
		page,
	}) => {
		await freshCharacters(page);
		await createBackstoryConflict(page);

		await gotoSettings(page);
		await page.getByTestId('view-as-select').selectOption('actor-player');

		// The player gets the structural list, not the DM detail/resolution controls.
		await expect(page.getByTestId('conflict-lifecycle-structural')).toBeVisible();
		await expect(page.getByTestId('conflict-lifecycle-dm')).toHaveCount(0);
		await expect(
			page.getByTestId('conflict-lifecycle-structural').getByText('awaiting DM resolution').first(),
		).toBeVisible();
	});
});

test.describe('SYNC-013 DM-authorized resolution', () => {
	test('the DM resolves the conflict with a note; the entity becomes non-conflicted', async ({
		page,
	}) => {
		await freshCharacters(page);
		await createBackstoryConflict(page);

		await gotoSettings(page);
		const row = page
			.getByTestId('conflict-lifecycle-dm')
			.locator('[data-testid^="conflict-dm-"]')
			.first();
		const conflictId = (await row.getAttribute('data-testid'))!.replace('conflict-dm-', '');

		// SYNC-013: explicit selected value + optional note → DM-authorized resolution.
		await page.getByTestId(`conflict-notes-${conflictId}`).fill('Adopting the DM value after review.');
		await page.getByTestId(`conflict-resolve-remote-${conflictId}`).click();

		// The conflict record is now RESOLVED: the unresolved count drops to 0, the row reports resolved
		// + the resolution audit (who/selected value/note), and the resolve controls are gone.
		await expect(page.getByTestId('conflict-unresolved-count')).toHaveText('0');
		await expect(page.getByTestId(`conflict-resolved-${conflictId}`)).toBeVisible();
		await expect(page.getByTestId(`conflict-resolved-${conflictId}`)).toContainText('local-dm');
		await expect(page.getByTestId(`conflict-resolve-remote-${conflictId}`)).toHaveCount(0);
	});

	test('a player cannot resolve: no resolution controls are exposed (fail-closed)', async ({
		page,
	}) => {
		await freshCharacters(page);
		await createBackstoryConflict(page);

		await gotoSettings(page);
		await page.getByTestId('view-as-select').selectOption('actor-player');

		// No DM resolve controls exist for a non-DM; the conflict remains for the DM.
		await expect(page.locator('[data-testid^="conflict-resolve-remote-"]')).toHaveCount(0);
		await expect(page.locator('[data-testid^="conflict-resolve-local-"]')).toHaveCount(0);
		await expect(page.getByTestId('conflict-lifecycle-structural')).toBeVisible();
	});
});
