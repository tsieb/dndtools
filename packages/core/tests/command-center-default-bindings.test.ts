import { describe, expect, it } from 'vitest';
import {
	WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION,
	buildDefaultCommandCenterScene,
	createDemoMapState,
	dispatchCommand,
	entityBindingKey,
	getMapViewForActor,
	getSceneForActor,
	type CommandResult,
	type CoreStateSlice,
	type EntityBindingRecord,
	type WidgetDataEnvironment,
} from '../src';
import { DM_ACTOR, buildInitialState, makeEnvironment } from '../src/testing/fixtures';

/**
 * RC-ENG-8.2 — the default Command Center screen never opens on an error. Every widget the system
 * template lays out resolves to `available` for the DM against a data environment built from the
 * vault's maps (so a binding to a map the vault does not hold reads `missing`), and the Map tile is
 * bound to a real map whenever the vault has one. With no maps, the only non-available state is the
 * Map tile's intentional `unbound` ("No map linked") empty state.
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function withMaps(state: CoreStateSlice): CoreStateSlice {
	return { ...state, maps: createDemoMapState() };
}

function ensureHome(state: CoreStateSlice, env = makeEnvironment()) {
	return accept(
		dispatchCommand(state, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		}),
	);
}

function mapsDataEnvironment(state: CoreStateSlice): WidgetDataEnvironment {
	const entities: Record<string, EntityBindingRecord> = {};
	for (const map of Object.values(state.maps.maps)) {
		entities[entityBindingKey('map', map.id)] = {
			entityType: 'map',
			entityId: map.id,
			visibility: map.visibility,
		};
	}
	return {
		entities,
		knownEntityKeys: Object.keys(entities),
		schemaVersion: WIDGET_DATA_ENVIRONMENT_SCHEMA_VERSION,
	};
}

/** Widget type → payload kind for every widget on the home screen, as the DM receives it. */
function homeWidgetStates(state: CoreStateSlice): Record<string, string> {
	const homeId = state.commandCenter.homeSceneId!;
	const summary = getSceneForActor(state.scenes, state.permissions, DM_ACTOR.id, homeId, {
		widgetPackages: state.widgets,
		dataEnvironment: mapsDataEnvironment(state),
	});
	if ('kind' in summary) throw new Error(`home denied: ${summary.reason}`);
	return Object.fromEntries(
		summary.widgets.map((payload) => [
			'widget' in payload ? payload.widget.type : payload.type,
			payload.kind,
		]),
	);
}

function homeMapTile(state: CoreStateSlice) {
	return state.scenes.scenes[state.commandCenter.homeSceneId!]?.widgets.find(
		(widget) => widget.type === 'map',
	);
}

describe('RC-ENG-8.2 default Command Center bindings', () => {
	it('binds the Map tile to a real map and resolves every default widget to available', () => {
		const { nextState } = ensureHome(withMaps(buildInitialState(DM_ACTOR)));

		const states = homeWidgetStates(nextState);
		expect(Object.keys(states).length).toBeGreaterThan(0);
		expect(Object.entries(states).filter(([, kind]) => kind !== 'available')).toEqual([]);

		const mapId = homeMapTile(nextState)?.binding?.source.entityId ?? '';
		// A top-level map, first by name: the DM-only outpost is embedded in the Western Reaches.
		expect(mapId).toBe('map-ruined-keep');
		expect(
			getMapViewForActor(nextState.maps, nextState.permissions, DM_ACTOR.id, mapId).kind,
		).toBe('available');
	});

	it("prefers the session's active map", () => {
		const base = withMaps(buildInitialState(DM_ACTOR));
		const state: CoreStateSlice = {
			...base,
			session: {
				...base.session,
				activeMap: {
					mapId: 'map-western-reaches',
					regionId: null,
					sceneId: 'scene-elsewhere',
					widgetInstanceId: 'widget-elsewhere',
					updatedBy: DM_ACTOR.id,
					updatedAt: '2026-01-01T00:00:00.000Z',
				} as NonNullable<CoreStateSlice['session']['activeMap']>,
			},
		};

		const { nextState } = ensureHome(state);

		expect(homeMapTile(nextState)?.binding?.source.entityId).toBe('map-western-reaches');
	});

	it('leaves the Map tile in its intentional empty state in a vault with no maps', () => {
		const { nextState } = ensureHome(buildInitialState(DM_ACTOR));

		expect(homeMapTile(nextState)?.binding).toBeNull();
		expect(
			Object.entries(homeWidgetStates(nextState)).filter(([, kind]) => kind !== 'available'),
		).toEqual([['map', 'unbound']]);
	});

	it('repairs an unbound Map tile on an existing home once, then stays idempotent', () => {
		const env = makeEnvironment();
		const base = withMaps(buildInitialState(DM_ACTOR));
		const legacyHome = buildDefaultCommandCenterScene(env, DM_ACTOR.id);
		const legacy: CoreStateSlice = {
			...base,
			scenes: { ...base.scenes, scenes: { [legacyHome.id]: legacyHome } },
			commandCenter: { ...base.commandCenter, homeSceneId: legacyHome.id },
		};
		expect(homeMapTile(legacy)?.binding).toBeNull();

		const repaired = ensureHome(legacy, env);
		expect(repaired.operationIds).toHaveLength(1);
		expect(repaired.nextState.sync.operations.at(-1)?.opType).toBe(
			'command-center.bind-default-map',
		);
		const home = repaired.nextState.scenes.scenes[legacyHome.id]!;
		expect(home.ownership.revision).toBe(legacyHome.ownership.revision + 1);
		expect(homeMapTile(repaired.nextState)?.binding?.source.entityId).toBe('map-ruined-keep');
		expect(
			Object.entries(homeWidgetStates(repaired.nextState)).filter(([, kind]) => kind !== 'available'),
		).toEqual([]);

		const again = ensureHome(repaired.nextState, env);
		expect(again.operationIds).toHaveLength(0);
		expect(again.nextState).toBe(repaired.nextState);
	});
});
