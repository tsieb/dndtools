import type { PermissionState } from '../state/permission-state';
import { getActor } from '../state/permission-state';
import type { AudioState } from '../state/audio-state';
import { classifyAudioSource } from '../state/audio-source';
import { assetNeedsLicenseReview } from '../state/audio-asset';
import {
	isAudioSounding,
	resolveAudioDelivery,
	type AudioDeliveryDecision,
	type AudioDeliveryDisposition,
	type AudioOutputRouting,
	type AudioParticipantPreferences,
	type AudioPlatformCapability,
	type AudioSafetyState,
} from '../state/audio-degradation';

/**
 * AUDIO-006 / AUDIO-007 / AUDIO-012 / AUDIO-013 — the ACTOR-FILTERED audio-delivery read model.
 *
 * The {@link resolveAudioDelivery} policy is the pure decision; this is the only SANCTIONED read path that
 * applies it with the data-layer visibility rules (Architecture Contract 3) BEFORE returning anything:
 *
 *   - The DM inspecting session status sees EVERY participant's resolved delivery STATE — so a participant
 *     who cannot play audio is visible (AUDIO-006 AC2) — but the snapshot carries only the NON-LEAKING
 *     disposition + routing + whether the device is sounding. It NEVER carries device secrets (no raw
 *     platform fingerprint, no chosen output-route DEVICE id is echoed back as DM state, no consent token).
 *   - A PARTICIPANT sees only THEIR OWN resolved decision — never another participant's device state, and
 *     never any DM-only audio config (the source/asset records stay behind the DM-only library query).
 *
 * The participant's device-local preferences are the INPUT to the decision; resolving them here never
 * mutates the DM-authored session audio state (AUDIO-007 AC2 / AUDIO-012 AC2) — this is a pure read.
 *
 * Pure + deterministic. No GUI, no storage, no clock, no network.
 */

/** The per-track availability + device inputs captured for ONE participant (the impure layer fills these). */
export interface AudioParticipantDeviceInput {
	actorId: string;
	/** Whether the active track's asset bytes are locally available on this device (AUDIO-010 input). */
	assetLocallyAvailable: boolean;
	/** Whether the active track's asset is explicitly cached (AUDIO-010 input). */
	assetCached: boolean;
	/** Whether a previously-cached asset was EVICTED (AUDIO-010 AC3 input). */
	cacheEvicted: boolean;
	/** Whether this device currently has network (AUDIO-010 input). */
	online: boolean;
	/** The platform capability captured for this device (AUDIO-006/012). */
	capability: Partial<AudioPlatformCapability>;
	/** This participant's device-local preferences (AUDIO-007/012). */
	preferences: Partial<AudioParticipantPreferences>;
	/** The recorded performance-safety state for the active track on this device (AUDIO-013). */
	safety?: Partial<AudioSafetyState>;
	/** Whether the app is currently backgrounded on this device (AUDIO-006 AC1 input). */
	backgrounded?: boolean;
}

/**
 * The active-track context the DM authored (AUDIO-009/010 source + asset). It is the SAME track for every
 * participant; only the device inputs differ per participant. Resolved against the live audio library so a
 * deleted source/asset or a revoked license fails closed.
 */
export interface AudioActiveTrack {
	/** The configured source id the active track plays through. */
	sourceId: string;
	/** The active track's local asset id, or null for a pure-stream track. */
	assetId: string | null;
	/** The failure limit at which safety degrades playback (defaults to the policy default). */
	failureLimit?: number;
}

/**
 * A NON-LEAKING per-participant delivery snapshot for the DM session-status surface (AUDIO-006 AC2). It
 * reports WHETHER and WHY audio is/ isn't sounding for the participant, plus their resolved routing — and
 * nothing that would expose a device SECRET (no platform fingerprint, no raw route device id, no token).
 */
export interface AudioParticipantDeliveryView {
	actorId: string;
	/** The resolved delivery disposition (playing / degraded reason) — never device secrets. */
	disposition: AudioDeliveryDisposition;
	/** Whether audio is actually SOUNDING on the device (true only for `playing`). */
	sounding: boolean;
	/** The resolved output routing for the device (AUDIO-012) — `default` / `routed` / `unavailable`. */
	routing: AudioOutputRouting;
	/** A non-leaking human reason (DM-facing diagnostic). */
	message: string;
}

function toDeliveryView(actorId: string, decision: AudioDeliveryDecision): AudioParticipantDeliveryView {
	return {
		actorId,
		disposition: decision.disposition,
		sounding: isAudioSounding(decision.disposition),
		routing: decision.routing,
		message: decision.message,
	};
}

/**
 * Resolve ONE participant's delivery decision against the active track + live library, fail-closed. The
 * track availability is re-derived from the LIVE library so a deleted source/asset or an unlicensed asset
 * is `track-unavailable` (never plays). Returns null when the source no longer resolves to a supported type.
 */
function resolveForParticipant(
	state: AudioState,
	track: AudioActiveTrack,
	device: AudioParticipantDeviceInput,
): AudioDeliveryDecision | null {
	const source = state.sources[track.sourceId];
	// Fail closed: a deleted source, or one whose type no longer resolves to a supported type, yields no
	// playable track. (A non-DM never reaches here for a hidden source — see the actor gate below.)
	if (!source || !classifyAudioSource(source).supported) return null;

	// AUDIO-004 license gate, computed from the LIVE asset record (a stream track with no asset is cleared).
	const asset = track.assetId !== null ? state.assets[track.assetId] : undefined;
	if (track.assetId !== null && !asset) return null;
	const licenseCleared = asset === undefined ? true : !assetNeedsLicenseReview(asset);

	return resolveAudioDelivery({
		source,
		assetLocallyAvailable: device.assetLocallyAvailable,
		assetCached: device.assetCached,
		cacheEvicted: device.cacheEvicted,
		online: device.online,
		licenseCleared,
		capability: { ...device.capability } as AudioPlatformCapability,
		preferences: { ...device.preferences } as AudioParticipantPreferences,
		safety: { ...(device.safety ?? {}) } as AudioSafetyState,
		backgrounded: device.backgrounded === true,
		failureLimit: track.failureLimit,
	});
}

/**
 * AUDIO-006 AC2 — for the DM, resolve EVERY participant's delivery state for the active track. The DM sees a
 * roster of non-leaking delivery snapshots (stable actor-id order), so a participant who cannot play audio
 * is visible WITHOUT exposing any device secret. A non-DM actor gets an EMPTY list (the session-status
 * roster is DM-only — fail closed, no leak). A participant whose source no longer resolves is OMITTED (the
 * track is not playable for anyone), which is itself a fail-closed signal the DM can act on.
 */
export function listAudioDeliveryForDm(
	state: AudioState,
	permissions: PermissionState,
	actorId: string,
	track: AudioActiveTrack,
	devices: readonly AudioParticipantDeviceInput[],
): AudioParticipantDeliveryView[] {
	const actor = getActor(permissions, actorId);
	if (actor?.role !== 'dm') return [];
	return [...devices]
		.sort((a, b) => a.actorId.localeCompare(b.actorId))
		.flatMap((device) => {
			const decision = resolveForParticipant(state, track, device);
			return decision ? [toDeliveryView(device.actorId, decision)] : [];
		});
}

/**
 * AUDIO-007 / AUDIO-012 — resolve the requesting participant's OWN delivery decision for the active track.
 * A participant sees only their own decision (never another device's state, never DM-only audio config).
 * Returns null when the source/asset no longer resolves (the track is unavailable; nothing to play). This
 * is a pure read — the participant's device-local preferences are the input and never mutate session state.
 */
export function resolveAudioDeliveryForActor(
	state: AudioState,
	permissions: PermissionState,
	actorId: string,
	track: AudioActiveTrack,
	device: Omit<AudioParticipantDeviceInput, 'actorId'>,
): AudioDeliveryDecision | null {
	const actor = getActor(permissions, actorId);
	// Any authenticated participant may resolve their OWN delivery (audio is player-safe: yes for AUDIO-006/
	// 007/012). An unknown actor fails closed to null.
	if (!actor) return null;
	return resolveForParticipant(state, track, { ...device, actorId });
}
