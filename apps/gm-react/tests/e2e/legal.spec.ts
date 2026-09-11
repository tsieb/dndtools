import { expect, test } from '@playwright/test';

// LEGAL — the public Privacy Policy and Terms of Service (`#/legal/privacy`, `#/legal/terms`).
// Stripe (account activation, the customer-portal configuration, Checkout) and any visitor open
// these URLs with NO account and NO onboarding, so unlike every other spec this one deliberately
// does not call `markOnboarded` or seed a vault: a brand-new browser must land on the document, not
// on the DM's first-run wizard.

test.describe('legal: public privacy and terms pages', () => {
	test('a never-onboarded, signed-out visitor reads the Privacy Policy', async ({ page }) => {
		await page.goto('/#/legal/privacy', { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Billing through Stripe' })).toBeVisible();
		// The onboarding wizard mounts inside the DM shell only; it must not cover a legal page.
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Back to Lamplight' }).first()).toBeVisible();
	});

	test('the Terms of Service render and cross-link to the Privacy Policy', async ({ page }) => {
		await page.goto('/#/legal/terms', { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeVisible();
		await expect(
			page.getByRole('heading', { name: 'Plans, subscriptions and billing' }),
		).toBeVisible();
		await page.getByRole('link', { name: 'Privacy policy' }).first().click();
		await page.waitForURL((url) => url.hash === '#/legal/privacy');
		await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
	});

	test('the text never overflows the viewport, at phone width included', async ({ page }) => {
		await page.goto('/#/legal/terms', { waitUntil: 'domcontentloaded' });
		await expect(page.getByRole('heading', { level: 1, name: 'Terms of service' })).toBeVisible();
		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth,
		);
		expect(overflow).toBeLessThanOrEqual(0);
	});
});
