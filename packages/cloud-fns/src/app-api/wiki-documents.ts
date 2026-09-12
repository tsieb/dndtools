import { stripSecretCallouts } from '../../../core/src/state/markdown';

export interface WikiDocumentPage {
	slug: string;
	title: string;
	markdown: string;
	updatedAt?: string;
	folder?: string;
	kind?: 'note' | 'recap';
}
export interface WikiDocument {
	wikiId: string;
	title: string;
	access: string;
	updatedAt: string;
	pages: WikiDocumentPage[];
}
const escape = (value: string) =>
	value.replace(
		/[&<>"']/g,
		(c) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;',
			})[c]!,
	);
const text = (page: WikiDocumentPage) => stripSecretCallouts(page.markdown);

/** All URLs come from deployment coordinates, never Host or a user-supplied URL. */
export function wikiDocument(
	wiki: WikiDocument,
	origin: string,
	format: string,
	query: Record<string, string | undefined> = {},
	appOrigin = origin,
) {
	const base = `${origin.replace(/\/$/, '')}/wikis/${encodeURIComponent(wiki.wikiId)}`;
	const pageUrl = (slug: string) => `${base}/reader?page=${encodeURIComponent(slug)}`;
	const response = (statusCode: number, body: string, contentType: string) => ({
		statusCode,
		headers: {
			'content-type': `${contentType}; charset=utf-8`,
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff',
			'x-robots-tag': wiki.access === 'public' ? 'index, follow' : 'noindex, nofollow',
			'content-security-policy':
				"default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
		},
		body,
	});
	if (format !== 'reader' && wiki.access !== 'public')
		return response(404, 'Not found', 'text/plain');
	if (format === 'sitemap.xml')
		return response(
			200,
			`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${wiki.pages.map((p) => `<url><loc>${escape(pageUrl(p.slug))}</loc></url>`).join('')}</urlset>`,
			'application/xml',
		);
	if (format === 'rss.xml')
		return response(
			200,
			`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${escape(wiki.title)}</title><link>${escape(`${base}/reader`)}</link><description>Campaign session recaps</description>${wiki.pages
				.filter((p) => p.kind === 'recap')
				.map(
					(p) =>
						`<item><title>${escape(p.title)}</title><link>${escape(pageUrl(p.slug))}</link><guid isPermaLink="true">${escape(pageUrl(p.slug))}</guid><description>${escape(text(p))}</description>${p.updatedAt && Number.isFinite(Date.parse(p.updatedAt)) ? `<pubDate>${new Date(p.updatedAt).toUTCString()}</pubDate>` : ''}</item>`,
				)
				.join('')}</channel></rss>`,
			'application/rss+xml',
		);
	const page = query.page ? wiki.pages.find((p) => p.slug === query.page) : wiki.pages[0];
	if (!page) return response(404, 'Page not found', 'text/plain');
	const search = (query.q ?? '').slice(0, 200);
	const matches = wiki.pages.filter((p) =>
		`${p.title}\n${text(p)}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
	);
	const groups = new Map<string, WikiDocumentPage[]>();
	for (const p of matches) {
		const group = p.folder || 'Pages';
		groups.set(group, [...(groups.get(group) ?? []), p]);
	}
	const dark = query.theme === 'dark';
	const title = `${page.title} — ${wiki.title}`;
	const description =
		text(page).replace(/\s+/g, ' ').slice(0, 160) || `Read ${page.title} in ${wiki.title}.`;
	return response(
		200,
		`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title><meta name="description" content="${escape(description)}"><meta name="robots" content="${wiki.access === 'public' ? 'index, follow' : 'noindex, nofollow'}"><link rel="canonical" href="${escape(pageUrl(page.slug))}"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="article"><meta property="og:url" content="${escape(pageUrl(page.slug))}">${wiki.access === 'public' ? `<link rel="alternate" type="application/rss+xml" title="Session recaps" href="${base}/rss.xml">` : ''}<style>
:root{color-scheme:${dark ? 'dark' : 'light'};font:18px/1.6 system-ui}body{max-width:70rem;margin:auto;padding:1.5rem}a{color:LinkText}header{border-bottom:1px solid;padding-bottom:1rem}.layout{display:grid;grid-template-columns:minmax(12rem,1fr) 3fr;gap:2rem}nav a{display:block;padding:.35rem}article{white-space:pre-wrap;overflow-wrap:anywhere}input,button{font:inherit;max-width:100%;box-sizing:border-box}input{width:100%}h1,h2{line-height:1.2}main{min-width:0}@media(max-width:600px){.layout{display:block}}:focus-visible{outline:3px solid LinkText;outline-offset:3px}
</style></head><body><a href="#content">Skip to content</a><header><h1>${escape(wiki.title)}</h1><a href="${escape(`${appOrigin.replace(/\/$/, '')}/#/wiki?id=${encodeURIComponent(wiki.wikiId)}&page=${encodeURIComponent(page.slug)}`)}">Open formatted reader</a><form role="search" method="get"><label for="q">Search wiki</label><input id="q" name="q" value="${escape(search)}" maxlength="200"><input type="hidden" name="page" value="${escape(page.slug)}"><input type="hidden" name="theme" value="${dark ? 'dark' : 'light'}"><button>Search</button></form><a href="?${new URLSearchParams({ page: page.slug, q: search, theme: dark ? 'light' : 'dark' }).toString().replace(/&/g, '&amp;')}">Use ${dark ? 'light' : 'dark'} theme</a>${wiki.access === 'public' ? ` · <a href="${base}/rss.xml">Subscribe to recaps</a> · <a href="${base}/sitemap.xml">Sitemap</a>` : ''}</header><div class="layout"><nav aria-label="Wiki pages">${matches.length ? [...groups].map(([folder, pages]) => `<section><h2>${escape(folder)}</h2>${pages.map((p) => `<a href="${escape(`${pageUrl(p.slug)}&theme=${dark ? 'dark' : 'light'}`)}"${p.slug === page.slug ? ' aria-current="page"' : ''}>${escape(p.title)}</a>`).join('')}</section>`).join('') : '<p>No matching pages</p>'}</nav><main id="content" tabindex="-1"><h2>${escape(page.title)}</h2><article>${escape(text(page))}</article></main></div></body></html>`,
		'text/html',
	);
}
