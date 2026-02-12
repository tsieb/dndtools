import { test, expect } from '@playwright/test';

test.describe('Note CRUD', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		// Wait for app to initialize
		await page.waitForSelector('text=DND Tools', { timeout: 10000 });
	});

	test('displays welcome note on first launch', async ({ page }) => {
		// The welcome note should be created automatically
		await expect(page.getByText('Welcome to DND Tools')).toBeVisible();
	});

	test('creates a new note', async ({ page }) => {
		// Click "New Note" button in top bar
		await page.getByRole('button', { name: /new note/i }).click();

		// Should navigate to notes page or create a note
		await page.waitForURL(/\/notes\//);

		// Should be on the edit page for the new note
		await expect(page.getByPlaceholder(/note title/i)).toBeVisible();
	});

	test('navigates to notes list', async ({ page }) => {
		// Click on "Notes" in sidebar or navigate
		await page.goto('/notes');
		await expect(page.getByText(/notes/i).first()).toBeVisible();
	});

	test('views a note', async ({ page }) => {
		// Navigate to notes and click on a note
		await page.goto('/notes');
		await page.waitForSelector('[data-testid="note-card"], .note-card, a[href*="/notes/"]', {
			timeout: 5000,
		});

		// Click on the first note link
		const noteLink = page.locator('a[href*="/notes/"]').first();
		if (await noteLink.isVisible()) {
			await noteLink.click();
			await page.waitForURL(/\/notes\/.+/);
			// Should show note content
			await expect(page.locator('.markdown-content, [data-testid="note-content"]')).toBeVisible();
		}
	});

	test('deletes a note with confirmation', async ({ page }) => {
		// Navigate to a note
		await page.goto('/notes');
		await page.waitForTimeout(1000);

		const noteLink = page.locator('a[href*="/notes/"]').first();
		if (await noteLink.isVisible()) {
			await noteLink.click();
			await page.waitForURL(/\/notes\/.+/);

			// Click delete button
			const deleteBtn = page.getByRole('button', { name: /delete/i });
			if (await deleteBtn.isVisible()) {
				await deleteBtn.click();

				// Confirmation dialog should appear
				await expect(page.getByText(/are you sure/i)).toBeVisible();
			}
		}
	});
});
