import type { ActorId } from './ids';

/**
 * AUDIO-002 / AUDIO-003 — the SESSION-OWNED currently-playing audio state (Architecture Contract 4: "Audio
 * track currently playing — Session state"). This is the integration the prior AUDIO epics deferred to a
 * "future session-owned currently-playing state": the asset/license gate (AUDIO-004), the source-scope +
 * offline/cache gate (AUDIO-009/010), the automation resolver (AUDIO-005), and the per-participant delivery/
 * degradation decision (AUDIO-006/007/008/012/013) all SHAPED their inputs (`AudioActiveTrack`, the per-
 * device delivery snapshot) to attach here. This slice OWNS the authoritative, DM-authored playback state;
 * it COMPOSES the prior models rather than re-deriving them.
 *
 * Why session-owned, not widget-private (AUDIO-003 AC2): the currently-playing track is canonical SESSION
 * state, so removing the audio widget from a Scene MUST NOT delete it — only a `stop` command clears it.
 * The widget is an EMBED/projection of this state (Contract 4 Widget State Ownership), never its owner.
 *
 * The state is split into two parts:
 *
 *   - The DM-AUTHORITATIVE active track (`SessionAudioTrack`): which source/asset is playing, the playback
 *     STATUS (playing / paused / stopped), the AUTHORITATIVE session volume, and the crossfade metadata.
 *     This is the value a reconnecting DM device receives (AUDIO-003 AC1) and the value that syncs to
 *     collaborators as session state (not widget-private state).
 *   - The per-PLAYER DELIVERY records (`SessionAudioDelivery`): when the DM projects the active track to
 *     players, each player gets a delivery record marked `delivered` (connected) or `queued` (the remote
 *     participant is unavailable — AUDIO-003 AC3). The queue NEVER blocks local DM playback; it only marks
 *     undelivered participants so a reconnecting device can catch up.
 *
 * Player DEVICE-LOCAL preferences (consent / mute / local volume / output route) are NOT here — they are
 * device-local and owned by `audio-degradation.ts` (AUDIO-007/012). A player muting or lowering local
 * volume never mutates this authoritative state (AUDIO-002 AC3 / AUDIO-007 AC2). This module is PURE: no
 * DOM, no clock, no network. Identical command/event sequences produce identical session-audio state.
 */

export const SESSION_AUDIO_SCHEMA_VERSION = 1 as const;

/** The entity type session-owned audio playback is addressed by in the operation log. Session-scoped. */
export const SESSION_AUDIO_ENTITY_TYPE = 'session-audio' as const;

/**
 * The DM-AUTHORITATIVE playback STATUS of the session's currently-playing track. A CLOSED enum:
 *
 *   - `playing` — a track is selected and playing (the device-level delivery still degrades per participant).
 *   - `paused`  — a track is selected but paused; the active track is RETAINED (resumes on the next play).
 *   - `stopped` — no track is active; the playback state is cleared (the only thing that clears a track).
 */
export type SessionAudioStatus = 'playing' | 'paused' | 'stopped';

export const SESSION_AUDIO_STATUSES: readonly SessionAudioStatus[] = Object.freeze([
	'playing',
	'paused',
	'stopped',
]);

/** True when `value` is a declared session-audio status. Unknown values fail closed to `stopped`. */
export function isSessionAudioStatus(value: unknown): value is SessionAudioStatus {
	return typeof value === 'string' && (SESSION_AUDIO_STATUSES as readonly string[]).includes(value);
}

/**
 * AUDIO-002 / AUDIO-003 — the DM-AUTHORITATIVE currently-playing track. It references the playing track by
 * declared source/asset ID (never asset bytes — Contract 2: large binary assets are content-addressed
 * records, not embedded payloads), and carries the playback status + AUTHORITATIVE session volume. A
 * stopped session has `track === null`.
 */
export interface SessionAudioTrack {
	/** The configured `AudioSource` id the active track plays through (AUDIO-009/010). */
	sourceId: string;
	/** The active track's local asset id, or null for a pure web-stream track (AUDIO-004 gate per asset). */
	assetId: string | null;
	/** The current playback status (DM-authored). `stopped` is represented by a null track, not this field. */
	status: SessionAudioStatus;
	/**
	 * The AUTHORITATIVE session volume (0..1) the DM set. This is the SESSION volume, NEVER the participant's
	 * device-local volume — a player lowering local volume does not change this (AUDIO-002 AC3 / AUDIO-007 AC2).
	 */
	volume: number;
	/**
	 * The crossfade duration (seconds) of the transition INTO this track, or 0 for an immediate cut. Carried
	 * as authoritative metadata so a reconnecting device + the visualizer/announcement layer (AUDIO-008) can
	 * render the transition; the actual animated effect is reduced/disabled per the resolved motion state.
	 */
	crossfadeSeconds: number;
	/** The track that was playing immediately before this one (for a crossfade transition), or null. */
	previousSourceId: string | null;
	createdBy: ActorId;
	/** When this track was STARTED (the most recent play, not pause/volume changes). */
	startedAt: string;
	updatedAt: string;
	/** The authoritative revision; bumped on every DM mutation so a reconnecting device can order updates. */
	revision: number;
}

/** Whether a track value means audio is intended to be SOUNDING at the session level (status `playing`). */
export function isSessionAudioPlaying(track: SessionAudioTrack | null): boolean {
	return track !== null && track.status === 'playing';
}

/**
 * The DELIVERY STATUS of the active track to ONE player. `delivered` ⇒ the player's device was connected
 * when the DM projected the track; `queued` ⇒ the remote participant was unavailable, so the projection is
 * marked undelivered without blocking local playback (AUDIO-003 AC3). A reconnecting device clears the queue
 * by re-evaluating the active track.
 */
export type SessionAudioDeliveryStatus = 'delivered' | 'queued';

export const SESSION_AUDIO_DELIVERY_STATUSES: readonly SessionAudioDeliveryStatus[] = Object.freeze([
	'delivered',
	'queued',
]);

/**
 * AUDIO-003 AC3 — a per-PLAYER DELIVERY record for the session's active audio. Modeled on
 * `SessionActiveMapProjection`: the DM projects the active track to players; an offline participant's record
 * is `queued` (undelivered) rather than blocking the DM's local playback. It carries NO device secrets and
 * NO device-local preference (those stay device-local — AUDIO-007/012).
 */
export interface SessionAudioDelivery {
	id: string;
	playerActorId: ActorId;
	/** The source id of the track this delivery is for (so a stale delivery for an old track is detectable). */
	sourceId: string;
	assetId: string | null;
	deliveryStatus: SessionAudioDeliveryStatus;
	/** Why the delivery is delivered/queued: the participant was `connected` or `offline`. */
	deliveryReason: 'connected' | 'offline';
	createdBy: ActorId;
	createdAt: string;
	updatedAt: string;
	revision: number;
}

/**
 * AUDIO-002 / AUDIO-003 — the SESSION-OWNED audio playback slice. It lives ON the session document
 * (Contract 4 Widget State Ownership), so it is durable, syncs as session state, and survives widget
 * removal. `track === null` is the stopped/idle state.
 */
export interface SessionAudioState {
	/** The currently-playing track, or null when stopped/idle. */
	track: SessionAudioTrack | null;
	/** Per-player delivery records keyed by player actor id (AUDIO-003 AC3 offline queue). */
	deliveries: Record<ActorId, SessionAudioDelivery>;
	schemaVersion: typeof SESSION_AUDIO_SCHEMA_VERSION;
}

export const EMPTY_SESSION_AUDIO_STATE: SessionAudioState = Object.freeze({
	track: null,
	deliveries: {},
	schemaVersion: SESSION_AUDIO_SCHEMA_VERSION,
});

function clampVolume(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value)) return 1;
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

function clampSeconds(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value) || value < 0) return 0;
	return value;
}

/**
 * Hydrate a persisted track fail-closed. A record whose status is not a declared status defaults to
 * `stopped`; volume clamps to [0,1]; crossfade clamps to ≥ 0. A null/undefined track stays null. This
 * never RE-STARTS playback from a corrupt record — an invalid status is the safe (silent) default.
 */
function ensureSessionAudioTrack(track: SessionAudioTrack | null | undefined): SessionAudioTrack | null {
	if (!track || typeof track.sourceId !== 'string' || track.sourceId.length === 0) return null;
	const status: SessionAudioStatus = isSessionAudioStatus(track.status) ? track.status : 'stopped';
	// A `stopped` status on a persisted record means there is no active track (fail closed to null).
	if (status === 'stopped') return null;
	return {
		sourceId: track.sourceId,
		assetId: track.assetId ?? null,
		status,
		volume: clampVolume(track.volume),
		crossfadeSeconds: clampSeconds(track.crossfadeSeconds),
		previousSourceId: track.previousSourceId ?? null,
		createdBy: track.createdBy,
		startedAt: track.startedAt,
		updatedAt: track.updatedAt,
		revision: typeof track.revision === 'number' && track.revision >= 0 ? track.revision : 0,
	};
}

/** Hydrate one persisted delivery record fail-closed (unknown status ⇒ `queued`; the safe undelivered default). */
function ensureSessionAudioDelivery(delivery: SessionAudioDelivery): SessionAudioDelivery {
	const deliveryStatus: SessionAudioDeliveryStatus = (
		SESSION_AUDIO_DELIVERY_STATUSES as readonly string[]
	).includes(delivery.deliveryStatus)
		? delivery.deliveryStatus
		: 'queued';
	return {
		...delivery,
		sourceId: delivery.sourceId,
		assetId: delivery.assetId ?? null,
		deliveryStatus,
		deliveryReason: delivery.deliveryReason === 'connected' ? 'connected' : 'offline',
	};
}

/** A possibly-partial persisted session-audio slice (a session persisted before this slice existed). */
export type PersistedSessionAudioState = Partial<SessionAudioState>;

/**
 * Tolerantly hydrate a possibly-undefined/partial persisted session-audio slice (safe, fail-closed
 * defaults). A session document persisted before this slice existed restores to the empty (stopped) state
 * with no deliveries — exactly the AUDIO-003 hydration requirement (older vaults fail closed to silent).
 */
export function ensureSessionAudioState(
	state: PersistedSessionAudioState | undefined,
): SessionAudioState {
	const deliveries: Record<ActorId, SessionAudioDelivery> = {};
	for (const [id, delivery] of Object.entries(state?.deliveries ?? {})) {
		deliveries[id] = ensureSessionAudioDelivery(delivery as SessionAudioDelivery);
	}
	return {
		track: ensureSessionAudioTrack(state?.track),
		deliveries,
		schemaVersion: SESSION_AUDIO_SCHEMA_VERSION,
	};
}

/** Deep-clone a session-audio slice so an archive/snapshot never shares mutable references with the live state. */
export function cloneSessionAudioState(state: SessionAudioState): SessionAudioState {
	return {
		track: state.track ? { ...state.track } : null,
		deliveries: Object.fromEntries(
			Object.entries(state.deliveries).map(([id, delivery]) => [id, { ...delivery }]),
		),
		schemaVersion: SESSION_AUDIO_SCHEMA_VERSION,
	};
}
