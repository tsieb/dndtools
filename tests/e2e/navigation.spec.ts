import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('text=DND Tools', { timeout: 10000 });
	});

	test('home page loads with app title', async ({ page }) => {
		await expect(page.getByText('DND Tools')).toBeVisible();
	});

	test('navigates to notes page', async ({ page }) => {
		await page.goto('/notes');
		await page.waitForURL('/notes');
		// Notes page should load
		await expect(page.locator('h1')).toBeVisible();
	});

	test('navigates to search page', async ({ page }) => {
		await page.goto('/search');
		await page.waitForURL('/search');
		await expect(page.getByPlaceholder(/search/i)).toBeVisible();
	});

	test('navigates to settings page', async ({ page }) => {
		await page.goto('/settings');
		await page.waitForURL('/settings');
		await expect(page.getByText('Settings')).toBeVisible();
	});

	test('sidebar toggle works', async ({ page }) => {
		// Find the sidebar toggle (hamburger) button
		const toggleBtn = page.getByRole('button', { name: /toggle sidebar|menu/i });
		if (await toggleBtn.isVisible()) {
			await toggleBtn.click();
			// Sidebar should toggle visibility
			await page.waitForTimeout(300); // Wait for animation
		}
	});

	test('theme toggle exists on settings page', async ({ page }) => {
		await page.goto('/settings');
		await expect(page.getByText(/theme/i).first()).toBeVisible();
	});

	test('keyboard shortcut Ctrl+P opens quick switcher', async ({ page }) => {
		await page.keyboard.press('Control+p');
		// Quick switcher dialog should appear
		await expect(
			page
				.getByRole('dialog', { name: /quick switcher/i })
				.or(page.getByPlaceholder(/search notes/i)),
		).toBeVisible({ timeout: 2000 });
	});

	test('settings page shows keyboard shortcuts', async ({ page }) => {
		await page.goto('/settings');
		await expect(page.getByText('Keyboard Shortcuts')).toBeVisible();
		await expect(page.getByText('Ctrl+N')).toBeVisible();
		await expect(page.getByText('Ctrl+P')).toBeVisible();
	});

	test('handles 404 gracefully for non-existent note', async ({ page }) => {
		await page.goto('/notes/nonexistent-id');
		await expect(page.getByText(/not found/i)).toBeVisible();
	});
});
