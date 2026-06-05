import {
	playSessionAudioInputSchema,
	projectSessionAudioInputSchema,
	setSessionAudioVolumeInputSchema,
} from '../schemas/commands';
import { assetNeedsLicenseReview } from '../state/audio-asset';
import {
	classifyAudioSource,
	resolveAudioPlaybackAvailability,
} from '../state/audio-source';
import {
	SESSION_AUDIO_ENTITY_TYPE,
	type SessionAudioDelivery,
	type SessionAudioDeliveryStatus,
	type SessionAudioState,
	type SessionAudioTrack,
} from '../state/session-audio';
import type { CommandResult, CoreEnvironment, CoreEvent, CoreStateSlice } from './types';
import { appendOperationDraft, parseInput, reject, requireActor, requireDm } from './helpers';

/**
 * AUDIO-002 / AUDIO-003 — SESSION-OWNED AUDIO PLAYBACK command handlers (Architecture Contract 1 / 2 / 4).
 *
 * This is the integration the prior AUDIO epics deferred to. The DM controls playback (play, pause, stop,
 * volume, crossfade) through these commands; each durable mutation lands on the SESSION document's
 * `audioPlayback` slice (Contract 4 Widget State Ownership: "Audio track currently playing — Session
 * state"), so the currently-playing audio is canonical session state that syncs to collaborators and
 * survives audio-widget removal (AUDIO-003 AC2). The architecture invariants this slice upholds,
 * fail-closed:
 *
 *   - DM-only authority. A non-DM cannot play/pause/stop/set-volume/crossfade or project session audio
 *     (audio playback config is dm-only; the player surface is a read-only, device-locally-controlled view).
 *   - The gates are RESPECTED, never bypassed. A `play`/`crossfade` reuses the EXISTING gates verbatim:
 *     AUDIO-009 (the source must be a declared, supported, playback-enabled type), AUDIO-004 (a local
 *     asset's license must be cleared), and AUDIO-010 (the offline/cache availability must resolve
 *     `available`). A track that fails ANY gate is rejected and NO playback state is created/changed — the
 *     playback path can never sneak an out-of-scope / unlicensed / offline track into session audio.
 *   - Stop is the ONLY thing that clears the active track (AUDIO-003 AC2). Pause RETAINS the track.
 *   - Player device-local preferences stay device-local. These commands never read or mutate a player's
 *     consent/mute/local-volume/output-route (AUDIO-002 AC3 / AUDIO-007 AC2) — those live in
 *     `audio-degradation.ts` and are resolved per-device by the read model, not here.
 *
 * Each durable mutation appends a `session.audio.*` op (actor + entity — the audit). The GUI dispatches the
 * intent; it never writes the session audio state. PURE + DETERMINISTIC: identical command sequences
 * produce identical session-audio state (the env clock/ids are the only non-determinism, injected for tests).
 */

const SESSION_ENTITY_ID = 'session-default';

function withSessionAudio(state: CoreStateSlice, audioPlayback: SessionAudioState): CoreStateSlice {
	return { ...state, session: { ...state.session, audioPlayback } };
}

/**
 * AUDIO-002 / AUDIO-003 — PLAY or CROSSFADE into a track on the session-owned audio state (DM-only). The
 * track is validated through the FULL existing gate before any state change (fail closed):
 *
 *   1. The source must EXIST, be a DECLARED supported type (AUDIO-009), and be playback-enabled (AUDIO-010
 *      prerequisite — cache behavior declared). An unsupported/disabled source is rejected; no state changes.
 *   2. A referenced local ASSET must EXIST and have a CLEARED license (AUDIO-004). A missing/unlicensed
 *      asset is rejected. A web-stream `play` may omit the asset (the stream is the track).
 *   3. The OFFLINE/CACHE availability must resolve `available` for the device inputs (AUDIO-010). An
 *      unavailable/missing/evicted track is rejected — no network retry, no substitution, no state change.
 *
 * Only a fully-cleared track becomes the active session track. A `crossfadeSeconds > 0` records the
 * transition metadata (the previous track id + duration); the visualizer/announcement layer renders it per
 * the resolved motion state (AUDIO-008). This is a `playing` track; per-device degradation is resolved by
 * the read model, not here (a participant's device may still be silent for consent/platform reasons).
 */
export function handlePlaySessionAudio(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(playSessionAudioInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);
	const input = parsed.data;

	// (1) AUDIO-009 — the source must exist and resolve to a declared, supported, playback-enabled type.
	const source = state.audio.sources[input.sourceId];
	if (!source) {
		return reject(
			{ code: 'audio-source-not-found', message: `Audio source ${input.sourceId} is not configured.` },
			state,
		);
	}
	const classification = classifyAudioSource(source);
	if (!classification.supported) {
		return reject(
			{
				code: 'unsupported-audio-source',
				message: `Audio source ${source.id} is not a declared, supported source. Playback is rejected.`,
			},
			state,
		);
	}
	if (!classification.playbackEnabled) {
		return reject(
			{
				code: 'audio-playback-disabled',
				message: `Audio source ${source.id} has no declared cache/offline behavior; playback is disabled.`,
			},
			state,
		);
	}

	// A local-file / bundled-preset source plays a SPECIFIC local asset; a web-stream play may omit it.
	const assetId = input.assetId ?? null;
	if (assetId === null && source.type !== 'web-stream') {
		return reject(
			{
				code: 'audio-asset-required',
				message: `A ${source.type} source requires a local asset to play.`,
			},
			state,
		);
	}

	// (2) AUDIO-004 — a referenced local asset must exist and its license must be cleared (no silent bypass).
	if (assetId !== null) {
		const asset = state.audio.assets[assetId];
		if (!asset) {
			return reject(
				{ code: 'audio-asset-not-found', message: `Audio asset ${assetId} is not in the library.` },
				state,
			);
		}
		if (assetNeedsLicenseReview(asset)) {
			return reject(
				{
					code: 'audio-license-blocked',
					message: `Audio asset ${assetId} is flagged for license review; playback is blocked.`,
				},
				state,
			);
		}
	}

	// (3) AUDIO-010 — the offline/cache availability must resolve `available` for the device inputs. The play
	// command defaults to online + locally-available so a simple DM play succeeds; a test/runtime supplies
	// real device inputs to exercise the offline cases. No network retry, no track substitution on failure.
	const availability = resolveAudioPlaybackAvailability({
		source,
		assetLocallyAvailable: input.assetLocallyAvailable ?? true,
		assetCached: input.assetCached ?? false,
		cacheEvicted: input.cacheEvicted ?? false,
		online: input.online ?? true,
	});
	if (availability !== 'available') {
		return reject(
			{
				code: 'audio-track-unavailable',
				message: `Audio track is ${availability}; playback is not started (no retry, no substitution).`,
			},
			state,
		);
	}

	const previous = state.session.audioPlayback.track;
	const now = env.clock();
	const crossfadeSeconds = input.crossfadeSeconds ?? 0;
	const track: SessionAudioTrack = {
		sourceId: source.id,
		assetId,
		status: 'playing',
		volume: input.volume ?? previous?.volume ?? 1,
		crossfadeSeconds,
		// A crossfade records the track it transitions FROM (when there was one); an immediate play has none.
		previousSourceId: crossfadeSeconds > 0 ? (previous?.sourceId ?? null) : null,
		createdBy: actor.id,
		startedAt: now,
		updatedAt: now,
		revision: (previous?.revision ?? 0) + 1,
	};
	const nextAudio: SessionAudioState = {
		...state.session.audioPlayback,
		track,
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SESSION_AUDIO_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: crossfadeSeconds > 0 ? 'session.audio.crossfade' : 'session.audio.play',
		path: 'audioPlayback/track',
		// The op value carries the track REFERENCE (source/asset id + status) — never asset bytes (Contract 2).
		value: {
			sourceId: track.sourceId,
			assetId: track.assetId,
			status: track.status,
			volume: track.volume,
			crossfadeSeconds: track.crossfadeSeconds,
		},
		beforeRevision: previous?.revision ?? 0,
		afterRevision: track.revision,
		dependencies: [`audio-source:${source.id}@${source.revision}`],
	});

	return {
		status: 'accepted',
		nextState: withSessionAudio({ ...state, sync: nextLog }, nextAudio),
		events: [
			{
				kind: 'session.audio-changed',
				actorId: actor.id,
				status: track.status,
				sourceId: track.sourceId,
				assetId: track.assetId,
				crossfade: crossfadeSeconds > 0,
			},
		],
		operationIds: [op.id],
	};
}

/**
 * AUDIO-002 — PAUSE or RESUME the session's active track (DM-only). Pause RETAINS the active track
 * (AUDIO-003 AC2 — only stop clears it); resume returns it to `playing`. Fail closed: rejected when there is
 * no active track. The `pause` parameter selects the target status so one handler serves both verbs.
 */
function handlePauseOrResumeSessionAudio(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	pause: boolean,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const previous = state.session.audioPlayback.track;
	if (!previous) {
		return reject(
			{ code: 'audio-not-playing', message: 'There is no active session audio track.' },
			state,
		);
	}

	const status = pause ? 'paused' : 'playing';
	if (previous.status === status) {
		// Idempotent: pausing a paused track (or resuming a playing one) is a no-op success with no op.
		return { status: 'accepted', nextState: state, events: [], operationIds: [] };
	}
	const now = env.clock();
	const track: SessionAudioTrack = {
		...previous,
		status,
		updatedAt: now,
		revision: previous.revision + 1,
	};
	const nextAudio: SessionAudioState = { ...state.session.audioPlayback, track };

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SESSION_AUDIO_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: pause ? 'session.audio.pause' : 'session.audio.resume',
		path: 'audioPlayback/track/status',
		value: { status, sourceId: track.sourceId },
		beforeRevision: previous.revision,
		afterRevision: track.revision,
	});

	return {
		status: 'accepted',
		nextState: withSessionAudio({ ...state, sync: nextLog }, nextAudio),
		events: [
			{
				kind: 'session.audio-changed',
				actorId: actor.id,
				status: track.status,
				sourceId: track.sourceId,
				assetId: track.assetId,
				crossfade: false,
			},
		],
		operationIds: [op.id],
	};
}

export function handlePauseSessionAudio(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	_rawPayload: unknown,
): CommandResult {
	return handlePauseOrResumeSessionAudio(state, env, actorId, true);
}

export function handleResumeSessionAudio(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	_rawPayload: unknown,
): CommandResult {
	return handlePauseOrResumeSessionAudio(state, env, actorId, false);
}

/**
 * AUDIO-002 / AUDIO-003 — STOP the session's audio (DM-only). Stop is the ONLY command that CLEARS the
 * active track (AUDIO-003 AC2): it nulls the track and clears the per-player delivery queue (there is no
 * track to deliver). Fail closed: rejected when there is no active track (nothing to stop).
 */
export function handleStopSessionAudio(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	_rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const previous = state.session.audioPlayback.track;
	if (!previous) {
		return reject(
			{ code: 'audio-not-playing', message: 'There is no active session audio track to stop.' },
			state,
		);
	}

	const nextAudio: SessionAudioState = {
		...state.session.audioPlayback,
		track: null,
		// Clearing the track clears the delivery queue: there is no active track to be delivered/queued.
		deliveries: {},
	};

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SESSION_AUDIO_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'session.audio.stop',
		path: 'audioPlayback/track',
		value: { status: 'stopped', sourceId: previous.sourceId },
		beforeRevision: previous.revision,
		afterRevision: previous.revision + 1,
	});

	return {
		status: 'accepted',
		nextState: withSessionAudio({ ...state, sync: nextLog }, nextAudio),
		events: [
			{
				kind: 'session.audio-changed',
				actorId: actor.id,
				status: 'stopped',
				sourceId: previous.sourceId,
				assetId: previous.assetId,
				crossfade: false,
			},
		],
		operationIds: [op.id],
	};
}

/**
 * AUDIO-002 — set the AUTHORITATIVE session volume (0..1) on the active track (DM-only). This is the SESSION
 * volume; it never touches a participant's device-local volume (AUDIO-002 AC3 / AUDIO-007 AC2). Fail closed:
 * rejected when there is no active track. An unchanged volume is an idempotent no-op success.
 */
export function handleSetSessionAudioVolume(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(setSessionAudioVolumeInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const previous = state.session.audioPlayback.track;
	if (!previous) {
		return reject(
			{ code: 'audio-not-playing', message: 'There is no active session audio track.' },
			state,
		);
	}
	if (previous.volume === parsed.data.volume) {
		return { status: 'accepted', nextState: state, events: [], operationIds: [] };
	}

	const now = env.clock();
	const track: SessionAudioTrack = {
		...previous,
		volume: parsed.data.volume,
		updatedAt: now,
		revision: previous.revision + 1,
	};
	const nextAudio: SessionAudioState = { ...state.session.audioPlayback, track };

	const { log: nextLog, op } = appendOperationDraft(env, state.sync, actor.id, {
		entityType: SESSION_AUDIO_ENTITY_TYPE,
		entityId: SESSION_ENTITY_ID,
		opType: 'session.audio.set-volume',
		path: 'audioPlayback/track/volume',
		value: { volume: track.volume, sourceId: track.sourceId },
		beforeRevision: previous.revision,
		afterRevision: track.revision,
	});

	return {
		status: 'accepted',
		nextState: withSessionAudio({ ...state, sync: nextLog }, nextAudio),
		events: [
			{
				kind: 'session.audio-changed',
				actorId: actor.id,
				status: track.status,
				sourceId: track.sourceId,
				assetId: track.assetId,
				crossfade: false,
			},
		],
		operationIds: [op.id],
	};
}

/**
 * AUDIO-003 AC3 — PROJECT the session's active audio to players (DM-only). Each target player gets a
 * delivery record: `delivered` when the participant is connected, `queued` when the remote participant is
 * unavailable (offline). The queue marks the projection UNDELIVERED without blocking the DM's local
 * playback (AUDIO-003 AC3). Fail closed: rejected when there is no active track to project, or when a target
 * is not a registered non-DM participant. Modeled on `session.project-active-map`.
 */
export function handleProjectSessionAudio(
	state: CoreStateSlice,
	env: CoreEnvironment,
	actorId: string,
	rawPayload: unknown,
): CommandResult {
	const actor = requireActor(state, actorId);
	if ('code' in actor) return reject(actor, state);
	const dmCheck = requireDm(actor);
	if (dmCheck) return reject(dmCheck, state);

	const parsed = parseInput(projectSessionAudioInputSchema, rawPayload);
	if (!parsed.ok) return reject(parsed.rejection, state);

	const track = state.session.audioPlayback.track;
	if (!track) {
		return reject(
			{ code: 'audio-not-playing', message: 'Start a track before projecting session audio to players.' },
			state,
		);
	}

	const deliveryStatus: SessionAudioDeliveryStatus =
		parsed.data.connectionState === 'offline' ? 'queued' : 'delivered';
	const now = env.clock();
	const nextDeliveries = { ...state.session.audioPlayback.deliveries };
	const events: CoreEvent[] = [];
	let nextLog = state.sync;
	const operationIds: string[] = [];

	for (const playerActorId of parsed.data.playerActorIds) {
		const player = state.permissions.actors[playerActorId];
		if (!player || player.role === 'dm') {
			return reject(
				{
					code: 'invalid-payload',
					message: `Audio projection target ${playerActorId} must be a registered player or observer.`,
				},
				state,
			);
		}
		const previous = nextDeliveries[playerActorId];
		const delivery: SessionAudioDelivery = {
			id: previous?.id ?? env.ids(),
			playerActorId,
			sourceId: track.sourceId,
			assetId: track.assetId,
			deliveryStatus,
			deliveryReason: parsed.data.connectionState,
			createdBy: actor.id,
			createdAt: previous?.createdAt ?? now,
			updatedAt: now,
			revision: (previous?.revision ?? 0) + 1,
		};
		nextDeliveries[playerActorId] = delivery;
		const draft = appendOperationDraft(env, nextLog, actor.id, {
			entityType: SESSION_AUDIO_ENTITY_TYPE,
			entityId: SESSION_ENTITY_ID,
			opType: 'session.audio.project',
			path: `audioPlayback/deliveries/${playerActorId}`,
			value: {
				playerActorId,
				sourceId: delivery.sourceId,
				assetId: delivery.assetId,
				deliveryStatus,
			},
			beforeRevision: previous?.revision ?? 0,
			afterRevision: delivery.revision,
		});
		nextLog = draft.log;
		operationIds.push(draft.op.id);
		events.push({
			kind: 'session.audio-projected',
			actorId: actor.id,
			playerActorId,
			deliveryStatus,
		});
	}

	const nextAudio: SessionAudioState = {
		...state.session.audioPlayback,
		deliveries: nextDeliveries,
	};

	return {
		status: 'accepted',
		nextState: withSessionAudio({ ...state, sync: nextLog }, nextAudio),
		events,
		operationIds,
	};
}
