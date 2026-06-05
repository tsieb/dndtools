import { expect, test, type Page } from '@playwright/test';

/**
 * SYNC-007 / SYNC-008 / SYNC-017 — the cloud/device-local storage inspection surface lives on the
 * PLAT-owned Settings route. The Processing Core owns the classification policy and the fail-closed
 * enablement gate; the surface renders the computed model and reads NOTHING from raw storage.
 *
 *   - SYNC-007/008: the surface shows what is cloud-syncable (only when cloud sync is enabled) and
 *     what is device-local, including auth tokens and raw paths that never leave the device.
 *   - SYNC-017: cloud sync is DISABLED by default and BLOCKED — the encryption/key prerequisites are
 *     unmet (the real crypto model is deferred per ADR-014).
 *
 * The surface is presentation-equivalent across profiles, so these testids run on BOTH projects
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

test.describe('SYNC-017 cloud sync enablement gate (default off, fail-closed)', () => {
	test('cloud sync is disabled and cannot be enabled while prerequisites are unmet', async ({
		page,
	}) => {
		await freshSettings(page);

		await expect(page.getByTestId('cloud-storage-panel')).toBeVisible();
		await expect(page.getByTestId('cloud-sync-enabled')).toHaveText('disabled');
		await expect(page.getByTestId('cloud-sync-can-enable')).toHaveText('no');

		// Every encryption/key prerequisite is listed and shown as unmet.
		await expect(page.getByTestId('cloud-sync-prerequisites')).toBeVisible();
		for (const id of [
			'encryption-at-rest',
			'encryption-in-transit',
			'key-custody',
			'key-rotation',
			'key-recovery',
		]) {
			await expect(page.getByTestId(`cloud-sync-prereq-${id}`)).toContainText('unmet');
		}

		const summary = await page.getByTestId('cloud-sync-gate-summary').innerText();
		expect(summary).toMatch(/disabled/i);
	});
});

test.describe('SYNC-007/008 cloud/device-local classification', () => {
	test('cloud-syncable categories include vault identity, op log, snapshots, and assets', async ({
		page,
	}) => {
		await freshSettings(page);

		await expect(page.getByTestId('cloud-syncable-categories')).toBeVisible();
		for (const category of [
			'cloud-vault-identity',
			'durable-operation-log',
			'compacted-snapshot',
			'permission-metadata',
			'asset-blob',
			'conflict-record',
		]) {
			await expect(page.getByTestId(`cloud-category-${category}`)).toBeVisible();
		}
	});

	test('device-local categories include auth tokens, raw paths, presence, and temporary UI state', async ({
		page,
	}) => {
		await freshSettings(page);

		await expect(page.getByTestId('device-local-categories')).toBeVisible();
		for (const category of [
			'auth-refresh-token',
			'os-credential-record',
			'raw-absolute-path',
			'rebuildable-index',
			'presence-state',
			'local-diagnostics',
			'temporary-ui-state',
		]) {
			await expect(page.getByTestId(`device-local-category-${category}`)).toBeVisible();
		}

		// The device-local secret categories must never appear in the cloud-syncable list.
		await expect(page.getByTestId('cloud-category-auth-refresh-token')).toHaveCount(0);
		await expect(page.getByTestId('cloud-category-raw-absolute-path')).toHaveCount(0);
	});

	test('a player can inspect the same classification without raw storage knowledge', async ({
		page,
	}) => {
		await freshSettings(page);
		await viewAs(page, 'actor-player');

		await expect(page.getByTestId('cloud-storage-panel')).toBeVisible();
		await expect(page.getByTestId('cloud-sync-enabled')).toHaveText('disabled');
		await expect(page.getByTestId('device-local-category-auth-refresh-token')).toBeVisible();
	});
});
