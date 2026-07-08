import { expect, test, type Page } from '@playwright/test';

// UX-A11Y-010 (WCAG 2.5.8 Target Size): native checkboxes/radios meet the 24px hard floor on every
// profile. This is the resolution of the inherited `target-size` axe finding on /session — the
// session recipient/member-list checkboxes that rendered below 24x24 CSS px on the mobile profile.

const FLOOR = 24;

async function openSession(page: Page) {
	await page.goto('/');
	await page.getByTestId('command-center').waitFor({ state: 'visible' });
	await page.evaluate(async () => {
		await indexedDB.deleteDatabase('dndtools-v2');
	});
	await page.goto('/session');
	await page.getByTestId('session-view').waitFor({ state: 'visible' });
}

test.describe('UX-A11Y-010 native control target size', () => {
	test('every visible checkbox/radio on /session is at least 24x24 CSS px', async ({ page }) => {
		await openSession(page);
		const controls = page.locator('input[type="checkbox"], input[type="radio"]');
		const count = await controls.count();
		expect(count, 'session renders native toggle controls').toBeGreaterThan(0);

		let measured = 0;
		for (let i = 0; i < count; i += 1) {
			const control = controls.nth(i);
			if (!(await control.isVisible())) continue;
			const box = await control.boundingBox();
			expect(box).not.toBeNull();
			expect(box!.width, `checkbox ${i} width`).toBeGreaterThanOrEqual(FLOOR - 0.5);
			expect(box!.height, `checkbox ${i} height`).toBeGreaterThanOrEqual(FLOOR - 0.5);
			measured += 1;
		}
		expect(measured, 'measured at least one visible control').toBeGreaterThan(0);
	});

	test('the Help trigger meets the touch target on the active profile', async ({ page }) => {
		await page.goto('/');
		await page.getByTestId('command-center').waitFor({ state: 'visible' });
		const box = await page.getByTestId('open-help').boundingBox();
		expect(box).not.toBeNull();
		expect(box!.width).toBeGreaterThanOrEqual(FLOOR - 0.5);
		expect(box!.height).toBeGreaterThanOrEqual(FLOOR - 0.5);
	});
});
