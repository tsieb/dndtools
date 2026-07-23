import { expect, test, type Page } from '@playwright/test';
import { gotoRoute, markOnboarded, seedFresh } from './_helpers';

/**
 * Authoring cards must fit the *usable* phone width, not merely a typical 375px
 * handset.  This guards the 320px Android/folded-device case where Page gutters
 * leave 292px and a `minmax(300px, …)` card track creates an irrecoverable
 * horizontal scroll path.
 */
async function expectMainFitsPhone(page: Page, route: string): Promise<void> {
	await gotoRoute(page, route);
	await page.locator('#main-content').waitFor({ state: 'attached' });
	await expect
		.poll(() =>
			page.locator('#main-content').evaluate((main) => ({
				clientWidth: main.clientWidth,
				scrollWidth: main.scrollWidth,
			})),
		)
		.toMatchObject({ clientWidth: expect.any(Number), scrollWidth: expect.any(Number) });
	const dimensions = await page.locator('#main-content').evaluate((main) => ({
		clientWidth: main.clientWidth,
		scrollWidth: main.scrollWidth,
	}));
	expect(
		dimensions.scrollWidth,
		`${route} must not require horizontal scrolling`,
	).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

test('populated authoring libraries fit a 320px Android viewport', async ({ page }) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await markOnboarded(page);
	await gotoRoute(page, '/');
	await seedFresh(page);

	for (const route of ['/characters', '/knowledge', '/campaign']) {
		await expectMainFitsPhone(page, route);
	}

	// The populated campaign has factions, a second independently-rendered card grid.
	await page.getByRole('tab', { name: 'Factions' }).click();
	const dimensions = await page.locator('#main-content').evaluate((main) => ({
		clientWidth: main.clientWidth,
		scrollWidth: main.scrollWidth,
	}));
	expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

	for (const route of ['/atlas', '/audio']) {
		await expectMainFitsPhone(page, route);
	}
});

test('the character builder starts its first step without horizontal clipping on a 320px phone', async ({
	page,
}) => {
	await page.setViewportSize({ width: 320, height: 640 });
	await markOnboarded(page);
	await gotoRoute(page, '/characters');
	await seedFresh(page);

	await page.getByRole('button', { name: 'New character', exact: true }).first().click();
	await page.getByRole('button', { name: /Build from scratch/ }).click();

	const wizard = page.getByRole('dialog', { name: 'New character wizard' });
	await expect(wizard).toBeVisible();
	const dimensions = await wizard.evaluate((panel) => ({
		clientWidth: panel.clientWidth,
		scrollWidth: panel.scrollWidth,
	}));
	expect(
		dimensions.scrollWidth,
		'the phone wizard must not hide controls horizontally',
	).toBeLessThanOrEqual(dimensions.clientWidth + 1);

	// The first step retains its primary task without the desktop-only rail: the kind picker and
	// identity inputs are visible, focusable controls rather than clipped off the right edge.
	await expect(page.getByRole('button', { name: 'PC', exact: true })).toBeInViewport();
	await expect(page.getByLabel('Name')).toBeInViewport();
	await expect(page.getByLabel('Alignment')).toBeInViewport();
});
