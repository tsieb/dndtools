import { expect, test } from '@playwright/test';
import { waitForAppReady } from './helpers.js';

test.describe('Mobile navigation and keyboard adaptation', () => {
	test.describe.configure({ mode: 'serial' });

	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await waitForAppReady(page);
		await page.evaluate(() => {
			window.dispatchEvent(new Event('resize'));
		});
	});

	test('renders bottom navigation and opens library sheet', async ({ page }) => {
		const mobileNav = page.getByRole('navigation', {
			name: 'Global navigation: Primary sections',
		});
		await expect(mobileNav).toBeVisible({ timeout: 15_000 });

		await mobileNav.getByRole('link', { name: 'Settings' }).click();
		await expect(page).toHaveURL(/\/settings/);

		await page.getByRole('button', { name: 'Browse' }).click();
		await expect(page.getByRole('dialog', { name: 'Local navigation sheet' })).toBeVisible();

		await page
			.getByRole('button', { name: 'Close local navigation sheet' })
			.click({ force: true, position: { x: 8, y: 8 } });
		await expect(page.getByRole('dialog', { name: 'Local navigation sheet' })).not.toBeVisible();
	});

	test('note cards expose quick actions with non-gesture fallback', async ({ page }) => {
		await page.goto('/knowledge/notes');
		const actionsButton = page.getByRole('button', { name: 'Note quick actions' }).first();
		await expect(actionsButton).toBeVisible();
		await actionsButton.click();

		const quickActionsMenu = page.getByRole('menu', { name: 'Note card quick actions' });
		await expect(quickActionsMenu).toBeVisible();
		await quickActionsMenu.getByRole('menuitem', { name: 'Delete' }).click();
		await expect(page.getByRole('dialog', { name: 'Delete Note' })).toBeVisible();
		await page.getByRole('button', { name: 'Cancel' }).click();
	});

	test('docks editor toolbar when simulated keyboard opens', async ({ page }) => {
		await page.goto(`/knowledge/notes?create=${encodeURIComponent('Mobile Keyboard Test Note')}`);
		await expect(page).toHaveURL(/\/notes\/.+\/edit/);

		await page.locator('.cm-content').click();
		await page.evaluate(() => {
			window.dispatchEvent(
				new CustomEvent('dndtools:simulate-keyboard-inset', {
					detail: { inset: 320 },
				}),
			);
		});

		const toolbar = page.getByTestId('mobile-editor-toolbar');
		await expect(toolbar).toHaveClass(/editor-toolbar-shell--docked/);
		await expect(page.locator('html')).toHaveClass(/dndtools-keyboard-open/);
		await expect(page.getByTestId('mobile-bottom-nav')).toBeHidden();

		await page.evaluate(() => {
			window.dispatchEvent(
				new CustomEvent('dndtools:simulate-keyboard-inset', {
					detail: { inset: 0 },
				}),
			);
		});
		await expect(toolbar).not.toHaveClass(/editor-toolbar-shell--docked/);
	});
});
