import { describe, expect, it } from 'vitest';
import {
	bundleFacets,
	listingFacets,
	maintainerSubs,
	matchesQuery,
	normalizeSystem,
	parseListingQuery,
	parseStars,
	ratingSummary,
} from './discovery.ts';

// RC-CLD-4.5 — the pure discovery rules. The route contracts live in handler.test.ts; these pin
// the edges a route test would only reach indirectly.
describe('RC-CLD-4.5 discovery rules', () => {
	it('folds a system name and drops the builtin:/custom: namespace', () => {
		expect(normalizeSystem('  Builtin:DnD5e ')).toBe('dnd5e');
		expect(normalizeSystem('custom:hearthlight')).toBe('hearthlight');
		expect(normalizeSystem('pathfinder-2e')).toBe('pathfinder-2e');
	});

	it('reads facets from a validated bundle; a system package is found under its own id', () => {
		expect(
			bundleFacets({ manifest: { kind: 'system-package' }, payload: { id: 'builtin:dnd5e' } }),
		).toEqual({ systems: ['dnd5e'], license: '' });
		expect(
			bundleFacets({
				manifest: {
					kind: 'content-module',
					systems: ['DnD5e', 'dnd5e', ' PF2e '],
					license: ' CC0 ',
				},
				payload: {},
			}),
		).toEqual({ systems: ['dnd5e', 'pf2e'], license: 'CC0' });
		// Declared systems win over the fallback; a legacy bare package carries neither facet.
		expect(
			bundleFacets({
				manifest: { kind: 'system-package', systems: ['osr'] },
				payload: { id: 'custom:x' },
			}).systems,
		).toEqual(['osr']);
		expect(bundleFacets(null)).toEqual({ systems: [], license: '' });
	});

	it('parses a query into folded, de-duplicated words and refuses what it cannot honour', () => {
		expect(parseListingQuery(undefined)).toEqual({
			ok: true,
			query: { terms: [], kind: null, system: null, license: null },
		});
		expect(
			parseListingQuery({
				q: ' Crypt  crypt DROWNED ',
				kind: 'content-module',
				system: 'DnD5e',
				license: 'CC0',
			}),
		).toEqual({
			ok: true,
			query: {
				terms: ['crypt', 'drowned'],
				kind: 'content-module',
				system: 'dnd5e',
				license: 'cc0',
			},
		});
		expect(parseListingQuery({ kind: 'spellbook' }).ok).toBe(false);
		expect(parseListingQuery({ q: 'x'.repeat(101) }).ok).toBe(false);
		expect(parseListingQuery({ q: 'a b c d e f g h i' }).ok).toBe(false);
		expect(parseListingQuery({ license: 'l'.repeat(81) }).ok).toBe(false);
	});

	it('matches every word against the name or summary, and every filter exactly', () => {
		const row = {
			name: 'The Sunken Crypt',
			summary: 'A delve under a drowned chapel.',
			systems: '["dnd5e"]',
			license: 'CC-BY-4.0',
		};
		const query = (params: Record<string, string>) => {
			const parsed = parseListingQuery(params);
			if (!parsed.ok) throw new Error(parsed.error);
			return parsed.query;
		};
		expect(matchesQuery(row, 'content-module', query({ q: 'crypt chapel' }))).toBe(true);
		expect(matchesQuery(row, 'content-module', query({ q: 'crypt tower' }))).toBe(false);
		expect(matchesQuery(row, 'content-module', query({ kind: 'system-package' }))).toBe(false);
		expect(matchesQuery(row, 'content-module', query({ system: 'pf2e' }))).toBe(false);
		expect(matchesQuery(row, 'content-module', query({ license: 'cc-by-4.0' }))).toBe(true);
		// A damaged systems attribute reads as no systems rather than throwing.
		expect(
			matchesQuery({ ...row, systems: '{oops' }, 'content-module', query({ system: 'dnd5e' })),
		).toBe(false);
	});

	it('builds facets over every row, licences de-duplicated case-insensitively', () => {
		expect(
			listingFacets([
				{ systems: '["pf2e"]', license: 'CC0' },
				{ systems: '["dnd5e","pf2e"]', license: 'cc0' },
				{ license: 'MIT' },
			]),
		).toEqual({ systems: ['dnd5e', 'pf2e'], licenses: ['CC0', 'MIT'] });
	});

	it('summarises ratings to one decimal and clamps a damaged aggregate', () => {
		expect(ratingSummary(undefined)).toEqual({ average: null, count: 0 });
		expect(ratingSummary({ ratingCount: '0', ratingSum: '0' })).toEqual({
			average: null,
			count: 0,
		});
		expect(ratingSummary({ ratingCount: '3', ratingSum: '13' })).toEqual({
			average: 4.3,
			count: 3,
		});
		expect(ratingSummary({ ratingCount: '1', ratingSum: '40' })).toEqual({ average: 5, count: 1 });
	});

	it('accepts only whole stars from 1 to 5', () => {
		expect([1, 3, 5].map(parseStars)).toEqual([1, 3, 5]);
		expect([0, 6, 2.5, '4', null, undefined].map(parseStars)).toEqual([
			null,
			null,
			null,
			null,
			null,
			null,
		]);
	});

	it('reads the maintainer allowlist; empty means nobody', () => {
		expect([...maintainerSubs(' a , ,b ')]).toEqual(['a', 'b']);
		expect(maintainerSubs('').size).toBe(0);
		expect(maintainerSubs(undefined).size).toBe(0);
	});
});
