import { expect, type Page } from '@playwright/test';

export const wikiFixture = {
	wikiId: 'fixture',
	title: 'The Copper Coast',
	access: 'public',
	publishedAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-02T00:00:00.000Z',
	pageCount: 2,
	pages: [
		{
			slug: 'harbour',
			title: 'Harbour Ward',
			markdown: 'Ships at anchor. Visit [[The Sunken Crypt]].',
			folder: 'Places',
		},
		{ slug: 'crypt', title: 'The Sunken Crypt', markdown: 'Water to the knee.', folder: 'Places' },
	],
};

// Browser-local fixture: rewrite only the served config module, never the production config or
// environment. All requests to the synthetic API are intercepted; no account or remote is used.
export async function mockWiki(
	page: Page,
	mode: 'ready' | 'password' | 'empty' | 'loading' = 'ready',
) {
	await page.route('**/src/cloud/config.ts', async (route) => {
		const response = await route.fetch();
		const source = await response.text();
		const body = source.replace(
			/appApiUrl: read\(["']VITE_APP_API_URL["']\)/,
			'appApiUrl: location.origin + "/__wiki_fixture"',
		);
		expect(body).not.toBe(source);
		await route.fulfill({ response, body });
	});
	await page.route('**/__wiki_fixture/**', async (route) => {
		if (mode === 'loading') return;
		if (mode === 'password' && route.request().headers()['x-wiki-password'] !== 'lantern') {
			await route.fulfill({ status: 401, json: {} });
			return;
		}
		await route.fulfill({
			json: mode === 'empty' ? { ...wikiFixture, pages: [], pageCount: 0 } : wikiFixture,
		});
	});
}
