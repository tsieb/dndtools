import { describe, expect, it } from 'vitest';
import {
	createDemoMapState,
	dispatchCommand,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type MapState,
} from '../src';
import { DM_ACTOR, PLAYER_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';

/**
 * MAP-016 AC1 — projection is BLOCKED in the CORE (not merely surfaced as a DM report) while the
 * active map has a blocking visibility inconsistency: a player-visible route that references a hidden
 * POI would leak the hidden POI's position or draw a path to nothing. GUI hiding is not authoritative,
 * so `session.project-active-map` must run the pre-projection consistency audit and reject on a
 * blocking error. Non-blocking warnings (e.g. a player-visible POI on a hidden layer) do NOT block.
 */

const DEMO_MAP_ID = 'map-western-reaches';

function accepted(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') throw new Error(`expected accepted: ${result.rejection.message}`);
	return result;
}

function cmd(type: CoreCommand['type'], payload: unknown, actorId = DM_ACTOR.id): CoreCommand {
	return { type, actorId, payload } as CoreCommand;
}

/** Run the full DM flow (home → select active map → active workflow → project) and return the result. */
function projectActiveMap(maps: MapState): { result: CommandResult; env: CoreEnvironment } {
	const env = makeEnvironment();
	const base: CoreStateSlice = { ...buildInitialState(DM_ACTOR, PLAYER_ACTOR), maps };
	const home = accepted(dispatchCommand(base, env, cmd('command-center.ensure-home', {}))).nextState;
	const homeSceneId = home.commandCenter.homeSceneId!;
	const selected = accepted(
		dispatchCommand(home, env, cmd('session.set-active-map', { mapId: DEMO_MAP_ID, regionId: 'region-north-road' })),
	).nextState;
	const active = accepted(
		dispatchCommand(selected, env, cmd('session.set-workflow', { workflow: 'active', activeSceneId: homeSceneId })),
	).nextState;
	const result = dispatchCommand(
		active,
		env,
		cmd('session.project-active-map', { playerActorIds: [PLAYER_ACTOR.id], connectionState: 'connected' }),
	);
	return { result, env };
}

/** Demo map state with `poi-harbor-town` (referenced by the player-visible route) overridden. */
function demoMapsWithPoiVisibility(poiId: string, visibility: 'dm-only' | 'player-visible'): MapState {
	const maps = createDemoMapState();
	const map = maps.maps[DEMO_MAP_ID]!;
	return {
		...maps,
		maps: {
			...maps.maps,
			[DEMO_MAP_ID]: {
				...map,
				pois: map.pois.map((poi) => (poi.id === poiId ? { ...poi, visibility } : poi)),
			},
		},
	};
}

describe('MAP-016 AC1 — projection blocked on a visible route referencing a hidden POI', () => {
	it('allows projecting the consistent demo map (control)', () => {
		const { result } = projectActiveMap(createDemoMapState());
		expect(result.status).toBe('accepted');
	});

	it('BLOCKS projection when a player-visible route references a now-hidden POI', () => {
		// `route-north-road` is player-visible and references `poi-harbor-town`; hide that POI.
		const { result } = projectActiveMap(demoMapsWithPoiVisibility('poi-harbor-town', 'dm-only'));
		expect(result.status).toBe('rejected');
		if (result.status !== 'rejected') throw new Error('expected rejected');
		expect(result.rejection.code).toBe('invalid-state');
		expect(result.rejection.issues?.some((issue) => issue.path.startsWith('route:'))).toBe(true);
		// No projection was recorded.
		expect(Object.keys(result.nextState.session.activeMapProjections)).toHaveLength(0);
	});

	it('does NOT block on a non-blocking warning (player-visible POI on a hidden layer)', () => {
		// `poi-smugglers-cache` sits on the dm-only `layer-hidden-camps`; making the POI itself
		// player-visible yields a `visible-annotation-on-hidden-layer` WARNING, never an error. It is
		// not referenced by any visible route, so projection still proceeds.
		const { result } = projectActiveMap(demoMapsWithPoiVisibility('poi-smugglers-cache', 'player-visible'));
		expect(result.status).toBe('accepted');
	});
});
