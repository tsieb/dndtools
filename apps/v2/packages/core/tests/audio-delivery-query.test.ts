import { describe, expect, it } from 'vitest';
import {
	configureAudioSource,
	listAudioDeliveryForDm,
	resolveAudioDeliveryForActor,
	type AudioActiveTrack,
	type AudioAsset,
	type AudioParticipantDeviceInput,
	type AudioSource,
	type AudioState,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildPermissionState,
} from '../src/testing/fixtures';

/**
 * AUDIO-006 / AUDIO-007 / AUDIO-012 — the ACTOR-FILTERED audio-delivery read model.
 *
 * AUDIO-006 AC2: the DM inspecting session status sees a participant who cannot play audio WITHOUT exposing
 * device secrets. AUDIO-007 / AUDIO-012: a participant sees only their OWN resolved decision, and resolving
 * it never mutates DM-authored session audio state. The tests are the primary VISIBILITY (no-leak) +
 * fail-closed evidence.
 */

const CLEARED_ASSET: AudioAsset = {
	id: 'asset-cleared',
	mimeType: 'audio/mpeg',
	fileName: 'tavern.mp3',
	title: 'Tavern',
	byteLength: 10,
	checksum: 'abc',
	license: { kind: 'owned', licenseNote: '', attribution: '' },
	tags: [],
	source: { sourceId: 's-local', importedAt: 't', importedBy: 'd' },
	schemaVersion: 1,
};

const FLAGGED_ASSET: AudioAsset = {
	...CLEARED_ASSET,
	id: 'asset-flagged',
	license: { kind: 'unknown', licenseNote: '', attribution: '' },
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

function library(): AudioState {
	const source = localSource();
	return {
		assets: { [CLEARED_ASSET.id]: CLEARED_ASSET, [FLAGGED_ASSET.id]: FLAGGED_ASSET },
		sources: { [source.id]: source },
		automationRules: {},
		schemaVersion: 1,
	};
}

const TRACK: AudioActiveTrack = { sourceId: 's-local', assetId: 'asset-cleared' };

/** A granted, capable device input for a given actor. */
function capableDevice(actorId: string, overrides: Partial<AudioParticipantDeviceInput> = {}): AudioParticipantDeviceInput {
	return {
		actorId,
		assetLocallyAvailable: true,
		assetCached: false,
		cacheEvicted: false,
		online: true,
		capability: { canAutoplay: true, canPlayInBackground: true, canRouteOutput: true, canPlayAudio: true },
		preferences: { consent: 'granted', muted: false, localVolume: 1, outputRouteId: null },
		safety: { consecutiveFailures: 0, resourceExceeded: false },
		backgrounded: false,
		...overrides,
	};
}

describe('AUDIO-006 AC2 — the DM sees every participant delivery state without device secrets', () => {
	it('lists each participant delivery state in stable actor-id order', () => {
		const permissions = buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const devices = [
			capableDevice('actor-zed'),
			// A participant who DECLINED audio (cannot play) is visible to the DM.
			capableDevice('actor-amy', { preferences: { consent: 'declined', muted: false, localVolume: 1, outputRouteId: null } }),
		];
		const roster = listAudioDeliveryForDm(library(), permissions, DM_ACTOR.id, TRACK, devices);
		expect(roster.map((r) => r.actorId)).toEqual(['actor-amy', 'actor-zed']);
		const amy = roster.find((r) => r.actorId === 'actor-amy')!;
		expect(amy.disposition).toBe('consent-blocked');
		expect(amy.sounding).toBe(false);
		// No device secret leaks: the snapshot carries only the disposition / routing / message / sounding.
		expect(Object.keys(amy).sort()).toEqual(['actorId', 'disposition', 'message', 'routing', 'sounding']);
		expect(amy).not.toHaveProperty('capability');
		expect(amy).not.toHaveProperty('preferences');
	});

	it('a participant who cannot play (background-blocked / unsupported) is visible to the DM', () => {
		const permissions = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
		const devices = [
			capableDevice('actor-bg', {
				backgrounded: true,
				capability: { canAutoplay: true, canPlayInBackground: false, canRouteOutput: true, canPlayAudio: true },
			}),
			capableDevice('actor-locked', {
				capability: { canAutoplay: false, canPlayInBackground: false, canRouteOutput: false, canPlayAudio: false },
			}),
		];
		const roster = listAudioDeliveryForDm(library(), permissions, DM_ACTOR.id, TRACK, devices);
		expect(roster.find((r) => r.actorId === 'actor-bg')!.disposition).toBe('background-blocked');
		expect(roster.find((r) => r.actorId === 'actor-locked')!.disposition).toBe('platform-unsupported');
	});

	it('a non-DM actor gets an EMPTY roster (the session-status surface is DM-only — no leak)', () => {
		const permissions = buildPermissionState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const devices = [capableDevice('actor-zed')];
		expect(listAudioDeliveryForDm(library(), permissions, PLAYER_ACTOR.id, TRACK, devices)).toEqual([]);
		expect(listAudioDeliveryForDm(library(), permissions, OBSERVER_ACTOR.id, TRACK, devices)).toEqual([]);
		// An unknown actor fails closed to empty.
		expect(listAudioDeliveryForDm(library(), permissions, 'ghost', TRACK, devices)).toEqual([]);
	});

	it('a participant whose track source no longer resolves is omitted (fail closed)', () => {
		const permissions = buildPermissionState(DM_ACTOR);
		const roster = listAudioDeliveryForDm(library(), permissions, DM_ACTOR.id, { sourceId: 's-missing', assetId: null }, [
			capableDevice('actor-zed'),
		]);
		expect(roster).toEqual([]);
	});

	it('an unlicensed active track resolves track-unavailable for the participant (never plays)', () => {
		const permissions = buildPermissionState(DM_ACTOR);
		const roster = listAudioDeliveryForDm(
			library(),
			permissions,
			DM_ACTOR.id,
			{ sourceId: 's-local', assetId: 'asset-flagged' },
			[capableDevice('actor-zed')],
		);
		expect(roster[0]!.disposition).toBe('track-unavailable');
		expect(roster[0]!.sounding).toBe(false);
	});
});

describe('AUDIO-007 / AUDIO-012 — a participant resolves only their OWN decision (no DM-state mutation)', () => {
	it('a player resolves their own granted, capable decision to playing at their local volume', () => {
		const permissions = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
		const decision = resolveAudioDeliveryForActor(library(), permissions, PLAYER_ACTOR.id, TRACK, {
			assetLocallyAvailable: true,
			assetCached: false,
			cacheEvicted: false,
			online: true,
			capability: { canAutoplay: true, canPlayInBackground: true, canRouteOutput: true, canPlayAudio: true },
			preferences: { consent: 'granted', muted: false, localVolume: 0.3, outputRouteId: null },
		});
		expect(decision?.disposition).toBe('playing');
		expect(decision?.effectiveVolume).toBe(0.3);
	});

	it('AC2: a participant changing local volume does not change the authoritative library/source record', () => {
		const lib = library();
		const sourceBefore = JSON.parse(JSON.stringify(lib.sources['s-local']));
		const permissions = buildPermissionState(DM_ACTOR, PLAYER_ACTOR);
		resolveAudioDeliveryForActor(lib, permissions, PLAYER_ACTOR.id, TRACK, {
			assetLocallyAvailable: true,
			assetCached: false,
			cacheEvicted: false,
			online: true,
			capability: { canAutoplay: true, canPlayInBackground: true, canRouteOutput: true, canPlayAudio: true },
			preferences: { consent: 'granted', muted: false, localVolume: 0.1, outputRouteId: 'spk-2' },
		});
		// The DM-authored source is byte-for-byte unchanged — the read mutated no session audio state.
		expect(lib.sources['s-local']).toEqual(sourceBefore);
	});

	it('an observer (any authenticated participant) may resolve their own delivery decision', () => {
		const permissions = buildPermissionState(DM_ACTOR, OBSERVER_ACTOR);
		const decision = resolveAudioDeliveryForActor(library(), permissions, OBSERVER_ACTOR.id, TRACK, {
			assetLocallyAvailable: true,
			assetCached: false,
			cacheEvicted: false,
			online: true,
			capability: { canAutoplay: true, canPlayInBackground: true, canRouteOutput: true, canPlayAudio: true },
			preferences: { consent: 'declined', muted: false, localVolume: 1, outputRouteId: null },
		});
		expect(decision?.disposition).toBe('consent-blocked');
	});

	it('an unknown actor fails closed to null (no decision resolved for an unauthenticated actor)', () => {
		const permissions = buildPermissionState(DM_ACTOR);
		const decision = resolveAudioDeliveryForActor(library(), permissions, 'ghost', TRACK, {
			assetLocallyAvailable: true,
			assetCached: false,
			cacheEvicted: false,
			online: true,
			capability: { canAutoplay: true, canPlayInBackground: true, canRouteOutput: true, canPlayAudio: true },
			preferences: { consent: 'granted', muted: false, localVolume: 1, outputRouteId: null },
		});
		expect(decision).toBeNull();
	});
});
