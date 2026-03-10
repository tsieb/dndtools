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

	test('search restores scoped URL parameters', async ({ page }) => {
		await page.goto('/knowledge/search?q=Welcome&scope=type&scopeValue=npc');
		await expect(page.getByPlaceholder('Search notes...')).toHaveValue('Welcome');
		await expect(page.getByLabel('Search scope kind')).toHaveValue('type');
		await expect(page.getByLabel('Search scope type')).toHaveValue('npc');
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
			.getByText(/no notes match/i)
			.isVisible()
			.catch(() => false);
		expect(hasResults > 0 || hasNoResults).toBeTruthy();
	});

	test('search empty-result state offers create and clear actions', async ({ page }) => {
		await page.goto('/knowledge/search');
		const input = page.getByPlaceholder('Search notes...');
		await input.fill('zzzzzzzzzzzzzzzzzzzz');
		await page.waitForTimeout(400);

		await expect(page.getByRole('heading', { name: /No notes match/i })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Create a note about this' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Clear search' })).toBeVisible();

		await page.getByRole('button', { name: 'Clear search' }).click();
		await expect(page.getByText(/Type to search across all notes/i)).toBeVisible();
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

		await page.getByRole('button', { name: /save current search/i }).click();
		await expect(page.getByRole('button', { name: /welcome/i }).first()).toBeVisible();
	});

	test('command palette opens and closes with Escape and restores focus', async ({ page }) => {
		await page.goto('/knowledge/search');
		const trigger = page.getByRole('button', { name: /open command palette/i });
		await trigger.focus();
		await trigger.press('Enter');
		const dialog = page.getByRole('dialog', { name: /command palette/i });
		await expect(dialog).toBeVisible({ timeout: 2000 });

		await page.keyboard.press('Escape');
		await expect(dialog).not.toBeVisible();
		await expect(trigger).toBeFocused();
	});

	test('command palette supports prefix modes and keyboard activation', async ({ page }) => {
		await page.goto('/knowledge/search');
		await page.getByRole('button', { name: /open command palette/i }).click();
		const dialog = page.getByRole('dialog', { name: /command palette/i });
		await expect(dialog).toBeVisible();
		const input = dialog.getByRole('combobox', { name: /command palette query/i });
		await input.fill('/session');
		await input.press('ArrowDown');
		await input.press('Enter');
		await expect(page).toHaveURL(/\/session\//);
	});

	test('command palette keyboard navigation wraps and tabs through scope controls', async ({
		page,
	}) => {
		await page.goto('/knowledge/search');
		await page.getByRole('button', { name: /open command palette/i }).click();
		const dialog = page.getByRole('dialog', { name: /command palette/i });
		await expect(dialog).toBeVisible();
		const input = dialog.getByRole('combobox', { name: /command palette query/i });
		await input.fill('/session');

		const options = dialog.locator('[role="option"]');
		const count = await options.count();
		expect(count).toBeGreaterThan(1);
		await input.press('ArrowUp');
		const selectedAfterWrapUp = dialog.locator('[role="option"][aria-selected="true"]');
		await expect(selectedAfterWrapUp).toHaveCount(1);
		const selectedUpText = (await selectedAfterWrapUp.first().innerText()).trim();
		const lastText = (await options.nth(count - 1).innerText()).trim();
		expect(selectedUpText).toContain(lastText);

		await input.press('ArrowDown');
		const selectedAfterWrapDown = dialog.locator('[role="option"][aria-selected="true"]');
		const selectedDownText = (await selectedAfterWrapDown.first().innerText()).trim();
		const firstText = (await options.first().innerText()).trim();
		expect(selectedDownText).toContain(firstText);

		await input.fill('');
		await input.press('Tab');
		await expect(dialog.getByRole('button', { name: 'All notes' })).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(dialog.getByRole('button', { name: 'NPCs only' })).toBeFocused();
		await page.keyboard.press('Shift+Tab');
		await expect(dialog.getByRole('button', { name: 'All notes' })).toBeFocused();
		await expect(dialog).toBeVisible();
	});
});
