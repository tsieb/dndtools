import { expect, test, type Page } from '@playwright/test';

/**
 * COLLAB-008 / COLLAB-009 / COLLAB-010 / COLLAB-014 — the session-privacy surface lives on the PLAT-owned
 * Settings route. The Processing Core owns the filter-before-send replication policy, the DM-authority
 * resolution, and the explicit session-cache policy; this surface renders the computed models and reaches
 * no storage or transport (live transport deferred per ADR-014). It is presentation-equivalent across
 * profiles, so the same testids run on BOTH projects (desktop-chromium AND mobile-chromium).
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

test.describe('COLLAB-009 filter-before-send replication stream', () => {
	test("a player's outbound stream excludes the DM-only secret; the DM's includes it", async ({
		page,
	}) => {
		await freshSettings(page);
		await expect(page.getByTestId('session-privacy-panel')).toBeVisible();

		// Default recipient is the player: the secret op is withheld at the source, never delivered.
		await expect(page.getByTestId('replication-recipient')).toHaveValue('demo-player');
		await expect(page.getByTestId('replication-delivered')).toHaveText('op-public, op-handout');
		await expect(page.getByTestId('replication-withheld')).toHaveText('op-secret');
		await expect(page.getByTestId('replication-secret-present')).toContainText('secret: no');

		// Observer: the player-shared handout is also withheld; only the public note is delivered.
		await page.getByTestId('replication-recipient').selectOption('demo-observer');
		await expect(page.getByTestId('replication-delivered')).toHaveText('op-public');
		await expect(page.getByTestId('replication-secret-present')).toContainText('secret: no');

		// DM: the full stream is delivered, including the secret.
		await page.getByTestId('replication-recipient').selectOption('demo-dm');
		await expect(page.getByTestId('replication-delivered')).toHaveText('op-public, op-secret, op-handout');
		await expect(page.getByTestId('replication-secret-present')).toContainText('secret: yes');
	});
});

test.describe('COLLAB-008 DM authority resolution', () => {
	test('a valid DM command supersedes a player command under dm-authoritative policy', async ({
		page,
	}) => {
		await freshSettings(page);

		await expect(page.getByTestId('authority-policy')).toHaveValue('dm-authoritative');
		await expect(page.getByTestId('authority-outcome')).toHaveText('dm-supersedes');
		await expect(page.getByTestId('authority-winner')).toContainText('demo-dm');
		await expect(page.getByTestId('authority-winner')).toContainText('60');

		// Under shared-merge the DM does not override; the same-field edits conflict.
		await page.getByTestId('authority-policy').selectOption('shared-merge');
		await expect(page.getByTestId('authority-outcome')).toHaveText('conflict');
		await expect(page.getByTestId('authority-winner')).toContainText('none');
	});
});

test.describe('COLLAB-010 / COLLAB-014 participant cache purge/seal', () => {
	test('on leave the persistent handout is retained; the projected scene is purged online, sealed offline', async ({
		page,
	}) => {
		await freshSettings(page);

		// Online: persistent-granted handout retained, projected scene purged.
		await expect(page.getByTestId('cache-online')).toBeChecked();
		await expect(page.getByTestId('cache-retained')).toContainText('handout:handout-keep');
		await expect(page.getByTestId('cache-purged')).toContainText('scene:scene-boss');
		await expect(page.getByTestId('cache-sealed')).toContainText('none');

		// Offline: the projected scene is SEALED (key invalidation) instead of purged.
		await page.getByTestId('cache-online').uncheck();
		await expect(page.getByTestId('cache-sealed')).toContainText('scene:scene-boss');
		await expect(page.getByTestId('cache-purged')).toContainText('none');
		await expect(page.getByTestId('cache-retained')).toContainText('handout:handout-keep');
		await expect(page.getByTestId('cache-ttl')).toContainText('key invalidation: on');
	});

	test('an unconfirmed participant is marked purge-unconfirmed without exposing device secrets', async ({
		page,
	}) => {
		await freshSettings(page);

		await expect(page.getByTestId('purge-status-demo-player')).toContainText('confirmed');
		await expect(page.getByTestId('purge-status-demo-observer')).toContainText('purge-unconfirmed');
		// No cached entity ids leak into the status surface.
		await expect(page.getByTestId('cache-purge-status')).not.toContainText('handout-keep');
		await expect(page.getByTestId('cache-purge-status')).not.toContainText('scene-boss');
	});
});
