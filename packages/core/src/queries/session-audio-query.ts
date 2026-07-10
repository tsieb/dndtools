import type { PermissionState } from '../state/permission-state';
import { getActor } from '../state/permission-state';
import type { AudioState } from '../state/audio-state';
import type {
	SessionAmbienceLayer,
	SessionAudioDeliveryStatus,
	SessionAudioOutputDevice,
	SessionAudioState,
	SessionAudioStatus,
} from '../state/session-audio';
import { ambienceLayersOf } from '../state/session-audio';
import { classifyAudioSource } from '../state/audio-source';
import type { AudioDeliveryDisposition, AudioOutputRouting } from '../state/audio-degradation';
import {
	listAudioDeliveryForDm,
	resolveAudioDeliveryForActor,
	type AudioActiveTrack,
	type AudioParticipantDeliveryView,
	type AudioParticipantDeviceInput,
} from './audio-delivery-query';

/**
 * AUDIO-002 / AUDIO-003 — THE single actor-filtered SESSION AUDIO read model. This is the integration that
 * COMPOSES every prior AUDIO model into a per-actor view of the SESSION-OWNED currently-playing audio:
 *
 *   - the durable `SessionAudioState` track (AUDIO-002/003: what the DM is playing — source/asset/status/
 *     authoritative volume/crossfade),
 *   - the AUDIO-009 source classification + AUDIO-004 license posture (re-derived live, so a deleted source
 *     or revoked license fails the track closed),
 *   - the per-participant DELIVERY + DEGRADATION decision (AUDIO-006/007/008/012/013) via the existing
 *     `audio-delivery-query` (`listAudioDeliveryForDm` / `resolveAudioDeliveryForActor`), and
 *   - the AUDIO-003 AC3 offline DELIVERY QUEUE (per-player delivered/queued records).
 *
 * The data layer decides visibility BEFORE returning anything (Architecture Contract 3 / Cross-Contract
 * Non-Negotiable 2). The privacy guarantee proven here, FAIL CLOSED:
 *
 *   - The DM sees the full authoritative track + the per-participant delivery ROSTER (a participant who
 *     cannot play audio is visible — AUDIO-006 AC2) + the offline delivery-queue status. The roster carries
 *     only NON-LEAKING dispositions (no device secrets), reusing the audio-delivery read model.
 *   - A PARTICIPANT sees ONLY the PLAYER-SAFE active track (source/asset id + status; never DM-only audio
 *     config like the source URL, license note, or automation) and THEIR OWN resolved delivery decision —
 *     never another participant's device state, never the DM-only delivery roster. (AUDIO-003 is
 *     Player-safe: yes; the active track itself is shareable session state, the DM CONFIG is not.)
 *   - An UNKNOWN actor, or a participant whose track no longer resolves to a supported source, sees the
 *     SILENT (no-track) view — never a broken/leaking one.
 *
 * Pure + deterministic: a function of (audio library, session audio, permissions, actor, device inputs)
 * only. No GUI, no storage, no clock, no network — identical inputs yield an identical view.
 */

/** The PLAYER-SAFE projection of the active track: enough to render + drive a `<audio>` element, no DM config. */
export interface SessionAudioTrackView {
	sourceId: string;
	assetId: string | null;
	status: SessionAudioStatus;
	/** The AUTHORITATIVE session volume (0..1). The participant's device-local volume is resolved separately. */
	volume: number;
	crossfadeSeconds: number;
	revision: number;
}

/** One per-player delivery-queue row as projected to the DM (delivered / queued — AUDIO-003 AC3). */
export interface SessionAudioDeliveryView {
	playerActorId: string;
	deliveryStatus: SessionAudioDeliveryStatus;
	deliveryReason: 'connected' | 'offline';
}

/** The DM's session-audio view: the authoritative track + the per-participant delivery roster + the queue. */
export interface SessionAudioDmView {
	role: 'dm';
	/** The currently-playing track, or null when stopped/idle. */
	track: SessionAudioTrackView | null;
	/** AUDIO-006 AC2 — every participant's NON-LEAKING delivery state for the active track (stable order). */
	participantDelivery: AudioParticipantDeliveryView[];
	/** AUDIO-003 AC3 — the per-player offline DELIVERY QUEUE (delivered/queued), in stable player-id order. */
	deliveryQueue: SessionAudioDeliveryView[];
	/** DM-authored AMBIENCE LAYERS keyed by layer id (session-authoritative mix under the track). */
	ambienceLayers: Record<string, SessionAmbienceLayer>;
	/** The DM-selected session-host OUTPUT DEVICE (null ⇒ platform default). For the app audio driver. */
	outputDevice: SessionAudioOutputDevice | null;
}

/** A participant's own session-audio view: the player-safe track + THEIR OWN resolved delivery decision. */
export interface SessionAudioParticipantView {
	role: 'participant';
	/** The player-safe active track, or null when stopped/idle (never DM-only audio config). */
	track: SessionAudioTrackView | null;
	/** AUDIO-006/007/012/013 — this participant's OWN resolved delivery disposition (never another device's). */
	disposition: AudioDeliveryDisposition;
	/** Whether audio is actually SOUNDING on this device (true only when fully cleared). */
	sounding: boolean;
	/** AUDIO-012 — the resolved output routing for this device (default / routed / unavailable). */
	routing: AudioOutputRouting;
	/**
	 * AUDIO-007 — the EFFECTIVE device-local volume that WILL be applied (0..1). It reflects THIS participant's
	 * device-local preference (and is 0 while silent for any reason); it NEVER mirrors the authoritative
	 * session volume and never mutates it (AUDIO-007 AC2).
	 */
	effectiveVolume: number;
	/** A non-leaking human reason for the disposition (this device only). */
	message: string;
	/** This participant's delivery-queue status for the active track (delivered / queued / null if none). */
	queueStatus: SessionAudioDeliveryStatus | null;
	/**
	 * The DM-authored AMBIENCE LAYERS (player-safe: source ids + session volume/mute only — never DM
	 * source config). The participant device mixes these under the track per its own local decision.
	 */
	ambienceLayers: Record<string, SessionAmbienceLayer>;
}

export type SessionAudioView = SessionAudioDmView | SessionAudioParticipantView;

/** Project the durable track to its player-safe view, or null when stopped. A non-`playing`/`paused` status hides it. */
function toTrackView(session: SessionAudioState): SessionAudioTrackView | null {
	const track = session.track;
	if (!track || track.status === 'stopped') return null;
	return {
		sourceId: track.sourceId,
		assetId: track.assetId,
		status: track.status,
		volume: track.volume,
		crossfadeSeconds: track.crossfadeSeconds,
		revision: track.revision,
	};
}

/** Build the `AudioActiveTrack` the delivery resolver consumes from the durable session track. */
function toActiveTrack(session: SessionAudioState): AudioActiveTrack | null {
	const track = session.track;
	if (!track || track.status === 'stopped') return null;
	return { sourceId: track.sourceId, assetId: track.assetId };
}

/**
 * AUDIO-002 / AUDIO-003 — resolve the session-audio view for the requesting actor, fail-closed.
 *
 * The DM gets the authoritative track + the per-participant delivery roster (the supplied per-device inputs
 * are resolved through `listAudioDeliveryForDm`, which itself enforces the DM-only roster) + the offline
 * delivery queue. A participant gets ONLY the player-safe track + their OWN resolved decision (via
 * `resolveAudioDeliveryForActor`, which enforces the per-actor gate) + their own queue status. An unknown
 * actor gets the silent participant view.
 *
 * `deviceInputs` are the impure-layer-captured per-device snapshots (platform capability, consent/mute/
 * volume/route preferences, asset availability, safety). The DM passes the roster; a participant passes only
 * their own (the function reads the entry matching the actor id). When no device input is supplied for a
 * participant, the fail-closed defaults apply (silent until consent + platform clear).
 */
export function getSessionAudioView(
	library: AudioState,
	session: SessionAudioState,
	permissions: PermissionState,
	actorId: string,
	deviceInputs: readonly AudioParticipantDeviceInput[] = [],
): SessionAudioView {
	const actor = getActor(permissions, actorId);
	const trackView = toTrackView(session);
	const activeTrack = toActiveTrack(session);

	if (actor?.role === 'dm') {
		// AUDIO-006 AC2 — the per-participant delivery roster (DM-only, enforced inside the delivery query).
		const participantDelivery = activeTrack
			? listAudioDeliveryForDm(library, permissions, actorId, activeTrack, deviceInputs)
			: [];
		// AUDIO-003 AC3 — the offline delivery QUEUE, in stable player-id order.
		const deliveryQueue: SessionAudioDeliveryView[] = Object.values(session.deliveries)
			.sort((a, b) => a.playerActorId.localeCompare(b.playerActorId))
			.map((delivery) => ({
				playerActorId: delivery.playerActorId,
				deliveryStatus: delivery.deliveryStatus,
				deliveryReason: delivery.deliveryReason,
			}));
		return {
			role: 'dm',
			track: trackView,
			participantDelivery,
			deliveryQueue,
			ambienceLayers: ambienceLayersOf(session),
			outputDevice: session.outputDevice ?? null,
		};
	}

	// A participant (or unknown actor): the player-safe track + their OWN resolved decision. A track whose
	// source no longer resolves to a supported type fails closed (track hidden / silent).
	const supported =
		activeTrack !== null && classifyAudioSource(library.sources[activeTrack.sourceId] ?? ({} as never))?.supported === true;
	const safeTrack = supported ? trackView : null;
	const ownInput = actor ? deviceInputs.find((input) => input.actorId === actorId) : undefined;
	const decision =
		actor && activeTrack
			? resolveAudioDeliveryForActor(library, permissions, actorId, activeTrack, {
					assetLocallyAvailable: ownInput?.assetLocallyAvailable ?? false,
					assetCached: ownInput?.assetCached ?? false,
					cacheEvicted: ownInput?.cacheEvicted ?? false,
					online: ownInput?.online ?? true,
					capability: ownInput?.capability ?? {},
					preferences: ownInput?.preferences ?? {},
					safety: ownInput?.safety,
					backgrounded: ownInput?.backgrounded,
				})
			: null;
	const queueStatus = actor ? (session.deliveries[actorId]?.deliveryStatus ?? null) : null;

	if (!decision || !safeTrack) {
		// No active track (or it no longer resolves): the silent participant view (fail closed, no leak).
		return {
			role: 'participant',
			track: null,
			disposition: 'track-unavailable',
			sounding: false,
			routing: 'default',
			effectiveVolume: 0,
			message: 'No session audio is playing.',
			queueStatus,
			ambienceLayers: actor ? ambienceLayersOf(session) : {},
		};
	}

	return {
		role: 'participant',
		track: safeTrack,
		disposition: decision.disposition,
		sounding: decision.disposition === 'playing',
		routing: decision.routing,
		effectiveVolume: decision.effectiveVolume,
		message: decision.message,
		queueStatus,
		ambienceLayers: ambienceLayersOf(session),
	};
}
