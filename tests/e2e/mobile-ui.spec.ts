import { expect, test } from '@playwright/test';

test.describe('Mobile navigation and keyboard adaptation', () => {
	test.describe.configure({ mode: 'serial' });

	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/');
		await page.waitForSelector('text=DND Tools', { timeout: 10_000 });
		await page.evaluate(() => {
			window.dispatchEvent(new Event('resize'));
		});

		const exitPlayerModeButton = page.getByRole('button', { name: 'Exit player mode' });
		if (await exitPlayerModeButton.isVisible()) {
			await exitPlayerModeButton.click();
		}
	});

	test('renders bottom navigation and opens library sheet', async ({ page }) => {
		const mobileNav = page.getByRole('navigation', { name: 'Mobile navigation' });
		await expect(mobileNav).toBeVisible({ timeout: 15_000 });

		await mobileNav.getByRole('link', { name: 'Settings' }).click();
		await expect(page).toHaveURL(/\/settings/);

		await page.getByRole('button', { name: 'Open library sheet' }).click();
		await expect(page.getByRole('dialog', { name: 'Library sheet' })).toBeVisible();

		await page.getByRole('button', { name: 'Close library sheet' }).click();
		await expect(page.getByRole('dialog', { name: 'Library sheet' })).not.toBeVisible();
	});

	test('docks editor toolbar when simulated keyboard opens', async ({ page }) => {
		await page.getByRole('button', { name: 'Create options' }).click();
		await page.getByRole('menuitem', { name: 'New note' }).click();
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
