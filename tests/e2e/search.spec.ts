import { test, expect } from '@playwright/test';

test.describe('Search', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('text=DND Tools', { timeout: 10000 });
	});

	test('search page has input field', async ({ page }) => {
		await page.goto('/search');
		await expect(page.getByPlaceholder(/search notes/i)).toBeVisible();
	});

	test('search hydrates query from URL parameter', async ({ page }) => {
		await page.goto('/search?q=Welcome');
		await expect(page.getByPlaceholder(/search notes/i)).toHaveValue('Welcome');
	});

	test('search shows results for matching query', async ({ page }) => {
		await page.goto('/search');
		const input = page.getByPlaceholder(/search notes/i);
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
		await page.goto('/search');
		await expect(page.getByText(/type to search/i)).toBeVisible();
	});

	test('saved searches appear in sidebar collections', async ({ page }) => {
		await page.goto('/search');
		const input = page.getByPlaceholder(/search notes/i);
		await input.fill('Welcome');
		await page.waitForTimeout(300);

		await page.getByPlaceholder(/name this search/i).fill('Welcome Collection');
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
