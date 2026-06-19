import { expect, test, type Page } from '@playwright/test';
import { openSection } from './_nav-helper';

/**
 * UX-ONB help / coach marks / progressive disclosure / changelog.
 *
 * - UX-ONB-013/017: a first-reach coach mark fires once on the empty Command Center, is dismissible,
 *   does not block the surface, and does not fire again in a later session (seen-state persists).
 * - UX-ONB-014/016: the persistent "?" help entry opens the contextual help center, scoped to the
 *   current surface (heading + overview + quick tips).
 * - UX-ONB-018: the feature-tier control is also reachable from Settings, pre-selected, immediate.
 * - UX-ONB-020: a passive "What's New" badge on the "?" button clears when the help center opens; the
 *   changelog is a passive surface (Settings → About), never an interruptive launch modal.
 */

async function freshHome(page: Page) {
	await page.goto('/board/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
}

test.describe('UX-ONB-013 contextual coach marks', () => {
	test('a first-reach coach mark fires on the Command Center and is dismissible (AC1/AC4)', async ({
		page,
	}) => {
		await freshHome(page);
		const mark = page.getByTestId('coach-mark-cc-add-widget');
		await expect(mark).toBeVisible();
		// Non-blocking: the add-widget affordance it points to is still clickable underneath it (AC4).
		await expect(page.getByTestId('cc-add-widget')).toBeEnabled();

		// Individually dismissible.
		await page.getByTestId('coach-mark-cc-add-widget-dismiss').click();
		await expect(mark).toBeHidden();
	});

	test('a seen coach mark does not fire again in a later session (AC2)', async ({ page }) => {
		await freshHome(page);
		await expect(page.getByTestId('coach-mark-cc-add-widget')).toBeVisible();
		await page.getByTestId('coach-mark-cc-add-widget-dismiss').click();

		// A new session (app re-open) keeps the persisted seen-state: the mark must not fire again.
		await page.reload();
		await page.getByTestId('cc-add-widget').waitFor({ state: 'visible' });
		await expect(page.getByTestId('coach-mark-cc-add-widget')).toHaveCount(0);
	});
});

test.describe('UX-ONB-014/016 persistent "?" help + contextual help center', () => {
	test('the "?" button opens a help center scoped to the current surface', async ({ page }) => {
		await freshHome(page);
		await page.getByTestId('open-help').click();

		await expect(page.getByTestId('help-dialog')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Command Center help' })).toBeVisible();
		await expect(page.getByTestId('help-overview')).toBeVisible();
		await expect(page.getByTestId('help-tips')).toBeVisible();
		// The shortcut cheat sheet is still reachable from the same center (UX-ONB-015).
		await expect(page.getByTestId('help-shortcuts')).toBeVisible();
		await page.keyboard.press('Escape');

		// On another surface the help center re-scopes its heading + tips.
		await openSection(page, 'settings');
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
		await page.getByTestId('open-help').click();
		await expect(page.getByRole('heading', { name: 'Settings help' })).toBeVisible();
	});
});

test.describe('UX-ONB-020 "What\'s New" badge + changelog', () => {
	test('the badge shows on first launch and clears when the help center opens (AC1/AC2)', async ({
		page,
	}) => {
		await freshHome(page);
		// A fresh device has an unseen latest release → the passive badge is present.
		await expect(page.getByTestId('help-changelog-badge')).toBeVisible();

		await page.getByTestId('open-help').click();
		await expect(page.getByTestId('help-whats-new')).toBeVisible();
		await page.keyboard.press('Escape');

		// Opening the center cleared it; it stays cleared across a reload (persisted seen-state).
		await expect(page.getByTestId('help-changelog-badge')).toHaveCount(0);
		await page.reload();
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await expect(page.getByTestId('help-changelog-badge')).toHaveCount(0);
	});

	test('the changelog is a passive Settings surface, not a launch modal (AC3)', async ({ page }) => {
		await freshHome(page);
		// No interruptive dialog blocks the Command Center on launch.
		await expect(page.getByTestId('command-center')).toBeVisible();

		await openSection(page, 'settings');
		await page.getByTestId('settings-about').scrollIntoViewIfNeeded();
		await expect(page.getByTestId('changelog')).toBeVisible();
		await expect(page.getByTestId('changelog-0.2.0')).toBeVisible();
	});
});

test.describe('UX-ONB-018 feature-tier control in Settings', () => {
	test('the tier control is pre-selected and changing it takes immediate effect (AC3)', async ({
		page,
	}) => {
		await freshHome(page);
		await openSection(page, 'settings');
		const control = page.getByTestId('settings-feature-tier');
		await control.scrollIntoViewIfNeeded();
		await expect(control).toBeVisible();
		// Pre-selected at the current (default core) tier.
		await expect(page.getByTestId('settings-feature-tier-core')).toBeChecked();
		// Advanced-only capabilities are absent at the core tier.
		await expect(page.getByTestId('settings-feature-permissions')).toHaveCount(0);

		// Switching to Advanced takes immediate effect — the advanced capabilities appear.
		await page.getByTestId('settings-feature-tier-advanced').check();
		await expect(page.getByTestId('settings-feature-permissions')).toBeVisible();
		await expect(page.getByTestId('settings-feature-diagnostics')).toBeVisible();
	});
});
