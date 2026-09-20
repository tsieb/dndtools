import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockWiki } from './_wikiFixture';

async function axe(page: Page) {
	// Theme swaps transition DS control backgrounds; scan the settled palette, not an intermediate frame.
	await page.waitForTimeout(250);
	const result = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa', 'best-practice'])
		.analyze();
	expect(result.violations).toEqual([]);
}

test('wiki reader: keyboard reading, search, all themes and large text', async ({ page }) => {
	page.on('pageerror', (error) => console.error('Wiki page error:', error.message));
	page.on('requestfailed', (request) =>
		console.error('Wiki request failed:', request.url(), request.failure()?.errorText),
	);
	await mockWiki(page);
	await page.goto('/#/wiki?id=fixture');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Copper Coast', {
		timeout: 20_000,
	});
	await page.keyboard.press('Tab');
	await expect(page.getByRole('link', { name: 'Skip to page content' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('main')).toBeFocused();
	const next = page
		.getByRole('navigation')
		.getByRole('button', { name: 'The Sunken Crypt', exact: true });
	await page.keyboard.press('Shift+Tab');
	await expect(next).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.locator('article h2')).toBeFocused();
	await expect(page.locator('article')).toContainText('Water to the knee.');
	for (const theme of ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast']) {
		await page.getByLabel('Reader theme').selectOption(theme);
		await axe(page);
	}
	await page.getByLabel('Search wiki').fill('no such place');
	await expect(page.getByRole('status')).toContainText('No matching pages');
	await expect(page.locator('[data-illustration="search-none"]')).toBeVisible();
	await page.getByLabel('Reader theme').selectOption('parchment');
	await axe(page);
	await page.getByLabel('Search wiki').fill('');
	await page.evaluate(() => {
		document.documentElement.dataset.motion = 'reduced';
	});
	expect(
		await next.evaluate((node) =>
			getComputedStyle(node)
				.transitionDuration.split(',')
				.every((value) => parseFloat(value) <= 0.00001),
		),
	).toBe(true);
	await page.evaluate(() => {
		document.documentElement.style.fontSize = '200%';
	});
	await expect(next).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true,
	);
});

test('wiki reader: password failure announces recovery and opens the article', async ({ page }) => {
	await mockWiki(page, 'password');
	await page.goto('/#/wiki?id=fixture');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('This wiki is protected');
	await axe(page);
	await page.getByLabel('Wiki password').fill('wrong');
	await page.getByLabel('Wiki password').press('Enter');
	await expect(page.getByRole('alert')).toContainText('That password is not right');
	await axe(page);
	await page.getByLabel('Wiki password').fill('lantern');
	await page.getByLabel('Wiki password').press('Enter');
	await expect(page.locator('article')).toContainText('Ships at anchor.');
});

for (const mode of ['empty', 'loading'] as const) {
	test(`wiki reader: ${mode} state`, async ({ page }) => {
		await mockWiki(page, mode);
		await page.goto('/#/wiki?id=fixture');
		await expect(page.getByRole('main')).toBeVisible();
		if (mode === 'empty')
			await expect(page.locator('[data-illustration="publish-empty"]')).toBeVisible();
		else await expect(page.getByRole('status')).toHaveText('Fetching the published pages…');
		for (const theme of ['tavern', 'parchment', 'scholar', 'dungeon', 'high-contrast']) {
			await page
				.locator('[data-theme]')
				.last()
				.evaluate((node, applied) => node.setAttribute('data-theme', applied), theme);
			await axe(page);
		}
	});
}

test('wiki reader: missing link has a named, accessible notice', async ({ page }) => {
	await page.goto('/#/wiki');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('No wiki link');
	await axe(page);
});
