import { expect, test, type Page } from '@playwright/test';

// NAV-007: navigation components expose stable page titles, exactly one route-level
// `h1`, semantic landmarks, and live route announcements. The app shell owns a single
// `h1` derived from the navigation view, so every primary route has one and only one
// heading that matches its title, and a polite live region announces each route change.

async function freshHome(page: Page) {
	await page.goto('/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
}

test.describe('NAV-007 exactly one route-level h1 and matching title (AC1)', () => {
	test('the Command Center home has a single h1 matching the page title', async ({ page }) => {
		await freshHome(page);
		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.getByTestId('route-title')).toHaveText('Command Center');
		await expect(page).toHaveTitle(/Command Center/);
	});

	test('each primary section route keeps exactly one h1 that matches its title', async ({
		page,
	}) => {
		await freshHome(page);

		// Command Center → Scenes.
		await page.getByTestId('nav-scenes').click();
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.getByTestId('route-title')).toHaveText('Scenes');
		await expect(page).toHaveTitle(/Scenes/);

		// Scenes → Settings.
		await page.getByTestId('nav-settings').click();
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.getByTestId('route-title')).toHaveText('Settings');
		await expect(page).toHaveTitle(/Settings/);
	});

	test('an open Scene route uses the Scene name as its single h1 and title', async ({ page }) => {
		await freshHome(page);
		await page.getByTestId('nav-scenes').click();
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });

		await page.getByTestId('scene-name').fill('Misty Vale');
		await page.getByTestId('scene-create').click();
		await page.getByTestId('scene-list').getByRole('link', { name: 'Misty Vale' }).click();
		await page.getByTestId('scene-editor').waitFor({ state: 'visible' });

		await expect(page.locator('h1')).toHaveCount(1);
		await expect(page.getByTestId('route-title')).toHaveText('Misty Vale');
		await expect(page).toHaveTitle(/Misty Vale/);
	});
});

test.describe('NAV-007 live route announcement (AC2)', () => {
	test('a polite live region announces each completed route change', async ({ page }) => {
		await freshHome(page);

		const announcer = page.getByTestId('route-announcer');
		await expect(announcer).toHaveAttribute('aria-live', 'polite');
		// Home is announced once the vault loads.
		await expect(announcer).toHaveText('Command Center');

		// Navigating updates the announcement to name the new route.
		await page.getByTestId('nav-scenes').click();
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });
		await expect(announcer).toHaveText('Scenes');

		await page.getByTestId('nav-settings').click();
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
		await expect(announcer).toHaveText('Settings');
	});
});
