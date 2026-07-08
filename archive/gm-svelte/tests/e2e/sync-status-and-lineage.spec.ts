import { expect, test, type Page } from '@playwright/test';

/**
 * SYNC-010 / SYNC-014 — the computed sync-status surface lives on the PLAT-owned Settings route,
 * alongside the diagnostics/participant panels. The Processing Core derives the status model over the
 * op-log substrate and enforces the actor filter, so the surface is role-correct on both profiles.
 *
 *   - SYNC-010: every role inspects sync status (pending outbound, conflicts, source health, retry
 *     actions) without raw storage knowledge.
 *   - SYNC-014: the lineage block is actor-filtered — a DM sees structural version history; a
 *     player/observer sees only a non-leaking freshness summary (no revisions/snapshots/content).
 *
 * The surface is presentation-equivalent across profiles, so the same testids run on BOTH projects
 * (desktop-chromium AND mobile-chromium); nothing here is profile-scoped.
 */

async function freshSettings(page: Page) {
	await page.goto('/settings/');
	await page.getByTestId('settings-view').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('settings-view').waitFor({ state: 'visible' });
}

async function viewAs(page: Page, actorId: string) {
	await page.getByTestId('view-as-select').selectOption(actorId);
}

test.describe('SYNC-010 sync status inspection', () => {
	test('the DM sees source health, pending changes, conflicts, and retry actions', async ({
		page,
	}) => {
		await freshSettings(page);

		await expect(page.getByTestId('sync-status-panel')).toBeVisible();
		await expect(page.getByTestId('sync-status-health-level')).toBeVisible();
		await expect(page.getByTestId('sync-sources')).toBeVisible();
		await expect(page.getByTestId('sync-source-local-vault')).toBeVisible();
		// Recovery actions are always listed; their availability is driven by the computed status.
		await expect(page.getByTestId('sync-retry-actions')).toBeVisible();
		await expect(page.getByTestId('sync-retry-retry-pending')).toBeVisible();
		await expect(page.getByTestId('sync-retry-reauthorize-source')).toBeVisible();
		await expect(page.getByTestId('sync-retry-resolve-conflicts')).toBeVisible();
		// A clean fresh vault has no conflicts.
		await expect(page.getByTestId('sync-conflicts-empty')).toBeVisible();
	});

	test('a player can inspect their own sync status without raw storage knowledge', async ({
		page,
	}) => {
		await freshSettings(page);
		await viewAs(page, 'actor-player');

		await expect(page.getByTestId('sync-status-panel')).toBeVisible();
		await expect(page.getByTestId('sync-status-health-level')).toBeVisible();
		await expect(page.getByTestId('sync-retry-actions')).toBeVisible();
	});
});

test.describe('SYNC-014 actor-filtered lineage (non-leak)', () => {
	test('the DM sees structural version history & lineage metadata', async ({ page }) => {
		await freshSettings(page);

		// The structural lineage list is rendered for the DM (it may be empty on a fresh vault, so
		// assert it is attached rather than visibly non-empty).
		await expect(page.getByTestId('sync-lineage-entities')).toBeAttached();
		// No compacted snapshots exist in the fresh prototype; the recovery-checkpoint note shows.
		await expect(page.getByTestId('sync-lineage-no-snapshots')).toBeVisible();
		// The DM does NOT get the player freshness summary.
		await expect(page.getByTestId('sync-freshness-state')).toHaveCount(0);
	});

	test('a player sees only a non-leaking freshness summary, never the DM lineage', async ({
		page,
	}) => {
		await freshSettings(page);
		await viewAs(page, 'actor-player');

		await expect(page.getByTestId('sync-freshness-state')).toBeVisible();
		await expect(page.getByTestId('sync-freshness-message')).toBeVisible();

		// The DM structural lineage must be absent for a player.
		await expect(page.getByTestId('sync-lineage-entities')).toHaveCount(0);
		await expect(page.getByTestId('sync-lineage-snapshots')).toHaveCount(0);

		// The freshness summary must not leak revision/snapshot/path detail.
		const freshness = await page.getByTestId('sync-freshness-message').innerText();
		expect(freshness).not.toMatch(/rev\s|revision/i);
		expect(freshness).not.toMatch(/snapshot/i);
		expect(freshness).not.toMatch(/\/Users\//);
	});

	test('an observer also sees only the non-leaking freshness summary', async ({ page }) => {
		await freshSettings(page);
		await viewAs(page, 'actor-observer');

		await expect(page.getByTestId('sync-freshness-state')).toBeVisible();
		await expect(page.getByTestId('sync-lineage-entities')).toHaveCount(0);
	});
});
