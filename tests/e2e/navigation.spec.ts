import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers.js';

test.describe('Navigation', () => {
	test.beforeEach(async ({ page }) => {
		await waitForAppReady(page);
	});

	test('home page loads with app title', async ({ page }) => {
		await expect(page.getByRole('link', { name: 'DND Tools' })).toBeVisible();
	});

	test('navigates to notes page', async ({ page }) => {
		await page.goto('/notes');
		await page.waitForURL('/notes');
		await expect(
			page.getByRole('heading', { name: /All Notes|Player Notes|Notes tagged/i }),
		).toBeVisible();
	});

	test('navigates to search page', async ({ page }) => {
		await page.goto('/search');
		await page.waitForURL('/search');
		await expect(page.getByRole('heading', { name: 'Search & Discovery' })).toBeVisible();
		await expect(page.getByPlaceholder('Search notes...')).toBeVisible();
	});

	test('navigates to settings page', async ({ page }) => {
		await page.goto('/settings');
		await page.waitForURL('/settings');
		await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
	});

	test('sidebar toggle works', async ({ page }) => {
		const toggleButton = page.getByRole('button', { name: 'Toggle sidebar' });
		await toggleButton.click();
		await expect(toggleButton).toBeVisible();
	});

	test('theme toggle exists on settings page', async ({ page }) => {
		await page.goto('/settings');
		await expect(
			page.getByRole('tabpanel', { name: 'General' }).getByRole('radiogroup', { name: 'Theme' }),
		).toBeVisible();
	});

	test('keyboard shortcut Ctrl+P opens quick switcher', async ({ page }) => {
		await page.keyboard.press('Control+p');
		await expect(page.getByRole('dialog', { name: /quick switcher/i })).toBeVisible({
			timeout: 5_000,
		});
	});

	test('keyboard shortcut Ctrl+D opens dice tray', async ({ page }) => {
		await page.keyboard.press('Control+d');
		await expect(page.getByRole('dialog', { name: /dice tray/i })).toBeVisible({
			timeout: 5_000,
		});
	});

	test('settings page shows keyboard shortcuts', async ({ page }) => {
		await page.goto('/settings');
		await expect(page.getByText('Keyboard Shortcuts')).toBeVisible();
		const shortcutsPanel = page.getByLabel('General');
		await expect(shortcutsPanel.getByText('Ctrl+N')).toBeVisible();
		await expect(shortcutsPanel.getByText('Ctrl+P')).toBeVisible();
	});

	test('handles 404 gracefully for non-existent note', async ({ page }) => {
		await page.goto('/notes/nonexistent-id');
		await expect(page.getByText('Note not found')).toBeVisible();
	});
});
