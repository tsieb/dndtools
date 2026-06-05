import { describe, expect, it } from 'vitest';
import {
	buildAudioAssociation,
	configureAudioSource,
	dispatchCommand,
	ensureAudioState,
	listAudioAssociationsForActor,
	resolveActivatedSceneAudioForActor,
	resolveAudioAssociations,
	type AudioAssociation,
	type AudioAssociationActivation,
	type AudioSource,
	type AudioState,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * AUDIO-001 — SCENE / MAP / MAP-LAYER AUDIO ASSOCIATION. The DM associates an ambient track / playlist /
 * atmosphere preset with a Scene, map, or map layer. AC1: when the DM activates the Scene, the preset is
 * AVAILABLE to the audio widget. AC2: when an audio asset is missing on a device, the UI shows a MISSING
 * ASSET state.
 *
 * The tests are the primary fail-closed + DETERMINISM evidence: an association can never surface a silent
 * unlicensed (AUDIO-004), out-of-scope/unsupported (AUDIO-009), or offline/missing (AUDIO-010) cue as
 * playable; per-actor filtering keeps the DM-only config off a player; and identical activations produce
 * identical audio resolution.
 */

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function rejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected');
	return result;
}

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

/** The first element, asserted present (the tsconfig uses noUncheckedIndexedAccess). */
function first<T>(items: readonly T[]): T {
	const value = items[0];
	if (value === undefined) throw new Error('expected at least one element');
	return value;
}

/** A cleared local asset (license owned ⇒ never flagged for review). */
const CLEARED_ASSET = {
	id: 'asset-cleared',
	mimeType: 'audio/mpeg',
	fileName: 'tavern.mp3',
	title: 'Tavern',
	byteLength: 10,
	checksum: 'abc',
	license: { kind: 'owned' as const, licenseNote: '', attribution: '' },
	tags: [],
	source: { sourceId: 's-local', importedAt: 't', importedBy: 'd' },
	schemaVersion: 1 as const,
};

/** An unlicensed local asset (license unknown ⇒ flagged for review — must never surface as a playable cue). */
const FLAGGED_ASSET = {
	...CLEARED_ASSET,
	id: 'asset-flagged',
	license: { kind: 'unknown' as const, licenseNote: '', attribution: '' },
};

function localSource(): AudioSource {
	const result = configureAudioSource({
		id: 's-local',
		type: 'local-file',
		displayName: 'Local',
		cacheBehavior: 'local',
		createdBy: 'd',
		createdAt: 't',
	});
	if (!result.ok) throw new Error('expected ok');
	return result.source;
}

function streamSource(): AudioSource {
	const result = configureAudioSource({
		id: 's-stream',
		type: 'web-stream',
		displayName: 'Stream',
		url: 'https://example.test/stream',
		cacheBehavior: 'cache-required',
		createdBy: 'd',
		createdAt: 't',
	});
	if (!result.ok) throw new Error('expected ok');
	return result.source;
}

/** A library with both sources + both assets, plus the given associations. */
function library(associations: Record<string, AudioAssociation> = {}): AudioState {
	return ensureAudioState({
		assets: { [CLEARED_ASSET.id]: CLEARED_ASSET, [FLAGGED_ASSET.id]: FLAGGED_ASSET },
		sources: { 's-local': localSource(), 's-stream': streamSource() },
		associations,
		schemaVersion: 1 as const,
	});
}

function association(overrides: Partial<AudioAssociation> = {}): AudioAssociation {
	return {
		id: 'assoc-1',
		label: 'Tavern ambience',
		presetKind: 'ambient',
		targetKind: 'scene',
		targetId: 'scene-1',
		layerId: null,
		sourceId: 's-local',
		assetId: CLEARED_ASSET.id,
		createdBy: 'd',
		createdAt: 't',
		updatedAt: 't',
		revision: 1,
		...overrides,
	};
}

/** A default online activation with the asset locally available (the happy path). */
function activation(
	overrides: Partial<AudioAssociationActivation> = {},
): AudioAssociationActivation {
	return {
		targetKind: 'scene',
		targetId: 'scene-1',
		layerId: null,
		online: true,
		assetLocallyAvailable: true,
		assetCached: false,
		cacheEvicted: false,
		...overrides,
	};
}

describe('AUDIO-001 buildAudioAssociation (fail closed)', () => {
	it('builds a scene association with a cleared local asset', () => {
		const result = buildAudioAssociation({
			id: 'a1',
			targetKind: 'scene',
			targetId: 'scene-1',
			sourceId: 's-local',
			assetId: CLEARED_ASSET.id,
			createdBy: 'd',
			createdAt: 't',
			library: library(),
		});
		if (!result.ok) throw new Error(`expected ok: ${result.message}`);
		expect(result.association.targetKind).toBe('scene');
		expect(result.association.layerId).toBeNull();
		expect(result.association.presetKind).toBe('ambient');
	});

	it('rejects an undeclared target kind', () => {
		const result = buildAudioAssociation({
			id: 'a1',
			targetKind: 'note',
			targetId: 'n-1',
			sourceId: 's-local',
			assetId: CLEARED_ASSET.id,
			createdBy: 'd',
			createdAt: 't',
			library: library(),
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('unreachable');
		expect(result.reason).toBe('unsupported-target');
	});

	it('requires a layer id for a map-layer association', () => {
		const result = buildAudioAssociation({
			id: 'a1',
			targetKind: 'map-layer',
			targetId: 'map-1',
			sourceId: 's-local',
			assetId: CLEARED_ASSET.id,
			createdBy: 'd',
			createdAt: 't',
			library: library(),
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('unreachable');
		expect(result.reason).toBe('missing-layer-id');
	});

	it('rejects a stray layer id on a scene/map association', () => {
		const result = buildAudioAssociation({
			id: 'a1',
			targetKind: 'scene',
			targetId: 'scene-1',
			layerId: 'layer-1',
			sourceId: 's-local',
			assetId: CLEARED_ASSET.id,
			createdBy: 'd',
			createdAt: 't',
			library: library(),
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('unreachable');
		expect(result.reason).toBe('unexpected-layer-id');
	});

	it('rejects a dangling source and a dangling asset', () => {
		const danglingSource = buildAudioAssociation({
			id: 'a1',
			targetKind: 'scene',
			targetId: 'scene-1',
			sourceId: 's-missing',
			assetId: CLEARED_ASSET.id,
			createdBy: 'd',
			createdAt: 't',
			library: library(),
		});
		expect(rejectedBuildReason(danglingSource)).toBe('source-not-found');

		const danglingAsset = buildAudioAssociation({
			id: 'a1',
			targetKind: 'scene',
			targetId: 'scene-1',
			sourceId: 's-local',
			assetId: 'asset-missing',
			createdBy: 'd',
			createdAt: 't',
			library: library(),
		});
		expect(rejectedBuildReason(danglingAsset)).toBe('asset-not-found');
	});

	it('requires an asset for a local/bundled cue but not a web-stream cue', () => {
		const localNoAsset = buildAudioAssociation({
			id: 'a1',
			targetKind: 'scene',
			targetId: 'scene-1',
			sourceId: 's-local',
			assetId: null,
			createdBy: 'd',
			createdAt: 't',
			library: library(),
		});
		expect(rejectedBuildReason(localNoAsset)).toBe('asset-required');

		const streamNoAsset = buildAudioAssociation({
			id: 'a2',
			targetKind: 'scene',
			targetId: 'scene-1',
			sourceId: 's-stream',
			assetId: null,
			createdBy: 'd',
			createdAt: 't',
			library: library(),
		});
		expect(streamNoAsset.ok).toBe(true);
	});

	it('preserves created-by/at + bumps revision on update', () => {
		const previous = association({ createdBy: 'orig-dm', createdAt: 'original', revision: 3 });
		const result = buildAudioAssociation({
			id: previous.id,
			label: 'Renamed',
			targetKind: 'scene',
			targetId: 'scene-1',
			sourceId: 's-local',
			assetId: CLEARED_ASSET.id,
			createdBy: 'new-dm',
			createdAt: 'later',
			library: library(),
			previous,
		});
		if (!result.ok) throw new Error('expected ok');
		expect(result.association.createdBy).toBe('orig-dm');
		expect(result.association.createdAt).toBe('original');
		expect(result.association.revision).toBe(4);
		expect(result.association.label).toBe('Renamed');
	});
});

function rejectedBuildReason(result: ReturnType<typeof buildAudioAssociation>): string {
	if (result.ok) throw new Error('expected rejected');
	return result.reason;
}

describe('AUDIO-001 resolveAudioAssociations (AC1/AC2, gate composition)', () => {
	it('AC1: a Scene with a cleared preset resolves it AVAILABLE/playable on activation', () => {
		const presets = resolveAudioAssociations(activation(), { 'assoc-1': association() }, library());
		expect(presets).toHaveLength(1);
		expect(first(presets).availability).toBe('available');
		expect(first(presets).playable).toBe(true);
	});

	it('AC2: a missing local asset on a device resolves the MISSING-ASSET state (no retry/substitution)', () => {
		const presets = resolveAudioAssociations(
			activation({ assetLocallyAvailable: false }),
			{ 'assoc-1': association() },
			library(),
		);
		expect(first(presets).availability).toBe('missing-asset');
		expect(first(presets).playable).toBe(false);
		expect(first(presets).message).toContain('missing');
	});

	it('AC2: an evicted cache resolves MISSING-ASSET (preserves, never substitutes)', () => {
		const presets = resolveAudioAssociations(
			activation({ cacheEvicted: true }),
			{ 'assoc-1': association() },
			library(),
		);
		expect(first(presets).availability).toBe('missing-asset');
	});

	it('AUDIO-004: an unlicensed asset is BLOCKED, never a silent playable cue', () => {
		const presets = resolveAudioAssociations(
			activation(),
			{ 'assoc-1': association({ assetId: FLAGGED_ASSET.id }) },
			library(),
		);
		expect(first(presets).availability).toBe('license-blocked');
		expect(first(presets).playable).toBe(false);
		expect(first(presets).licenseReviewReason).toBe('license-undeclared');
	});

	it('AUDIO-004: an asset deleted after association resolves MISSING-ASSET', () => {
		const lib = library(); // no asset-gone in this library
		const presets = resolveAudioAssociations(
			activation(),
			{ 'assoc-1': association({ assetId: 'asset-gone' }) },
			lib,
		);
		expect(first(presets).availability).toBe('missing-asset');
	});

	it('AUDIO-009: an unsupported/disabled source resolves SOURCE-UNSUPPORTED', () => {
		// A source whose type no longer resolves (corrupt/legacy record) fails closed.
		const lib = ensureAudioState({
			assets: { [CLEARED_ASSET.id]: CLEARED_ASSET },
			sources: {
				's-local': { ...localSource(), type: 'spotify-private' as never, playbackEnabled: true },
			},
			associations: {},
			schemaVersion: 1 as const,
		});
		const presets = resolveAudioAssociations(activation(), { 'assoc-1': association() }, lib);
		expect(first(presets).availability).toBe('source-unsupported');
	});

	it('AUDIO-010: a web-stream cue offline-uncached resolves UNAVAILABLE', () => {
		const presets = resolveAudioAssociations(
			activation({ online: false, assetCached: false, assetLocallyAvailable: false }),
			{ 'assoc-1': association({ sourceId: 's-stream', assetId: null }) },
			library(),
		);
		expect(first(presets).availability).toBe('unavailable');
	});

	it('matches only the activated target: a different Scene id resolves no presets', () => {
		const presets = resolveAudioAssociations(
			activation({ targetId: 'scene-other' }),
			{ 'assoc-1': association() },
			library(),
		);
		expect(presets).toHaveLength(0);
	});

	it('a map-layer association fires only for its exact layer', () => {
		const layerAssoc = association({
			id: 'assoc-layer',
			targetKind: 'map-layer',
			targetId: 'map-1',
			layerId: 'layer-ambush',
		});
		const associations = { 'assoc-layer': layerAssoc };
		const matching = resolveAudioAssociations(
			activation({ targetKind: 'map-layer', targetId: 'map-1', layerId: 'layer-ambush' }),
			associations,
			library(),
		);
		expect(matching).toHaveLength(1);
		expect(first(matching).availability).toBe('available');

		const otherLayer = resolveAudioAssociations(
			activation({ targetKind: 'map-layer', targetId: 'map-1', layerId: 'layer-streets' }),
			associations,
			library(),
		);
		expect(otherLayer).toHaveLength(0);
	});

	it('DETERMINISM: identical activations produce identical resolution (stable id order)', () => {
		const associations = {
			'assoc-b': association({ id: 'assoc-b', label: 'B' }),
			'assoc-a': association({ id: 'assoc-a', label: 'A' }),
		};
		const first = resolveAudioAssociations(activation(), associations, library());
		const second = resolveAudioAssociations(activation(), associations, library());
		expect(first).toEqual(second);
		// Stable id order regardless of insertion order.
		expect(first.map((p) => p.associationId)).toEqual(['assoc-a', 'assoc-b']);
	});
});

describe('AUDIO-001 actor-filtered read model (DM-only, fail closed)', () => {
	it('lists associations for the DM and an empty list for a player', () => {
		const lib = library({ 'assoc-1': association() });
		const dmList = listAudioAssociationsForActor(
			lib,
			buildPermissions(),
			DM_ACTOR.id,
		);
		expect(dmList).toHaveLength(1);
		const playerList = listAudioAssociationsForActor(lib, buildPermissions(), PLAYER_ACTOR.id);
		expect(playerList).toEqual([]);
	});

	it('filters associations by target kind + id', () => {
		const lib = library({
			'assoc-1': association({ id: 'assoc-1', targetId: 'scene-1' }),
			'assoc-2': association({ id: 'assoc-2', targetId: 'scene-2' }),
		});
		const filtered = listAudioAssociationsForActor(lib, buildPermissions(), DM_ACTOR.id, {
			targetKind: 'scene',
			targetId: 'scene-1',
		});
		expect(filtered.map((a) => a.id)).toEqual(['assoc-1']);
	});

	it('resolves activated-scene presets for the DM and null for a player (no leak)', () => {
		const lib = library({ 'assoc-1': association() });
		const dmPresets = resolveActivatedSceneAudioForActor(
			lib,
			buildPermissions(),
			DM_ACTOR.id,
			activation(),
		);
		expect(dmPresets).not.toBeNull();
		expect(first(dmPresets ?? []).availability).toBe('available');
		const playerPresets = resolveActivatedSceneAudioForActor(
			lib,
			buildPermissions(),
			PLAYER_ACTOR.id,
			activation(),
		);
		expect(playerPresets).toBeNull();
	});
});

function buildPermissions() {
	return buildInitialState(DM_ACTOR, PLAYER_ACTOR).permissions;
}

describe('AUDIO-001 commands (DM-only, fail closed, audit)', () => {
	function seededState(): { state: CoreStateSlice; env: CoreEnvironment } {
		const env = makeEnvironment();
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		// Seed a configured source + an imported cleared asset so an association has a live cue to bind to.
		state = accept(
			dispatch(state, env, {
				type: 'audio.configure-source',
				actorId: DM_ACTOR.id,
				payload: {
					sourceId: 'src-bundled',
					type: 'bundled-preset',
					displayName: 'Tavern',
					cacheBehavior: 'local',
				},
			}),
		).nextState;
		state = accept(
			dispatch(state, env, {
				type: 'audio.import-asset',
				actorId: DM_ACTOR.id,
				payload: {
					sourceId: 'src-bundled',
					bytes: [82, 73, 70, 70],
					mimeType: 'audio/mpeg',
					fileName: 'tavern.mp3',
					title: 'Tavern',
					license: { kind: 'owned' },
				},
			}),
		).nextState;
		return { state, env };
	}

	function seededAssetId(state: CoreStateSlice): string {
		const asset = Object.values(state.audio.assets)[0];
		if (!asset) throw new Error('expected a seeded asset');
		return asset.id;
	}

	it('the DM associates a Scene cue; it is durable + emits an audit event', () => {
		const { state, env } = seededState();
		const result = accept(
			dispatch(state, env, {
				type: 'audio.associate-scene',
				actorId: DM_ACTOR.id,
				payload: {
					targetKind: 'scene',
					targetId: 'scene-1',
					sourceId: 'src-bundled',
					assetId: seededAssetId(state),
					label: 'Tavern ambience',
				},
			}),
		);
		const associations = Object.values(result.nextState.audio.associations);
		expect(associations).toHaveLength(1);
		expect(first(associations).targetId).toBe('scene-1');
		expect(result.events.some((e) => e.kind === 'audio.association-changed')).toBe(true);
		expect(result.operationIds).toHaveLength(1);
	});

	it('a player cannot associate a cue (DM-only)', () => {
		const { state, env } = seededState();
		const result = rejected(
			dispatch(state, env, {
				type: 'audio.associate-scene',
				actorId: PLAYER_ACTOR.id,
				payload: {
					targetKind: 'scene',
					targetId: 'scene-1',
					sourceId: 'src-bundled',
					assetId: seededAssetId(state),
				},
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('rejects a dangling source reference fail-closed (no record written)', () => {
		const { state, env } = seededState();
		const result = rejected(
			dispatch(state, env, {
				type: 'audio.associate-scene',
				actorId: DM_ACTOR.id,
				payload: {
					targetKind: 'scene',
					targetId: 'scene-1',
					sourceId: 'src-missing',
					assetId: seededAssetId(state),
				},
			}),
		);
		expect(result.rejection.code).toBe('audio-asset-not-found');
		expect(Object.keys(result.nextState.audio.associations)).toHaveLength(0);
	});

	it('rejects a map-layer association missing its layer id', () => {
		const { state, env } = seededState();
		const result = rejected(
			dispatch(state, env, {
				type: 'audio.associate-scene',
				actorId: DM_ACTOR.id,
				payload: {
					targetKind: 'map-layer',
					targetId: 'map-1',
					sourceId: 'src-bundled',
					assetId: seededAssetId(state),
				},
			}),
		);
		expect(result.rejection.code).toBe('invalid-audio-association');
	});

	it('updates an existing association by id (revision bumps, created-by preserved)', () => {
		const { state, env } = seededState();
		const created = accept(
			dispatch(state, env, {
				type: 'audio.associate-scene',
				actorId: DM_ACTOR.id,
				payload: {
					targetKind: 'scene',
					targetId: 'scene-1',
					sourceId: 'src-bundled',
					assetId: seededAssetId(state),
				},
			}),
		);
		const id = Object.keys(created.nextState.audio.associations)[0]!;
		const updated = accept(
			dispatch(created.nextState, env, {
				type: 'audio.associate-scene',
				actorId: DM_ACTOR.id,
				payload: {
					associationId: id,
					label: 'Renamed',
					targetKind: 'scene',
					targetId: 'scene-1',
					sourceId: 'src-bundled',
					assetId: seededAssetId(state),
				},
			}),
		);
		expect(Object.keys(updated.nextState.audio.associations)).toHaveLength(1);
		const updatedAssociation = first(Object.values(updated.nextState.audio.associations));
		expect(updatedAssociation.label).toBe('Renamed');
		expect(updatedAssociation.revision).toBe(2);
	});

	it('disassociates a cue (DM-only); a missing id is rejected fail-closed', () => {
		const { state, env } = seededState();
		const created = accept(
			dispatch(state, env, {
				type: 'audio.associate-scene',
				actorId: DM_ACTOR.id,
				payload: {
					targetKind: 'scene',
					targetId: 'scene-1',
					sourceId: 'src-bundled',
					assetId: seededAssetId(state),
				},
			}),
		);
		const id = Object.keys(created.nextState.audio.associations)[0]!;
		const removed = accept(
			dispatch(created.nextState, env, {
				type: 'audio.disassociate-scene',
				actorId: DM_ACTOR.id,
				payload: { associationId: id },
			}),
		);
		expect(Object.keys(removed.nextState.audio.associations)).toHaveLength(0);
		expect(removed.events.some((e) => e.kind === 'audio.association-removed')).toBe(true);

		const missing = rejected(
			dispatch(removed.nextState, env, {
				type: 'audio.disassociate-scene',
				actorId: DM_ACTOR.id,
				payload: { associationId: id },
			}),
		);
		expect(missing.rejection.code).toBe('audio-association-not-found');

		const playerRemove = rejected(
			dispatch(created.nextState, env, {
				type: 'audio.disassociate-scene',
				actorId: PLAYER_ACTOR.id,
				payload: { associationId: id },
			}),
		);
		expect(playerRemove.rejection.code).toBe('actor-not-authorized');
	});
});

describe('AUDIO-001 hydration (fail closed, older vaults)', () => {
	it('an older vault with no associations field hydrates to an empty map', () => {
		const hydrated = ensureAudioState({ assets: {}, sources: {}, schemaVersion: 1 as const });
		expect(hydrated.associations).toEqual({});
	});

	it('drops a persisted record with an undeclared target kind', () => {
		const corrupt = { ...association(), targetKind: 'note' as never };
		const hydrated = ensureAudioState({ associations: { bad: corrupt } });
		expect(hydrated.associations.bad).toBeUndefined();
	});

	it('drops a persisted map-layer record missing its layer id', () => {
		const corrupt = association({ targetKind: 'map-layer', targetId: 'map-1', layerId: null });
		const hydrated = ensureAudioState({ associations: { bad: corrupt } });
		expect(hydrated.associations.bad).toBeUndefined();
	});

	it('clears a stray layer id and defaults an invalid preset kind on a scene record', () => {
		const corrupt = association({ layerId: 'stray' as never, presetKind: 'symphony' as never });
		const hydrated = ensureAudioState({ associations: { 'assoc-1': corrupt } });
		expect(first(Object.values(hydrated.associations)).layerId).toBeNull();
		expect(first(Object.values(hydrated.associations)).presetKind).toBe('ambient');
	});
});
