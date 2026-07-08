import { expect, test, type Page } from '@playwright/test';

/**
 * PLAT-013: fixture-driven onboarding acceptance tests over a fresh vault.
 *
 * Each test resets the local IndexedDB vault to a fresh, unconfigured state, then asserts the
 * first-run onboarding surface, the feature-tier (progressive disclosure) visibility, and the
 * first-run Command Center setup. These flows previously required manual fresh-vault verification
 * (defect `AUDIT-21.4-FEATURE-TIER-E2E`); they are now covered without manual checks.
 */

async function resetToFreshVault(page: Page) {
	await page.goto('/board/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('onboarding').waitFor({ state: 'visible' });
}

test.describe('PLAT-013 fresh-vault onboarding (AC1)', () => {
	test.beforeEach(async ({ page }) => {
		await resetToFreshVault(page);
	});

	test('first-run shows the onboarding surface with core defaults', async ({ page }) => {
		const onboarding = page.getByTestId('onboarding');
		await expect(onboarding).toBeVisible();

		// The onboarding banner and setup steps are present on a fresh vault.
		await expect(page.getByTestId('onboarding-banner')).toBeVisible();
		await expect(page.getByTestId('onboarding-step-command-center')).toBeVisible();
		await expect(page.getByTestId('onboarding-step-first-scene')).toHaveAttribute(
			'data-done',
			'false',
		);

		// Default feature tier is core: Command Center + core navigation are visible.
		await expect(page.getByTestId('feature-tier-core')).toBeChecked();
		await expect(page.getByTestId('feature-command-center')).toBeVisible();
		await expect(page.getByTestId('feature-navigation')).toBeVisible();

		// The Command Center home + core navigation are the default-visible surfaces.
		await expect(page.getByTestId('command-center')).toBeVisible();
		await expect(page.getByTestId('nav-command-center')).toBeVisible();
	});

	test('first-run Command Center setup completes its step (AC1)', async ({ page }) => {
		// The Command Center home Scene is created from the system template on first load, so its
		// setup step is satisfied right after onboarding renders.
		await expect(page.getByTestId('onboarding-step-command-center')).toHaveAttribute(
			'data-done',
			'true',
		);
		// The first-scene step is still pending until the DM authors a real Scene.
		await expect(page.getByTestId('onboarding-step-first-scene')).toHaveAttribute(
			'data-done',
			'false',
		);
	});

	test('authoring a Scene advances onboarding and clears the banner', async ({ page }) => {
		// Scenes is a non-global capability reached outside the primary nav; deep-link to its root.
		await page.goto('/scenes/');
		await page.getByTestId('scene-name').fill('Tavern Brawl');
		await page.getByTestId('scene-create').click();
		await expect(
			page.getByTestId('scene-list').getByRole('link', { name: 'Tavern Brawl' }),
		).toBeVisible();

		// The onboarding surface (first-run banner + steps) lives on the /board scene surface; the nav
		// Command Center item goes to the launcher hub.
		await page.goto('/board/');
		await page.getByTestId('onboarding').waitFor({ state: 'visible' });
		// Both setup steps are now done → onboarding is complete and the first-run banner + steps
		// are gone (the onboarding surface stays for the feature-tier control + help).
		await expect(page.getByTestId('onboarding')).toHaveAttribute('data-status', 'complete');
		await expect(page.getByTestId('onboarding-banner')).toHaveCount(0);
		await expect(page.getByTestId('onboarding-step-first-scene')).toHaveCount(0);
	});
});

test.describe('PLAT-013 feature-tier visibility (AC2)', () => {
	test.beforeEach(async ({ page }) => {
		await resetToFreshVault(page);
	});

	test('core tier shows only core capabilities in the feature list', async ({ page }) => {
		await expect(page.getByTestId('feature-tier-core')).toBeChecked();
		// Core capabilities are listed.
		await expect(page.getByTestId('feature-command-center')).toBeVisible();
		await expect(page.getByTestId('feature-scenes')).toBeVisible();
		await expect(page.getByTestId('feature-navigation')).toBeVisible();
		// Intermediate + advanced capabilities are absent from the list at the core tier.
		await expect(page.getByTestId('feature-widget-library')).toHaveCount(0);
		await expect(page.getByTestId('feature-presets')).toHaveCount(0);
		await expect(page.getByTestId('feature-diagnostics')).toHaveCount(0);
		await expect(page.getByTestId('feature-permissions')).toHaveCount(0);
	});

	test('intermediate tier reveals intermediate capabilities, still hides advanced', async ({
		page,
	}) => {
		await page.getByTestId('feature-tier-intermediate').check();
		await expect(page.getByTestId('feature-widget-library')).toBeVisible();
		await expect(page.getByTestId('feature-presets')).toBeVisible();
		await expect(page.getByTestId('feature-player-views')).toBeVisible();
		// Core is still listed (monotonic disclosure).
		await expect(page.getByTestId('feature-command-center')).toBeVisible();
		// Advanced remains hidden.
		await expect(page.getByTestId('feature-diagnostics')).toHaveCount(0);
		await expect(page.getByTestId('feature-permissions')).toHaveCount(0);
	});

	test('advanced tier reveals every capability in the feature list', async ({ page }) => {
		await page.getByTestId('feature-tier-advanced').check();
		await expect(page.getByTestId('feature-widget-library')).toBeVisible();
		await expect(page.getByTestId('feature-diagnostics')).toBeVisible();
		await expect(page.getByTestId('feature-support-status')).toBeVisible();
		await expect(page.getByTestId('feature-permissions')).toBeVisible();
	});
});

test.describe('PLAT-013 help surfaces + PLAT-014 support status', () => {
	test('help surfaces are reachable from the onboarding surface', async ({ page }) => {
		await resetToFreshVault(page);
		const help = page.getByTestId('help-surfaces');
		await expect(help).toBeVisible();
		await help.locator('summary').click(); // expand the <details>
		await expect(page.getByTestId('help-welcome')).toBeVisible();
		await expect(page.getByTestId('help-scenes')).toBeVisible();
	});

	test('PLAT-014 support status surface shows parity, degradation, and unsupported with reasons', async ({
		page,
	}) => {
		await page.goto('/settings/');
		const support = page.getByTestId('support-status');
		await expect(support).toBeVisible();
		// The web profile degrades player-view projection and marks filesystem/MCP unsupported.
		await expect(page.getByTestId('support-parity')).toBeVisible();
		await expect(page.getByTestId('support-unsupported-vault.open-filesystem')).toBeVisible();
		// A degraded/unsupported entry shows a reason and a fallback (AC2).
		await expect(
			page.getByTestId('support-unsupported-reason-vault.open-filesystem'),
		).not.toBeEmpty();
		await expect(
			page.getByTestId('support-unsupported-fallback-vault.open-filesystem'),
		).not.toBeEmpty();
	});
});
