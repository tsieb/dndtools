import { expect, test, type Page } from '@playwright/test';

/**
 * SYNC-003 / SYNC-004 / SYNC-005 / SYNC-015 / SYNC-016 — the source-adapter inspection surface lives on
 * the PLAT-owned Settings route. The Processing Core owns the declared adapter capability registry, the
 * explicit sync-state vocabulary, the authorization-state derivation, and the fail-closed preflight; this
 * surface renders the computed models and never reaches raw storage or network (live transports deferred
 * per ADR-014). It is presentation-equivalent across profiles, so the same testids run on BOTH projects
 * (desktop-chromium AND mobile-chromium) — nothing here is profile-scoped.
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

test.describe('SYNC-015 declared adapter capabilities', () => {
	test('the registry lists local-vault, Obsidian, and Google Docs with their capability metadata', async ({
		page,
	}) => {
		await freshSettings(page);

		await expect(page.getByTestId('source-adapters-panel')).toBeVisible();
		await expect(page.getByTestId('source-adapter-local-vault')).toBeVisible();
		await expect(page.getByTestId('source-adapter-obsidian-vault')).toBeVisible();
		await expect(page.getByTestId('source-adapter-google-docs')).toBeVisible();

		// SYNC-004: Obsidian supports the full Obsidian feature set with no lossy/unsupported entries.
		await expect(page.getByTestId('source-adapter-supported-obsidian-vault')).toContainText(
			'[[wikilinks]]',
		);
		await expect(page.getByTestId('source-adapter-unsupported-obsidian-vault')).toHaveCount(0);

		// SYNC-005: Google Docs declares the constrained features as unsupported/lossy.
		await expect(page.getByTestId('source-adapter-unsupported-google-docs')).toContainText(
			'Front matter properties',
		);
		await expect(page.getByTestId('source-adapter-lossy-google-docs')).toContainText('Inline #tags');
	});
});

test.describe('SYNC-016 explicit sync states', () => {
	test('the explicit sync-state vocabulary is rendered', async ({ page }) => {
		await freshSettings(page);

		await expect(page.getByTestId('source-adapter-states')).toBeVisible();
		await expect(page.getByTestId('source-state-auth-required')).toBeVisible();
		await expect(page.getByTestId('source-state-reauth-required')).toBeVisible();
		await expect(page.getByTestId('source-state-offline-queued')).toBeVisible();
		await expect(page.getByTestId('source-state-conflict')).toBeVisible();
		await expect(page.getByTestId('source-state-deleted-remote')).toBeVisible();
	});

	test('Google Docs authorization state is derived from the auth posture', async ({ page }) => {
		await freshSettings(page);

		// Default: online, no token ⇒ first-time auth required, cached content readable.
		await expect(page.getByTestId('auth-state')).toHaveText('auth-required');
		await expect(page.getByTestId('auth-message')).toContainText('First-time authorization');

		// Offline + no token ⇒ still auth-required, cached content readable.
		await page.getByTestId('auth-online').uncheck();
		await expect(page.getByTestId('auth-state')).toHaveText('auth-required');
		await expect(page.getByTestId('auth-message')).toContainText('unavailable offline');
		await expect(page.getByTestId('auth-message')).toContainText('Cached content remains readable');

		// A valid token ⇒ idle.
		await page.getByTestId('auth-online').check();
		await page.getByTestId('auth-has-token').check();
		await expect(page.getByTestId('auth-state')).toHaveText('idle');

		// An expired token ⇒ reauth-required, queued work kept.
		await page.getByTestId('auth-has-token').uncheck();
		await page.getByTestId('auth-token-expired').check();
		await expect(page.getByTestId('auth-state')).toHaveText('reauth-required');
		await expect(page.getByTestId('auth-message')).toContainText('queued changes are kept');
	});
});

test.describe('SYNC-015 fail-closed write preflight', () => {
	test('a lossy Google Docs write is blocked until acknowledged', async ({ page }) => {
		await freshSettings(page);

		// Google Docs + front matter present ⇒ lossy ⇒ blocked.
		await expect(page.getByTestId('preflight-result')).toHaveText('blocked');
		await expect(page.getByTestId('preflight-rejection-lossy-transform')).toBeVisible();

		// Acknowledge the loss ⇒ allowed.
		await page.getByTestId('preflight-ack').check();
		await expect(page.getByTestId('preflight-result')).toHaveText('allowed');
	});

	test('an Obsidian write of the same content is faithful and allowed without acknowledgment', async ({
		page,
	}) => {
		await freshSettings(page);

		await page.getByTestId('preflight-source').selectOption('obsidian-vault');
		await expect(page.getByTestId('preflight-result')).toHaveText('allowed');
		await expect(page.getByTestId('preflight-rejections')).toHaveCount(0);
	});
});
