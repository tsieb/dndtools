import { expect, test } from '@playwright/test';

test.describe('CANVAS-001 visible Scene creation + restart persistence', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		// Wait for runtime to finish loading
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
		// Reset local IndexedDB so each run starts from a known empty vault.
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
	});

	test('DM creates a Scene and sees it persist across a reload', async ({ page }) => {
		await expect(page.getByTestId('scene-list-empty')).toBeVisible();

		await page.getByTestId('scene-name').fill('Goblin Ambush');
		await page.getByTestId('scene-description').fill('Forest road at dusk');
		await page.getByTestId('scene-tags').fill('combat, prep');
		await page.getByTestId('scene-visibility').selectOption('dm-only');
		await page.getByTestId('scene-create').click();

		await expect(page.getByTestId('last-created')).toBeVisible();
		await expect(
			page.getByTestId('scene-list').getByText('Goblin Ambush'),
		).toBeVisible();

		await page.reload();
		await page.getByTestId('scene-list').waitFor({ state: 'visible' });
		await expect(
			page.getByTestId('scene-list').getByText('Goblin Ambush'),
		).toBeVisible();
	});

	test('Adding a widget on a Scene persists across reload', async ({ page }) => {
		await page.getByTestId('scene-name').fill('Combat Board');
		await page.getByTestId('scene-create').click();
		const sceneLink = page
			.getByTestId('scene-list')
			.getByRole('link', { name: 'Combat Board' });
		await expect(sceneLink).toBeVisible();
		await sceneLink.click();

		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });
		await page.getByTestId('widget-type').fill('initiative-tracker');
		await page.getByTestId('widget-version').fill('1.0.0');
		await page.getByTestId('widget-add').click();

		const widgetGrid = page.getByTestId('widget-grid');
		await expect(widgetGrid.getByText('initiative-tracker')).toBeVisible();

		const url = page.url();
		await page.reload();
		await page.goto(url);
		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });
		await expect(widgetGrid.getByText('initiative-tracker')).toBeVisible();
	});
});
