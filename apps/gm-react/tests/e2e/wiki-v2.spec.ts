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
			// The shared distribution serves the documents and the SPA from one origin; a custom
			// domain passes its separate WEB_ORIGIN here instead.
			baseURL!,
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
test('the text reader hands a reader back to the app, keeping the page they were on', async ({
	page,
	baseURL,
}) => {
	await page.goto('/wikis/campaign1234/reader?page=recap');
	const back = page.getByRole('link', { name: 'Open formatted reader' });
	// This link used to be built from the document's own origin, so on a wiki's custom domain — which
	// serves that wiki's text documents and no SPA — it resolved back to the text reader and dropped
	// the page. It has to address the app origin, and carry the page across.
	await expect(back).toHaveAttribute('href', `${baseURL}/#/wiki?id=campaign1234&page=recap`);
	await back.click();
	await expect(page).toHaveURL(`${baseURL}/#/wiki?id=campaign1234&page=recap`);
	// No cloud backend is configured offline, so the app can only reach its honest invalid-link
	// notice — but it IS the app, which is what the custom-domain bounce prevented.
	await expect(page.getByRole('main')).toBeVisible();
});
