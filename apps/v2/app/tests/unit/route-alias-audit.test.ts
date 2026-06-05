import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	auditRouteAliasStubs,
	listAliasRoutes,
	type AliasRouteDescriptor,
} from '@dndtools/v2-core';

/**
 * NAV-002 AC2 — the alias-stub audit gate.
 *
 * This test is the programmatic form of "a full duplicate legacy implementation exists
 * instead of a redirect stub → the gate fails." It reads the real legacy-alias route
 * directories under `src/routes`, decides for each whether it is a thin redirect stub or
 * a duplicate implementation, and hands those facts to the Processing Core's pure
 * {@link auditRouteAliasStubs} audit (route-shape knowledge is the GUI's — Contract 1;
 * the alias table and audit rules are the core's).
 *
 * A redirect stub is recognized structurally: it consists of only a `+page.ts` that
 * delegates to the shared `redirectLegacyAlias` helper, and renders nothing of its own
 * (no `+page.svelte`). A directory with its own `+page.svelte`, or a `+page.ts` that does
 * not redirect, is treated as a duplicate implementation and fails the gate.
 */

const routesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/routes');

/** Strip trailing slashes for route comparison; keep `/`. */
function normalize(route: string): string {
	return route.replace(/\/+$/, '') || '/';
}

/** Inspect a scaffolded alias route directory and describe whether it is a redirect
 *  stub: a `+page.ts` that delegates to `redirectLegacyAlias`, with no `+page.svelte`. */
function describeAliasRoute(aliasRoute: string): AliasRouteDescriptor {
	const dir = join(routesDir, aliasRoute.replace(/^\//, ''));
	if (!existsSync(dir)) {
		return { route: aliasRoute, redirectsToCanonical: false };
	}
	const entries = readdirSync(dir);
	const hasOwnPage = entries.includes('+page.svelte');
	const pageTs = join(dir, '+page.ts');
	let redirects = false;
	if (existsSync(pageTs)) {
		const source = readFileSync(pageTs, 'utf8');
		redirects = source.includes('redirectLegacyAlias');
	}
	// A redirect stub redirects AND renders nothing of its own.
	return { route: aliasRoute, redirectsToCanonical: redirects && !hasOwnPage };
}

describe('NAV-002 AC2 alias-stub audit gate', () => {
	it('every released-section legacy alias is a thin redirect stub (gate passes)', () => {
		const aliasRoutes = listAliasRoutes().map(describeAliasRoute);
		const problems = auditRouteAliasStubs({ aliasRoutes });
		expect(problems).toEqual([]);
	});

	it('the alias stub directories exist and contain only a redirecting +page.ts', () => {
		for (const route of listAliasRoutes()) {
			const dir = join(routesDir, route.replace(/^\//, ''));
			expect(existsSync(join(dir, '+page.ts'))).toBe(true);
			// A stub must not carry its own rendered page (which would be a duplicate UI).
			expect(existsSync(join(dir, '+page.svelte'))).toBe(false);
			expect(readFileSync(join(dir, '+page.ts'), 'utf8')).toContain('redirectLegacyAlias');
		}
	});

	it('fails the gate when an alias route gains its own rendered page (AC2)', () => {
		// Simulate /maps re-implementing the Atlas UI by reporting it with its own page.
		const aliasRoutes = listAliasRoutes().map((route) =>
			normalize(route) === '/maps'
				? { route, redirectsToCanonical: false }
				: describeAliasRoute(route),
		);
		const problems = auditRouteAliasStubs({ aliasRoutes });
		expect(problems).toContainEqual(
			expect.objectContaining({ kind: 'duplicate-implementation', route: '/maps' }),
		);
	});
});
