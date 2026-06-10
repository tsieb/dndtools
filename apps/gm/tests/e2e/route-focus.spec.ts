import { expect, test, type Page } from '@playwright/test';

// NAV-004: navigation focus restoration preserves hash anchors, scroll position, route
// landmarks, deep-link semantics, and browser back/forward. A URL with a heading hash
// keeps the heading scroll target active instead of unconditional landmark focus (AC1);
// a normal route transition focuses the route landmark and announces the route (AC2).

async function freshHome(page: Page) {
	await page.goto('/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.reload();
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
}

test.describe('NAV-004 AC1 a heading hash keeps the heading target active', () => {
	test('a deep link with a heading hash focuses the heading, not the route landmark', async ({
		page,
	}) => {
		await freshHome(page);
		// Deep link straight to the Atlas "Maps" heading anchor.
		await page.goto('/atlas/#maps');
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });

		const heading = page.locator('#maps');
		await expect(heading).toBeVisible();
		// The heading — not the <main> route landmark — holds focus after navigation (AC1).
		await expect(heading).toBeFocused();
		await expect(page.getByTestId('route-landmark')).not.toBeFocused();

		// The within-page jump does not re-announce the route landmark (AC1).
		await expect(page.getByTestId('route-announcer')).toHaveText('');
	});
});

test.describe('NAV-004 AC2 a normal transition focuses the landmark and announces', () => {
	test('a hash-less route transition focuses the route landmark and announces the route', async ({
		page,
	}) => {
		await freshHome(page);
		// Home announces once loaded; the landmark is the focus target with no hash.
		await expect(page.getByTestId('route-announcer')).toHaveText('Command Center');

		await page.getByTestId('nav-atlas').click();
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });

		// The route landmark is focused (AC2)...
		await expect(page.getByTestId('route-landmark')).toBeFocused();
		// ...and the live region announces the new route (AC2 / NAV-007 AC2).
		await expect(page.getByTestId('route-announcer')).toHaveText('Atlas');
	});
});

test.describe('NAV-004 browser back/forward stays coherent', () => {
	test('back and forward preserve route landmarks and deep-link semantics', async ({ page }) => {
		await freshHome(page);

		await page.getByTestId('nav-atlas').click();
		await page.getByTestId('atlas-view').waitFor({ state: 'visible' });
		await page.getByTestId('nav-settings').click();
		await page.getByTestId('settings-view').waitFor({ state: 'visible' });

		// Back returns to Atlas and re-focuses/announces its landmark.
		await page.goBack();
		await expect(page).toHaveURL(/\/atlas\/?$/);
		await expect(page.getByTestId('route-announcer')).toHaveText('Atlas');

		// Forward returns to Settings.
		await page.goForward();
		await expect(page).toHaveURL(/\/settings\/?$/);
		await expect(page.getByTestId('route-announcer')).toHaveText('Settings');
	});
});
