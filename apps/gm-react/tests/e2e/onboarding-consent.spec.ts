import { expect, test, type Page } from '@playwright/test';
import { markOnboarded, waitReady } from './_helpers';

// ONBOARDING FORCED CONSENT (ADR-026). First-run setup must not be dismissible until the vault
// privacy mode is explicitly decided: skip/Escape refuse and land on the privacy step, the step has
// NO pre-selected option, and choosing Private (E2EE) additionally demands the typed no-cloud-
// recovery acknowledgment. Both modes complete and persist; the e2e bypass flag keeps working.

const MODE_KEY = 'dndtools:react:vault-privacy-mode';
const ONBOARDED_KEY = 'dndtools:react:onboarded';
const ACK_PHRASE = 'i hold the keys';

function overlay(page: Page) {
	return page.locator('[data-fullscreen-overlay="onboarding"]');
}

function storage(page: Page, key: string): Promise<string | null> {
	return page.evaluate((k) => window.localStorage.getItem(k), key);
}

async function openFresh(page: Page): Promise<void> {
	await page.goto('/#/', { waitUntil: 'domcontentloaded' });
	await waitReady(page);
	await expect(overlay(page)).toBeVisible();
}

/** Walk welcome → vault and land on the privacy step. */
async function toPrivacyStep(page: Page): Promise<void> {
	await overlay(page).getByRole('button', { name: 'Get started' }).click();
	await overlay(page).getByRole('button', { name: 'Continue' }).click();
	await expect(overlay(page).getByRole('radiogroup', { name: 'Vault privacy mode' })).toBeVisible();
}

test.describe('onboarding forced consent (ADR-026)', () => {
	test('setup refuses to dismiss until the privacy mode is decided', async ({ page }) => {
		await openFresh(page);
		// Skip from the welcome step refuses and routes to the (undecided) privacy step instead.
		await overlay(page).getByRole('button', { name: 'Skip setup' }).click();
		await expect(overlay(page)).toBeVisible();
		const group = overlay(page).getByRole('radiogroup', { name: 'Vault privacy mode' });
		await expect(group).toBeVisible();
		// Escape refuses too.
		await page.keyboard.press('Escape');
		await expect(overlay(page)).toBeVisible();
		// No option is pre-selected, and the primary action is disabled until one is picked.
		await expect(group.getByRole('radio', { checked: true })).toHaveCount(0);
		await expect(overlay(page).getByRole('button', { name: 'Choose to continue' })).toBeDisabled();
		// Nothing was recorded by the refused dismissals.
		expect(await storage(page, MODE_KEY)).toBeNull();
		expect(await storage(page, ONBOARDED_KEY)).toBeNull();
	});

	test('Private (E2EE) demands the typed acknowledgment, then completes and persists', async ({
		page,
	}) => {
		await openFresh(page);
		await toPrivacyStep(page);
		await overlay(page)
			.getByRole('radio', { name: /Private vault/ })
			.click();
		// Picking Private is not enough — the no-cloud-recovery acknowledgment gates Continue.
		await expect(overlay(page).getByRole('button', { name: 'Continue' })).toBeDisabled();
		await overlay(page).getByLabel(`Type "${ACK_PHRASE}" to confirm`).fill(ACK_PHRASE);
		await overlay(page).getByRole('button', { name: 'Continue' }).click();
		// experience → players → ready → finish.
		await overlay(page).getByRole('button', { name: 'Continue' }).click();
		await overlay(page).getByRole('button', { name: 'Continue' }).click();
		await overlay(page).getByRole('button', { name: 'Enter Command Center' }).click();
		await expect(overlay(page)).toBeHidden();
		expect(await storage(page, MODE_KEY)).toBe('private-e2ee');
		expect(await storage(page, ONBOARDED_KEY)).toBe('done');
	});

	test('Cloud-Enhanced needs no acknowledgment, and a decided setup may then be skipped', async ({
		page,
	}) => {
		await openFresh(page);
		await toPrivacyStep(page);
		await overlay(page)
			.getByRole('radio', { name: /Cloud-Enhanced vault/ })
			.click();
		await expect(overlay(page).getByRole('button', { name: 'Continue' })).toBeEnabled();
		// Once the forced decision is made, "Skip setup" is honored — and persists the consent.
		await overlay(page).getByRole('button', { name: 'Skip setup' }).click();
		await expect(overlay(page)).toBeHidden();
		expect(await storage(page, MODE_KEY)).toBe('cloud-enhanced');
		expect(await storage(page, ONBOARDED_KEY)).toBe('skipped');
	});

	test('the e2e/gate bypass flag still suppresses the overlay entirely', async ({ page }) => {
		await markOnboarded(page);
		await page.goto('/#/', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(overlay(page)).toHaveCount(0);
	});
});
