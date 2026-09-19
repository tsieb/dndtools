import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
import YAML from 'yaml';
import { wikiDocument } from '../../packages/cloud-fns/src/app-api/wiki-documents';

const read = (path: string) => YAML.parse(readFileSync(path, 'utf8'), { logLevel: 'silent' });
it('only forwards this custom domain to its own wiki documents', () => {
	const template = read('infra/web-hosting/wiki/custom-domain.yaml');
	const source = template.Resources.Route.Properties.FunctionCode.replaceAll(
		'${WikiId}',
		'campaign1234',
	);
	const route = (uri: string) =>
		runInNewContext(`${source}\nhandler(event)`, {
			event: { request: { uri, querystring: { page: { value: 'harbour' } } } },
		});
	expect(route('/').uri).toBe('/wikis/campaign1234/reader');
	expect(route('/rss.xml').uri).toBe('/wikis/campaign1234/rss.xml');
	expect(route('/sitemap.xml').uri).toBe('/wikis/campaign1234/sitemap.xml');
	expect(route('/wikis/campaign1234/reader').querystring.page.value).toBe('harbour');
	for (const uri of ['/wiki', '/account', '/wikis/other1234/reader', '/wikis/campaign1234'])
		expect(route(uri).statusCode).toBe(404);
	const cache = template.Resources.Distribution.Properties.DistributionConfig.DefaultCacheBehavior;
	expect([cache.MinTTL, cache.DefaultTTL, cache.MaxTTL]).toEqual([0, 0, 0]);
});
it('the shared host forwards wiki queries without caching content or forwarding viewer identity', () => {
	const template = read('infra/web-hosting/template.yaml');
	const cache = template.Resources.WikiNoCachePolicy.Properties.CachePolicyConfig;
	expect([cache.MinTTL, cache.DefaultTTL, cache.MaxTTL]).toEqual([0, 0, 0]);
	const request = template.Resources.WikiRequestPolicy.Properties.OriginRequestPolicyConfig;
	expect(request.QueryStringsConfig.QueryStringBehavior).toBe('all');
	expect(request.CookiesConfig.CookieBehavior).toBe('none');
	expect(request.HeadersConfig.Headers).toEqual(['x-wiki-password']);
	const origins = template.Resources.WebDistribution.Properties.DistributionConfig.Origins;
	expect(origins[1][1].OriginPath).toBe('/${Stage}');
});
it('registers documents as anonymous reads while publishing retains the default authorizer', () => {
	const template = read('infra/app-api/template.yaml');
	const resources = Object.values(template.Resources) as Array<{
		Properties?: {
			Events?: Record<string, { Properties: { Auth?: { Authorizer: string }; Path: string } }>;
		};
	}>;
	const events = resources.find((r) => r.Properties?.Events?.ReadWikiDocument)!.Properties!.Events!;
	expect(events.ReadWikiDocument.Properties.Auth?.Authorizer).toBe('NONE');
	expect(events.ReadWikiDocument.Properties.Path).toBe('/wikis/{wikiId}/{document}');
	expect(events.PublishWiki.Properties.Auth?.Authorizer).not.toBe('NONE');
});

it('every URL the renderer publishes on a custom domain survives that domain routing', () => {
	// The reviewer's failure mode: the renderer and the CloudFront function each look correct alone,
	// but composed they disagree. Run the SHIPPED function over the URLs the SHIPPED renderer emits.
	const host = 'campaign.example';
	const appOrigin = 'https://app.example';
	const source = read(
		'infra/web-hosting/wiki/custom-domain.yaml',
	).Resources.Route.Properties.FunctionCode.replaceAll('${WikiId}', 'campaign1234');
	const route = (uri: string) =>
		runInNewContext(`${source}\nhandler(event)`, { event: { request: { uri, querystring: {} } } });
	const wiki = {
		wikiId: 'campaign1234',
		title: 'Copper & Coast',
		access: 'public',
		updatedAt: '2026-09-01',
		pages: [
			{ slug: 'harbour', title: 'Harbour', markdown: 'Ships at anchor.', folder: 'Places' },
			{ slug: 'recap', title: 'First voyage', markdown: 'A sunken crypt.', kind: 'recap' as const },
		],
	};
	const hrefs = ['reader', 'rss.xml', 'sitemap.xml'].flatMap((format) => [
		...wikiDocument(wiki, `https://${host}`, format, { page: 'harbour' }, appOrigin).body.matchAll(
			/(?:href|src)="([^"]+)"|<(?:loc|link|guid[^>]*)>([^<]+)<\//g,
		),
	]);
	const urls = hrefs
		.map(([, attr, node]) => (attr ?? node)!.replaceAll('&amp;', '&'))
		.filter((u) => !u.startsWith('#'));
	expect(urls.length).toBeGreaterThan(8);
	for (const raw of urls) {
		const url = new URL(raw, `https://${host}/wikis/campaign1234/reader`);
		// An off-host URL (the app link) leaves this distribution entirely and is not its to route.
		if (url.host !== host) {
			expect(url.origin).toBe(appOrigin);
			continue;
		}
		// Reaching the origin is not enough: the function must route the URL to ITSELF. An app link
		// left on this host would arrive as '/' and be rewritten to the text reader — a 200 that
		// silently lands the reader somewhere other than where the link pointed.
		const routed = route(url.pathname);
		expect({ raw, routed: routed.statusCode ?? routed.uri }).toEqual({ raw, routed: url.pathname });
	}
});
