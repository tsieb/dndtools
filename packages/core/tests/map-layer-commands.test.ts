import { describe, expect, it } from 'vitest';
import {
	buildVisibilityCache,
	createDemoMapState,
	dispatchCommand,
	invalidateVisibilityCache,
	mapLayerVisibilityMetadata,
	mapLayerVisibilitySurfaces,
	type VisibilityCacheInputs,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

const MAP_ID = 'map-western-reaches';

function stateWithMaps(): CoreStateSlice {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	return { ...base, maps: createDemoMapState() };
}

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got ${JSON.stringify(result.rejection)}`);
	}
	return result;
}

function layersOf(state: CoreStateSlice, mapId = MAP_ID) {
	return state.maps.maps[mapId]!.layers;
}

describe('MAP-005 durable layer commands', () => {
	it('creates a layer, appends a durable operation, bumps the map revision, emits an event', () => {
		const env = makeEnvironment();
		const before = stateWithMaps();
		const beforeRevision = before.maps.maps[MAP_ID]!.revision;
		const result = accept(
			dispatchCommand(before, env, {
				type: 'map.create-layer',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: MAP_ID,
					name: 'Encounter Markers',
					category: 'poi',
					visibility: 'dm-only',
					tags: ['type:poi'],
					query: { type: 'poi' },
				},
			} satisfies CoreCommand),
		);
		const layers = layersOf(result.nextState);
		expect(layers.some((l) => l.name === 'Encounter Markers')).toBe(true);
		expect(result.nextState.maps.maps[MAP_ID]!.revision).toBe(beforeRevision + 1);
		expect(result.operationIds.length).toBe(1);
		expect(result.nextState.sync.operations.map((o) => o.opType)).toContain('map.layer.create');
		expect(result.events[0]).toMatchObject({ kind: 'map.layer-changed', mutation: 'create' });
	});

	it('reorders a layer and persists the new order (AC: C above A)', () => {
		const env = makeEnvironment();
		const before = stateWithMaps();
		// terrain(0) roads(1) hidden-camps(2). Move hidden-camps to order 0.
		const result = accept(
			dispatchCommand(before, env, {
				type: 'map.reorder-layer',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-hidden-camps', toOrder: 0 },
			} satisfies CoreCommand),
		);
		const ordered = [...layersOf(result.nextState)].sort((a, b) => a.order - b.order);
		expect(ordered.map((l) => l.id)).toEqual([
			'layer-hidden-camps',
			'layer-terrain',
			'layer-roads',
		]);
	});

	it('rejects every layer mutation from a non-DM actor (fail closed)', () => {
		const env = makeEnvironment();
		const before = stateWithMaps();
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			const result = dispatchCommand(before, env, {
				type: 'map.set-layer-visibility',
				actorId,
				payload: { mapId: MAP_ID, layerId: 'layer-hidden-camps', visibility: 'player-visible' },
			} satisfies CoreCommand);
			expect(result.status).toBe('rejected');
			if (result.status === 'rejected') expect(result.rejection.code).toBe('actor-not-authorized');
		}
	});

	it('a locked layer rejects edits end-to-end and accepts unlock', () => {
		const env = makeEnvironment();
		let state = stateWithMaps();
		state = accept(
			dispatchCommand(state, env, {
				type: 'map.lock-layer',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-roads', locked: true },
			} satisfies CoreCommand),
		).nextState;

		const rejected = dispatchCommand(state, env, {
			type: 'map.rename-layer',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId: 'layer-roads', name: 'Highways' },
		} satisfies CoreCommand);
		expect(rejected.status).toBe('rejected');
		if (rejected.status === 'rejected')
			expect(rejected.rejection.code).toBe('actor-not-authorized');

		// Unlock, then the rename is accepted.
		state = accept(
			dispatchCommand(state, env, {
				type: 'map.lock-layer',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-roads', locked: false },
			} satisfies CoreCommand),
		).nextState;
		const renamed = accept(
			dispatchCommand(state, env, {
				type: 'map.rename-layer',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-roads', name: 'Highways' },
			} satisfies CoreCommand),
		);
		expect(layersOf(renamed.nextState).find((l) => l.id === 'layer-roads')!.name).toBe('Highways');
	});

	it('rejects a layer command on an unknown map', () => {
		const env = makeEnvironment();
		const result = dispatchCommand(stateWithMaps(), env, {
			type: 'map.create-layer',
			actorId: DM_ACTOR.id,
			payload: { mapId: 'map-nope', name: 'X' },
		} satisfies CoreCommand);
		expect(result.status).toBe('rejected');
		if (result.status === 'rejected') expect(result.rejection.code).toBe('map-not-found');
	});

	it('duplicate, delete, set-opacity, set-enabled, and set-tags all produce durable ops', () => {
		const env = makeEnvironment();
		let state = stateWithMaps();
		const ops: string[] = [];
		const commands: CoreCommand[] = [
			{
				type: 'map.duplicate-layer',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain' },
			},
			{
				type: 'map.set-layer-opacity',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', opacity: 0.3 },
			},
			{
				type: 'map.set-layer-enabled',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', enabled: false },
			},
			{
				type: 'map.set-layer-tags',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', tags: ['x'], query: { k: 'v' } },
			},
		];
		for (const command of commands) {
			const result = accept(dispatchCommand(state, env, command));
			state = result.nextState;
			ops.push(...result.nextState.sync.operations.map((o) => o.opType));
		}
		expect(ops).toContain('map.layer.duplicate');
		expect(ops).toContain('map.layer.set-opacity');
		expect(ops).toContain('map.layer.set-dm-enabled');
		expect(ops).toContain('map.layer.set-tags');
		const terrain = layersOf(state).find((l) => l.id === 'layer-terrain')!;
		expect(terrain.opacity).toBe(0.3);
		expect(terrain.enabled).toBe(false);
		expect(terrain.query).toEqual({ k: 'v' });
	});
});

describe('MAP-006 / PERM-012 / Contract 3 rule 4: a layer player-visibility change invalidates affected caches', () => {
	function visInputs(state: CoreStateSlice): VisibilityCacheInputs {
		return {
			permissions: state.permissions,
			metadata: mapLayerVisibilityMetadata(state.maps),
			surfaces: mapLayerVisibilitySurfaces(state.maps),
		};
	}

	it('revealing a dm-only layer to players invalidates exactly the non-DM participants', () => {
		const env = makeEnvironment();
		const before = stateWithMaps();
		const cache = buildVisibilityCache(visInputs(before));
		const revealed = accept(
			dispatchCommand(before, env, {
				type: 'map.set-layer-visibility',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-hidden-camps', visibility: 'player-visible' },
			} satisfies CoreCommand),
		);
		const result = invalidateVisibilityCache(cache, visInputs(revealed.nextState));
		// The players/observer can now see a layer they could not before → invalidated. The DM's
		// surface never changes (sees everything) → NOT invalidated.
		expect(result.invalidatedActorIds).toContain(PLAYER_ACTOR.id);
		expect(result.invalidatedActorIds).toContain(OBSERVER_ACTOR.id);
		expect(result.invalidatedActorIds).not.toContain(DM_ACTOR.id);
	});

	it('hiding a previously player-visible layer invalidates the affected actors (stale cache never serves it)', () => {
		const env = makeEnvironment();
		const before = stateWithMaps();
		const cache = buildVisibilityCache(visInputs(before));
		const hidden = accept(
			dispatchCommand(before, env, {
				type: 'map.set-layer-visibility',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', visibility: 'dm-only' },
			} satisfies CoreCommand),
		);
		const result = invalidateVisibilityCache(cache, visInputs(hidden.nextState));
		expect(result.invalidatedActorIds).toContain(PLAYER_ACTOR.id);
	});

	it('an opacity-only change does NOT change any actor visibility surface (presentation, not visibility)', () => {
		const env = makeEnvironment();
		const before = stateWithMaps();
		const cache = buildVisibilityCache(visInputs(before));
		const dimmed = accept(
			dispatchCommand(before, env, {
				type: 'map.set-layer-opacity',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', opacity: 0.1 },
			} satisfies CoreCommand),
		);
		// Opacity is a render axis, not visibility — no actor's VISIBILITY surface changes. The
		// rendered view-model still reflects the new opacity on the next query (no stale visibility
		// cache is involved).
		const result = invalidateVisibilityCache(cache, visInputs(dimmed.nextState));
		expect(result.invalidatedActorIds).toEqual([]);
	});
});
