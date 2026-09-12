import { expect, test } from '@playwright/test';
import {
	wikiDocument,
	type WikiDocument,
} from '../../../../packages/cloud-fns/src/app-api/wiki-documents';

const wiki: WikiDocument = {
	wikiId: 'campaign1234',
	title: 'The Copper Coast',
	access: 'public',
	updatedAt: '2026-09-01',
	pages: [
		{
			slug: 'harbour',
			title: 'Harbour Ward',
			markdown: 'Ships at anchor.',
			folder: 'Places / Coast',
		},
		{
			slug: 'recap',
			title: 'First voyage',
			markdown: 'We found the sunken crypt.',
			folder: 'Session recaps',
			kind: 'recap',
		},
	],
};
// Exercise the production document renderer with a local published bundle. No cloud credentials.
test.beforeEach(async ({ page, baseURL }) => {
	await page.route('**/wikis/campaign1234/**', async (route) => {
		const url = new URL(route.request().url());
		const result = wikiDocument(
			wiki,
			baseURL!,
			url.pathname.split('/').at(-1)!,
			Object.fromEntries(url.searchParams),
		);
		await route.fulfill({ status: result.statusCode, headers: result.headers, body: result.body });
	});
});
test('reader folders, search, theme and page navigation work without an account', async ({
	page,
}) => {
	await page.goto('/wikis/campaign1234/reader');
	await expect(page).toHaveTitle('Harbour Ward — The Copper Coast');
	await expect(page.getByRole('heading', { name: 'Places / Coast' })).toBeVisible();
	await page.getByRole('link', { name: 'First voyage', exact: true }).click();
	await expect(page.getByRole('main')).toContainText('sunken crypt');
	await page.getByRole('link', { name: 'Use dark theme' }).click();
	await expect(page.getByRole('link', { name: 'Use light theme' })).toBeVisible();
	await page.getByLabel('Search wiki').fill('anchor');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(
		page.getByRole('navigation').getByRole('link', { name: 'Harbour Ward' }),
	).toBeVisible();
	await expect(
		page.getByRole('navigation').getByRole('link', { name: 'First voyage' }),
	).toHaveCount(0);
	await page.getByLabel('Search wiki').fill('no-such-lore');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page.getByText('No matching pages')).toBeVisible();
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		/reader\?page=recap$/,
	);
});
test('reader exposes RSS and sitemap links and scales to the viewport', async ({ page }) => {
	await page.goto('/wikis/campaign1234/reader');
	await expect(page.getByRole('link', { name: 'Subscribe to recaps' })).toHaveAttribute(
		'href',
		/rss.xml$/,
	);
	await expect(page.getByRole('link', { name: 'Sitemap' })).toHaveAttribute('href', /sitemap.xml$/);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
		true,
	);
});
