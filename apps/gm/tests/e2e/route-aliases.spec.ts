import { expect, test, type Page } from '@playwright/test';

// NAV-002: legacy route aliases redirect to their canonical section, preserving search
// parameters and hashes by default. The alias → canonical mapping is the Processing
// Core's; each alias route is a thin redirect stub (NAV-002 AC1/AC2).

async function freshHome(page: Page) {
	await page.goto('/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
}

test.describe('NAV-002 AC1 alias redirects preserve search params and hash', () => {
	test('a legacy /maps URL redirects to /atlas/ preserving all search params', async ({ page }) => {
		await freshHome(page);
		await page.goto('/maps/?poi=region-coast&x=1&y=2');
		// Lands on the canonical Atlas route with every search parameter intact.
		await expect(page).toHaveURL(/\/atlas\/?\?poi=region-coast&x=1&y=2$/);
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
	});

	test('a legacy /maps URL preserves a hash anchor alongside search params', async ({ page }) => {
		await freshHome(page);
		await page.goto('/map/?poi=region-north-road#layers');
		await expect(page).toHaveURL(/\/atlas\/?\?poi=region-north-road#layers$/);
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
	});

	test('the /home alias redirects to the Command Center home', async ({ page }) => {
		await freshHome(page);
		await page.goto('/home/');
		await expect(page).toHaveURL(/\/$/);
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
	});

	test('the /canvas and /preferences aliases redirect to their canonical sections', async ({
		page,
	}) => {
		await freshHome(page);
		await page.goto('/canvas/');
		await expect(page).toHaveURL(/\/scenes\/?$/);
		await page.getByTestId('scene-name').waitFor({ state: 'visible' });

		await page.goto('/preferences/');
		await expect(page).toHaveURL(/\/settings\/?$/);
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });
	});
});
