import { describe, expect, it } from 'vitest';
import {
	buildMapAsset,
	createMapImportAdapterRegistry,
	dispatchCommand,
	hashAssetBytes,
	previewMapImport,
	stageMapImport,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
	type MapImportAdapterDescriptor,
	type MapImportAdapterRegistry,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got ${JSON.stringify(result.rejection)}`);
	}
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

const PNG = [137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4];
const PNG_META = { mimeType: 'image/png', fileName: 'battlemap.png', dimensions: null };

const VTT_ADAPTER: MapImportAdapterDescriptor = {
	formatId: 'vtt-scene',
	displayName: 'VTT Scene',
	version: '1.0.0',
	elementSupport: {
		dimensions: 'importable',
		'background-image': 'importable',
		grid: 'importable',
		walls: 'lossy',
		notes: 'lossy',
		lights: 'unsupported',
		tokens: 'unsupported',
	},
};

function withAdapters(...descriptors: MapImportAdapterDescriptor[]): CoreEnvironment {
	return makeEnvironment({ mapImportAdapters: createMapImportAdapterRegistry(descriptors) });
}

// ---------------------------------------------------------------------------
// MAP-002: content-addressed asset hashing
// ---------------------------------------------------------------------------
describe('MAP-002 content-addressed asset hashing', () => {
	it('the same bytes always hash to the same id (content-addressed, deterministic)', () => {
		const a = hashAssetBytes(Uint8Array.from(PNG));
		const b = hashAssetBytes(Uint8Array.from(PNG));
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{16}$/);
	});

	it('different bytes hash to different ids', () => {
		expect(hashAssetBytes(Uint8Array.from(PNG))).not.toBe(
			hashAssetBytes(Uint8Array.from([...PNG, 99])),
		);
	});

	it('byte order changes the hash', () => {
		expect(hashAssetBytes(Uint8Array.from([1, 2, 3]))).not.toBe(
			hashAssetBytes(Uint8Array.from([3, 2, 1])),
		);
	});

	it('buildMapAsset sets the id to the algorithm-tagged content hash', () => {
		const asset = buildMapAsset({
			bytes: Uint8Array.from(PNG),
			mimeType: 'image/png',
			fileName: 'm.png',
			importedBy: DM_ACTOR.id,
			importedAt: '2026-06-04T00:00:00.000Z',
		});
		if ('error' in asset) throw new Error('expected asset');
		expect(asset.id).toBe(`fnv1a64-${asset.checksum}`);
		expect(asset.checksum).toBe(hashAssetBytes(Uint8Array.from(PNG)));
		expect(asset.kind).toBe('image');
	});

	it('rejects empty bytes, oversized bytes, and non-native MIME fail-closed', () => {
		const empty = buildMapAsset({
			bytes: new Uint8Array(),
			mimeType: 'image/png',
			fileName: 'm.png',
			importedBy: DM_ACTOR.id,
			importedAt: 'now',
		});
		expect('error' in empty && empty.error.kind).toBe('empty-bytes');

		const tooLarge = buildMapAsset({
			bytes: Uint8Array.from(PNG),
			mimeType: 'image/png',
			fileName: 'm.png',
			importedBy: DM_ACTOR.id,
			importedAt: 'now',
			maxBytes: 4,
		});
		expect('error' in tooLarge && tooLarge.error.kind).toBe('too-large');

		const badMime = buildMapAsset({
			bytes: Uint8Array.from(PNG),
			mimeType: 'application/x-foundry',
			fileName: 'm.fvtt',
			importedBy: DM_ACTOR.id,
			importedAt: 'now',
		});
		expect('error' in badMime && badMime.error.kind).toBe('unsupported-mime');
	});
});

// ---------------------------------------------------------------------------
// MAP-001: create a map entity
// ---------------------------------------------------------------------------
describe('MAP-001 map.create', () => {
	function base(): CoreStateSlice {
		return buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
	}

	it('AC1: a created map persists a MapState record with name, scale, projection, and initial layers', () => {
		const env = makeEnvironment();
		const result = accept(
			dispatchCommand(base(), env, {
				type: 'map.create',
				actorId: DM_ACTOR.id,
				payload: {
					name: 'Sunless Citadel',
					scale: { unitsPerMap: 300, unit: 'feet' },
					projection: { kind: 'flat', rotationDegrees: 0 },
					initialLayers: [
						{ name: 'Floor 1', category: 'base', visibility: 'player-visible' },
						{ name: 'Traps', category: 'dm-annotations' },
					],
				},
			} satisfies CoreCommand),
		);
		const maps = Object.values(result.nextState.maps.maps);
		expect(maps).toHaveLength(1);
		const map = maps[0]!;
		expect(map.name).toBe('Sunless Citadel');
		expect(map.scale).toEqual({ unitsPerMap: 300, unit: 'feet' });
		expect(map.projection).toEqual({ kind: 'flat', rotationDegrees: 0 });
		expect(map.layers).toHaveLength(2);
		expect(map.layers.map((l) => l.name)).toEqual(['Floor 1', 'Traps']);
		// A durable op was appended (no GUI reaches storage).
		expect(result.operationIds).toHaveLength(1);
		expect(result.nextState.sync.operations.at(-1)!.opType).toBe('map.create');
	});

	it('AC2: default visibility fails closed to dm-only when omitted', () => {
		const env = makeEnvironment();
		const result = accept(
			dispatchCommand(base(), env, {
				type: 'map.create',
				actorId: DM_ACTOR.id,
				payload: { name: 'Hidden Lair' },
			} satisfies CoreCommand),
		);
		const map = Object.values(result.nextState.maps.maps)[0]!;
		expect(map.visibility).toBe('dm-only');
		// An empty initial layer set still seeds at least one (dm-only) base layer.
		expect(map.layers).toHaveLength(1);
		expect(map.layers[0]!.visibility).toBe('dm-only');
	});

	it('rejects a bad scale fail-closed (non-positive) before any mutation', () => {
		const env = makeEnvironment();
		const before = base();
		const result = rejected(
			dispatchCommand(before, env, {
				type: 'map.create',
				actorId: DM_ACTOR.id,
				payload: { name: 'Bad', scale: { unitsPerMap: -5, unit: 'miles' } },
			} satisfies CoreCommand),
		);
		expect(result.rejection.code).toBe('invalid-payload');
		expect(result.nextState).toBe(before); // byte-identical: nothing committed
	});

	it('rejects an unknown projection fail-closed', () => {
		const env = makeEnvironment();
		const result = rejected(
			dispatchCommand(base(), env, {
				type: 'map.create',
				actorId: DM_ACTOR.id,
				payload: { name: 'Bad', projection: { kind: 'orthographic' } },
			} satisfies CoreCommand),
		);
		expect(result.rejection.code).toBe('invalid-payload');
	});

	it('rejects a non-DM actor (DM-only authoring)', () => {
		const env = makeEnvironment();
		const result = rejected(
			dispatchCommand(base(), env, {
				type: 'map.create',
				actorId: PLAYER_ACTOR.id,
				payload: { name: 'Nope' },
			} satisfies CoreCommand),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});
});

// ---------------------------------------------------------------------------
// MAP-002: import native assets, content-addressed, adapter-gated
// ---------------------------------------------------------------------------
describe('MAP-002 map.import-asset / adapter gating', () => {
	function mapState(): CoreStateSlice {
		const env = makeEnvironment();
		const created = accept(
			dispatchCommand(buildInitialState(DM_ACTOR, PLAYER_ACTOR), env, {
				type: 'map.create',
				actorId: DM_ACTOR.id,
				payload: { name: 'Battle' },
			} satisfies CoreCommand),
		);
		return created.nextState;
	}

	function firstMapId(state: CoreStateSlice): string {
		return Object.keys(state.maps.maps)[0]!;
	}

	it('AC1: an imported image has dimensions, checksum, source metadata, and a map link', () => {
		const env = makeEnvironment();
		const state = mapState();
		const mapId = firstMapId(state);
		const result = accept(
			dispatchCommand(state, env, {
				type: 'map.import-asset',
				actorId: DM_ACTOR.id,
				payload: {
					mapId,
					bytes: PNG,
					asset: { ...PNG_META, dimensions: { width: 1024, height: 768 } },
				},
			} satisfies CoreCommand),
		);
		const assetId = `fnv1a64-${hashAssetBytes(Uint8Array.from(PNG))}`;
		const asset = result.nextState.maps.assets[assetId]!;
		expect(asset).toBeDefined();
		expect(asset.dimensions).toEqual({ width: 1024, height: 768 });
		expect(asset.checksum).toBe(hashAssetBytes(Uint8Array.from(PNG)));
		expect(asset.source.importedBy).toBe(DM_ACTOR.id);
		// The map links to the asset (content-addressed reference).
		expect(result.nextState.maps.maps[mapId]!.assetIds).toContain(assetId);
	});

	it('content-addressed dedupe: importing identical bytes twice keeps a single asset record', () => {
		const env = makeEnvironment();
		const state = mapState();
		const mapId = firstMapId(state);
		const once = accept(
			dispatchCommand(state, env, {
				type: 'map.import-asset',
				actorId: DM_ACTOR.id,
				payload: { mapId, bytes: PNG, asset: PNG_META },
			} satisfies CoreCommand),
		);
		const twice = accept(
			dispatchCommand(once.nextState, env, {
				type: 'map.import-asset',
				actorId: DM_ACTOR.id,
				payload: { mapId, bytes: PNG, asset: PNG_META },
			} satisfies CoreCommand),
		);
		expect(Object.keys(twice.nextState.maps.assets)).toHaveLength(1);
		expect(twice.nextState.maps.maps[mapId]!.assetIds).toHaveLength(1);
	});

	it('AC2: an oversized import is rejected with a diagnostic before any storage mutation', () => {
		const env = makeEnvironment();
		const before = mapState();
		const mapId = firstMapId(before);
		const result = rejected(
			dispatchCommand(before, env, {
				type: 'map.import-asset',
				actorId: DM_ACTOR.id,
				payload: { mapId, bytes: PNG, asset: { ...PNG_META, maxBytes: 4 } },
			} satisfies CoreCommand),
		);
		expect(result.rejection.message).toMatch(/exceeds/);
		expect(Object.keys(result.nextState.maps.assets)).toHaveLength(0);
		expect(result.nextState).toBe(before); // byte-identical
	});

	it('AC4: an external format with NO declared adapter is rejected fail-closed, no partial map', () => {
		const env = withAdapters(); // empty registry — no external format declared
		const before = buildInitialState(DM_ACTOR);
		const result = rejected(
			dispatchCommand(before, env, {
				type: 'map.commit-import',
				actorId: DM_ACTOR.id,
				payload: {
					mapName: 'Imported VTT',
					formatId: 'vtt-scene',
					declaredElements: ['dimensions', 'walls'],
				},
			} satisfies CoreCommand),
		);
		expect(result.rejection.message).toMatch(/No declared adapter/);
		expect(Object.keys(result.nextState.maps.maps)).toHaveLength(0);
		expect(result.nextState).toBe(before); // byte-identical: no partial commit
	});

	it('a non-native MIME import (no adapter) is rejected fail-closed', () => {
		const env = makeEnvironment();
		const before = mapState();
		const mapId = firstMapId(before);
		const result = rejected(
			dispatchCommand(before, env, {
				type: 'map.import-asset',
				actorId: DM_ACTOR.id,
				payload: { mapId, bytes: PNG, asset: { mimeType: 'application/x-foundry', fileName: 'x.fvtt' } },
			} satisfies CoreCommand),
		);
		expect(result.rejection.code).toBe('invalid-payload');
		expect(result.nextState).toBe(before);
	});
});

// ---------------------------------------------------------------------------
// MAP-020: safe import — preview, capability summary, diagnostics, rollback
// ---------------------------------------------------------------------------
describe('MAP-020 preview + diagnostics + rollback', () => {
	const registry: MapImportAdapterRegistry = createMapImportAdapterRegistry([VTT_ADAPTER]);

	it('AC1: preview classifies each declared element importable / lossy / unsupported', () => {
		const preview = previewMapImport(registry, {
			formatId: 'vtt-scene',
			declaredElements: ['dimensions', 'walls', 'lights', 'notes', 'tokens'],
			importedBy: DM_ACTOR.id,
			importedAt: 'now',
		});
		if (!preview.ok) throw new Error('expected ok preview');
		const byKind = Object.fromEntries(preview.diagnostics.map((d) => [d.kind, d.support]));
		expect(byKind.dimensions).toBe('importable');
		expect(byKind.walls).toBe('lossy');
		expect(byKind.notes).toBe('lossy');
		expect(byKind.lights).toBe('unsupported');
		expect(byKind.tokens).toBe('unsupported');
		// Unsupported elements are REPORTED as dropped, not silently lost.
		expect(preview.droppedElements.sort()).toEqual(['lights', 'tokens']);
		// The capability summary tells the DM what the adapter can / can't do.
		expect(preview.capabilitySummary!.unsupported.sort()).toEqual(['lights', 'tokens']);
		expect(preview.capabilitySummary!.importable).toContain('dimensions');
	});

	it('preview never mutates: it is a pure read-only function', () => {
		const result1 = previewMapImport(registry, {
			formatId: 'vtt-scene',
			declaredElements: ['walls'],
			importedBy: DM_ACTOR.id,
			importedAt: 'now',
		});
		const result2 = previewMapImport(registry, {
			formatId: 'vtt-scene',
			declaredElements: ['walls'],
			importedBy: DM_ACTOR.id,
			importedAt: 'now',
		});
		expect(result1).toEqual(result2);
	});

	it('AC2: a previewed-but-not-committed import leaves storage byte-identical (cancel = rollback)', () => {
		const before = buildInitialState(DM_ACTOR).maps;
		const preview = previewMapImport(registry, {
			formatId: 'vtt-scene',
			declaredElements: ['dimensions', 'walls'],
			importedBy: DM_ACTOR.id,
			importedAt: 'now',
		});
		if (!preview.ok) throw new Error('expected ok preview');
		// Staging produces a candidate next state but NEVER mutates the input — discarding it is rollback.
		const staged = stageMapImport(before, {
			preview,
			mapId: null,
			mapName: 'Imported',
			importedBy: DM_ACTOR.id,
			importedAt: 'now',
		});
		expect(Object.keys(staged.nextState.maps)).toHaveLength(1); // candidate has the map
		expect(Object.keys(before.maps)).toHaveLength(0); // input untouched (rollback)
	});

	it('AC3: a committed import that creates a map writes the map + reports dropped elements', () => {
		const env = withAdapters(VTT_ADAPTER);
		const before = buildInitialState(DM_ACTOR);
		const result = accept(
			dispatchCommand(before, env, {
				type: 'map.commit-import',
				actorId: DM_ACTOR.id,
				payload: {
					mapName: 'Imported VTT',
					formatId: 'vtt-scene',
					declaredElements: ['dimensions', 'walls', 'lights'],
				},
			} satisfies CoreCommand),
		);
		const map = Object.values(result.nextState.maps.maps)[0]!;
		expect(map.name).toBe('Imported VTT');
		// Fail closed: an imported map is dm-only until revealed.
		expect(map.visibility).toBe('dm-only');
		// The durable op records the dropped (unsupported) element — reported, not silently lost.
		const op = result.nextState.sync.operations.at(-1)!;
		expect(op.opType).toBe('map.import.create');
		expect((op.value as { droppedElements: string[] }).droppedElements).toEqual(['lights']);
	});

	it('an import where every declared element is unsupported is rejected (nothing to import)', () => {
		const env = withAdapters(VTT_ADAPTER);
		const before = buildInitialState(DM_ACTOR);
		const result = rejected(
			dispatchCommand(before, env, {
				type: 'map.commit-import',
				actorId: DM_ACTOR.id,
				payload: { mapName: 'Empty', formatId: 'vtt-scene', declaredElements: ['lights', 'tokens'] },
			} satisfies CoreCommand),
		);
		expect(result.rejection.message).toMatch(/nothing would import/i);
		expect(Object.keys(result.nextState.maps.maps)).toHaveLength(0);
		expect(result.nextState).toBe(before);
	});

	it('a registry rejects a duplicate format declaration at construction (fail closed)', () => {
		expect(() => createMapImportAdapterRegistry([VTT_ADAPTER, VTT_ADAPTER])).toThrow(/registered twice/);
	});
});
