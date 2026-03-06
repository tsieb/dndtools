import { test, expect, type Page } from '@playwright/test';
import { waitForAppReady } from './helpers.js';

async function startNewNote(page: Page): Promise<void> {
	await page.goto(`/knowledge/notes?create=${encodeURIComponent('E2E Generated Note')}`);
	await expect(page).toHaveURL(/\/notes\/[^/]+\/edit$/, { timeout: 15_000 });
}

test.describe('Note CRUD', () => {
	test.beforeEach(async ({ page }) => {
		await waitForAppReady(page);
	});

	test('notes list route renders', async ({ page }) => {
		await page.goto('/knowledge/notes');
		await expect(
			page.getByRole('heading', { name: /All Notes|Player Notes|Notes tagged/i }),
		).toBeVisible();
		await expect(page.getByRole('button', { name: 'New Note' }).first()).toBeVisible();
	});

	test('creates a new note and opens editor', async ({ page }) => {
		await startNewNote(page);
		await expect(page.getByPlaceholder('Note title...')).toBeVisible();
	});

	test('views a note from notes list', async ({ page }) => {
		await page.goto('/knowledge/notes');
		const firstCard = page
			.locator('button')
			.filter({ hasText: /Welcome to DND Tools/i })
			.first();
		await expect(firstCard).toBeVisible();
		await firstCard.click();
		await expect(page).toHaveURL(/\/notes\/[^/]+$/);
		await expect(page.locator('.markdown-content[role="document"]')).toBeVisible();
	});

	test('deletes a note with confirmation', async ({ page }) => {
		await startNewNote(page);
		await page.getByPlaceholder('Note title...').fill('E2E Delete Target');
		await page.getByRole('button', { name: 'Done' }).click();
		await expect(page).toHaveURL(/\/notes\/[^/]+$/);
		await page.getByTitle('Delete note').click();
		await expect(page.getByText(/Are you sure you want to delete/i)).toBeVisible();
		await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
		await expect(page).toHaveURL(/\/notes$/);
	});
});
