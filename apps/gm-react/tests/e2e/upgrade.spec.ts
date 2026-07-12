import { expect, test } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh, waitReady } from './_helpers';

// UPGRADE — "Plans & cloud" (/upgrade), the acquisition surface for a local-first app. With cloud
// FAIL-CLOSED in e2e (no account backend, signed out) entitlements resolve to the FREE plan and
// the feature matrix renders from the offline fallback — no server round-trip. Checkout is
// SIMULATED end to end: no payment processor exists anywhere, so the confirm dialog says so plainly
// and a plan change is saved device-locally. These specs assert that honest simulated state — three
// plan cards, the offline matrix, the explicit "no payment is processed" copy, and an applied
// device-local plan change — never a broken real-payment flow.

test.describe('upgrade: plans & simulated checkout', () => {
	test.beforeEach(async ({ page }) => {
		await markOnboarded(page);
		await gotoRoute(page, '/upgrade');
		await seedFresh(page);
		await page.goto('/#/upgrade', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await page.locator('#main-content').waitFor({ state: 'attached' });
	});

	test('the three plan cards and the offline feature matrix render honestly', async ({ page }) => {
		await expect(page.getByRole('heading', { name: 'Free to play. Pay only for the cloud.' })).toBeVisible();

		// All three plans, with the free tier as the current plan (fail-closed default) and Lantern
		// flagged as most-chosen.
		for (const name of ['Hearth', 'Lantern', 'Beacon']) {
			await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
		}
		await expect(page.getByText('Most chosen')).toBeVisible();
		await expect(page.getByText('Free', { exact: true }).first()).toBeVisible();
		await expect(page.getByText('$7', { exact: true }).first()).toBeVisible();
		await expect(page.getByText('$15', { exact: true }).first()).toBeVisible();

		// Hearth is the current plan (its card CTA is the disabled "Your current plan").
		await expect(page.getByRole('button', { name: 'Your current plan' })).not.toHaveCount(0);

		// The comparison matrix renders, and honestly labels itself as the offline fallback (no
		// account backend configured to serve the live copy).
		await expect(page.getByText('Compare every feature')).toBeVisible();
		await expect(page.getByText(/Offline comparison — connect an account/)).toBeVisible();
	});

	test('the billing-cycle toggle switches the cards to annual pricing', async ({ page }) => {
		// Monthly by default; flipping to annual multiplies by ten (2 months free).
		await expect(page.getByText('$7', { exact: true }).first()).toBeVisible();
		await page.getByRole('switch', { name: /Bill annually/ }).click();
		await expect(page.getByText('$70', { exact: true }).first()).toBeVisible();
		await expect(page.getByText('$150', { exact: true }).first()).toBeVisible();
	});

	test('checkout is explicitly simulated and applies the plan on this device', async ({ page }) => {
		// Open the change-plan confirm for a paid tier.
		await page.getByRole('button', { name: 'Upgrade to Lantern' }).click();
		const dialog = page.getByRole('dialog', { name: /Lantern/ });
		await expect(dialog).toBeVisible();

		// The dialog is honest: simulated checkout, no payment, device-local (no account connected).
		await expect(page.getByText('Simulated checkout — no payment is processed.')).toBeVisible();
		await expect(page.getByText(/saved on this device only/)).toBeVisible();

		// Confirm performs the REAL (device-local) plan change — no card is ever asked for.
		await page.getByRole('button', { name: /^Confirm/ }).click();
		await expect(page.getByRole('status').filter({ hasText: /Now on Lantern on this device/ })).not.toHaveCount(0);

		// The change applied: Lantern is now the current plan, so its upgrade CTA is gone.
		await expect(page.getByRole('button', { name: 'Upgrade to Lantern' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Your current plan' })).not.toHaveCount(0);
	});

	test('the footer states checkout is simulated, and the back bar returns to Settings', async ({ page }) => {
		await expect(page.getByText(/Checkout is simulated — no payment is ever processed\./)).toBeVisible();

		await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: 'Settings' }).click();
		await page.waitForURL((url) => url.hash.startsWith('#/settings'), { timeout: 10_000 });
	});
});
