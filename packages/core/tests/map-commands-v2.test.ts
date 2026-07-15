import { describe, expect, it } from 'vitest';
import {
	MAX_FEATURE_BATCH,
	buildMapInverse,
	createDemoMapState,
	dispatchCommand,
	getGenerator,
	getMapViewForActor,
	queryMapLayers,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type MapFeature,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * MAP-021 — the generator-fleet ↔ editor bridge.
 *
 * Every command here asserts the same four things, because they are the four ways a map command has
 * historically gone wrong in this repo:
 *   (a) the durable op is appended, with the right opType/value/before+after revisions;
 *   (b) a non-DM actor is REJECTED;
 *   (c) a player's actor-filtered map view does NOT contain the dm-only artifact (a visibility leak is
 *       a release blocker);
 *   (d) a LOCKED layer rejects the mutation fail-closed.
 */

const MAP_ID = 'map-western-reaches';
const KEEP_ID = 'map-ruined-keep';
const OUTPOST_ID = 'map-hidden-outpost';

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

function reject(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function run(state: CoreStateSlice, command: CoreCommand): CommandResult {
	return dispatchCommand(state, makeEnvironment(), command);
}

function mapOf(state: CoreStateSlice, mapId = MAP_ID) {
	return state.maps.maps[mapId]!;
}

function layer(state: CoreStateSlice, layerId: string, mapId = MAP_ID) {
	return mapOf(state, mapId).layers.find((l) => l.id === layerId)!;
}

function lastOp(state: CoreStateSlice) {
	return state.sync.operations.at(-1)!;
}

/** Lock a layer so the fail-closed lock assertion runs against real durable state. */
function withLockedLayer(state: CoreStateSlice, layerId: string, mapId = MAP_ID): CoreStateSlice {
	return accept(
		run(state, {
			type: 'map.lock-layer',
			actorId: DM_ACTOR.id,
			payload: { mapId, layerId, locked: true },
		}),
	).nextState;
}

/** The player's actor-filtered view + the layer query, stringified — the no-leak probe. */
function playerSurface(state: CoreStateSlice, mapId = MAP_ID): string {
	const view = getMapViewForActor(state.maps, state.permissions, PLAYER_ACTOR.id, mapId);
	const layers = queryMapLayers(state.maps, state.permissions, PLAYER_ACTOR.id, { mapId });
	return JSON.stringify({ view, layers });
}

const A: MapFeature = { id: 'f-a', kind: 'stroke', points: [{ x: 0.2, y: 0.3 }], style: 'ink:black' };
const B: MapFeature = { id: 'f-b', kind: 'marker', points: [{ x: 0.4, y: 0.5 }], style: 'ink:red' };
const C: MapFeature = {
	id: 'f-c',
	kind: 'polygon',
	points: [
		{ x: 0.1, y: 0.1 },
		{ x: 0.2, y: 0.1 },
		{ x: 0.2, y: 0.2 },
	],
	style: 'terrain:forest',
	props: { role: 'grove', elevation: 12 },
};

/** Seed a layer with `count` features, as a generator would. */
function bulkFeatures(count: number, prefix = 'bulk'): MapFeature[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `${prefix}-${index}`,
		kind: 'stroke' as const,
		points: [{ x: (index % 100) / 100, y: Math.floor(index / 100) / 100 }],
		style: 'terrain:grass',
	}));
}

// =================================================================================================
// A. map.add-features / map.update-features / map.remove-features
// =================================================================================================

describe('MAP-021 map.add-features — the durable op carries ONLY the delta', () => {
	it('appends ONE op whose value is the added features and nothing else, with before/after revisions', () => {
		const before = stateWithMaps();
		const opsBefore = before.sync.operations.length;
		const result = accept(
			run(before, {
				type: 'map.add-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [A, B] },
			}),
		);

		expect(layer(result.nextState, 'layer-terrain').content).toEqual([A, B]);
		expect(result.nextState.sync.operations.length).toBe(opsBefore + 1);

		const op = lastOp(result.nextState);
		expect(op.opType).toBe('map.layer.add-features');
		expect(op.entityId).toBe(MAP_ID);
		expect(op.value).toEqual({
			mutation: 'add-features',
			layerId: 'layer-terrain',
			features: [A, B],
		});
		expect(op.beforeRevision).toBe(mapOf(before).revision);
		expect(op.afterRevision).toBe(mapOf(before).revision + 1);
		// The LAYER revision bumps too — the per-layer conflict anchor.
		expect(layer(result.nextState, 'layer-terrain').revision).toBe(
			layer(before, 'layer-terrain').revision + 1,
		);
	});

	it('THE POINT OF THE COMMAND: the op size is independent of how much the layer already holds', () => {
		let state = stateWithMaps();
		// A generated layer: 2,000 features already painted.
		state = accept(
			run(state, {
				type: 'map.add-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: bulkFeatures(2000) },
			}),
		).nextState;
		expect(layer(state, 'layer-terrain').content.length).toBe(2000);

		// One more brush stroke on top of it.
		const stroke = accept(
			run(state, {
				type: 'map.add-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [A] },
			}),
		);
		const op = lastOp(stroke.nextState);
		const value = op.value as { features: MapFeature[] };

		// The op carries exactly ONE feature — not the 2,001 the layer now holds.
		expect(value.features).toEqual([A]);
		expect(value.features.length).toBe(1);
		expect(layer(stroke.nextState, 'layer-terrain').content.length).toBe(2001);
		// And no pre-existing feature rides along: the op's serialized size stays tiny. (`map.edit-layer`
		// would have written 4,002 features here — the whole before array plus the whole after array.)
		const serialized = JSON.stringify(op.value);
		expect(serialized).not.toContain('bulk-');
		expect(serialized.length).toBeLessThan(300);
	});

	it('carries per-feature `props` and the new feature kinds (door/light/polygon) into durable state', () => {
		const result = accept(
			run(stateWithMaps(), {
				type: 'map.add-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [C] },
			}),
		);
		expect(layer(result.nextState, 'layer-terrain').content[0]).toEqual(C);
	});

	it('(b) rejects a non-DM actor fail-closed', () => {
		const before = stateWithMaps();
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			const result = reject(
				run(before, {
					type: 'map.add-features',
					actorId,
					payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [A] },
				}),
			);
			expect(result.rejection.code).toBe('actor-not-authorized');
			expect(result.nextState.sync.operations.length).toBe(before.sync.operations.length);
		}
	});

	it('(c) a feature painted on a DM-ONLY layer never reaches the player surface', () => {
		const secret: MapFeature = {
			id: 'f-ambush',
			kind: 'marker',
			points: [{ x: 0.7, y: 0.4 }],
			style: 'ambush:cache',
		};
		const result = accept(
			run(stateWithMaps(), {
				type: 'map.add-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-hidden-camps', features: [secret] },
			}),
		);
		// The DM sees it.
		const dmQuery = queryMapLayers(
			result.nextState.maps,
			result.nextState.permissions,
			DM_ACTOR.id,
			{ mapId: MAP_ID },
		);
		expect(dmQuery.layers.find((l) => l.layerId === 'layer-hidden-camps')!.content).toEqual([
			secret,
		]);
		// The player sees no layer, no feature, no style token — no leak.
		const surface = playerSurface(result.nextState);
		expect(surface).not.toContain('f-ambush');
		expect(surface).not.toContain('ambush:cache');
		expect(surface).not.toContain('layer-hidden-camps');
	});

	it('(d) rejects a LOCKED layer fail-closed', () => {
		const state = withLockedLayer(stateWithMaps(), 'layer-terrain');
		const opsBefore = state.sync.operations.length;
		const result = reject(
			run(state, {
				type: 'map.add-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [A] },
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
		expect(result.nextState.sync.operations.length).toBe(opsBefore);
	});

	it('rejects a duplicate feature id rather than silently overwriting existing content', () => {
		let state = stateWithMaps();
		state = accept(
			run(state, {
				type: 'map.add-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [A] },
			}),
		).nextState;
		const result = reject(
			run(state, {
				type: 'map.add-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [A] },
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
	});

	it('caps the batch size fail-closed (never truncates)', () => {
		const before = stateWithMaps();
		const result = reject(
			run(before, {
				type: 'map.add-features',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: MAP_ID,
					layerId: 'layer-terrain',
					features: bulkFeatures(MAX_FEATURE_BATCH + 1),
				},
			}),
		);
		expect(result.rejection.code).toBe('payload-too-large');
		expect(layer(result.nextState, 'layer-terrain').content).toEqual([]);
		expect(result.nextState.sync.operations.length).toBe(before.sync.operations.length);
	});
});

describe('MAP-021 map.update-features', () => {
	function seeded(): CoreStateSlice {
		return accept(
			run(stateWithMaps(), {
				type: 'map.add-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [A, B] },
			}),
		).nextState;
	}

	const MOVED_A: MapFeature = { ...A, points: [{ x: 0.9, y: 0.9 }] };

	it('(a) replaces by id, keeps array position, and appends ONE delta-only op', () => {
		const before = seeded();
		const result = accept(
			run(before, {
				type: 'map.update-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [MOVED_A] },
			}),
		);
		expect(layer(result.nextState, 'layer-terrain').content).toEqual([MOVED_A, B]);

		const op = lastOp(result.nextState);
		expect(op.opType).toBe('map.layer.update-features');
		expect(op.value).toEqual({
			mutation: 'update-features',
			layerId: 'layer-terrain',
			features: [MOVED_A],
		});
		expect(JSON.stringify(op.value)).not.toContain('f-b');
		expect(op.beforeRevision).toBe(mapOf(before).revision);
		expect(op.afterRevision).toBe(mapOf(before).revision + 1);
	});

	it('rejects an UNKNOWN feature id rather than treating the update as an add', () => {
		const result = reject(
			run(seeded(), {
				type: 'map.update-features',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: MAP_ID,
					layerId: 'layer-terrain',
					features: [{ ...A, id: 'f-ghost' }],
				},
			}),
		);
		expect(result.rejection.code).toBe('invalid-state');
	});

	it('(b) rejects a non-DM actor', () => {
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			expect(
				reject(
					run(seeded(), {
						type: 'map.update-features',
						actorId,
						payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [MOVED_A] },
					}),
				).rejection.code,
			).toBe('actor-not-authorized');
		}
	});

	it('(c) an update on a DM-only layer never reaches the player surface', () => {
		let state = accept(
			run(stateWithMaps(), {
				type: 'map.add-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-hidden-camps', features: [A] },
			}),
		).nextState;
		state = accept(
			run(state, {
				type: 'map.update-features',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: MAP_ID,
					layerId: 'layer-hidden-camps',
					features: [{ ...A, style: 'secret:tunnel' }],
				},
			}),
		).nextState;
		expect(playerSurface(state)).not.toContain('secret:tunnel');
	});

	it('(d) rejects a LOCKED layer fail-closed', () => {
		const state = withLockedLayer(seeded(), 'layer-terrain');
		expect(
			reject(
				run(state, {
					type: 'map.update-features',
					actorId: DM_ACTOR.id,
					payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [MOVED_A] },
				}),
			).rejection.code,
		).toBe('actor-not-authorized');
	});
});

describe('MAP-021 map.remove-features', () => {
	function seeded(): CoreStateSlice {
		return accept(
			run(stateWithMaps(), {
				type: 'map.add-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [A, B, C] },
			}),
		).nextState;
	}

	it('(a) removes by id and the op carries the removed features + their indices (its own inverse)', () => {
		const before = seeded();
		const result = accept(
			run(before, {
				type: 'map.remove-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', featureIds: ['f-b'] },
			}),
		);
		expect(layer(result.nextState, 'layer-terrain').content).toEqual([A, C]);

		const op = lastOp(result.nextState);
		expect(op.opType).toBe('map.layer.remove-features');
		expect(op.value).toEqual({
			mutation: 'remove-features',
			layerId: 'layer-terrain',
			featureIds: ['f-b'],
			removed: [B],
			// index 1 — where it sat. Re-adding at that index restores the exact array.
			removedIndices: [1],
		});
		// The features that SURVIVED are not in the op.
		expect(JSON.stringify(op.value)).not.toContain('f-a');
		expect(op.beforeRevision).toBe(mapOf(before).revision);
		expect(op.afterRevision).toBe(mapOf(before).revision + 1);
	});

	it('rejects an unknown feature id fail-closed (never a silent no-op)', () => {
		expect(
			reject(
				run(seeded(), {
					type: 'map.remove-features',
					actorId: DM_ACTOR.id,
					payload: { mapId: MAP_ID, layerId: 'layer-terrain', featureIds: ['f-ghost'] },
				}),
			).rejection.code,
		).toBe('invalid-state');
	});

	it('(b) rejects a non-DM actor', () => {
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			expect(
				reject(
					run(seeded(), {
						type: 'map.remove-features',
						actorId,
						payload: { mapId: MAP_ID, layerId: 'layer-terrain', featureIds: ['f-b'] },
					}),
				).rejection.code,
			).toBe('actor-not-authorized');
		}
	});

	it('(c) a removal on a DM-only layer leaks nothing to the player surface', () => {
		let state = accept(
			run(stateWithMaps(), {
				type: 'map.add-features',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: MAP_ID,
					layerId: 'layer-hidden-camps',
					features: [{ ...A, style: 'secret:cache' }],
				},
			}),
		).nextState;
		state = accept(
			run(state, {
				type: 'map.remove-features',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-hidden-camps', featureIds: ['f-a'] },
			}),
		).nextState;
		expect(playerSurface(state)).not.toContain('secret:cache');
		expect(playerSurface(state)).not.toContain('layer-hidden-camps');
	});

	it('(d) rejects a LOCKED layer fail-closed', () => {
		const state = withLockedLayer(seeded(), 'layer-terrain');
		expect(
			reject(
				run(state, {
					type: 'map.remove-features',
					actorId: DM_ACTOR.id,
					payload: { mapId: MAP_ID, layerId: 'layer-terrain', featureIds: ['f-b'] },
				}),
			).rejection.code,
		).toBe('actor-not-authorized');
	});
});

// =================================================================================================
// B. map.generate — registry-driven, and the op carries parameters, NOT geometry
// =================================================================================================

const GENERATE: CoreCommand = {
	type: 'map.generate',
	actorId: DM_ACTOR.id,
	payload: {
		mapId: MAP_ID,
		generatorId: 'dungeon.tinykeep',
		seed: 'crypt-of-the-drowned',
		params: { roomCount: 12 },
		idPrefix: 'gen1',
		visibility: 'dm-only',
	},
};

describe('MAP-021 map.generate — registry-driven generation', () => {
	it('(a) inserts the generated layers + POIs and appends ONE op that carries the PARAMETERS, not the geometry', () => {
		const before = stateWithMaps();
		const baseLayers = mapOf(before).layers.length;
		const basePois = mapOf(before).pois.length;
		const result = accept(run(before, GENERATE));

		const generated = mapOf(result.nextState).layers.filter((l) => l.id.startsWith('gen1'));
		expect(generated.length).toBeGreaterThan(0);
		expect(mapOf(result.nextState).layers.length).toBe(baseLayers + generated.length);
		// The generator's POIs became REAL MapPoi records, filtered by the same query as any other POI.
		expect(mapOf(result.nextState).pois.length).toBeGreaterThan(basePois);
		// The output is thousands-of-features scale — this is exactly the case the delta ops exist for.
		const featureCount = generated.reduce((sum, l) => sum + l.content.length, 0);
		expect(featureCount).toBeGreaterThan(20);

		const op = lastOp(result.nextState);
		expect(op.opType).toBe('map.generate');
		expect(op.value).toMatchObject({
			generatorId: 'dungeon.tinykeep',
			generatorVersion: getGenerator('dungeon.tinykeep')!.version,
			seed: 'crypt-of-the-drowned',
			params: { roomCount: 12 },
		});
		expect(op.beforeRevision).toBe(mapOf(before).revision);
		expect(op.afterRevision).toBe(mapOf(before).revision + 1);

		// NO GEOMETRY. The op names the layers it created; it does not transport a single point.
		const value = op.value as Record<string, unknown>;
		expect(value.layers).toBeUndefined();
		expect(value.content).toBeUndefined();
		expect(value.generatedLayerIds).toEqual(generated.map((l) => l.id));
		const serialized = JSON.stringify(op.value);
		expect(serialized).not.toContain('"points"');
		// And it is dramatically smaller than the geometry it stands for.
		expect(serialized.length).toBeLessThan(
			JSON.stringify(generated.map((l) => l.content)).length / 2,
		);
	});

	it('DETERMINISM: replaying the same generate on a fresh state produces byte-identical layers', () => {
		const first = accept(run(stateWithMaps(), GENERATE));
		const second = accept(run(stateWithMaps(), GENERATE));
		const layersOf = (state: CoreStateSlice) =>
			mapOf(state).layers.filter((l) => l.id.startsWith('gen1'));
		expect(JSON.stringify(layersOf(second.nextState))).toBe(
			JSON.stringify(layersOf(first.nextState)),
		);
		expect(JSON.stringify(mapOf(second.nextState).pois)).toBe(
			JSON.stringify(mapOf(first.nextState).pois),
		);
	});

	it('REPLAY GUARD: a recorded generatorVersion that no longer matches is rejected, not silently re-rolled', () => {
		const before = stateWithMaps();
		const result = reject(
			run(before, {
				type: 'map.generate',
				actorId: DM_ACTOR.id,
				payload: { ...(GENERATE.payload as object), generatorVersion: 99 },
			}),
		);
		expect(result.rejection.code).toBe('generator-version-mismatch');
		expect(result.nextState.maps.maps[MAP_ID]!.layers.length).toBe(mapOf(before).layers.length);
		expect(result.nextState.sync.operations.length).toBe(before.sync.operations.length);
	});

	it('rejects an UNKNOWN generator id fail-closed (no map from a guessed generator)', () => {
		const result = reject(
			run(stateWithMaps(), {
				type: 'map.generate',
				actorId: DM_ACTOR.id,
				payload: { ...(GENERATE.payload as object), generatorId: 'dungeon.nope' },
			}),
		);
		expect(result.rejection.code).toBe('generator-not-found');
	});

	it('rejects a bad PARAM and names the offending knob (no partial layers persisted)', () => {
		const before = stateWithMaps();
		const result = reject(
			run(before, {
				type: 'map.generate',
				actorId: DM_ACTOR.id,
				payload: { ...(GENERATE.payload as object), params: { roomCount: 9999 } },
			}),
		);
		expect(result.rejection.code).toBe('invalid-payload');
		expect(result.rejection.message).toContain('roomCount');
		expect(result.rejection.issues?.[0]?.path).toBe('roomCount');
		expect(result.nextState.maps.maps[MAP_ID]!.layers.length).toBe(mapOf(before).layers.length);
		expect(result.nextState.sync.operations.length).toBe(before.sync.operations.length);
	});

	it('rejects a generated layer-id collision rather than clobbering an existing layer', () => {
		const once = accept(run(stateWithMaps(), GENERATE)).nextState;
		expect(reject(run(once, GENERATE)).rejection.code).toBe('invalid-state');
	});

	it('(b) rejects a non-DM actor', () => {
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			expect(
				reject(run(stateWithMaps(), { ...GENERATE, actorId })).rejection.code,
			).toBe('actor-not-authorized');
		}
	});

	it('(c) a dm-only generation is entirely absent from the player surface (layers, features and POIs)', () => {
		const state = accept(run(stateWithMaps(), GENERATE)).nextState;
		const surface = playerSurface(state);
		expect(surface).not.toContain('gen1');
		const view = getMapViewForActor(state.maps, state.permissions, PLAYER_ACTOR.id, MAP_ID);
		expect(view.kind).toBe('available');
		if (view.kind !== 'available') throw new Error('unreachable');
		expect(view.layers.some((l) => l.id.startsWith('gen1'))).toBe(false);
		expect(view.pois.some((p) => p.id.startsWith('gen1'))).toBe(false);
		// The DM does see them.
		const dmView = getMapViewForActor(state.maps, state.permissions, DM_ACTOR.id, MAP_ID);
		if (dmView.kind !== 'available') throw new Error('unreachable');
		expect(dmView.layers.some((l) => l.id.startsWith('gen1'))).toBe(true);
	});

	it('(d) a re-roll that would REPLACE a locked layer is rejected fail-closed', () => {
		const state = withLockedLayer(stateWithMaps(), 'layer-terrain');
		const result = reject(
			run(state, {
				type: 'map.generate',
				actorId: DM_ACTOR.id,
				payload: {
					...(GENERATE.payload as object),
					targetLayerIds: ['layer-terrain'],
					replace: true,
				},
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('refuses an ambiguous re-roll (target layers named without `replace`)', () => {
		expect(
			reject(
				run(stateWithMaps(), {
					type: 'map.generate',
					actorId: DM_ACTOR.id,
					payload: { ...(GENERATE.payload as object), targetLayerIds: ['layer-terrain'] },
				}),
			).rejection.code,
		).toBe('invalid-payload');
	});

	it('`replace` re-rolls in place: the target layer is gone, the generated ones are there', () => {
		const state = accept(
			run(stateWithMaps(), {
				type: 'map.generate',
				actorId: DM_ACTOR.id,
				payload: {
					...(GENERATE.payload as object),
					targetLayerIds: ['layer-terrain'],
					replace: true,
				},
			}),
		).nextState;
		expect(mapOf(state).layers.some((l) => l.id === 'layer-terrain')).toBe(false);
		expect(mapOf(state).layers.some((l) => l.id.startsWith('gen1'))).toBe(true);
		expect((lastOp(state).value as { replacedLayerIds: string[] }).replacedLayerIds).toEqual([
			'layer-terrain',
		]);
	});
});

// =================================================================================================
// C. map.derive-features — walls / doors / lights from floor geometry
// =================================================================================================

const ROOM_A: MapFeature = {
	id: 'room-a',
	kind: 'room',
	points: [
		{ x: 0.1, y: 0.1 },
		{ x: 0.35, y: 0.35 },
	],
	style: 'floor:stone',
};
const ROOM_B: MapFeature = {
	id: 'room-b',
	kind: 'room',
	points: [
		{ x: 0.6, y: 0.1 },
		{ x: 0.85, y: 0.35 },
	],
	style: 'floor:stone',
};
const CORRIDOR: MapFeature = {
	id: 'corr-1',
	kind: 'stroke',
	points: [
		{ x: 0.2, y: 0.22 },
		{ x: 0.75, y: 0.22 },
	],
	style: 'floor:corridor',
	props: { width: 0.03 },
};

function withFloors(layerId = 'layer-terrain'): CoreStateSlice {
	return accept(
		run(stateWithMaps(), {
			type: 'map.add-features',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId, features: [ROOM_A, ROOM_B, CORRIDOR] },
		}),
	).nextState;
}

const DERIVE: CoreCommand = {
	type: 'map.derive-features',
	actorId: DM_ACTOR.id,
	payload: {
		mapId: MAP_ID,
		sourceLayerIds: ['layer-terrain'],
		seed: 'derive-1',
		idPrefix: 'd1',
	},
};

describe('MAP-021 map.derive-features — VTT-exportable walls, doors and lights, for free', () => {
	it('(a) derives walls+doors+lights onto a new layer and appends ONE op carrying the INPUTS, not the geometry', () => {
		const before = withFloors();
		const result = accept(run(before, DERIVE));

		const derived = layer(result.nextState, 'd1-derived');
		expect(derived).toBeDefined();
		const kinds = new Set(derived.content.map((f) => f.kind));
		expect(kinds.has('wall')).toBe(true);
		expect(kinds.has('door')).toBe(true);
		// A wall polyline closes its ring and blocks sight — what makes line-of-sight work at all.
		const wall = derived.content.find((f) => f.kind === 'wall')!;
		expect(wall.props?.blocksSight).toBe(true);

		const op = lastOp(result.nextState);
		expect(op.opType).toBe('map.layer.derive');
		expect(op.value).toMatchObject({
			mutation: 'derive',
			layerId: 'd1-derived',
			layerCreated: true,
			sourceLayerIds: ['layer-terrain'],
			seed: 'derive-1',
		});
		expect(JSON.stringify(op.value)).not.toContain('"points"');
		expect(op.beforeRevision).toBe(mapOf(before).revision);
		expect(op.afterRevision).toBe(mapOf(before).revision + 1);
	});

	it('is DETERMINISTIC: the same floors + seed derive byte-identical features', () => {
		const first = accept(run(withFloors(), DERIVE)).nextState;
		const second = accept(run(withFloors(), DERIVE)).nextState;
		expect(JSON.stringify(layer(second, 'd1-derived').content)).toBe(
			JSON.stringify(layer(first, 'd1-derived').content),
		);
	});

	it('appends onto an EXISTING target layer when one is named', () => {
		const state = accept(
			run(withFloors(), {
				type: 'map.derive-features',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: MAP_ID,
					sourceLayerIds: ['layer-terrain'],
					targetLayerId: 'layer-roads',
					seed: 'derive-1',
					idPrefix: 'd1',
				},
			}),
		).nextState;
		expect(layer(state, 'layer-roads').content.some((f) => f.kind === 'wall')).toBe(true);
		expect(mapOf(state).layers.some((l) => l.id === 'd1-derived')).toBe(false);
	});

	it('rejects a source layer that does not exist (never a wall set with a hole in it)', () => {
		expect(
			reject(
				run(withFloors(), {
					type: 'map.derive-features',
					actorId: DM_ACTOR.id,
					payload: {
						mapId: MAP_ID,
						sourceLayerIds: ['layer-terrain', 'layer-ghost'],
						seed: 's',
						idPrefix: 'd2',
					},
				}),
			).rejection.code,
		).toBe('invalid-state');
	});

	it('rejects source layers with NO floor geometry', () => {
		expect(reject(run(stateWithMaps(), DERIVE)).rejection.code).toBe('invalid-state');
	});

	it('(b) rejects a non-DM actor', () => {
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			expect(reject(run(withFloors(), { ...DERIVE, actorId })).rejection.code).toBe(
				'actor-not-authorized',
			);
		}
	});

	it('(c) a dm-only derived layer is absent from the player surface', () => {
		const state = accept(run(withFloors(), DERIVE)).nextState;
		expect(playerSurface(state)).not.toContain('d1-derived');
	});

	it('(d) rejects a LOCKED target layer fail-closed', () => {
		const state = withLockedLayer(withFloors(), 'layer-roads');
		expect(
			reject(
				run(state, {
					type: 'map.derive-features',
					actorId: DM_ACTOR.id,
					payload: {
						mapId: MAP_ID,
						sourceLayerIds: ['layer-terrain'],
						targetLayerId: 'layer-roads',
						seed: 'derive-1',
						idPrefix: 'd1',
					},
				}),
			).rejection.code,
		).toBe('actor-not-authorized');
	});
});

// =================================================================================================
// D. The gaps: map.delete / map.set-scale / map.set-projection / region CRUD
// =================================================================================================

describe('MAP-021 map.delete — refuses to orphan an embed', () => {
	it('REJECTS deleting a map another map embeds (the parent would point at nothing)', () => {
		const before = stateWithMaps();
		// The demo Western Reaches embeds the Hidden Outpost.
		const result = reject(
			run(before, {
				type: 'map.delete',
				actorId: DM_ACTOR.id,
				payload: { mapId: OUTPOST_ID },
			}),
		);
		expect(result.rejection.code).toBe('map-embedded-elsewhere');
		expect(result.nextState.maps.maps[OUTPOST_ID]).toBeDefined();
		expect(result.nextState.sync.operations.length).toBe(before.sync.operations.length);
	});

	it('`force` deletes it AND removes the orphaned embeds, leaving the graph consistent', () => {
		const before = stateWithMaps();
		const result = accept(
			run(before, {
				type: 'map.delete',
				actorId: DM_ACTOR.id,
				payload: { mapId: OUTPOST_ID, force: true },
			}),
		);
		expect(result.nextState.maps.maps[OUTPOST_ID]).toBeUndefined();
		expect(mapOf(result.nextState).embeds).toEqual([]);

		const op = lastOp(result.nextState);
		expect(op.opType).toBe('map.delete');
		expect(op.entityId).toBe(OUTPOST_ID);
		expect(op.value).toMatchObject({
			forced: true,
			removedEmbeds: [{ parentMapId: MAP_ID, embedId: 'embed-hidden-outpost' }],
		});
		expect(op.beforeRevision).toBe(before.maps.maps[OUTPOST_ID]!.revision);
		expect(result.events).toEqual([
			{ kind: 'map.deleted', mapId: OUTPOST_ID, actorId: DM_ACTOR.id },
		]);
	});

	it('deletes an unembedded map without force', () => {
		const result = accept(
			run(stateWithMaps(), { type: 'map.delete', actorId: DM_ACTOR.id, payload: { mapId: KEEP_ID } }),
		);
		expect(result.nextState.maps.maps[KEEP_ID]).toBeUndefined();
	});

	it('(b) rejects a non-DM actor', () => {
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			expect(
				reject(run(stateWithMaps(), { type: 'map.delete', actorId, payload: { mapId: KEEP_ID } }))
					.rejection.code,
			).toBe('actor-not-authorized');
		}
	});

	it('(c) a deleted map reads as generically UNAVAILABLE to a player (not "deleted")', () => {
		const state = accept(
			run(stateWithMaps(), { type: 'map.delete', actorId: DM_ACTOR.id, payload: { mapId: KEEP_ID } }),
		).nextState;
		const view = getMapViewForActor(state.maps, state.permissions, PLAYER_ACTOR.id, KEEP_ID);
		expect(view).toEqual({ kind: 'unavailable', mapId: KEEP_ID });
	});
});

describe('MAP-021 map.set-scale / map.set-projection — no longer write-once', () => {
	it('(a) sets the scale and appends ONE op carrying before+after', () => {
		const before = stateWithMaps();
		const result = accept(
			run(before, {
				type: 'map.set-scale',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, scale: { unitsPerMap: 500, unit: 'miles' } },
			}),
		);
		expect(mapOf(result.nextState).scale).toEqual({ unitsPerMap: 500, unit: 'miles' });
		const op = lastOp(result.nextState);
		expect(op.opType).toBe('map.set-scale');
		expect(op.value).toEqual({
			mutation: 'set-scale',
			scale: { unitsPerMap: 500, unit: 'miles' },
			before: { unitsPerMap: 120, unit: 'miles' },
		});
		expect(op.beforeRevision).toBe(mapOf(before).revision);
		expect(op.afterRevision).toBe(mapOf(before).revision + 1);
	});

	it('CLEARS the scale with null (distance then reads unavailable, never guessed)', () => {
		const state = accept(
			run(stateWithMaps(), {
				type: 'map.set-scale',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, scale: null },
			}),
		).nextState;
		expect(mapOf(state).scale).toBeNull();
	});

	it('validates fail-closed exactly as map.create does (non-positive scale, unknown projection)', () => {
		const before = stateWithMaps();
		expect(
			reject(
				run(before, {
					type: 'map.set-scale',
					actorId: DM_ACTOR.id,
					payload: { mapId: MAP_ID, scale: { unitsPerMap: 0, unit: 'miles' } },
				}),
			).rejection.code,
		).toBe('invalid-payload');
		expect(
			reject(
				run(before, {
					type: 'map.set-projection',
					actorId: DM_ACTOR.id,
					payload: { mapId: MAP_ID, projection: { kind: 'holographic', rotationDegrees: 0 } },
				}),
			).rejection.code,
		).toBe('invalid-payload');
	});

	it('sets the projection', () => {
		const state = accept(
			run(stateWithMaps(), {
				type: 'map.set-projection',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, projection: { kind: 'web-mercator', rotationDegrees: 15 } },
			}),
		).nextState;
		expect(mapOf(state).projection).toEqual({ kind: 'web-mercator', rotationDegrees: 15 });
		expect(lastOp(state).opType).toBe('map.set-projection');
	});

	it('(b) rejects a non-DM actor on both', () => {
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			expect(
				reject(
					run(stateWithMaps(), {
						type: 'map.set-scale',
						actorId,
						payload: { mapId: MAP_ID, scale: null },
					}),
				).rejection.code,
			).toBe('actor-not-authorized');
			expect(
				reject(
					run(stateWithMaps(), {
						type: 'map.set-projection',
						actorId,
						payload: { mapId: MAP_ID, projection: { kind: 'flat', rotationDegrees: 0 } },
					}),
				).rejection.code,
			).toBe('actor-not-authorized');
		}
	});
});

describe('MAP-021 region CRUD — MapRegion finally has a writer', () => {
	it('(a) creates a region and appends ONE op with before/after revisions', () => {
		const before = stateWithMaps();
		const result = accept(
			run(before, {
				type: 'map.create-region',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: MAP_ID,
					id: 'region-eastmarch',
					name: 'Eastmarch',
					bounds: { x: 0.1, y: 0.5, w: 0.2, h: 0.2 },
				},
			}),
		);
		expect(mapOf(result.nextState).regions.map((r) => r.id)).toContain('region-eastmarch');
		const op = lastOp(result.nextState);
		expect(op.opType).toBe('map.region.create');
		expect(op.value).toMatchObject({
			mutation: 'create',
			region: { id: 'region-eastmarch', name: 'Eastmarch' },
		});
		expect(op.beforeRevision).toBe(mapOf(before).revision);
		expect(op.afterRevision).toBe(mapOf(before).revision + 1);
		expect(result.events).toEqual([
			{
				kind: 'map.region-changed',
				mapId: MAP_ID,
				regionId: 'region-eastmarch',
				mutation: 'create',
				actorId: DM_ACTOR.id,
			},
		]);
	});

	it('validates bounds fail-closed (outside normalized space, degenerate)', () => {
		for (const bounds of [
			{ x: 0.9, y: 0.1, w: 0.5, h: 0.2 },
			{ x: 0.1, y: 0.1, w: 0, h: 0.2 },
		]) {
			expect(
				reject(
					run(stateWithMaps(), {
						type: 'map.create-region',
						actorId: DM_ACTOR.id,
						payload: { mapId: MAP_ID, name: 'Bad', bounds },
					}),
				).rejection.code,
			).toBe('invalid-payload');
		}
	});

	it('updates a region', () => {
		const state = accept(
			run(stateWithMaps(), {
				type: 'map.update-region',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, regionId: 'region-coast', name: 'Storm Coast (flooded)' },
			}),
		).nextState;
		expect(mapOf(state).regions.find((r) => r.id === 'region-coast')!.name).toBe(
			'Storm Coast (flooded)',
		);
		expect(lastOp(state).opType).toBe('map.region.update');
	});

	it('DELETING THE DEFAULT REGION CLEARS defaultRegionId rather than dangling it', () => {
		const before = stateWithMaps();
		expect(mapOf(before).defaultRegionId).toBe('region-north-road');
		const result = accept(
			run(before, {
				type: 'map.delete-region',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, regionId: 'region-north-road' },
			}),
		);
		expect(mapOf(result.nextState).regions.some((r) => r.id === 'region-north-road')).toBe(false);
		expect(mapOf(result.nextState).defaultRegionId).toBeNull();
		expect(lastOp(result.nextState).value).toMatchObject({
			mutation: 'delete',
			wasDefault: true,
			defaultRegionId: null,
		});
	});

	it('deleting a NON-default region leaves defaultRegionId alone', () => {
		const state = accept(
			run(stateWithMaps(), {
				type: 'map.delete-region',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, regionId: 'region-coast' },
			}),
		).nextState;
		expect(mapOf(state).defaultRegionId).toBe('region-north-road');
	});

	it('(b) rejects a non-DM actor on all three', () => {
		const before = stateWithMaps();
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			expect(
				reject(
					run(before, {
						type: 'map.create-region',
						actorId,
						payload: { mapId: MAP_ID, name: 'X', bounds: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } },
					}),
				).rejection.code,
			).toBe('actor-not-authorized');
			expect(
				reject(
					run(before, {
						type: 'map.update-region',
						actorId,
						payload: { mapId: MAP_ID, regionId: 'region-coast', name: 'X' },
					}),
				).rejection.code,
			).toBe('actor-not-authorized');
			expect(
				reject(
					run(before, {
						type: 'map.delete-region',
						actorId,
						payload: { mapId: MAP_ID, regionId: 'region-coast' },
					}),
				).rejection.code,
			).toBe('actor-not-authorized');
		}
	});

	it('(c) a region authored on a DM-ONLY map never reaches the player surface', () => {
		const state = accept(
			run(stateWithMaps(), {
				type: 'map.create-region',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: OUTPOST_ID,
					id: 'region-secret-armoury',
					name: 'Secret Armoury',
					bounds: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 },
				},
			}),
		).nextState;
		// The map itself is dm-only, so the player gets the generic unavailable result — no region, no name.
		const view = getMapViewForActor(state.maps, state.permissions, PLAYER_ACTOR.id, OUTPOST_ID);
		expect(view).toEqual({ kind: 'unavailable', mapId: OUTPOST_ID });
		expect(JSON.stringify(view)).not.toContain('Secret Armoury');
	});
});

// =================================================================================================
// E. buildMapInverse — the property that makes the whole undo stack trustworthy
// =================================================================================================

/**
 * Strip the fields that MUST move forward on every mutation (a durable revision never rewinds, and an
 * audit stamp records who touched it last). What remains is the DATA — and undo has to restore that
 * EXACTLY, including array order.
 */
/**
 * The map's id-keyed annotation collections (`pois`/`routes`/`tokens`/`regions`) have NO order field —
 * their readers look each up by id and never sort by array position. So the inverse of a delete
 * (recreate) legitimately appends the record at the end rather than at its former index, and the sets
 * are equal even when the arrays are permuted. Layers and fog are NOT in this set: layer order is
 * load-bearing (the `order` field, which the restore re-applies), and fog order is its override
 * sequence. So those are compared position-sensitively.
 */
const ORDERLESS_KEYS = new Set(['pois', 'routes', 'tokens', 'regions']);

function stripVolatile(value: unknown, key?: string): unknown {
	if (Array.isArray(value)) {
		const mapped = value.map((item) => stripVolatile(item));
		if (key && ORDERLESS_KEYS.has(key)) {
			return [...mapped].sort((a, b) => {
				const ai = (a as { id?: string }).id ?? '';
				const bi = (b as { id?: string }).id ?? '';
				return ai.localeCompare(bi);
			});
		}
		return mapped;
	}
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [innerKey, inner] of Object.entries(value as Record<string, unknown>)) {
			if (innerKey === 'revision' || innerKey === 'updatedAt' || innerKey === 'updatedBy') continue;
			out[innerKey] = stripVolatile(inner, innerKey);
		}
		return out;
	}
	return value;
}

interface RoundTripCase {
	name: string;
	/** Optional prep dispatched BEFORE the command under test (its state becomes `stateBefore`). */
	setup?: (state: CoreStateSlice) => CoreStateSlice;
	command: CoreCommand;
	/** The label the History panel shows for the FORWARD action. */
	label: string;
}

const ROUND_TRIPS: RoundTripCase[] = [
	{
		name: 'map.add-features',
		command: {
			type: 'map.add-features',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [A, B] },
		},
		label: 'Painted 2 features',
	},
	{
		name: 'map.update-features',
		setup: (state) =>
			accept(
				run(state, {
					type: 'map.add-features',
					actorId: DM_ACTOR.id,
					payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [A, B, C] },
				}),
			).nextState,
		command: {
			type: 'map.update-features',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: MAP_ID,
				layerId: 'layer-terrain',
				features: [{ ...B, points: [{ x: 0.01, y: 0.02 }], style: 'ink:blue' }],
			},
		},
		label: 'Edited 1 feature',
	},
	{
		name: 'map.remove-features (from the MIDDLE of the array — order must be restored exactly)',
		setup: (state) =>
			accept(
				run(state, {
					type: 'map.add-features',
					actorId: DM_ACTOR.id,
					payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [A, B, C] },
				}),
			).nextState,
		command: {
			type: 'map.remove-features',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId: 'layer-terrain', featureIds: ['f-b'] },
		},
		label: 'Erased 1 feature',
	},
	{
		name: 'map.edit-layer',
		command: {
			type: 'map.edit-layer',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId: 'layer-terrain', before: [], after: [A] },
		},
		label: 'Painted layer',
	},
	{
		name: 'map.generate',
		command: GENERATE,
		label: 'Generated dungeon — organic',
	},
	{
		name: 'map.generate (replacing an existing layer)',
		command: {
			type: 'map.generate',
			actorId: DM_ACTOR.id,
			payload: {
				...(GENERATE.payload as object),
				targetLayerIds: ['layer-terrain'],
				replace: true,
			},
		},
		label: 'Generated dungeon — organic',
	},
	{
		name: 'map.derive-features (new layer)',
		setup: () => withFloors(),
		command: DERIVE,
		label: 'Derived walls, doors and lights',
	},
	{
		name: 'map.derive-features (existing target layer)',
		setup: () => withFloors(),
		command: {
			type: 'map.derive-features',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: MAP_ID,
				sourceLayerIds: ['layer-terrain'],
				targetLayerId: 'layer-roads',
				seed: 'derive-1',
				idPrefix: 'd1',
			},
		},
		label: 'Derived walls, doors and lights',
	},
	{
		name: 'map.create-layer',
		command: {
			type: 'map.create-layer',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, id: 'layer-new', name: 'Ink' },
		},
		label: 'Created layer "Ink"',
	},
	{
		name: 'map.duplicate-layer',
		command: {
			type: 'map.duplicate-layer',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId: 'layer-roads', id: 'layer-roads-copy' },
		},
		label: 'Duplicated layer',
	},
	{
		name: 'map.delete-layer (which also repacks every other layer order)',
		command: {
			type: 'map.delete-layer',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId: 'layer-roads' },
		},
		label: 'Deleted layer "Roads"',
	},
	{
		name: 'map.rename-layer',
		command: {
			type: 'map.rename-layer',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId: 'layer-terrain', name: 'Ground' },
		},
		label: 'Renamed layer to "Ground"',
	},
	{
		name: 'map.reorder-layer',
		command: {
			type: 'map.reorder-layer',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId: 'layer-terrain', toOrder: 2 },
		},
		label: 'Reordered layer "Terrain"',
	},
	{
		name: 'map.lock-layer',
		command: {
			type: 'map.lock-layer',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId: 'layer-terrain', locked: true },
		},
		label: 'Locked layer "Terrain"',
	},
	{
		name: 'map.set-layer-visibility',
		command: {
			type: 'map.set-layer-visibility',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId: 'layer-terrain', visibility: 'dm-only' },
		},
		label: 'Set layer "Terrain" to dm-only',
	},
	{
		name: 'map.set-layer-enabled',
		command: {
			type: 'map.set-layer-enabled',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId: 'layer-terrain', enabled: false },
		},
		label: 'Hid layer "Terrain"',
	},
	{
		name: 'map.set-layer-opacity',
		command: {
			type: 'map.set-layer-opacity',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId: 'layer-terrain', opacity: 0.25 },
		},
		label: 'Set layer "Terrain" opacity',
	},
	{
		name: 'map.set-layer-tags',
		command: {
			type: 'map.set-layer-tags',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: MAP_ID,
				layerId: 'layer-terrain',
				tags: ['region:south'],
				query: { region: 'south' },
			},
		},
		label: 'Retagged layer "Terrain"',
	},
	{
		name: 'map.create-poi',
		command: {
			type: 'map.create-poi',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: MAP_ID,
				id: 'poi-old-mill',
				layerId: 'layer-roads',
				label: 'Old Mill',
				position: { x: 0.3, y: 0.7 },
			},
		},
		label: 'Created POI "Old Mill"',
	},
	{
		name: 'map.update-poi',
		command: {
			type: 'map.update-poi',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: MAP_ID,
				poiId: 'poi-harbor-town',
				label: 'Harbour Town (burned)',
				position: { x: 0.11, y: 0.12 },
				visibility: 'dm-only',
			},
		},
		label: 'Edited POI "Harbor Town"',
	},
	{
		name: 'map.delete-poi',
		command: {
			type: 'map.delete-poi',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, poiId: 'poi-harbor-town' },
		},
		label: 'Deleted POI "Harbor Town"',
	},
	{
		name: 'map.create-route',
		command: {
			type: 'map.create-route',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: MAP_ID,
				id: 'route-smugglers-run',
				layerId: 'layer-roads',
				label: "Smugglers' Run",
				waypoints: [
					{ id: 'w1', position: { x: 0.1, y: 0.1 } },
					{ id: 'w2', position: { x: 0.2, y: 0.2 } },
				],
			},
		},
		label: 'Created route "Smugglers\' Run"',
	},
	{
		name: 'map.update-route',
		command: {
			type: 'map.update-route',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, routeId: 'route-north-road', label: 'North Road (washed out)' },
		},
		label: 'Edited route "North Road March"',
	},
	{
		name: 'map.delete-route',
		command: {
			type: 'map.delete-route',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, routeId: 'route-north-road' },
		},
		label: 'Deleted route "North Road March"',
	},
	{
		name: 'map.create-token',
		command: {
			type: 'map.create-token',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: MAP_ID,
				id: 'token-wolf',
				layerId: 'layer-roads',
				label: 'Dire Wolf',
				position: { x: 0.4, y: 0.4 },
			},
		},
		label: 'Placed token "Dire Wolf"',
	},
	{
		name: 'map.move-token',
		command: {
			type: 'map.move-token',
			actorId: DM_ACTOR.id,
			payload: { mapId: KEEP_ID, tokenId: 'token-hero', position: { x: 0.5, y: 0.5 } },
		},
		label: 'Moved token "Sir Caldwell"',
	},
	{
		name: 'map.update-token',
		command: {
			type: 'map.update-token',
			actorId: DM_ACTOR.id,
			payload: { mapId: KEEP_ID, tokenId: 'token-hero', label: 'Sir Caldwell (bloodied)', size: 2 },
		},
		label: 'Edited token "Sir Caldwell"',
	},
	{
		name: 'map.delete-token',
		command: {
			type: 'map.delete-token',
			actorId: DM_ACTOR.id,
			payload: { mapId: KEEP_ID, tokenId: 'token-ambusher' },
		},
		label: 'Removed token "Cellar Ambusher"',
	},
	{
		name: 'map.append-fog',
		command: {
			type: 'map.append-fog',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: KEEP_ID,
				id: 'fog-hall-reveal',
				layerId: 'layer-fog',
				kind: 'reveal',
				region: { shape: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
			},
		},
		label: 'Revealed fog',
	},
	{
		name: 'map.remove-fog',
		// Append a fresh, canonically-shaped fog op first, then remove THAT. (The demo's seed fog uses the
		// pre-`shape` legacy `{x,y,w,h}` form, which re-append canonicalizes — an unrelated back-compat
		// quirk, not an undo defect. Removing a freshly-added op keeps the round-trip about the inverse.)
		setup: (state) =>
			accept(
				run(state, {
					type: 'map.append-fog',
					actorId: DM_ACTOR.id,
					payload: {
						mapId: KEEP_ID,
						id: 'fog-fresh-conceal',
						layerId: 'layer-fog',
						kind: 'conceal',
						region: { shape: 'rect', x: 0.2, y: 0.2, w: 0.1, h: 0.1 },
					},
				}),
			).nextState,
		command: {
			type: 'map.remove-fog',
			actorId: DM_ACTOR.id,
			payload: { mapId: KEEP_ID, fogId: 'fog-fresh-conceal' },
		},
		label: 'Removed a fog operation',
	},
	{
		name: 'map.set-overlay-mode',
		command: {
			type: 'map.set-overlay-mode',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, mode: 'token' },
		},
		label: 'Entered token overlay mode',
	},
	{
		name: 'map.configure-overlay',
		command: {
			type: 'map.configure-overlay',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, gridVisible: true, gridSize: 40 },
		},
		label: 'Configured the combat overlay',
	},
	{
		name: 'map.create-region',
		command: {
			type: 'map.create-region',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: MAP_ID,
				id: 'region-eastmarch',
				name: 'Eastmarch',
				bounds: { x: 0.1, y: 0.5, w: 0.2, h: 0.2 },
			},
		},
		label: 'Created region "Eastmarch"',
	},
	{
		name: 'map.update-region',
		command: {
			type: 'map.update-region',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, regionId: 'region-coast', name: 'Drowned Coast' },
		},
		label: 'Edited region "Storm Coast"',
	},
	{
		name: 'map.delete-region (the DEFAULT one — the inverse must restore defaultRegionId too)',
		command: {
			type: 'map.delete-region',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, regionId: 'region-north-road' },
		},
		label: 'Deleted region "North Road"',
	},
	{
		name: 'map.set-scale',
		command: {
			type: 'map.set-scale',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, scale: null },
		},
		label: 'Changed the map scale',
	},
	{
		name: 'map.set-projection',
		command: {
			type: 'map.set-projection',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, projection: { kind: 'web-mercator', rotationDegrees: 30 } },
		},
		label: 'Changed the map projection',
	},
	{
		name: 'map.update-metadata',
		command: {
			type: 'map.update-metadata',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, name: 'The Sundered Reaches' },
		},
		label: 'Renamed the map',
	},
];

describe('MAP-021 buildMapInverse — every undoable map command round-trips EXACTLY', () => {
	it.each(ROUND_TRIPS)('$name', ({ setup, command, label }) => {
		const stateBefore = setup ? setup(stateWithMaps()) : stateWithMaps();

		// Forward.
		const forward = accept(run(stateBefore, command));
		expect(JSON.stringify(stripVolatile(forward.nextState.maps))).not.toBe(
			JSON.stringify(stripVolatile(stateBefore.maps)),
		);

		// The inverse is built from the command + the state BEFORE it applied. Nothing else.
		const inverse = buildMapInverse(command, stateBefore);
		expect(inverse).not.toBeNull();
		expect(inverse!.label).toBe(label);

		// Undo: dispatched through the NORMAL command path (an undo is an ordinary authorized, logged
		// mutation — never a back-door state write), and it appends its own durable op.
		const undone = accept(run(forward.nextState, inverse!.command));
		expect(undone.nextState.sync.operations.length).toBe(
			forward.nextState.sync.operations.length + 1,
		);

		// The DATA is back, exactly — every layer, every feature, in the same array order. (Revisions and
		// audit stamps have moved forward, as they must: the durable history never rewinds.)
		expect(stripVolatile(undone.nextState.maps)).toEqual(stripVolatile(stateBefore.maps));
	});

	it('returns null for a create command with no explicit id (the minted id is unknowable from stateBefore)', () => {
		const state = stateWithMaps();
		const command: CoreCommand = {
			type: 'map.create-poi',
			actorId: DM_ACTOR.id,
			payload: {
				mapId: MAP_ID,
				layerId: 'layer-roads',
				label: 'Nameless',
				position: { x: 0.3, y: 0.3 },
			},
		};
		accept(run(state, command));
		expect(buildMapInverse(command, state)).toBeNull();
	});

	it('returns null for commands that are deliberately NOT undoable (map create/delete, import)', () => {
		const state = stateWithMaps();
		expect(
			buildMapInverse(
				{ type: 'map.delete', actorId: DM_ACTOR.id, payload: { mapId: KEEP_ID } },
				state,
			),
		).toBeNull();
		expect(
			buildMapInverse(
				{ type: 'map.create', actorId: DM_ACTOR.id, payload: { name: 'New' } },
				state,
			),
		).toBeNull();
	});

	it('the undo of a generation removes its layers AND the POIs it planted', () => {
		const before = stateWithMaps();
		const forward = accept(run(before, GENERATE));
		expect(mapOf(forward.nextState).pois.length).toBeGreaterThan(mapOf(before).pois.length);

		const inverse = buildMapInverse(GENERATE, before)!;
		const undone = accept(run(forward.nextState, inverse.command)).nextState;
		expect(mapOf(undone).layers.some((l) => l.id.startsWith('gen1'))).toBe(false);
		expect(mapOf(undone).pois.map((p) => p.id)).toEqual(mapOf(before).pois.map((p) => p.id));
	});

	it('an undo is itself DM-gated: a player cannot dispatch the inverse', () => {
		const before = stateWithMaps();
		const command: CoreCommand = {
			type: 'map.add-features',
			actorId: DM_ACTOR.id,
			payload: { mapId: MAP_ID, layerId: 'layer-terrain', features: [A] },
		};
		const forward = accept(run(before, command));
		const inverse = buildMapInverse(command, before)!;
		const result = reject(
			run(forward.nextState, { ...inverse.command, actorId: PLAYER_ACTOR.id } as CoreCommand),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});

// =================================================================================================
// F. map.restore-layers — the durable undo tail is itself a gated, fail-closed command
// =================================================================================================

describe('MAP-021 map.restore-layers', () => {
	it('(b) rejects a non-DM actor', () => {
		const before = stateWithMaps();
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			expect(
				reject(
					run(before, {
						type: 'map.restore-layers',
						actorId,
						payload: { mapId: MAP_ID, removeLayerIds: ['layer-terrain'] },
					}),
				).rejection.code,
			).toBe('actor-not-authorized');
		}
	});

	it('(d) refuses to remove or overwrite a LOCKED layer (an undo may not walk through a lock)', () => {
		const state = withLockedLayer(stateWithMaps(), 'layer-terrain');
		expect(
			reject(
				run(state, {
					type: 'map.restore-layers',
					actorId: DM_ACTOR.id,
					payload: { mapId: MAP_ID, removeLayerIds: ['layer-terrain'] },
				}),
			).rejection.code,
		).toBe('actor-not-authorized');
		expect(
			reject(
				run(state, {
					type: 'map.restore-layers',
					actorId: DM_ACTOR.id,
					payload: {
						mapId: MAP_ID,
						restoreLayers: [{ ...layer(state, 'layer-terrain'), name: 'Overwritten' }],
					},
				}),
			).rejection.code,
		).toBe('actor-not-authorized');
	});

	it('appends ONE op that names the ids it touched, and bumps the map revision', () => {
		const before = stateWithMaps();
		const result = accept(
			run(before, {
				type: 'map.restore-layers',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, removeLayerIds: ['layer-hidden-camps'] },
			}),
		);
		const op = lastOp(result.nextState);
		expect(op.opType).toBe('map.layer.restore');
		expect(op.value).toMatchObject({
			mutation: 'restore',
			removedLayerIds: ['layer-hidden-camps'],
			restoredLayerIds: [],
		});
		expect(op.beforeRevision).toBe(mapOf(before).revision);
		expect(op.afterRevision).toBe(mapOf(before).revision + 1);
		// Orders are repacked densely, exactly as every other layer reducer leaves them.
		expect(mapOf(result.nextState).layers.map((l) => l.order)).toEqual([0, 1]);
	});
});
