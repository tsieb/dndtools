import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Route structure audit test.
 *
 * The IA contract (docs/architecture/INFORMATION_ARCHITECTURE.md) defines five
 * canonical sections: knowledge, atlas, session, campaign, settings.
 * Only these sections plus a small allowlist of special routes may exist as
 * top-level route directories under src/routes/.
 *
 * Legacy non-section routes that still exist as full implementations (rather
 * than redirects) are flagged here so they are tracked until remediation.
 */

const ROUTES_DIR = join(process.cwd(), 'src/routes');

const CANONICAL_SECTIONS = new Set(['knowledge', 'atlas', 'session', 'campaign', 'settings']);

/** Routes that are intentionally outside the section hierarchy. */
const ALLOWLISTED_ROUTES = new Set(['player']);

/**
 * Legacy routes that are known to exist as full implementations instead of
 * redirects. Each entry here is a tracked remediation item from Epic 21.4.
 * Remove entries as they are converted to redirects.
 */
const KNOWN_LEGACY_ROUTES = new Set([
	'combat',
	'encounter',
	'graph',
	'maps',
	'notes',
	'search',
	'session-board',
	'timeline',
]);

function getTopLevelRouteDirs(): string[] {
	return readdirSync(ROUTES_DIR)
		.filter((entry) => {
			const full = join(ROUTES_DIR, entry);
			return statSync(full).isDirectory() && !entry.startsWith('(') && !entry.startsWith('[');
		})
		.sort();
}

describe('route structure audit', () => {
	const topLevelDirs = getTopLevelRouteDirs();

	it('all canonical sections have route directories', () => {
		for (const section of CANONICAL_SECTIONS) {
			expect(topLevelDirs, `missing canonical section route: ${section}`).toContain(section);
		}
	});

	it('no unexpected top-level route directories exist', () => {
		const unexpected = topLevelDirs.filter(
			(dir) =>
				!CANONICAL_SECTIONS.has(dir) &&
				!ALLOWLISTED_ROUTES.has(dir) &&
				!KNOWN_LEGACY_ROUTES.has(dir),
		);
		expect(unexpected, 'unexpected top-level routes outside IA contract').toEqual([]);
	});

	it('known legacy routes are tracked (remove entries as they are converted to redirects)', () => {
		for (const legacy of KNOWN_LEGACY_ROUTES) {
			expect(
				topLevelDirs,
				`legacy route "${legacy}" no longer exists — remove from KNOWN_LEGACY_ROUTES`,
			).toContain(legacy);
		}
	});
});
