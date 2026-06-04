import { expect, test } from '@playwright/test';

test.describe('CANVAS-005/CANVAS-015 Player View projection panel', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/scenes/');
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
	});

	test('DM projects, queues, and revokes a selected widget for the demo player', async ({
		page,
	}) => {
		await page.getByTestId('scene-name').fill('Projection Scene');
		await page.getByTestId('scene-create').click();
		await page.getByTestId('scene-list').getByRole('link', { name: 'Projection Scene' }).click();
		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });

		await page.getByTestId('widget-type').fill('note');
		await page.getByTestId('widget-version').fill('1.0.0');
		await page.getByTestId('widget-add').click();
		await expect(page.getByTestId('widget-grid')).toContainText('note');

		await page.getByRole('checkbox').first().check();
		await page.getByTestId('projection-kind').selectOption('handout');
		await page.getByTestId('project-player-view').click();
		await expect(page.getByTestId('player-view-preview')).toContainText('handout');
		await expect(page.getByTestId('player-view-preview')).toContainText('delivered');
		await expect(page.getByTestId('player-view-preview')).toContainText('note');

		await page.getByTestId('queue-player-view').click();
		await expect(page.getByTestId('player-view-preview')).toContainText('queued');
		await expect(page.getByTestId('player-view-preview')).toContainText('offline');

		await page.getByTestId('revoke-player-view').click();
		await expect(page.getByTestId('player-view-empty')).toBeVisible();
	});
});
