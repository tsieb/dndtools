import { describe, expect, it } from 'vitest';
import {
	CANONICAL_NAVIGATION_SECTIONS,
	auditRouteAliasStubs,
	buildRouteAliasTable,
	listAliasRoutes,
	resolveRouteAlias,
	type CanonicalNavigationSection,
} from '../src/index';

/**
 * NAV-002 — legacy route aliases from the alias table, preserving search params and
 * hashes by default, with a duplicate-implementation audit gate.
 */

describe('NAV-002 alias table is derived from the canonical registry', () => {
	it('maps every declared alias to its section route root', () => {
		const table = buildRouteAliasTable();
		// Atlas declares /maps and /map as aliases of /atlas (released).
		expect(table.get('/maps')).toEqual({
			canonicalRoot: '/atlas',
			sectionId: 'atlas',
			released: true,
		});
		expect(table.get('/map')).toEqual({
			canonicalRoot: '/atlas',
			sectionId: 'atlas',
			released: true,
		});
		// Command Center home alias (released).
		expect(table.get('/home')).toEqual({
			canonicalRoot: '/',
			sectionId: 'command-center',
			released: true,
		});
		// A planned-section alias is in the table but marked not-released.
		expect(table.get('/notes')).toEqual({
			canonicalRoot: '/knowledge',
			sectionId: 'knowledge',
			released: false,
		});
	});

	it('lists only released-destination alias routes by default', () => {
		const routes = listAliasRoutes();
		// Released sections in the prototype: command-center (/home), scenes (/canvas),
		// atlas (/maps,/map), session (/sessions,/play), characters (/party,/pcs),
		// settings (/preferences).
		expect(routes).toEqual([
			'/canvas',
			'/home',
			'/map',
			'/maps',
			'/party',
			'/pcs',
			'/play',
			'/preferences',
			'/sessions',
		]);
	});

	it('lists every declared alias when planned destinations are included', () => {
		const routes = listAliasRoutes(CANONICAL_NAVIGATION_SECTIONS, { includePlanned: true });
		const declared = CANONICAL_NAVIGATION_SECTIONS.flatMap((section) => section.aliases).map((a) =>
			a.replace(/\/+$/, ''),
		);
		expect(routes.sort()).toEqual([...new Set(declared)].sort());
	});
});

describe('NAV-002 AC1 alias redirect preserves search params and hash by default', () => {
	it('preserves all search parameters on a legacy map URL', () => {
		const redirect = resolveRouteAlias({ path: '/maps', search: '?poi=abc&x=1&y=2' });
		expect(redirect).not.toBeNull();
		expect(redirect?.canonicalRoot).toBe('/atlas');
		expect(redirect?.target).toBe('/atlas/?poi=abc&x=1&y=2');
		expect(redirect?.preservedSearch).toBe(true);
		expect(redirect?.preservedHash).toBe(false);
	});

	it('preserves a hash anchor alongside search params', () => {
		const redirect = resolveRouteAlias({
			path: '/maps/',
			search: '?poi=abc&x=1&y=2',
			hash: '#layers',
		});
		expect(redirect?.target).toBe('/atlas/?poi=abc&x=1&y=2#layers');
		expect(redirect?.preservedSearch).toBe(true);
		expect(redirect?.preservedHash).toBe(true);
	});

	it('tolerates search/hash passed without their leading ?/# sigils', () => {
		const redirect = resolveRouteAlias({ path: '/notes', search: 'q=goblin', hash: 'overview' });
		expect(redirect?.target).toBe('/knowledge/?q=goblin#overview');
	});

	it('normalizes the home alias to the root route', () => {
		const redirect = resolveRouteAlias({ path: '/home', search: '', hash: '' });
		expect(redirect?.canonicalRoot).toBe('/');
		expect(redirect?.target).toBe('/');
	});

	it('returns null for a path that is not a declared alias', () => {
		expect(resolveRouteAlias({ path: '/atlas' })).toBeNull();
		expect(resolveRouteAlias({ path: '/totally-unknown' })).toBeNull();
	});
});

describe('NAV-002 AC2 alias-stub audit fails on a duplicate implementation', () => {
	/** All declared alias routes wired as proper redirect stubs. */
	function allStubs(redirects = true) {
		return listAliasRoutes().map((route) => ({ route, redirectsToCanonical: redirects }));
	}

	it('passes when every declared alias is a redirect stub', () => {
		const problems = auditRouteAliasStubs({ aliasRoutes: allStubs() });
		expect(problems).toEqual([]);
	});

	it('fails when an alias route duplicates the canonical implementation (AC2)', () => {
		const aliasRoutes = allStubs();
		// Simulate /maps re-implementing the Atlas UI instead of redirecting.
		const maps = aliasRoutes.find((r) => r.route === '/maps')!;
		maps.redirectsToCanonical = false;
		const problems = auditRouteAliasStubs({ aliasRoutes });
		expect(problems).toContainEqual(
			expect.objectContaining({ kind: 'duplicate-implementation', route: '/maps' }),
		);
	});

	it('fails when a declared alias has no scaffolded redirect stub', () => {
		const aliasRoutes = allStubs().filter((r) => r.route !== '/maps');
		const problems = auditRouteAliasStubs({ aliasRoutes });
		expect(problems).toContainEqual(
			expect.objectContaining({ kind: 'missing-alias-stub', route: '/maps' }),
		);
	});

	it('fails when a scaffolded "alias" route is not declared in the registry', () => {
		const aliasRoutes = [...allStubs(), { route: '/legacy', redirectsToCanonical: true }];
		const problems = auditRouteAliasStubs({ aliasRoutes });
		expect(problems).toContainEqual(
			expect.objectContaining({ kind: 'unknown-alias-route', route: '/legacy' }),
		);
	});
});

describe('NAV-002 alias resolution honors a custom registry', () => {
	it('resolves against a provided section list', () => {
		const sections: CanonicalNavigationSection[] = [
			{
				...CANONICAL_NAVIGATION_SECTIONS[0]!,
				id: 'demo',
				routeRoot: '/demo',
				aliases: ['/legacy-demo'],
				home: false,
				availability: { dm: true, player: true, observer: true },
			},
		];
		const redirect = resolveRouteAlias({ path: '/legacy-demo', search: '?a=1' }, sections);
		expect(redirect?.canonicalRoot).toBe('/demo');
		expect(redirect?.target).toBe('/demo/?a=1');
	});
});
