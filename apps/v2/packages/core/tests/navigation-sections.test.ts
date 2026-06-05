import { describe, expect, it } from 'vitest';
import {
	CANONICAL_NAVIGATION_SECTIONS,
	findSectionByRoute,
	getHomeSection,
	isSectionAvailableForRole,
	sectionRuntimeRoute,
	validateNavigationSections,
	type CanonicalNavigationSection,
} from '../src/queries/navigation-sections';
import { listNavigationRegistryForActor, listNavigationSections } from '../src/queries/navigation';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildPermissionState,
} from '../src/testing/fixtures';

/** A structurally valid section, used as the base for negative validator cases. */
function section(overrides: Partial<CanonicalNavigationSection> = {}): CanonicalNavigationSection {
	return {
		id: 'sample',
		title: 'Sample',
		owner: 'CONTENT',
		taskFit: 'A sample user task.',
		routeRoot: '/sample',
		entityRoutes: [],
		availability: { dm: true, player: true, observer: true },
		aliases: [],
		landmark: 'sample',
		localNav: { kind: 'note-tree', description: 'A sample local nav contract.' },
		releaseStatus: 'planned',
		keywords: ['sample'],
		category: 'navigation',
		home: false,
		...overrides,
	};
}

describe('NAV-001 Command Center home and canonical sections', () => {
	it('declares exactly one home section, and it is the Command Center at "/"', () => {
		const homes = CANONICAL_NAVIGATION_SECTIONS.filter((s) => s.home);
		expect(homes).toHaveLength(1);
		const home = getHomeSection();
		expect(home.id).toBe('command-center');
		expect(home.routeRoot).toBe('/');
		expect(sectionRuntimeRoute(home)).toBe('/');
		// The home surface is reachable by every role (NAV-001 AC1).
		expect(home.availability).toEqual({ dm: true, player: true, observer: true });
	});

	it('maintains the approved canonical sections named by NAV-001', () => {
		const ids = CANONICAL_NAVIGATION_SECTIONS.map((s) => s.id);
		for (const expected of [
			'command-center',
			'knowledge',
			'atlas',
			'session',
			'campaign',
			'characters',
			'audio',
			'mcp',
			'settings',
		]) {
			expect(ids).toContain(expected);
		}
	});

	it('every section declares an owning domain, route root, landmark, and local nav contract (NAV-009)', () => {
		for (const s of CANONICAL_NAVIGATION_SECTIONS) {
			expect(s.owner).toBeTruthy();
			expect(s.routeRoot.startsWith('/')).toBe(true);
			expect(s.landmark).toBeTruthy();
			expect(s.localNav.kind).toBeTruthy();
			expect(s.localNav.description).toBeTruthy();
			expect(Array.isArray(s.aliases)).toBe(true);
		}
	});
});

describe('NAV-009 IA-review validator', () => {
	it('passes the shipped canonical registry with no problems', () => {
		expect(validateNavigationSections()).toEqual([]);
	});

	it('requires the owner field (NAV-009 AC1)', () => {
		const problems = validateNavigationSections([
			// @ts-expect-error intentionally invalid owner for the IA gate
			section({ id: 'no-owner', owner: '' }),
			section({ home: true, id: 'home', availability: { dm: true, player: true, observer: true } }),
		]);
		expect(problems).toContainEqual(
			expect.objectContaining({ sectionId: 'no-owner', field: 'owner' }),
		);
	});

	it('requires a route root, aliases, availability, and a local nav contract (NAV-009 AC1)', () => {
		const broken = section({
			id: 'broken',
			routeRoot: 'sample', // missing leading slash
			// @ts-expect-error intentionally invalid availability for the IA gate
			availability: { dm: true },
			// @ts-expect-error intentionally invalid local nav for the IA gate
			localNav: { kind: 'mystery', description: '' },
		});
		const problems = validateNavigationSections([broken, section({ home: true, id: 'home' })]);
		const fields = problems.filter((p) => p.sectionId === 'broken').map((p) => p.field);
		expect(fields).toContain('routeRoot');
		expect(fields).toContain('availability');
		expect(fields).toContain('localNav');
	});

	it('rejects a registry without exactly one home section', () => {
		const none = validateNavigationSections([
			section({ id: 'a' }),
			section({ id: 'b', routeRoot: '/b' }),
		]);
		expect(none).toContainEqual(
			expect.objectContaining({ field: 'home', sectionId: '<registry>' }),
		);

		const two = validateNavigationSections([
			section({ id: 'a', home: true }),
			section({ id: 'b', routeRoot: '/b', home: true }),
		]);
		expect(two).toContainEqual(expect.objectContaining({ field: 'home', sectionId: '<registry>' }));
	});

	it('requires the home section to be reachable by every role', () => {
		const problems = validateNavigationSections([
			section({
				id: 'home',
				home: true,
				availability: { dm: true, player: false, observer: false },
			}),
		]);
		expect(problems).toContainEqual(expect.objectContaining({ sectionId: 'home', field: 'home' }));
	});

	it('detects duplicate ids, duplicate route roots, and alias/route collisions', () => {
		const dupId = validateNavigationSections([
			section({ id: 'dup', routeRoot: '/x' }),
			section({ id: 'dup', routeRoot: '/y' }),
			section({ id: 'home', routeRoot: '/home2', home: true }),
		]);
		expect(dupId).toContainEqual(expect.objectContaining({ sectionId: 'dup', field: 'id' }));

		const dupRoute = validateNavigationSections([
			section({ id: 'a', routeRoot: '/same' }),
			section({ id: 'b', routeRoot: '/same' }),
			section({ id: 'home', routeRoot: '/h', home: true }),
		]);
		expect(dupRoute).toContainEqual(
			expect.objectContaining({ sectionId: 'b', field: 'routeRoot' }),
		);

		const aliasClash = validateNavigationSections([
			section({ id: 'a', routeRoot: '/a', aliases: ['/shared'] }),
			section({ id: 'b', routeRoot: '/b', aliases: ['/shared'] }),
			section({ id: 'home', routeRoot: '/h', home: true }),
		]);
		expect(aliasClash).toContainEqual(
			expect.objectContaining({ sectionId: 'b', field: 'aliases' }),
		);
	});
});

describe('route helpers', () => {
	it('computes trailing-slash routes, keeping the home root as "/"', () => {
		const home = CANONICAL_NAVIGATION_SECTIONS.find((s) => s.id === 'command-center')!;
		const scenes = CANONICAL_NAVIGATION_SECTIONS.find((s) => s.id === 'scenes')!;
		expect(sectionRuntimeRoute(home)).toBe('/');
		expect(sectionRuntimeRoute(scenes)).toBe('/scenes/');
	});

	it('resolves a route to its section by root or alias, normalizing trailing slashes', () => {
		expect(findSectionByRoute('/atlas/')?.id).toBe('atlas');
		expect(findSectionByRoute('/maps')?.id).toBe('atlas'); // alias
		expect(findSectionByRoute('/notes')?.id).toBe('knowledge'); // alias
		expect(findSectionByRoute('/')?.id).toBe('command-center');
		expect(findSectionByRoute('/does-not-exist')).toBeUndefined();
	});

	it('reports role availability and fails closed for an unknown role', () => {
		const scenes = CANONICAL_NAVIGATION_SECTIONS.find((s) => s.id === 'scenes')!;
		expect(isSectionAvailableForRole(scenes, 'dm')).toBe(true);
		expect(isSectionAvailableForRole(scenes, 'player')).toBe(false);
		expect(isSectionAvailableForRole(scenes, undefined)).toBe(false);
	});
});

describe('NAV-009 AC2 actor-filtered registry view (no leaks)', () => {
	const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);

	it('gives the DM the full canonical registry', () => {
		const ids = listNavigationRegistryForActor(permission, DM_ACTOR.id).map((e) => e.id);
		expect(ids).toEqual(CANONICAL_NAVIGATION_SECTIONS.map((s) => s.id));
	});

	it('omits DM-only sections from player and observer navigation data', () => {
		const playerIds = listNavigationRegistryForActor(permission, PLAYER_ACTOR.id).map((e) => e.id);
		const observerIds = listNavigationRegistryForActor(permission, OBSERVER_ACTOR.id).map(
			(e) => e.id,
		);
		// Scenes, Audio, and MCP are DM-only: absent for players and observers entirely.
		for (const dmOnly of ['scenes', 'audio', 'mcp']) {
			expect(playerIds).not.toContain(dmOnly);
			expect(observerIds).not.toContain(dmOnly);
		}
		// The home is always present; players keep player-available sections.
		expect(playerIds).toContain('command-center');
		expect(playerIds).toContain('knowledge');
		// Observers get no character/knowledge data but keep shared atlas/session.
		expect(observerIds).not.toContain('characters');
		expect(observerIds).not.toContain('knowledge');
		expect(observerIds).toContain('atlas');
		expect(observerIds).toContain('session');
	});

	it('marks released-and-available sections reachable, planned ones not', () => {
		const dm = listNavigationRegistryForActor(permission, DM_ACTOR.id);
		expect(dm.find((e) => e.id === 'command-center')?.reachable).toBe(true);
		expect(dm.find((e) => e.id === 'scenes')?.reachable).toBe(true);
		expect(dm.find((e) => e.id === 'knowledge')?.reachable).toBe(false); // planned
	});

	it('fails closed for an unknown actor', () => {
		expect(listNavigationRegistryForActor(permission, 'nobody')).toEqual([]);
	});
});

describe('NAV-001 released runtime navigation surfaces only built sections', () => {
	const permission = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);

	it('lists only the released sections in the primary nav, never planned routes', () => {
		const ids = listNavigationSections(permission, DM_ACTOR.id).map((s) => s.id);
		// Atlas (NAV-005), Characters (CHAR creation epic), and Session (SES combat slice) are
		// released, in canonical order.
		expect(ids).toEqual([
			'command-center',
			'scenes',
			'atlas',
			'session',
			'characters',
			'settings',
		]);
		// Planned sections are canonical IA but must not appear as runtime nav links.
		for (const planned of ['knowledge', 'campaign', 'audio', 'mcp']) {
			expect(ids).not.toContain(planned);
		}
	});

	it('carries the canonical landmark for each reachable section (NAV-001 AC2)', () => {
		const sections = listNavigationSections(permission, DM_ACTOR.id);
		expect(sections.find((s) => s.id === 'command-center')?.landmark).toBe('command-center');
		expect(sections.find((s) => s.id === 'scenes')?.landmark).toBe('scenes');
		expect(sections.find((s) => s.id === 'settings')?.landmark).toBe('settings');
	});
});
