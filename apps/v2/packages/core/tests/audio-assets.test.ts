import { describe, expect, it } from 'vitest';
import {
	assetNeedsLicenseReview,
	buildAudioAsset,
	dispatchCommand,
	licenseReviewReason,
	listAudioAssetsForActor,
	listAudioAssetsNeedingReview,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * AUDIO-004 — IMPORT + MANAGE local audio assets with metadata, licensing notes, tags, and a source
 * reference. The licensing gate is the security crux: an undeclared/restricted/no-attribution license is
 * FLAGGED for review BEFORE export — never silently allowed. Tests are the primary fail-closed evidence.
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

const SAMPLE_BYTES = [1, 2, 3, 4, 5, 6, 7, 8];

function importAssetCommand(overrides: Record<string, unknown> = {}): CoreCommand {
	return {
		type: 'audio.import-asset',
		actorId: DM_ACTOR.id,
		payload: {
			sourceId: 'src-local',
			bytes: SAMPLE_BYTES,
			mimeType: 'audio/mpeg',
			fileName: 'tavern.mp3',
			...overrides,
		},
	};
}

describe('AUDIO-004 — pure asset model + licensing review', () => {
	it('AC1: records tags, license note, source, and content hash on import', () => {
		const built = buildAudioAsset({
			bytes: Uint8Array.from(SAMPLE_BYTES),
			mimeType: 'audio/mpeg',
			fileName: 'tavern.mp3',
			tags: ['Tavern', 'ambience', 'tavern'],
			license: { kind: 'owned', licenseNote: 'My own recording' },
			sourceId: 'src-local',
			importedBy: DM_ACTOR.id,
			importedAt: '2026-06-05T00:00:00.000Z',
		});
		if ('error' in built) throw new Error('expected a built asset');
		// Content hash IS the id; the bare checksum is recorded too.
		expect(built.id.startsWith('fnv1a64-')).toBe(true);
		expect(built.id).toBe(`fnv1a64-${built.checksum}`);
		// Tags are normalized (trim/lowercase/dedupe/sort).
		expect(built.tags).toEqual(['ambience', 'tavern']);
		// License note + source reference recorded.
		expect(built.license).toEqual({ kind: 'owned', licenseNote: 'My own recording', attribution: '' });
		expect(built.source.sourceId).toBe('src-local');
		expect(built.source.importedBy).toBe(DM_ACTOR.id);
	});

	it('content-addresses: identical bytes hash to the same id (dedupe), different bytes differ', () => {
		const base = {
			mimeType: 'audio/mpeg',
			fileName: 'a.mp3',
			sourceId: 'src-local',
			importedBy: DM_ACTOR.id,
			importedAt: '2026-06-05T00:00:00.000Z',
		};
		const a = buildAudioAsset({ ...base, bytes: Uint8Array.from(SAMPLE_BYTES) });
		const b = buildAudioAsset({ ...base, bytes: Uint8Array.from(SAMPLE_BYTES) });
		const c = buildAudioAsset({ ...base, bytes: Uint8Array.from([9, 9, 9]) });
		if ('error' in a || 'error' in b || 'error' in c) throw new Error('built');
		expect(a.id).toBe(b.id);
		expect(a.id).not.toBe(c.id);
	});

	it('rejects empty, oversized, and non-native MIME imports fail-closed (before any write)', () => {
		expect('error' in buildAudioAsset({
			bytes: Uint8Array.from([]),
			mimeType: 'audio/mpeg',
			fileName: 'x.mp3',
			sourceId: 's',
			importedBy: 'd',
			importedAt: 't',
		})).toBe(true);
		const tooLarge = buildAudioAsset({
			bytes: Uint8Array.from([1, 2, 3, 4]),
			mimeType: 'audio/mpeg',
			fileName: 'x.mp3',
			sourceId: 's',
			importedBy: 'd',
			importedAt: 't',
			maxBytes: 2,
		});
		expect('error' in tooLarge && tooLarge.error.kind).toBe('too-large');
		const badMime = buildAudioAsset({
			bytes: Uint8Array.from([1, 2, 3]),
			mimeType: 'application/zip',
			fileName: 'x.zip',
			sourceId: 's',
			importedBy: 'd',
			importedAt: 't',
		});
		expect('error' in badMime && badMime.error.kind).toBe('unsupported-mime');
	});

	it('AC2: an undeclared license is flagged for review; a declared owned license is not', () => {
		const undeclared = buildAudioAsset({
			bytes: Uint8Array.from(SAMPLE_BYTES),
			mimeType: 'audio/mpeg',
			fileName: 'x.mp3',
			sourceId: 's',
			importedBy: 'd',
			importedAt: 't',
		});
		if ('error' in undeclared) throw new Error('built');
		expect(undeclared.license.kind).toBe('unknown');
		expect(assetNeedsLicenseReview(undeclared)).toBe(true);
		expect(licenseReviewReason(undeclared)).toBe('license-undeclared');

		const owned = buildAudioAsset({
			bytes: Uint8Array.from(SAMPLE_BYTES),
			mimeType: 'audio/mpeg',
			fileName: 'x.mp3',
			license: { kind: 'owned' },
			sourceId: 's',
			importedBy: 'd',
			importedAt: 't',
		});
		if ('error' in owned) throw new Error('built');
		expect(assetNeedsLicenseReview(owned)).toBe(false);
		expect(licenseReviewReason(owned)).toBeNull();
	});

	it('AC2: a restricted license, and a cc-by missing attribution, are flagged', () => {
		const restricted = buildAudioAsset({
			bytes: Uint8Array.from(SAMPLE_BYTES),
			mimeType: 'audio/mpeg',
			fileName: 'x.mp3',
			license: { kind: 'restricted' },
			sourceId: 's',
			importedBy: 'd',
			importedAt: 't',
		});
		if ('error' in restricted) throw new Error('built');
		expect(licenseReviewReason(restricted)).toBe('license-restricted');

		const ccByNoAttribution = buildAudioAsset({
			bytes: Uint8Array.from(SAMPLE_BYTES),
			mimeType: 'audio/mpeg',
			fileName: 'x.mp3',
			license: { kind: 'cc-by' },
			sourceId: 's',
			importedBy: 'd',
			importedAt: 't',
		});
		if ('error' in ccByNoAttribution) throw new Error('built');
		expect(licenseReviewReason(ccByNoAttribution)).toBe('attribution-missing');

		const ccByWithAttribution = buildAudioAsset({
			bytes: Uint8Array.from(SAMPLE_BYTES),
			mimeType: 'audio/mpeg',
			fileName: 'x.mp3',
			license: { kind: 'cc-by', attribution: 'Jane Composer' },
			sourceId: 's',
			importedBy: 'd',
			importedAt: 't',
		});
		if ('error' in ccByWithAttribution) throw new Error('built');
		expect(assetNeedsLicenseReview(ccByWithAttribution)).toBe(false);
	});

	it('never fabricates a license: an unrecognized kind fails closed to unknown', () => {
		const asset = buildAudioAsset({
			bytes: Uint8Array.from(SAMPLE_BYTES),
			mimeType: 'audio/mpeg',
			fileName: 'x.mp3',
			license: { kind: 'cleared-by-magic' as never },
			sourceId: 's',
			importedBy: 'd',
			importedAt: 't',
		});
		if ('error' in asset) throw new Error('built');
		expect(asset.license.kind).toBe('unknown');
		expect(assetNeedsLicenseReview(asset)).toBe(true);
	});
});

describe('AUDIO-004 — import command + actor-filtered library read', () => {
	it('AC1: the DM imports an asset; it lands in the library with recorded metadata + an op', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const env = makeEnvironment();
		const result = accept(
			dispatch(
				state,
				env,
				importAssetCommand({ tags: ['battle'], license: { kind: 'royalty-free', licenseNote: 'pack-42' } }),
			),
		);
		expect(result.operationIds).toHaveLength(1);
		expect(result.events[0]).toMatchObject({ kind: 'audio.asset-imported', deduped: false });
		const assets = listAudioAssetsForActor(result.nextState.audio, result.nextState.permissions, DM_ACTOR.id);
		expect(assets).toHaveLength(1);
		expect(assets[0]).toMatchObject({
			fileName: 'tavern.mp3',
			tags: ['battle'],
			licenseKind: 'royalty-free',
			sourceId: 'src-local',
			needsLicenseReview: false,
		});
		// The op carries metadata only — never the bytes.
		const op = result.nextState.sync.operations.at(-1)!;
		expect(JSON.stringify(op.value)).not.toContain('"bytes"');
	});

	it('re-importing identical bytes dedupes to one record but refreshes the license metadata', () => {
		let state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		state = accept(dispatch(state, env, importAssetCommand())).nextState; // undeclared
		const second = accept(
			dispatch(state, env, importAssetCommand({ license: { kind: 'owned' } })),
		);
		expect(second.events[0]).toMatchObject({ kind: 'audio.asset-imported', deduped: true });
		const assets = listAudioAssetsForActor(second.nextState.audio, second.nextState.permissions, DM_ACTOR.id);
		expect(assets).toHaveLength(1);
		expect(assets[0]?.licenseKind).toBe('owned');
	});

	it('rejects a non-DM importer fail-closed (audio config is DM-only)', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const env = makeEnvironment();
		const asPlayer = rejected(
			dispatch(state, env, { ...importAssetCommand(), actorId: PLAYER_ACTOR.id }),
		);
		expect(asPlayer.rejection.code).toBe('actor-not-authorized');
		// The observer write-gate rejects before the reducer runs.
		const asObserver = rejected(
			dispatch(state, env, { ...importAssetCommand(), actorId: OBSERVER_ACTOR.id }),
		);
		expect(asObserver.rejection.code).toBe('actor-not-authorized');
	});

	it('rejects an invalid audio file with the invalid-audio-asset code (no write)', () => {
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const result = rejected(dispatch(state, env, importAssetCommand({ mimeType: 'video/mp4' })));
		expect(result.rejection.code).toBe('invalid-audio-asset');
		expect(Object.keys(result.nextState.audio.assets)).toHaveLength(0);
	});

	it('a player/observer sees an EMPTY audio library (no leak)', () => {
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const env = makeEnvironment();
		state = accept(dispatch(state, env, importAssetCommand())).nextState;
		expect(listAudioAssetsForActor(state.audio, state.permissions, PLAYER_ACTOR.id)).toHaveLength(0);
		expect(listAudioAssetsForActor(state.audio, state.permissions, OBSERVER_ACTOR.id)).toHaveLength(0);
	});

	it('AC2: review list surfaces only the assets flagged for licensing review', () => {
		let state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		state = accept(dispatch(state, env, importAssetCommand({ bytes: [1], license: { kind: 'owned' } }))).nextState;
		state = accept(dispatch(state, env, importAssetCommand({ bytes: [2] }))).nextState; // undeclared ⇒ flagged
		const needsReview = listAudioAssetsNeedingReview(state.audio, state.permissions, DM_ACTOR.id);
		expect(needsReview).toHaveLength(1);
		expect(needsReview[0]?.reviewReason).toBe('license-undeclared');
	});

	it('update-asset-metadata can clear the review flag by declaring a license', () => {
		let state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const imported = accept(dispatch(state, env, importAssetCommand()));
		state = imported.nextState;
		const assetId = imported.events[0] && 'assetId' in imported.events[0] ? imported.events[0].assetId : '';
		const updated = accept(
			dispatch(state, env, {
				type: 'audio.update-asset-metadata',
				actorId: DM_ACTOR.id,
				payload: { assetId, license: { kind: 'cc-by', attribution: 'Composer X' }, tags: ['epic'] },
			}),
		);
		expect(updated.events[0]).toMatchObject({ kind: 'audio.asset-metadata-updated', needsLicenseReview: false });
		const view = listAudioAssetsForActor(updated.nextState.audio, updated.nextState.permissions, DM_ACTOR.id);
		expect(view[0]).toMatchObject({ licenseKind: 'cc-by', attribution: 'Composer X', tags: ['epic'] });
	});

	it('rejects updating a missing asset fail-closed', () => {
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const result = rejected(
			dispatch(state, env, {
				type: 'audio.update-asset-metadata',
				actorId: DM_ACTOR.id,
				payload: { assetId: 'nope', license: { kind: 'owned' } },
			}),
		);
		expect(result.rejection.code).toBe('audio-asset-not-found');
	});
});
