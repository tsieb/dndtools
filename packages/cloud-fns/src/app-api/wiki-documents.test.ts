import { describe, expect, it } from 'vitest';
import { wikiDocument, type WikiDocument } from './wiki-documents';
const wiki: WikiDocument = {
	wikiId: 'campaign1234',
	title: 'Copper & Coast',
	access: 'public',
	updatedAt: '2026-09-01',
	pages: [
		{
			slug: 'harbour',
			title: 'Harbour',
			markdown: 'Ships at anchor.\n> [!Secret]\n> Hidden treasure',
			folder: 'Places',
		},
		{
			slug: 'first-session',
			title: 'First session',
			markdown: '<script>alert(1)</script>',
			folder: 'Journal',
			kind: 'recap',
			updatedAt: '2026-09-01',
		},
	],
};
describe('wiki documents', () => {
	it('renders crawlable page-specific metadata, folder links and escaped player-safe content', () => {
		const response = wikiDocument(wiki, 'https://wiki.example', 'reader');
		expect(response.statusCode).toBe(200);
		expect(response.headers['cache-control']).toBe('no-store');
		expect(response.body).toContain('<title>Harbour — Copper &amp; Coast</title>');
		expect(response.body).toContain('name="description"');
		expect(response.body).toContain('<h2>Places</h2>');
		expect(response.body).not.toContain('Hidden treasure');
		expect(
			wikiDocument(wiki, 'https://wiki.example', 'reader', { page: 'first-session' }).body,
		).not.toContain('<script>');
	});
	it('searches bodies and rejects unknown pages', () => {
		const response = wikiDocument(wiki, 'https://wiki.example', 'reader', { q: 'anchor' });
		expect(response.body).not.toContain('<h2>Journal</h2>');
		expect(
			wikiDocument(wiki, 'https://wiki.example', 'reader', { page: 'missing' }).statusCode,
		).toBe(404);
	});
	it('RSS includes only recaps and sitemap contains distinct non-fragment page URLs', () => {
		const rss = wikiDocument(wiki, 'https://wiki.example', 'rss.xml');
		expect(rss.body).toContain('<title>First session</title>');
		expect(rss.body).not.toContain('<title>Harbour</title>');
		expect(rss.body).toContain('&lt;script&gt;');
		const sitemap = wikiDocument(wiki, 'https://wiki.example', 'sitemap.xml');
		expect(sitemap.body.match(/<url>/g)).toHaveLength(2);
		expect(sitemap.body).toContain('/reader?page=harbour');
	});
	it('unlisted documents are noindex and never syndicated', () => {
		const privateWiki = { ...wiki, access: 'unlisted' };
		expect(
			wikiDocument(privateWiki, 'https://wiki.example', 'reader').headers['x-robots-tag'],
		).toBe('noindex, nofollow');
		for (const format of ['rss.xml', 'sitemap.xml'])
			expect(wikiDocument(privateWiki, 'https://wiki.example', format).statusCode).toBe(404);
	});
});
