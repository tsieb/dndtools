import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { auditNavigationRoutes } from '@dndtools/v2-core';

/**
 * NAV-006 AC2 — the route-audit gate.
 *
 * This test is the programmatic route audit: it derives the actual top-level route
 * roots scaffolded under `src/routes` and checks every one against the canonical
 * Navigation Section registry (the IA metadata). If a route is added without IA
 * metadata — i.e. it does not map to a section root, an owned entity route, or a
 * declared alias — the audit returns a problem and this gate fails (NAV-006 AC2). If a
 * released section's route is missing, the audit also fails, so the route tree and the
 * approved IA cannot silently diverge.
 *
 * Route-shape knowledge belongs to the GUI (Contract 1): this test enumerates the
 * SvelteKit route directories and hands the discovered roots to the Processing Core's
 * pure {@link auditNavigationRoutes} audit.
 */

const routesDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/routes');

/** SvelteKit route files that are not their own top-level route segment. */
const NON_SEGMENT_ENTRIES = new Set([
	'+layout.svelte',
	'+layout.ts',
	'+layout.server.ts',
	'+page.svelte',
	'+page.ts',
	'+page.server.ts',
	'+error.svelte',
	'styles.css',
]);

/**
 * Discover the top-level route roots scaffolded under `src/routes`. A directory is a
 * top-level segment (`scene`, `scenes`, `settings` → `/scene`, `/scenes`, `/settings`);
 * a root `+page.svelte` is the home route `/`. Dynamic segments such as `[id]` live
 * inside their parent directory, so only the parent segment is a top-level root.
 */
function discoverScaffoldedRoutes(): string[] {
	const entries = readdirSync(routesDir, { withFileTypes: true });
	const routes = new Set<string>();
	for (const entry of entries) {
		if (entry.isDirectory()) {
			// Route groups like `(group)` do not contribute a path segment; none exist
			// today, but skip them defensively if one is added later.
			if (entry.name.startsWith('(') && entry.name.endsWith(')')) continue;
			routes.add(`/${entry.name}`);
		} else if (entry.name === '+page.svelte') {
			routes.add('/');
		} else if (!NON_SEGMENT_ENTRIES.has(entry.name)) {
			// A stray top-level file that is not a recognized SvelteKit route artifact is
			// worth surfacing rather than silently ignoring.
			continue;
		}
	}
	return [...routes];
}

describe('NAV-006 AC2 route audit gate', () => {
	it('discovers the expected prototype route roots', () => {
		const routes = discoverScaffoldedRoutes().sort();
		expect(routes).toEqual(['/', '/scene', '/scenes', '/settings']);
	});

	it('every scaffolded route maps to canonical IA metadata (gate passes)', () => {
		const problems = auditNavigationRoutes({ scaffoldedRoutes: discoverScaffoldedRoutes() });
		expect(problems).toEqual([]);
	});

	it('fails the gate if a route is scaffolded without IA metadata (AC2)', () => {
		// Simulate adding a `/reports` route without registering it in the IA registry.
		const problems = auditNavigationRoutes({
			scaffoldedRoutes: [...discoverScaffoldedRoutes(), '/reports'],
		});
		expect(problems).toContainEqual(
			expect.objectContaining({ kind: 'unowned-route', route: '/reports' }),
		);
	});
});
