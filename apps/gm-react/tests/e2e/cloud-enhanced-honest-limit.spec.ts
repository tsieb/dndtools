import { expect, test, type Locator, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// RC-CLD-2.2 — the honest limit. The Cloud-Enhanced decision record ships `approved: false`, so no
// server-readable path exists in this edition (the platform is deferred to epic CLD-6). Every
// surface that offers or reports the mode must say two things — the data is still end-to-end
// encrypted, and the server features are not in this edition — and none may promise that they are
// on their way. This walks each of those surfaces: the onboarding choice, the Settings › Sync
// panel, both switch dialogs, the confirmation toast and the vault-privacy help tip.

const MODE_KEY = 'dndtools:react:vault-privacy-mode';

/** Phrasing that promises a capability the closed gate withholds. */
const PROMISES = [
	/upcoming features/i,
	/when (those|the|its) features (arrive|ship)/i,
	/features (arrive|ship)/i,
	/will use Cloud-Enhanced features/i,
	/re-uploads your vault/i,
	/may already have been read/i,
];

async function expectHonestLimit(region: Locator): Promise<void> {
	await expect(region).toContainText('not in this edition');
	await expect(region).toContainText('end-to-end encrypted');
	const text = (await region.innerText()).replace(/\s+/g, ' ');
	for (const promise of PROMISES) expect(text, `promises: ${promise}`).not.toMatch(promise);
}

async function openSyncSettings(page: Page, mode: 'cloud-enhanced' | 'private-e2ee') {
	await markOnboarded(page);
	await page.addInitScript(
		([key, value]) => {
			try {
				window.localStorage.setItem(key, value);
			} catch {
				/* storage may be unavailable in some contexts */
			}
		},
		[MODE_KEY, mode] as const,
	);
	await gotoRoute(page, '/');
	await seedFresh(page);
	await gotoRoute(page, '/settings?tab=sync');
}

test.describe('Cloud-Enhanced states its limit (RC-CLD-2.2)', () => {
	test('onboarding offers Cloud-Enhanced without promising its features', async ({ page }) => {
		await page.goto('/#/', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		const overlay = page.locator('[data-fullscreen-overlay="onboarding"]');
		await expect(overlay).toBeVisible();
		await overlay.getByRole('button', { name: 'Get started' }).click();
		await overlay.getByRole('button', { name: 'Continue' }).click();
		const group = overlay.getByRole('radiogroup', { name: 'Vault privacy mode' });
		await expect(group).toBeVisible();
		await expectHonestLimit(group.getByRole('radio', { name: /Cloud-Enhanced vault/ }));
	});

	test('a Cloud-Enhanced vault reports itself as still end-to-end encrypted', async ({ page }) => {
		await openSyncSettings(page, 'cloud-enhanced');
		const main = page.locator('#main-content');
		await expect(main.getByText('Cloud-Enhanced vault', { exact: true })).toBeVisible();
		await expectHonestLimit(main);

		const trigger = page.getByRole('button', { name: 'About vault privacy mode' });
		await trigger.click();
		await expectHonestLimit(page.getByRole('dialog', { name: 'Vault privacy mode' }));
		await trigger.click();

		// Leaving for Private must not claim the service could already have read the vault.
		await page.getByRole('button', { name: 'Switch to Private…' }).click();
		const toPrivate = page.getByRole('alertdialog', { name: 'Make this vault Private?' });
		await expect(toPrivate).toContainText('end-to-end encrypted');
		const body = (await toPrivate.innerText()).replace(/\s+/g, ' ');
		for (const promise of PROMISES) expect(body, `promises: ${promise}`).not.toMatch(promise);
	});

	test('switching to Cloud-Enhanced records consent and promises nothing', async ({ page }) => {
		await openSyncSettings(page, 'private-e2ee');
		await page.getByRole('button', { name: 'Switch to Cloud-Enhanced…' }).click();
		const dialog = page.getByRole('alertdialog', { name: 'Switch to Cloud-Enhanced?' });
		await expectHonestLimit(dialog);

		await dialog.getByLabel('Type "read my vault" to confirm').fill('read my vault');
		await dialog.getByRole('button', { name: 'Record my consent' }).click();
		await expect(dialog).toHaveCount(0);
		const toast = page.getByText(/^Cloud-Enhanced recorded\./);
		await expectHonestLimit(toast);
		expect(await page.evaluate((key) => window.localStorage.getItem(key), MODE_KEY)).toBe(
			'cloud-enhanced',
		);
	});
});
