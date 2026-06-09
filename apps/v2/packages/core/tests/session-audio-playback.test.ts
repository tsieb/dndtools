import { describe, expect, it } from 'vitest';
import {
	dispatchCommand,
	ensureSessionAudioState,
	getSessionAudioView,
	isSessionAudioPlaying,
	type AudioParticipantDeviceInput,
	type CommandResult,
	type CoreCommand,
	type CoreStateSlice,
	type SessionAudioParticipantView,
} from '../src';
import {
	DM_ACTOR,
	OBSERVER_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';
import type { CoreEnvironment } from '../src/commands/types';
import type { Actor } from '../src/state/permission-state';

/**
 * AUDIO-002 / AUDIO-003 — the SESSION-OWNED audio playback integration.
 *
 * These tests are the primary evidence that the playback path COMPOSES the prior AUDIO models (the
 * AUDIO-009/010/004 gates + the AUDIO-006/007/012/013 per-participant decision) into session-owned state,
 * fail-closed: per-actor filtering (a player sees only the player-safe track + their own decision), gate
 * respect (an unlicensed / offline / out-of-scope track never plays), determinism (identical command
 * sequences ⇒ identical state), and the AUDIO-003 acceptance criteria (reconnect, widget-removal survival,
 * offline delivery queue).
 */

const PLAYER_B: Actor = { id: 'actor-player-b', role: 'player', displayName: 'Player B' };

function accept(result: CommandResult): Extract<CommandResult, { status: 'accepted' }> {
	if (result.status !== 'accepted') {
		throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
	}
	return result;
}

function expectRejected(result: CommandResult): Extract<CommandResult, { status: 'rejected' }> {
	if (result.status !== 'rejected') throw new Error('expected rejected, got accepted');
	return result;
}

function dispatch(state: CoreStateSlice, env: CoreEnvironment, command: CoreCommand): CommandResult {
	return dispatchCommand(state, env, command);
}

/** An active session with a configured, playback-enabled local source and a license-cleared asset. */
function activeSessionWithAudio(env: CoreEnvironment): CoreStateSlice {
	const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, PLAYER_B, OBSERVER_ACTOR);
	const home = accept(
		dispatch(base, env, { type: 'command-center.ensure-home', actorId: DM_ACTOR.id, payload: {} }),
	).nextState;
	const sceneId = home.commandCenter.homeSceneId!;
	const active = accept(
		dispatch(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: sceneId },
		}),
	).nextState;
	const withSource = accept(
		dispatch(active, env, {
			type: 'audio.configure-source',
			actorId: DM_ACTOR.id,
			payload: {
				sourceId: 's-local',
				type: 'local-file',
				displayName: 'Local',
				cacheBehavior: 'local',
			},
		}),
	).nextState;
	const withAsset = accept(
		dispatch(withSource, env, {
			type: 'audio.import-asset',
			actorId: DM_ACTOR.id,
			payload: {
				sourceId: 's-local',
				bytes: [1, 2, 3, 4],
				mimeType: 'audio/mpeg',
				fileName: 'tavern.mp3',
				title: 'Tavern',
				license: { kind: 'owned' },
			},
		}),
	).nextState;
	return withAsset;
}

/** The single imported asset's id (content-addressed, so we read it back from the library). */
function assetId(state: CoreStateSlice): string {
	const ids = Object.keys(state.audio.assets);
	if (ids.length !== 1) throw new Error('expected exactly one imported asset');
	return ids[0]!;
}

function playTrack(state: CoreStateSlice, env: CoreEnvironment, asset: string): CoreStateSlice {
	return accept(
		dispatch(state, env, {
			type: 'session.audio.play',
			actorId: DM_ACTOR.id,
			payload: { sourceId: 's-local', assetId: asset, volume: 0.8 },
		}),
	).nextState;
}

describe('AUDIO-002 — DM session playback controls', () => {
	it('AC1: the DM presses play and session audio state records the active track', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const played = playTrack(state, env, assetId(state));

		expect(isSessionAudioPlaying(played.session.audioPlayback.track)).toBe(true);
		const track = played.session.audioPlayback.track!;
		expect(track.sourceId).toBe('s-local');
		expect(track.assetId).toBe(assetId(state));
		expect(track.status).toBe('playing');
		expect(track.volume).toBe(0.8);
		// The active track lives on SESSION state (not a widget) — Contract 4 Widget State Ownership.
		expect(played.session.audioPlayback.schemaVersion).toBe(1);
	});

	it('a non-DM player cannot control playback (DM-only, fail closed)', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const asset = assetId(state);
		const rejected = expectRejected(
			dispatch(state, env, {
				type: 'session.audio.play',
				actorId: PLAYER_ACTOR.id,
				payload: { sourceId: 's-local', assetId: asset },
			}),
		);
		expect(rejected.rejection.code).toBe('actor-not-authorized');
		expect(rejected.nextState.session.audioPlayback.track).toBeNull();
	});

	it('pause retains the track; resume returns to playing; stop clears it', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const played = playTrack(state, env, assetId(state));

		const paused = accept(
			dispatch(played, env, { type: 'session.audio.pause', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		expect(paused.session.audioPlayback.track?.status).toBe('paused');
		// AUDIO-003 AC2 — pause RETAINS the active track (only stop clears it).
		expect(paused.session.audioPlayback.track?.sourceId).toBe('s-local');

		const resumed = accept(
			dispatch(paused, env, { type: 'session.audio.resume', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		expect(resumed.session.audioPlayback.track?.status).toBe('playing');

		const stopped = accept(
			dispatch(resumed, env, { type: 'session.audio.stop', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		expect(stopped.session.audioPlayback.track).toBeNull();
	});

	it('the authoritative session volume is set by the DM and is NOT a device-local volume', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const played = playTrack(state, env, assetId(state));
		const louder = accept(
			dispatch(played, env, {
				type: 'session.audio.set-volume',
				actorId: DM_ACTOR.id,
				payload: { volume: 0.25 },
			}),
		).nextState;
		expect(louder.session.audioPlayback.track?.volume).toBe(0.25);
	});

	it('AC3: a player lowering local volume / muting does NOT mutate authoritative session audio', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const played = playTrack(state, env, assetId(state));
		const sessionVolumeBefore = played.session.audioPlayback.track!.volume;

		// A participant resolving their OWN view with a local mute + low local volume.
		const device: AudioParticipantDeviceInput = {
			actorId: PLAYER_ACTOR.id,
			assetLocallyAvailable: true,
			assetCached: false,
			cacheEvicted: false,
			online: true,
			capability: { canPlayAudio: true, canAutoplay: true, canPlayInBackground: true, canRouteOutput: false },
			preferences: { consent: 'granted', muted: true, localVolume: 0.1, outputRouteId: null },
		};
		const view = getSessionAudioView(
			played.audio,
			played.session.audioPlayback,
			played.permissions,
			PLAYER_ACTOR.id,
			[device],
		) as SessionAudioParticipantView;
		expect(view.role).toBe('participant');
		// The muted device is silent; the AUTHORITATIVE session volume is untouched (read is pure).
		expect(view.disposition).toBe('muted');
		expect(view.sounding).toBe(false);
		expect(played.session.audioPlayback.track!.volume).toBe(sessionVolumeBefore);
	});

	it('AC2: a player whose platform blocks autoplay sees a user-action-required degraded state', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const played = playTrack(state, env, assetId(state));

		// Consent not granted yet (autoplay gate) ⇒ user action required (NOT a failure, not silent autoplay).
		const device: AudioParticipantDeviceInput = {
			actorId: PLAYER_ACTOR.id,
			assetLocallyAvailable: true,
			assetCached: false,
			cacheEvicted: false,
			online: true,
			capability: { canPlayAudio: true, canAutoplay: false, canPlayInBackground: true, canRouteOutput: false },
			preferences: { consent: 'unset', muted: false, localVolume: 1, outputRouteId: null },
		};
		const view = getSessionAudioView(
			played.audio,
			played.session.audioPlayback,
			played.permissions,
			PLAYER_ACTOR.id,
			[device],
		) as SessionAudioParticipantView;
		expect(view.disposition).toBe('user-action-required');
		expect(view.sounding).toBe(false);
	});
});

describe('AUDIO-002/003 — gates are respected by the playback path (fail closed)', () => {
	it('an unlicensed asset cannot be played (AUDIO-004 gate)', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		// Import a flagged asset (license unknown).
		const withFlagged = accept(
			dispatch(state, env, {
				type: 'audio.import-asset',
				actorId: DM_ACTOR.id,
				payload: {
					sourceId: 's-local',
					bytes: [9, 9, 9],
					mimeType: 'audio/mpeg',
					fileName: 'unknown.mp3',
				},
			}),
		).nextState;
		const flaggedId = Object.keys(withFlagged.audio.assets).find((id) => id !== assetId(state))!;
		const rejected = expectRejected(
			dispatch(withFlagged, env, {
				type: 'session.audio.play',
				actorId: DM_ACTOR.id,
				payload: { sourceId: 's-local', assetId: flaggedId },
			}),
		);
		expect(rejected.rejection.code).toBe('audio-license-blocked');
		expect(rejected.nextState.session.audioPlayback.track).toBeNull();
	});

	it('an offline/missing local asset cannot be played (AUDIO-010 gate, no retry/substitution)', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const rejected = expectRejected(
			dispatch(state, env, {
				type: 'session.audio.play',
				actorId: DM_ACTOR.id,
				payload: { sourceId: 's-local', assetId: assetId(state), assetLocallyAvailable: false },
			}),
		);
		expect(rejected.rejection.code).toBe('audio-track-unavailable');
		expect(rejected.nextState.session.audioPlayback.track).toBeNull();
	});

	it('an unconfigured source cannot be played (fail closed)', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const rejected = expectRejected(
			dispatch(state, env, {
				type: 'session.audio.play',
				actorId: DM_ACTOR.id,
				payload: { sourceId: 's-missing', assetId: assetId(state) },
			}),
		);
		expect(rejected.rejection.code).toBe('audio-source-not-found');
	});

	it('AUDIO-010 AC3: a cache-evicted play attempt is rejected and the already-playing track is preserved (session state not cleared, no substitution)', () => {
		// Start with a track already playing so we can verify preservation, not vacuous null == null.
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const asset = assetId(state);
		const playing = playTrack(state, env, asset);
		expect(playing.session.audioPlayback.track?.status).toBe('playing');

		// Attempt to replace the playing track with a cache-evicted version of the same asset.
		const result = expectRejected(
			dispatch(playing, env, {
				type: 'session.audio.play',
				actorId: DM_ACTOR.id,
				payload: { sourceId: 's-local', assetId: asset, cacheEvicted: true },
			}),
		);
		expect(result.rejection.code).toBe('audio-track-unavailable');
		// The rejection message must cite the cache-evicted availability so the caller can surface it.
		expect(result.rejection.message).toContain('cache-evicted');
		// The originally-playing track is fully preserved in nextState — no substitution, no reset.
		expect(result.nextState.session.audioPlayback.track?.sourceId).toBe('s-local');
		expect(result.nextState.session.audioPlayback.track?.assetId).toBe(asset);
		expect(result.nextState.session.audioPlayback.track?.status).toBe('playing');
		expect(result.nextState.session.audioPlayback.track?.revision).toBe(
			playing.session.audioPlayback.track?.revision,
		);
	});
});

describe('AUDIO-002/003 — actor-filtered view (no leak)', () => {
	it('the DM sees the authoritative track + per-participant delivery roster; a player sees only the player-safe track', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const played = playTrack(state, env, assetId(state));

		const roster: AudioParticipantDeviceInput[] = [
			{
				actorId: PLAYER_ACTOR.id,
				assetLocallyAvailable: true,
				assetCached: false,
				cacheEvicted: false,
				online: true,
				capability: { canPlayAudio: true, canAutoplay: true, canPlayInBackground: true, canRouteOutput: false },
				preferences: { consent: 'granted', muted: false, localVolume: 1, outputRouteId: null },
			},
			{
				actorId: PLAYER_B.id,
				assetLocallyAvailable: true,
				assetCached: false,
				cacheEvicted: false,
				online: true,
				capability: { canPlayAudio: false, canAutoplay: false, canPlayInBackground: false, canRouteOutput: false },
				preferences: { consent: 'unset', muted: false, localVolume: 1, outputRouteId: null },
			},
		];

		const dmView = getSessionAudioView(
			played.audio,
			played.session.audioPlayback,
			played.permissions,
			DM_ACTOR.id,
			roster,
		);
		expect(dmView.role).toBe('dm');
		if (dmView.role !== 'dm') throw new Error('unreachable');
		expect(dmView.track?.sourceId).toBe('s-local');
		// AUDIO-006 AC2 — a participant who cannot play audio is visible to the DM, without device secrets.
		expect(dmView.participantDelivery).toHaveLength(2);
		const playerBRow = dmView.participantDelivery.find((row) => row.actorId === PLAYER_B.id)!;
		expect(playerBRow.disposition).toBe('platform-unsupported');
		expect(playerBRow.sounding).toBe(false);

		// A player gets the PARTICIPANT view (only their own decision; never the DM roster).
		const playerView = getSessionAudioView(
			played.audio,
			played.session.audioPlayback,
			played.permissions,
			PLAYER_ACTOR.id,
			roster,
		);
		expect(playerView.role).toBe('participant');
		if (playerView.role !== 'participant') throw new Error('unreachable');
		expect(playerView.track?.sourceId).toBe('s-local');
		expect(playerView.disposition).toBe('playing');
		// A player view object has no `participantDelivery` / `deliveryQueue` keys (the DM roster never leaks).
		expect('participantDelivery' in playerView).toBe(false);
	});

	it('an unknown actor sees the silent participant view (fail closed)', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const played = playTrack(state, env, assetId(state));
		const view = getSessionAudioView(
			played.audio,
			played.session.audioPlayback,
			played.permissions,
			'ghost',
			[],
		);
		expect(view.role).toBe('participant');
		if (view.role !== 'participant') throw new Error('unreachable');
		expect(view.track).toBeNull();
		expect(view.sounding).toBe(false);
	});
});

describe('AUDIO-003 — session-owned persistence + sync', () => {
	it('AC1: a reconnecting (second DM) device receives the active audio state via the durable slice', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const played = playTrack(state, env, assetId(state));

		// Simulate a reconnect by re-hydrating the persisted session-audio slice (what a fresh load would do).
		const rehydrated = ensureSessionAudioState(played.session.audioPlayback);
		expect(rehydrated.track?.sourceId).toBe('s-local');
		expect(rehydrated.track?.status).toBe('playing');
		expect(rehydrated.track?.volume).toBe(0.8);
	});

	it('AC2: removing a widget does not delete session audio (only stop clears it)', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const played = playTrack(state, env, assetId(state));

		// Add then destroy a widget on the home scene; the session-owned audio is untouched.
		const sceneId = played.commandCenter.homeSceneId!;
		const added = accept(
			dispatch(played, env, {
				type: 'scene.add-widget',
				actorId: DM_ACTOR.id,
				payload: {
					sceneId,
					widget: { type: 'note', version: '1.0.0', layout: { x: 0, y: 0, w: 160, h: 120 } },
				},
			}),
		).nextState;
		const widgetId = added.scenes.scenes[sceneId]!.widgets.at(-1)!.id;
		const destroyed = accept(
			dispatch(added, env, {
				type: 'scene.destroy-widget',
				actorId: DM_ACTOR.id,
				payload: { sceneId, widgetInstanceId: widgetId },
			}),
		).nextState;
		// Widget removed, but the session-owned track survives (Contract 4 Widget State Ownership).
		expect(destroyed.session.audioPlayback.track?.sourceId).toBe('s-local');
		expect(destroyed.session.audioPlayback.track?.status).toBe('playing');
	});

	it('AC3: projecting to an offline participant QUEUES the delivery without blocking local playback', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const played = playTrack(state, env, assetId(state));

		const projected = accept(
			dispatch(played, env, {
				type: 'session.audio.project',
				actorId: DM_ACTOR.id,
				payload: { playerActorIds: [PLAYER_ACTOR.id], connectionState: 'offline' },
			}),
		).nextState;
		// The offline participant's delivery is QUEUED (undelivered), and local playback is unaffected.
		expect(projected.session.audioPlayback.deliveries[PLAYER_ACTOR.id]?.deliveryStatus).toBe('queued');
		expect(projected.session.audioPlayback.track?.status).toBe('playing');

		// A re-projection while connected marks it delivered (a reconnecting device catches up).
		const delivered = accept(
			dispatch(projected, env, {
				type: 'session.audio.project',
				actorId: DM_ACTOR.id,
				payload: { playerActorIds: [PLAYER_ACTOR.id], connectionState: 'connected' },
			}),
		).nextState;
		expect(delivered.session.audioPlayback.deliveries[PLAYER_ACTOR.id]?.deliveryStatus).toBe('delivered');
	});

	it('stopping clears both the track and the delivery queue', () => {
		const env = makeEnvironment();
		const state = activeSessionWithAudio(env);
		const played = playTrack(state, env, assetId(state));
		const projected = accept(
			dispatch(played, env, {
				type: 'session.audio.project',
				actorId: DM_ACTOR.id,
				payload: { playerActorIds: [PLAYER_ACTOR.id], connectionState: 'connected' },
			}),
		).nextState;
		const stopped = accept(
			dispatch(projected, env, { type: 'session.audio.stop', actorId: DM_ACTOR.id, payload: {} }),
		).nextState;
		expect(stopped.session.audioPlayback.track).toBeNull();
		expect(Object.keys(stopped.session.audioPlayback.deliveries)).toHaveLength(0);
	});
});

describe('AUDIO-002/003 — determinism', () => {
	it('identical command sequences produce identical session-audio state', () => {
		const run = (): CoreStateSlice => {
			const env = makeEnvironment();
			const state = activeSessionWithAudio(env);
			const asset = assetId(state);
			let next = playTrack(state, env, asset);
			next = accept(
				dispatch(next, env, {
					type: 'session.audio.set-volume',
					actorId: DM_ACTOR.id,
					payload: { volume: 0.5 },
				}),
			).nextState;
			next = accept(
				dispatch(next, env, {
					type: 'session.audio.project',
					actorId: DM_ACTOR.id,
					payload: { playerActorIds: [PLAYER_ACTOR.id, PLAYER_B.id], connectionState: 'offline' },
				}),
			).nextState;
			next = accept(
				dispatch(next, env, { type: 'session.audio.pause', actorId: DM_ACTOR.id, payload: {} }),
			).nextState;
			return next;
		};
		const a = run();
		const b = run();
		expect(JSON.stringify(a.session.audioPlayback)).toBe(JSON.stringify(b.session.audioPlayback));
	});
});

describe('AUDIO-003 — fail-closed hydration', () => {
	it('a vault persisted before this slice restores to the stopped/silent state', () => {
		expect(ensureSessionAudioState(undefined)).toEqual({
			track: null,
			deliveries: {},
			schemaVersion: 1,
		});
	});

	it('a persisted track with an invalid status hydrates to stopped (never re-starts from corrupt data)', () => {
		const hydrated = ensureSessionAudioState({
			// @ts-expect-error — modeling a corrupt persisted record with an invalid status.
			track: { sourceId: 's-local', assetId: null, status: 'bogus', volume: 2, crossfadeSeconds: -1, revision: 1 },
			deliveries: {},
		});
		expect(hydrated.track).toBeNull();
	});
});
