import { expect, test } from '@playwright/test';

test.describe('CMD-005 quick-access widget library', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		await page.evaluate(async () => {
			await indexedDB.deleteDatabase('dndtools-v2');
		});
		await page.reload();
		await page.getByTestId('cc-library-list').waitFor({ state: 'visible' });
	});

	test('filters widgets by name and previews required bindings (AC1)', async ({ page }) => {
		// Entity-backed widgets advertise the data binding they need.
		await expect(page.getByTestId('cc-library-character')).toBeVisible();
		await expect(page.getByTestId('cc-library-bindings-character')).toContainText('Character');

		// Filtering by "dice" narrows the library to the matching widget.
		await page.getByTestId('cc-library-search').fill('dice');
		await expect(page.getByTestId('cc-library-dice')).toBeVisible();
		await expect(page.getByTestId('cc-library-character')).toHaveCount(0);
		await expect(page.getByTestId('cc-library-dice')).toContainText('Dice');
	});

	test('adds a widget from the library to the Command Center (AC1)', async ({ page }, testInfo) => {
		test.skip(
			testInfo.project.name === 'mobile-chromium',
			'free-canvas widget grid is the desktop layout',
		);

		await expect(page.getByTestId('cc-widget-note')).toHaveCount(0);

		await page.getByTestId('cc-library-search').fill('note');
		await page.getByTestId('cc-library-add-note').click();

		// The added widget renders on the Command Center as a normal Scene widget.
		await expect(page.getByTestId('cc-widget-note')).toBeVisible();
	});
});
