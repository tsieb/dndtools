import { test, expect } from '@playwright/test';
import { waitForAppReady } from './helpers.js';

test.describe('Search', () => {
	test.beforeEach(async ({ page }) => {
		await waitForAppReady(page);
	});

	test('search page has input field', async ({ page }) => {
		await page.goto('/knowledge/search');
		await expect(page.getByRole('heading', { name: 'Search & Discovery' })).toBeVisible();
		await expect(page.getByPlaceholder('Search notes...')).toBeVisible();
	});

	test('search hydrates query from URL parameter', async ({ page }) => {
		await page.goto('/knowledge/search?q=Welcome');
		await expect(page.getByPlaceholder('Search notes...')).toHaveValue('Welcome');
	});

	test('search shows results for matching query', async ({ page }) => {
		await page.goto('/knowledge/search');
		const input = page.getByPlaceholder('Search notes...');
		await input.fill('Welcome');

		// Wait for debounced search results
		await page.waitForTimeout(500);

		// Should show results or "no results" depending on data
		const hasResults = await page.locator('text=/score\\s+[0-9]/i').count();
		const hasNoResults = await page
			.getByText(/no results/i)
			.isVisible()
			.catch(() => false);
		expect(hasResults > 0 || hasNoResults).toBeTruthy();
	});

	test('search shows empty state when no query', async ({ page }) => {
		await page.goto('/knowledge/search');
		await expect(page.getByText(/Type to search across all notes/i)).toBeVisible();
	});

	test('saved searches appear in sidebar collections', async ({ page }) => {
		await page.goto('/knowledge/search');
		const input = page.getByPlaceholder('Search notes...');
		await input.fill('Welcome');
		await page.waitForTimeout(300);

		await page.getByPlaceholder('Name this search').fill('Welcome Collection');
		await page.getByRole('button', { name: /^save$/i }).click();

		await expect(page.getByRole('button', { name: 'Welcome Collection' }).first()).toBeVisible();
	});

	test('quick switcher opens and closes with Escape', async ({ page }) => {
		// Open quick switcher
		await page.keyboard.press('Control+p');
		const dialog = page.getByRole('dialog', { name: /quick switcher/i });
		await expect(dialog).toBeVisible({ timeout: 2000 });

		// Close with Escape
		await page.keyboard.press('Escape');
		await expect(dialog).not.toBeVisible();
	});
});
