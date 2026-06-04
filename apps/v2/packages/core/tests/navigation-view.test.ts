import { describe, expect, it } from 'vitest';
import { dispatchCommand } from '../src/commands/dispatch';
import type {
	CommandResult,
	CoreCommand,
	CoreEnvironment,
	CoreStateSlice,
} from '../src/commands/types';
import {
	listReachableDestinations,
	resolveNavigationView,
	type NavigationLocation,
} from '../src/queries/navigation-view';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function createScene(
	state: CoreStateSlice,
	env: CoreEnvironment,
	name: string,
	visibility: 'dm-only' | 'shared' | 'player-visible',
): { state: CoreStateSlice; sceneId: string } {
	const result = accept(
		dispatch(state, env, {
			type: 'scene.create',
			actorId: DM_ACTOR.id,
			payload: { name, visibility },
		}),
	);
	const sceneId = (result.events.find((e) => e.kind === 'scene.created') as { sceneId: string })
		.sceneId;
	return { state: result.nextState, sceneId };
}

/** A vault with the Command Center home configured and one dm-only + one
 *  player-visible Scene, mirroring the command-availability fixture. */
function baseVault(): {
	env: CoreEnvironment;
	state: CoreStateSlice;
	homeSceneId: string;
	dmSceneId: string;
	playerSceneId: string;
} {
	const env = makeEnvironment();
	let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	const home = accept(
		dispatch(state, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	);
	state = home.nextState;
	const homeSceneId = (home.events.find((e) => e.kind === 'command-center.home-ready') as {
		sceneId: string;
	}).sceneId;

	const dm = createScene(state, env, 'Secret Lair', 'dm-only');
	state = dm.state;
	const player = createScene(state, env, 'Tavern', 'player-visible');
	state = player.state;

	return { env, state, homeSceneId, dmSceneId: dm.sceneId, playerSceneId: player.sceneId };
}

const sceneLocation = (id: string): NavigationLocation => ({
	sectionId: 'scenes',
	entity: { type: 'scene', id },
});

describe('NAV-003 breadcrumbs', () => {
	it('builds Home -> Scenes -> Scene from a single location', () => {
		const { state, playerSceneId } = baseVault();
		const view = resolveNavigationView(state, DM_ACTOR.id, sceneLocation(playerSceneId));
		expect(view.breadcrumbs.map((c) => c.title)).toEqual(['Command Center', 'Scenes', 'Tavern']);
		expect(view.breadcrumbs.map((c) => c.route)).toEqual([
			'/',
			'/scenes/',
			`/scene/${playerSceneId}/`,
		]);
		// Exactly the open entity is current; ancestors are navigable links.
		expect(view.breadcrumbs.map((c) => c.current)).toEqual([false, false, true]);
	});

	it('marks Home current at the Command Center with no deeper trail', () => {
		const { state } = baseVault();
		const view = resolveNavigationView(state, DM_ACTOR.id, { sectionId: 'command-center' });
		expect(view.breadcrumbs).toHaveLength(1);
		expect(view.breadcrumbs[0]).toMatchObject({ title: 'Command Center', current: true });
	});

	it('omits the DM-only Scenes ancestor for a player viewing a player-visible Scene', () => {
		const { state, playerSceneId } = baseVault();
		// A player cannot reach the DM-only Scenes authoring section, so its crumb is
		// absent; Home stays, and the visible Scene itself is the current crumb.
		const view = resolveNavigationView(state, PLAYER_ACTOR.id, sceneLocation(playerSceneId));
		expect(view.section).toBeNull();
		expect(view.breadcrumbs.map((c) => c.title)).toEqual(['Command Center', 'Tavern']);
		expect(view.breadcrumbs.map((c) => c.current)).toEqual([false, true]);
	});

	it('drops the entity crumb when the Scene is hidden from the actor (fail closed)', () => {
		const { state, dmSceneId } = baseVault();
		const view = resolveNavigationView(state, PLAYER_ACTOR.id, sceneLocation(dmSceneId));
		// The dm-only Scene name never appears for the player.
		expect(JSON.stringify(view)).not.toContain('Secret Lair');
		expect(view.breadcrumbs.map((c) => c.title)).toEqual(['Command Center']);
	});
});

describe('NAV-003 local section navigation', () => {
	it('lists actor-visible Scenes as local items, marking the open one current', () => {
		const { state, playerSceneId } = baseVault();
		const dmView = resolveNavigationView(state, DM_ACTOR.id, sceneLocation(playerSceneId));
		// The Command Center home is itself a dm-only Scene, so it appears in the DM's
		// local section nav alongside the authored Scenes (name-sorted).
		expect(dmView.localItems.map((i) => i.title)).toEqual([
			'Command Center',
			'Secret Lair',
			'Tavern',
		]);
		expect(dmView.localItems.find((i) => i.id === playerSceneId)?.current).toBe(true);
	});

	it('has no local section nav for sections the actor cannot reach', () => {
		const { state } = baseVault();
		// The player cannot reach the DM-only Scenes section at all.
		const view = resolveNavigationView(state, PLAYER_ACTOR.id, { sectionId: 'scenes' });
		expect(view.section).toBeNull();
		expect(view.localItems).toEqual([]);
	});
});

describe('NAV-003 contextual backlinks and related links', () => {
	it('reports the Command Center home Scene as a backlink', () => {
		const { state, homeSceneId } = baseVault();
		const view = resolveNavigationView(state, DM_ACTOR.id, sceneLocation(homeSceneId));
		expect(view.backlinks).toContainEqual(
			expect.objectContaining({ relation: 'Command Center home Scene', route: '/' }),
		);
	});

	it('links a template to its instances (backlink) and an instance to its template (related)', () => {
		const { env, state: base } = baseVault();
		// Save a template from the player-visible Scene, then instantiate it.
		const tmpl = accept(
			dispatch(base, env, {
				type: 'scene.save-template',
				actorId: DM_ACTOR.id,
				payload: { sourceSceneId: baseVaultPlayerScene(base), templateName: 'Ambush Template' },
			}),
		);
		let state = tmpl.nextState;
		const templateSceneId = (tmpl.events.find((e) => e.kind === 'scene.template-saved') as {
			templateSceneId: string;
		}).templateSceneId;

		const inst = accept(
			dispatch(state, env, {
				type: 'scene.instantiate-template',
				actorId: DM_ACTOR.id,
				payload: { templateSceneId, newSceneName: 'Ambush at Dawn' },
			}),
		);
		state = inst.nextState;
		const instanceId = (inst.events.find((e) => e.kind === 'scene.template-instantiated') as {
			newSceneId: string;
		}).newSceneId;

		// From the template: a backlink to the instance created from it.
		const templateView = resolveNavigationView(state, DM_ACTOR.id, sceneLocation(templateSceneId));
		expect(templateView.backlinks).toContainEqual(
			expect.objectContaining({
				relation: 'Instantiated from this template',
				route: `/scene/${instanceId}/`,
			}),
		);

		// From the instance: a related link back to the template it came from.
		const instanceView = resolveNavigationView(state, DM_ACTOR.id, sceneLocation(instanceId));
		expect(instanceView.related).toContainEqual(
			expect.objectContaining({
				relation: 'Created from template',
				route: `/scene/${templateSceneId}/`,
			}),
		);
	});

	it('shows player-view projection backlinks to the DM but never to the player', () => {
		const { env, state: base, playerSceneId } = baseVault();
		const projected = accept(
			dispatch(base, env, {
				type: 'session.project-player-view',
				actorId: DM_ACTOR.id,
				payload: {
					playerActorIds: [PLAYER_ACTOR.id],
					connectionState: 'connected',
					target: {
						kind: 'scene',
						sceneId: playerSceneId,
						sectionIds: null,
						widgetInstanceIds: null,
						displayState: null,
						mapRegion: null,
					},
				},
			}),
		).nextState;

		const dmView = resolveNavigationView(projected, DM_ACTOR.id, sceneLocation(playerSceneId));
		expect(dmView.backlinks.some((b) => b.relation.startsWith('Projected to'))).toBe(true);

		// The player sees the Scene itself but no who-is-projected session detail.
		const playerView = resolveNavigationView(projected, PLAYER_ACTOR.id, sceneLocation(playerSceneId));
		expect(playerView.backlinks.some((b) => b.relation.startsWith('Projected to'))).toBe(false);
	});
});

describe('NAV-003 reachable destinations (pinned/recent filtering)', () => {
	it('lists reachable sections and visible Scenes for the DM', () => {
		const { state, playerSceneId, dmSceneId } = baseVault();
		const routes = listReachableDestinations(state, DM_ACTOR.id).map((d) => d.route);
		expect(routes).toContain('/');
		expect(routes).toContain('/scenes/');
		expect(routes).toContain('/settings/');
		expect(routes).toContain(`/scene/${playerSceneId}/`);
		expect(routes).toContain(`/scene/${dmSceneId}/`);
	});

	it('omits DM-only sections and hidden Scenes for a player (fail closed)', () => {
		const { state, playerSceneId, dmSceneId } = baseVault();
		const destinations = listReachableDestinations(state, PLAYER_ACTOR.id);
		const routes = destinations.map((d) => d.route);
		expect(routes).toContain('/');
		expect(routes).toContain('/settings/');
		expect(routes).not.toContain('/scenes/');
		expect(routes).toContain(`/scene/${playerSceneId}/`);
		expect(routes).not.toContain(`/scene/${dmSceneId}/`);
		expect(JSON.stringify(destinations)).not.toContain('Secret Lair');
	});

	it('fails closed for an unknown actor', () => {
		const { state } = baseVault();
		const view = resolveNavigationView(state, 'nobody', { sectionId: 'command-center' });
		expect(view.section).toBeNull();
		expect(view.breadcrumbs).toEqual([]);
		expect(listReachableDestinations(state, 'nobody')).toEqual([]);
	});
});

/** Resolve the player-visible Scene id from the base vault for template tests. */
function baseVaultPlayerScene(state: CoreStateSlice): string {
	const scene = Object.values(state.scenes.scenes).find((s) => s.name === 'Tavern');
	if (!scene) throw new Error('expected the Tavern scene to exist');
	return scene.id;
}
