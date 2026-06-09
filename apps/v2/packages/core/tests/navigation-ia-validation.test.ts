import { describe, expect, it } from 'vitest';
import {
	CANONICAL_NAVIGATION_SECTIONS,
	auditNavigationRoutes,
	validateNavigationSections,
	type CanonicalNavigationSection,
} from '../src/queries/navigation-sections';
import {
	DEFAULT_APP_NAME,
	resolveNavigationView,
	resolveRouteAccessibility,
	type NavigationLocation,
} from '../src/queries/navigation-view';
import { dispatchCommand } from '../src/commands/dispatch';
import type {
	CommandResult,
	CoreCommand,
	CoreEnvironment,
	CoreStateSlice,
} from '../src/commands/types';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
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

/**
 * The route roots the prototype actually scaffolds under `apps/v2/app/src/routes`.
 * The app's route-audit gate (tests/unit/route-audit.test.ts) derives this set from the
 * filesystem; here it is stated explicitly so the audit semantics are unit-tested too.
 */
const SCAFFOLDED_ROUTES = [
	'/',
	'/atlas',
	'/characters',
	'/scene',
	'/scenes',
	'/session',
	'/settings',
];

describe('NAV-006 IA-review includes task fit (AC1)', () => {
	it('the shipped registry passes the IA-review validator', () => {
		expect(validateNavigationSections()).toEqual([]);
	});

	it('every canonical section names the user task it serves (task fit)', () => {
		for (const s of CANONICAL_NAVIGATION_SECTIONS) {
			expect(s.taskFit.trim().length).toBeGreaterThan(0);
		}
	});

	it('fails the IA review when a proposed section omits task fit', () => {
		const problems = validateNavigationSections([
			section({ id: 'no-task', taskFit: '   ' }),
			section({ id: 'home', home: true }),
		]);
		expect(problems).toContainEqual(
			expect.objectContaining({ sectionId: 'no-task', field: 'taskFit' }),
		);
	});

	it('requires task fit together with route ownership, aliases, and the local nav contract', () => {
		// NAV-006 AC1: an architecture review must cover all four dimensions at once.
		const broken = section({
			id: 'broken',
			taskFit: '',
			routeRoot: 'sample', // missing leading slash → route ownership
			// @ts-expect-error intentionally invalid availability for the IA gate
			availability: { dm: true },
			// @ts-expect-error intentionally omit aliases to verify the IA gate requires them
			aliases: null,
			// @ts-expect-error intentionally invalid local nav for the IA gate
			localNav: { kind: 'mystery', description: '' },
		});
		const fields = validateNavigationSections([broken, section({ id: 'home', home: true })])
			.filter((p) => p.sectionId === 'broken')
			.map((p) => p.field);
		expect(fields).toContain('taskFit');
		expect(fields).toContain('routeRoot');
		expect(fields).toContain('aliases');
		expect(fields).toContain('localNav');
	});

	it('requires entity routes to be declared and rooted', () => {
		const problems = validateNavigationSections([
			// @ts-expect-error intentionally invalid entityRoutes for the IA gate
			section({ id: 'bad-entity', entityRoutes: 'scene' }),
			section({ id: 'home', home: true }),
		]);
		expect(problems).toContainEqual(
			expect.objectContaining({ sectionId: 'bad-entity', field: 'entityRoutes' }),
		);

		const unrooted = validateNavigationSections([
			section({ id: 'unrooted', entityRoutes: ['scene'] }),
			section({ id: 'home', home: true }),
		]);
		expect(unrooted).toContainEqual(
			expect.objectContaining({ sectionId: 'unrooted', field: 'entityRoutes' }),
		);
	});

	it('detects an entity route that collides with another section route', () => {
		const clash = validateNavigationSections([
			section({ id: 'a', routeRoot: '/a', entityRoutes: ['/shared-detail'] }),
			section({ id: 'b', routeRoot: '/shared-detail' }),
			section({ id: 'home', routeRoot: '/h', home: true }),
		]);
		expect(clash.some((p) => p.field === 'aliases' || p.field === 'routeRoot')).toBe(true);
	});
});

describe('NAV-006 route audit (AC2)', () => {
	it('passes when every scaffolded route maps to a canonical IA owner', () => {
		expect(auditNavigationRoutes({ scaffoldedRoutes: SCAFFOLDED_ROUTES })).toEqual([]);
	});

	it('treats the Scenes entity route /scene as IA-owned, not an orphan', () => {
		// /scene is the /scene/[id] editor; it is owned by the Scenes section's entityRoutes.
		const problems = auditNavigationRoutes({ scaffoldedRoutes: ['/scene'] });
		expect(problems.some((p) => p.kind === 'unowned-route' && p.route === '/scene')).toBe(false);
	});

	it('fails when a route is added without IA metadata (AC2)', () => {
		const problems = auditNavigationRoutes({
			scaffoldedRoutes: [...SCAFFOLDED_ROUTES, '/orphan'],
		});
		expect(problems).toContainEqual(
			expect.objectContaining({ kind: 'unowned-route', route: '/orphan' }),
		);
	});

	it('normalizes trailing slashes when matching scaffolded routes to IA owners', () => {
		expect(
			auditNavigationRoutes({
				scaffoldedRoutes: [
					'/',
					'/atlas/',
					'/characters/',
					'/scene/',
					'/scenes/',
					'/session/',
					'/settings/',
				],
			}),
		).toEqual([]);
	});

	it('reports a released section whose route root is not scaffolded', () => {
		const problems = auditNavigationRoutes({
			// Drop /settings even though the Settings section is released.
			scaffoldedRoutes: ['/', '/scene', '/scenes'],
		});
		expect(problems).toContainEqual(
			expect.objectContaining({ kind: 'missing-section-route', sectionId: 'settings' }),
		);
	});

	it('reports a released section whose entity route is not scaffolded', () => {
		const problems = auditNavigationRoutes({
			// Drop /scene; the Scenes section (released) declares it as an entity route.
			scaffoldedRoutes: ['/', '/scenes', '/settings'],
		});
		expect(problems).toContainEqual(
			expect.objectContaining({ kind: 'missing-entity-route', sectionId: 'scenes' }),
		);
	});

	it('does not require planned sections to have scaffolded routes', () => {
		// Knowledge/Campaign/etc. are approved IA but not yet built; the audit must not
		// demand their routes exist, only that scaffolded routes have IA owners. (Atlas is
		// released for the map deep-link surface, and Session is released by the SES combat
		// slice, so they are no longer in this planned set.)
		const problems = auditNavigationRoutes({ scaffoldedRoutes: SCAFFOLDED_ROUTES });
		expect(problems.some((p) => p.sectionId === 'knowledge')).toBe(false);
		expect(problems.some((p) => p.sectionId === 'campaign')).toBe(false);
	});

	it('fails the route audit when the IA registry itself is invalid', () => {
		const problems = auditNavigationRoutes({ scaffoldedRoutes: ['/h'] }, [
			section({ id: 'home', routeRoot: '/h', home: true, taskFit: '' }),
		]);
		expect(problems.some((p) => p.kind === 'registry-invalid')).toBe(true);
	});
});

// --- NAV-007 route accessibility -------------------------------------------------

function dispatch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	command: CoreCommand,
): CommandResult {
	return dispatchCommand(state, env, command);
}

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function baseVault(): { env: CoreEnvironment; state: CoreStateSlice; playerSceneId: string } {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	state = accept(
		dispatch(state, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	const created = accept(
		dispatch(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name: 'Tavern', visibility: 'player-visible' },
		}),
	);
	state = created.nextState;
	const playerSceneId = (
		created.events.find((e) => e.kind === 'scene.created') as {
			sceneId: string;
		}
	).sceneId;
	return { env, state, playerSceneId };
}

const sceneLocation = (id: string): NavigationLocation => ({
	sectionId: 'scenes',
	entity: { type: 'scene', id },
});

describe('NAV-007 route accessibility semantics', () => {
	it('the heading and document title match the section route context (AC1)', () => {
		const { state } = baseVault();
		const home = resolveRouteAccessibility(
			resolveNavigationView(state, DM_ACTOR.id, { sectionId: 'command-center' }),
		);
		expect(home.heading).toBe('Command Center');
		expect(home.documentTitle).toBe('Command Center — DND Tools v2');
		expect(home.landmark).toBe('command-center');

		const settings = resolveRouteAccessibility(
			resolveNavigationView(state, DM_ACTOR.id, { sectionId: 'settings' }),
		);
		expect(settings.heading).toBe('Settings');
		expect(settings.documentTitle).toMatch(/Settings/);
		expect(settings.landmark).toBe('settings');
	});

	it('uses the open entity name as the route heading when an entity is open', () => {
		const { state, playerSceneId } = baseVault();
		const view = resolveNavigationView(state, DM_ACTOR.id, sceneLocation(playerSceneId));
		const a11y = resolveRouteAccessibility(view);
		expect(a11y.heading).toBe('Tavern');
		expect(a11y.documentTitle).toBe('Tavern — DND Tools v2');
	});

	it('announces the new route so a completed navigation is communicated (AC2)', () => {
		const { state, playerSceneId } = baseVault();
		const sceneA11y = resolveRouteAccessibility(
			resolveNavigationView(state, DM_ACTOR.id, sceneLocation(playerSceneId)),
		);
		// The announcement names the route the user landed on.
		expect(sceneA11y.announcement).toBe('Tavern');

		const settingsA11y = resolveRouteAccessibility(
			resolveNavigationView(state, DM_ACTOR.id, { sectionId: 'settings' }),
		);
		expect(settingsA11y.announcement).toBe('Settings');
		// Two different routes never share an announcement.
		expect(sceneA11y.announcement).not.toBe(settingsA11y.announcement);
	});

	it('fails closed to the app name and never leaks a hidden entity title', () => {
		const { env, state: base } = baseVault();
		const dmScene = accept(
			dispatch(base, env, {
				type: 'scene.create',
				actorId: DM_ACTOR.id,
				payload: { name: 'Secret Lair', visibility: 'dm-only' },
			}),
		);
		const state = dmScene.nextState;
		const dmSceneId = (
			dmScene.events.find((e) => e.kind === 'scene.created') as {
				sceneId: string;
			}
		).sceneId;

		// A player opening a hidden scene: the view redacts it, so the heading falls back
		// to a section/home title and the secret name never appears anywhere.
		const view = resolveNavigationView(state, PLAYER_ACTOR.id, sceneLocation(dmSceneId));
		const a11y = resolveRouteAccessibility(view);
		expect(JSON.stringify(a11y)).not.toContain('Secret Lair');
		expect(a11y.heading).toBe('Command Center');

		// A wholly unknown actor gets the application name as a safe fallback.
		const unknown = resolveRouteAccessibility(
			resolveNavigationView(state, 'nobody', { sectionId: 'command-center' }),
		);
		expect(unknown.heading).toBe(DEFAULT_APP_NAME);
		expect(unknown.documentTitle).toBe(DEFAULT_APP_NAME);
		expect(unknown.landmark).toBe('');
	});

	it('honors a custom application name', () => {
		const { state } = baseVault();
		const a11y = resolveRouteAccessibility(
			resolveNavigationView(state, DM_ACTOR.id, { sectionId: 'settings' }),
			{ appName: 'Custom App' },
		);
		expect(a11y.documentTitle).toBe('Settings — Custom App');
	});
});
