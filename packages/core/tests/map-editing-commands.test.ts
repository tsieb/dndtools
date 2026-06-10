import { describe, expect, it } from 'vitest';
import {
	createDemoMapState,
	dispatchCommand,
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

function reject(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function layer(state: CoreStateSlice, layerId: string) {
	return state.maps.maps[MAP_ID]!.layers.find((l) => l.id === layerId)!;
}

const STROKE: MapFeature[] = [
	{ id: 'f1', kind: 'stroke', points: [{ x: 0.2, y: 0.3 }], style: 'ink:black' },
];

describe('MAP-003 map.edit-layer command', () => {
	it('AC1: a paint edit captures before+after on the durable op and is undoable to the exact prior state', () => {
		const env = makeEnvironment();
		const before = stateWithMaps();
		const beforeContent = layer(before, 'layer-terrain').content;

		// Forward edit: paint a stroke onto Terrain.
		const forward = accept(
			dispatchCommand(before, env, {
				type: 'map.edit-layer',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', before: beforeContent, after: STROKE },
			} satisfies CoreCommand),
		);
		expect(layer(forward.nextState, 'layer-terrain').content).toEqual(STROKE);

		// The durable op carries BOTH before and after (sync-replayable + undoable).
		const op = forward.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('map.layer.edit');
		expect(op.value).toMatchObject({ before: beforeContent, after: STROKE });
		expect(op.beforeRevision).toBeLessThan(op.afterRevision!);

		// Undo: dispatch the inverse (before/after swapped). The prior content is restored exactly.
		const undo = accept(
			dispatchCommand(forward.nextState, env, {
				type: 'map.edit-layer',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', before: STROKE, after: beforeContent },
			} satisfies CoreCommand),
		);
		expect(layer(undo.nextState, 'layer-terrain').content).toEqual(beforeContent);
	});

	it('AC3: a paint on a DM-only layer produces NO player-visible payload (omitted from the player query)', () => {
		const env = makeEnvironment();
		const before = stateWithMaps();
		// layer-hidden-camps is dm-only. Paint a secret stroke on it.
		const secret: MapFeature[] = [
			{ id: 'secret', kind: 'marker', points: [{ x: 0.5, y: 0.5 }], style: 'ambush' },
		];
		const after = accept(
			dispatchCommand(before, env, {
				type: 'map.edit-layer',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-hidden-camps', before: [], after: secret },
			} satisfies CoreCommand),
		);
		// The DM sees the painted content.
		const dmQuery = queryMapLayers(after.nextState.maps, after.nextState.permissions, DM_ACTOR.id, {
			mapId: MAP_ID,
		});
		expect(dmQuery.layers.find((l) => l.layerId === 'layer-hidden-camps')!.content).toEqual(secret);

		// The player query OMITS the dm-only layer entirely — no layer, no content, no leak.
		const playerQuery = queryMapLayers(
			after.nextState.maps,
			after.nextState.permissions,
			PLAYER_ACTOR.id,
			{ mapId: MAP_ID },
		);
		expect(playerQuery.layers.some((l) => l.layerId === 'layer-hidden-camps')).toBe(false);
		expect(JSON.stringify(playerQuery)).not.toContain('secret');
		expect(JSON.stringify(playerQuery)).not.toContain('ambush');
	});

	it('rejects a paint edit from a non-DM actor (fail closed)', () => {
		const env = makeEnvironment();
		const before = stateWithMaps();
		for (const actorId of [PLAYER_ACTOR.id, OBSERVER_ACTOR.id]) {
			const result = reject(
				dispatchCommand(before, env, {
					type: 'map.edit-layer',
					actorId,
					payload: { mapId: MAP_ID, layerId: 'layer-terrain', before: [], after: STROKE },
				} satisfies CoreCommand),
			);
			expect(result.rejection.code).toBe('actor-not-authorized');
		}
	});

	it('rejects a stale before-base as a revision conflict and appends no operation', () => {
		const env = makeEnvironment();
		const before = stateWithMaps();
		const opsBefore = before.sync.operations.length;
		const result = reject(
			dispatchCommand(before, env, {
				type: 'map.edit-layer',
				actorId: DM_ACTOR.id,
				// terrain seeds with no content, but pretend the caller saw a stale non-empty base.
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', before: STROKE, after: [] },
			} satisfies CoreCommand),
		);
		expect(result.rejection.code).toBe('revision-conflict');
		expect(result.nextState.sync.operations.length).toBe(opsBefore);
	});

	it('rejects a locked layer fail-closed', () => {
		const env = makeEnvironment();
		let state = stateWithMaps();
		state = accept(
			dispatchCommand(state, env, {
				type: 'map.lock-layer',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', locked: true },
			} satisfies CoreCommand),
		).nextState;
		const result = reject(
			dispatchCommand(state, env, {
				type: 'map.edit-layer',
				actorId: DM_ACTOR.id,
				payload: { mapId: MAP_ID, layerId: 'layer-terrain', before: [], after: STROKE },
			} satisfies CoreCommand),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});

describe('MAP-004 map.generate-layers command', () => {
	it('AC1: generates editable layers saved into the map; same seed reproduces the same layer set', () => {
		const before = stateWithMaps();
		const baseCount = before.maps.maps[MAP_ID]!.layers.length;

		const run = (idPrefix: string) =>
			accept(
				dispatchCommand(stateWithMaps(), makeEnvironment(), {
					type: 'map.generate-layers',
					actorId: DM_ACTOR.id,
					payload: {
						mapId: MAP_ID,
						kind: 'dungeon',
						seed: 'crypt-seed',
						width: 10,
						height: 10,
						density: 0.4,
						idPrefix,
					},
				} satisfies CoreCommand),
			);

		const first = run('gen-a');
		const firstLayers = first.nextState.maps.maps[MAP_ID]!.layers;
		expect(firstLayers.length).toBeGreaterThan(baseCount);
		// The generated layers append to the existing set (editable MAP-005 layers).
		const generated = firstLayers.filter((l) => l.id.startsWith('gen-a'));
		expect(generated.length).toBeGreaterThan(0);
		expect(generated.every((l) => l.locked === false)).toBe(true);

		// Same params + seed (different idPrefix only) ⇒ identical geometry. Compare content stripped
		// of the id-prefix so the geometry equality is exact.
		const second = run('gen-b');
		const stripPrefix = (json: string, prefix: string) => json.split(prefix).join('PFX');
		const a = stripPrefix(JSON.stringify(generated.map((l) => l.content)), 'gen-a');
		const b = stripPrefix(
			JSON.stringify(
				second.nextState.maps.maps[MAP_ID]!.layers.filter((l) => l.id.startsWith('gen-b')).map(
					(l) => l.content,
				),
			),
			'gen-b',
		);
		expect(a).toBe(b);

		// A durable op records the deterministic generation params (replayable on another device).
		const op = first.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('map.layer.generate');
		expect(op.value).toMatchObject({
			mutation: 'generate',
			params: { kind: 'dungeon', seed: 'crypt-seed' },
		});
	});

	it('a generated layer is then editable via map.edit-layer', () => {
		const env = makeEnvironment();
		const generated = accept(
			dispatchCommand(stateWithMaps(), env, {
				type: 'map.generate-layers',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: MAP_ID,
					kind: 'terrain',
					seed: 7,
					width: 6,
					height: 6,
					density: 0.5,
					idPrefix: 'terr',
				},
			} satisfies CoreCommand),
		);
		const genLayer = generated.nextState.maps.maps[MAP_ID]!.layers.find(
			(l) => l.id === 'terr-terrain',
		)!;
		// Paint over the generated content — the layer accepts the edit (it is a normal MAP-005 layer).
		const edited = accept(
			dispatchCommand(generated.nextState, env, {
				type: 'map.edit-layer',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: MAP_ID,
					layerId: 'terr-terrain',
					before: genLayer.content,
					after: STROKE,
				},
			} satisfies CoreCommand),
		);
		expect(layer(edited.nextState, 'terr-terrain').content).toEqual(STROKE);
	});

	it('AC2: invalid params are rejected with NO partial layers persisted', () => {
		const env = makeEnvironment();
		const before = stateWithMaps();
		const baseCount = before.maps.maps[MAP_ID]!.layers.length;
		const opsBefore = before.sync.operations.length;
		const result = reject(
			dispatchCommand(before, env, {
				type: 'map.generate-layers',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: MAP_ID,
					kind: 'dungeon',
					seed: 1,
					width: 99,
					height: 8,
					density: 0.5,
					idPrefix: 'bad',
				},
			} satisfies CoreCommand),
		);
		expect(result.rejection.code).toBe('invalid-payload');
		// State unchanged: no layers, no op.
		expect(result.nextState.maps.maps[MAP_ID]!.layers.length).toBe(baseCount);
		expect(result.nextState.sync.operations.length).toBe(opsBefore);
	});

	it('rejects a generated id collision rather than clobbering an existing layer', () => {
		const env = makeEnvironment();
		let state = stateWithMaps();
		state = accept(
			dispatchCommand(state, env, {
				type: 'map.generate-layers',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: MAP_ID,
					kind: 'terrain',
					seed: 1,
					width: 6,
					height: 6,
					density: 0.5,
					idPrefix: 'dup',
				},
			} satisfies CoreCommand),
		).nextState;
		// Re-running with the same idPrefix would collide on 'dup-terrain'.
		const result = reject(
			dispatchCommand(state, env, {
				type: 'map.generate-layers',
				actorId: DM_ACTOR.id,
				payload: {
					mapId: MAP_ID,
					kind: 'terrain',
					seed: 1,
					width: 6,
					height: 6,
					density: 0.5,
					idPrefix: 'dup',
				},
			} satisfies CoreCommand),
		);
		expect(result.rejection.code).toBe('invalid-state');
	});

	it('rejects generation from a non-DM actor', () => {
		const env = makeEnvironment();
		const before = stateWithMaps();
		const result = reject(
			dispatchCommand(before, env, {
				type: 'map.generate-layers',
				actorId: PLAYER_ACTOR.id,
				payload: {
					mapId: MAP_ID,
					kind: 'terrain',
					seed: 1,
					width: 6,
					height: 6,
					density: 0.5,
					idPrefix: 'x',
				},
			} satisfies CoreCommand),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});
