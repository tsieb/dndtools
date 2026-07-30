import { expect, test, type Page } from '@playwright/test';
import { markOnboarded, waitReady } from './_helpers';

// ONBOARDING FORCED CONSENT (ADR-026). First-run setup must not be dismissible until the vault
// privacy mode is explicitly decided: skip/Escape refuse and land on the privacy step, the step has
// NO pre-selected option, and choosing Private (E2EE) additionally demands the typed no-cloud-
// recovery acknowledgment. Both modes complete and persist; the e2e bypass flag keeps working.

const MODE_KEY = 'dndtools:react:vault-privacy-mode';
const ONBOARDED_KEY = 'dndtools:react:onboarded';
const TIER_KEY = 'dndtools:react:tier';
const INVITES_KEY = 'dndtools:react:invites';
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
		await expect(
			overlay(page).getByRole('button', { name: 'Choose an option to continue' }),
		).toBeDisabled();
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
		// experience → tools → players → ready → finish.
		await overlay(page).getByRole('button', { name: 'Continue' }).click();
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

	// Escape is bound on the whole panel, so it also fired from inside the party-name field and the
	// E2EE acknowledgement field — where the browser convention is "leave this field", not "abandon
	// the wizard". It ended setup and threw away whatever had been typed.
	test('Escape inside a text field leaves the field instead of abandoning setup', async ({
		page,
	}) => {
		await openFresh(page);
		await toPrivacyStep(page);
		await overlay(page)
			.getByRole('radio', { name: /Cloud-Enhanced vault/ })
			.click();
		await overlay(page).getByRole('button', { name: 'Continue' }).click();
		// experience -> tools -> players
		await overlay(page).getByRole('button', { name: 'Continue' }).click();
		await overlay(page).getByRole('button', { name: 'Continue' }).click();

		const draft = overlay(page).getByLabel('Player name or email');
		await expect(draft).toBeVisible();
		await draft.click();
		await draft.fill('Rowan');
		await expect(draft).toBeFocused();

		// Escape from inside the field: setup survives and the typed name is untouched.
		await page.keyboard.press('Escape');
		await expect(overlay(page)).toBeVisible();
		await expect(draft).toHaveValue('Rowan');
		// Focus stayed inside the modal rather than falling to <body>.
		expect(
			await page.evaluate(
				() =>
					!!document.activeElement &&
					document.activeElement !== document.body &&
					!!document.activeElement.closest('[data-fullscreen-overlay="onboarding"]'),
			),
		).toBe(true);

		// A second Escape — now from outside any text field — still dismisses, so the affordance is
		// not lost, just no longer destructive mid-typing.
		await page.keyboard.press('Escape');
		await expect(overlay(page)).toBeHidden();
	});

	// "Skip setup" ENDS setup, so it has to persist the decisions already made on the steps behind it.
	// It used to write only the privacy mode + the onboarded flag, silently discarding the experience
	// tier, the AI preference and the noted players — with no way back (setup only replays from
	// Settings). Regression lock for that data loss.
	test('skipping mid-setup keeps the choices already made (tier + noted players)', async ({
		page,
	}) => {
		await openFresh(page);
		await toPrivacyStep(page);
		await overlay(page)
			.getByRole('radio', { name: /Cloud-Enhanced vault/ })
			.click();
		await overlay(page).getByRole('button', { name: 'Continue' }).click();

		// Experience step: pick a NON-default complexity ('expert' -> the 'advanced' tier; the default
		// is 'core', so a lost write is indistinguishable from an unmade choice unless we move it).
		const tiers = overlay(page).getByRole('radiogroup', { name: 'Experience complexity' });
		await expect(tiers).toBeVisible();
		await tiers.getByRole('radio', { name: /Expert/ }).click();
		await expect(tiers.getByRole('radio', { name: /Expert/ })).toHaveAttribute(
			'aria-checked',
			'true',
		);
		await overlay(page).getByRole('button', { name: 'Continue' }).click();

		// tools -> players, and note a player.
		await overlay(page).getByRole('button', { name: 'Continue' }).click();
		const draft = overlay(page).getByLabel('Player name or email');
		await expect(draft).toBeVisible();
		await draft.fill('Rowan');
		await overlay(page).getByRole('button', { name: 'Add', exact: true }).click();

		// Now bail out. Everything decided so far must survive.
		await overlay(page).getByRole('button', { name: 'Skip setup' }).click();
		await expect(overlay(page)).toBeHidden();
		expect(await storage(page, ONBOARDED_KEY)).toBe('skipped');
		expect(await storage(page, MODE_KEY)).toBe('cloud-enhanced');
		expect(await storage(page, TIER_KEY)).toBe('advanced');
		expect(await storage(page, INVITES_KEY)).toContain('Rowan');
		// The tier is applied to the live document, not just stored.
		await expect(page.locator('html')).toHaveAttribute('data-feature-tier', 'advanced');
	});

	test('the e2e/gate bypass flag still suppresses the overlay entirely', async ({ page }) => {
		await markOnboarded(page);
		await page.goto('/#/', { waitUntil: 'domcontentloaded' });
		await waitReady(page);
		await expect(overlay(page)).toHaveCount(0);
	});
});
