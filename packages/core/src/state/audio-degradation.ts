import {
	resolveAudioPlaybackAvailability,
	type AudioPlaybackAvailability,
	type AudioSource,
} from './audio-source';

/**
 * AUDIO-006 / AUDIO-007 / AUDIO-008 / AUDIO-012 / AUDIO-013 — the PLATFORM + PLAYER DEGRADATION policy.
 *
 * The existing audio gates answer "is this track playable AT ALL?" — the AUDIO-009 source-scope gate, the
 * AUDIO-010 cache/offline gate (`resolveAudioPlaybackAvailability`), and the AUDIO-004 license gate. This
 * module answers the NEXT question, per PARTICIPANT: "given the platform this participant is on, the
 * device-local preferences they set, and any recorded playback failures, SHOULD audio actually sound on
 * their device — and if not, how does it DEGRADE CLEANLY?" It composes the offline gate rather than
 * re-deriving it: a track that is already unavailable offline degrades to that same reported state; this
 * layer only adds the PLATFORM (autoplay/consent/background/routing) and PLAYER (consent/mute/safety) axes.
 *
 * The guiding invariant is FAIL CLOSED, never broken or silently-wrong. When consent is absent, the
 * platform cannot play, the track is offline/unlicensed/out-of-scope, or capability is UNKNOWN, the
 * resolved decision is a clearly-signalled NON-PLAYING state — never an indefinite retry, never autoplay
 * where the policy forbids it, and never DM-only cues leaked to a player. The participant's device-local
 * preferences (consent / mute / volume / output route) are exactly that: DEVICE-LOCAL. They change what the
 * participant HEARS; they NEVER mutate the DM-authored session audio state (AUDIO-007 AC2 / AUDIO-012 AC2).
 *
 * This module is PURE + DETERMINISTIC (no DOM, no `navigator`, no clock, no network). Identical
 * capability + permission + preference + failure inputs produce an identical degradation decision, so the
 * policy is testable and reproducible on every device. The GUI/runtime owns the IMPURE work — detecting the
 * real platform capability, capturing the user consent gesture, observing element errors — and feeds the
 * captured snapshot here; the GUI then RENDERS the computed decision (it never decides degradation itself).
 */

export const AUDIO_DEGRADATION_SCHEMA_VERSION = 1 as const;

/**
 * The PLATFORM AUDIO CAPABILITY descriptor a participant's device declares (AUDIO-006 / AUDIO-012). It is a
 * captured SNAPSHOT — the GUI/runtime derives it from the real platform (browser autoplay policy, page
 * visibility / background-playback support, output-routing support such as `setSinkId`) and passes it in.
 * Every field is a tri-state-friendly boolean with a FAIL-CLOSED default so an UNKNOWN capability degrades
 * rather than optimistically playing (see {@link normalizeAudioPlatformCapability}).
 */
export interface AudioPlatformCapability {
	/**
	 * Whether the platform permits audio to START WITHOUT a user gesture. Browsers block autoplay until the
	 * user interacts; until the consent gesture is captured this is false and playback degrades to
	 * `user-action-required` rather than silently failing (AUDIO-002 AC2 / AUDIO-006).
	 */
	canAutoplay: boolean;
	/**
	 * Whether the platform keeps audio playing when the app is BACKGROUNDED / the tab is hidden. Mobile
	 * browsers commonly suspend background audio; when false, a background playback request degrades to
	 * `background-blocked` rather than retrying indefinitely (AUDIO-006 AC1).
	 */
	canPlayInBackground: boolean;
	/**
	 * Whether the platform supports CHOOSING a non-default audio OUTPUT ROUTE (e.g. `HTMLMediaElement
	 * .setSinkId`). When false, routing falls back to the default output and a requested route reports
	 * `unavailable` — it never fails session audio state (AUDIO-012 AC1).
	 */
	canRouteOutput: boolean;
	/**
	 * Whether the platform can play audio AT ALL (an audio element/context is constructable). When false —
	 * a locked-down/headless/unknown platform — every request degrades to `platform-unsupported` (fail
	 * closed). This is the hard floor; the other capabilities only matter when this is true.
	 */
	canPlayAudio: boolean;
}

/**
 * The FAIL-CLOSED platform capability: a device whose capability was NEVER declared is treated as unable to
 * play audio at all, so an unknown platform degrades to a clearly-signalled non-playing state rather than
 * optimistically autoplaying. Every {@link normalizeAudioPlatformCapability} default flows from this.
 */
export const UNKNOWN_AUDIO_PLATFORM_CAPABILITY: AudioPlatformCapability = Object.freeze({
	canAutoplay: false,
	canPlayInBackground: false,
	canRouteOutput: false,
	canPlayAudio: false,
});

/**
 * Normalize a possibly-partial captured capability snapshot fail-closed. A MISSING or non-boolean field
 * defaults to its UNKNOWN value (cannot do the thing), so an under-specified platform degrades rather than
 * being optimistically trusted. Pure.
 */
export function normalizeAudioPlatformCapability(
	capability: Partial<AudioPlatformCapability> | undefined | null,
): AudioPlatformCapability {
	return {
		canAutoplay: capability?.canAutoplay === true,
		canPlayInBackground: capability?.canPlayInBackground === true,
		canRouteOutput: capability?.canRouteOutput === true,
		canPlayAudio: capability?.canPlayAudio === true,
	};
}

/**
 * A participant's DEVICE-LOCAL audio preferences (AUDIO-007 / AUDIO-012). These are owned by the
 * participant's DEVICE, never by the DM-authored session audio state — they change what THIS participant
 * hears and never sync as authoritative session state (Contract 2: device-local settings).
 */
export interface AudioParticipantPreferences {
	/**
	 * The participant's CONSENT to hear session audio on this device (AUDIO-007). `granted` ⇒ audio may
	 * sound (subject to the platform gate); `declined` ⇒ the device stays silent and reports consent-blocked;
	 * `unset` ⇒ NOT yet consented (fail closed: treated like a missing autoplay gesture — silent until the
	 * participant grants consent). There is no implicit consent.
	 */
	consent: AudioConsentState;
	/** Whether the participant locally MUTED session audio (AUDIO-007). A local mute keeps the device silent. */
	muted: boolean;
	/**
	 * The participant's DEVICE-LOCAL volume preference (0..1). This NEVER mutates the DM-authored session
	 * volume (AUDIO-007 AC2) — it only scales what this device outputs. Out-of-range values clamp to [0,1].
	 */
	localVolume: number;
	/**
	 * The participant's chosen device-local OUTPUT ROUTE id (a specific speaker/headset), or null for the
	 * platform default (AUDIO-012). A chosen route is honored ONLY when the platform `canRouteOutput`; it is
	 * device-local and never mutates DM-authored playback state (AUDIO-012 AC2).
	 */
	outputRouteId: string | null;
}

/** A participant's audio CONSENT state on a device (AUDIO-007). Fail closed: `unset` is treated as silent. */
export type AudioConsentState = 'granted' | 'declined' | 'unset';

export const AUDIO_CONSENT_STATES: readonly AudioConsentState[] = Object.freeze([
	'granted',
	'declined',
	'unset',
]);

/** True when `value` is a declared consent state. Unknown values fail closed to `unset` on normalize. */
export function isAudioConsentState(value: unknown): value is AudioConsentState {
	return typeof value === 'string' && (AUDIO_CONSENT_STATES as readonly string[]).includes(value);
}

/**
 * The FAIL-CLOSED default participant preferences: consent NOT yet granted (silent), not explicitly muted,
 * full local volume, default output route. A participant with no captured preferences therefore stays
 * SILENT until they explicitly grant consent (no implicit/auto consent — AUDIO-007).
 */
export const DEFAULT_AUDIO_PARTICIPANT_PREFERENCES: AudioParticipantPreferences = Object.freeze({
	consent: 'unset',
	muted: false,
	localVolume: 1,
	outputRouteId: null,
});

function clampVolume(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value)) return 1;
	if (value < 0) return 0;
	if (value > 1) return 1;
	return value;
}

/**
 * Normalize possibly-partial captured participant preferences fail-closed. An unknown/absent consent
 * value resolves to `unset` (silent until granted — no implicit consent); volume clamps to [0,1]; a blank
 * route id becomes the default (null). Pure.
 */
export function normalizeAudioParticipantPreferences(
	preferences: Partial<AudioParticipantPreferences> | undefined | null,
): AudioParticipantPreferences {
	return {
		consent: isAudioConsentState(preferences?.consent) ? preferences.consent : 'unset',
		muted: preferences?.muted === true,
		localVolume: clampVolume(preferences?.localVolume),
		outputRouteId: (preferences?.outputRouteId ?? '').toString().trim() || null,
	};
}

/**
 * AUDIO-013 — the PERFORMANCE-SAFE FAILURE-MODE tracking for a track's playback on a device. The GUI/runtime
 * observes playback element errors (decode/network/stall) and excessive resource use and records the COUNT
 * + a tripped safety flag here; this module's resolver consumes the snapshot deterministically. The COUNTS
 * are captured by the impure layer (this module never observes time or resources itself).
 */
export interface AudioSafetyState {
	/** How many times playback of this track has FAILED on this device since it last started cleanly. */
	consecutiveFailures: number;
	/** Whether the device has flagged EXCESSIVE RESOURCE use for this track (e.g. CPU/memory pressure). */
	resourceExceeded: boolean;
}

/** The fail-closed default safety state: no failures recorded, resource budget not exceeded. */
export const DEFAULT_AUDIO_SAFETY_STATE: AudioSafetyState = Object.freeze({
	consecutiveFailures: 0,
	resourceExceeded: false,
});

/**
 * The default consecutive-failure count at which playback is DEGRADED for performance safety (AUDIO-013).
 * After this many failures the track is stopped/degraded rather than retried indefinitely — the retry loop
 * is bounded so repeated failures can never block other session commands.
 */
export const DEFAULT_AUDIO_FAILURE_LIMIT = 3;

/** Normalize a possibly-partial captured safety snapshot fail-closed (non-finite counts ⇒ 0). Pure. */
export function normalizeAudioSafetyState(
	safety: Partial<AudioSafetyState> | undefined | null,
): AudioSafetyState {
	const failures = safety?.consecutiveFailures;
	return {
		consecutiveFailures:
			typeof failures === 'number' && Number.isFinite(failures) && failures > 0
				? Math.floor(failures)
				: 0,
		resourceExceeded: safety?.resourceExceeded === true,
	};
}

/**
 * The resolved AUDIO DELIVERY DISPOSITION for one participant on one device. Exactly ONE of these is the
 * deterministic outcome of the degradation policy. Every non-`playing` value is a CLEARLY-SIGNALLED
 * non-playing (degraded) state — never a broken or silently-wrong one:
 *
 *   - `playing`              — audio will sound on this device (everything cleared).
 *   - `consent-blocked`      — the participant DECLINED audio; the device stays silent (AUDIO-007 AC1).
 *   - `user-action-required` — consent not yet granted OR the platform blocks autoplay; a user gesture is
 *                              needed before audio can start (AUDIO-002 AC2 / AUDIO-006). NOT a failure.
 *   - `muted`                — the participant locally MUTED audio; silent by choice (AUDIO-007).
 *   - `background-blocked`   — the platform cannot play in the background and the app is backgrounded; the
 *                              app shows a degraded status rather than retrying indefinitely (AUDIO-006 AC1).
 *   - `platform-unsupported` — the platform cannot play audio at all (locked-down/unknown). Fail closed.
 *   - `safety-degraded`      — repeated failures / excessive resource tripped the safety limit; the track is
 *                              stopped/degraded so it cannot block other session commands (AUDIO-013).
 *   - `track-unavailable`    — the track itself is unplayable on this device (offline/missing/unlicensed/
 *                              out-of-scope per the AUDIO-009/010 gate). Reuses the existing availability.
 */
export type AudioDeliveryDisposition =
	| 'playing'
	| 'consent-blocked'
	| 'user-action-required'
	| 'muted'
	| 'background-blocked'
	| 'platform-unsupported'
	| 'safety-degraded'
	| 'track-unavailable';

/**
 * Whether a disposition means audio is actually SOUNDING on the device. Only `playing` does; every other
 * disposition is a degraded (silent) state. Used by the read model to summarize delivery without leaking
 * the precise device reason to non-DM viewers.
 */
export function isAudioSounding(disposition: AudioDeliveryDisposition): boolean {
	return disposition === 'playing';
}

/**
 * The resolved OUTPUT ROUTING for a device (AUDIO-012). Independent of whether audio is currently sounding —
 * a device can have a resolved route even while consent-blocked — so the routing decision is reported
 * separately and never fails session audio state:
 *
 *   - `default`     — the platform default output is used (no custom route requested, or routing
 *                     unsupported and we fell back to default — AUDIO-012 AC1).
 *   - `routed`      — a supported, participant-chosen device-local route is in effect (AUDIO-012 AC2).
 *   - `unavailable` — a route was requested but the platform cannot route output; reported, falls back to
 *                     the default output, never fails session audio (AUDIO-012 AC1).
 */
export type AudioOutputRouting = 'default' | 'routed' | 'unavailable';

/**
 * AUDIO-012 — resolve a device's OUTPUT ROUTING fail-closed, WITHOUT mutating any DM-authored state. The
 * participant's chosen route is honored only when the platform supports routing; otherwise it reports
 * `unavailable` and the caller uses the default output (AUDIO-012 AC1). When no route is chosen the result
 * is `default`. The participant's choice is device-local: it is the INPUT here, never an output that changes
 * session audio state (AUDIO-012 AC2). Pure.
 */
export function resolveAudioOutputRouting(
	capability: AudioPlatformCapability,
	preferences: AudioParticipantPreferences,
): AudioOutputRouting {
	if (preferences.outputRouteId === null) return 'default';
	if (!capability.canRouteOutput) return 'unavailable';
	return 'routed';
}

/**
 * The accessibility-resolved MOTION state for audio visualizers/transitions (AUDIO-008). The GUI captures
 * the participant's `prefers-reduced-motion` setting and passes it; the resolver maps it to whether
 * animated crossfade/visualizer effects should run. Fail closed: an unknown/absent preference reduces
 * motion (the safer, less-animated default).
 */
export type AudioMotionState = 'full' | 'reduced';

/**
 * AUDIO-008 — resolve whether animated audio effects (crossfade/visualizer) may run, given the participant's
 * reduced-motion preference. `prefersReducedMotion === true` ⇒ `reduced` (effects disabled/reduced);
 * otherwise `full`. Fail closed: a missing preference is treated as reduced. Pure.
 */
export function resolveAudioMotionState(prefersReducedMotion: boolean | undefined): AudioMotionState {
	return prefersReducedMotion === false ? 'full' : 'reduced';
}

/**
 * AUDIO-008 — the audio playback STATE-CHANGE announcements that are concise + safe for assistive tech. A
 * CLOSED set: a low-frequency LIFECYCLE change is announced, while high-frequency PROGRESS updates are NOT
 * (so a screen reader is not spammed for every progress tick — AUDIO-008 AC2). The GUI announces only the
 * changes this predicate admits.
 */
export type AudioAnnounceableChange =
	| 'track-started'
	| 'track-stopped'
	| 'track-paused'
	| 'track-resumed'
	| 'track-degraded'
	| 'progress';

const ANNOUNCEABLE_LIFECYCLE_CHANGES: ReadonlySet<AudioAnnounceableChange> = new Set([
	'track-started',
	'track-stopped',
	'track-paused',
	'track-resumed',
	'track-degraded',
]);

/**
 * AUDIO-008 AC2 — whether an audio state change should be announced to assistive technology. A discrete
 * LIFECYCLE change is announced; a high-frequency `progress` update is NOT (it would spam the live region).
 * Pure + deterministic, so announcements are concise and never repeated for progress ticks.
 */
export function shouldAnnounceAudioChange(change: AudioAnnounceableChange): boolean {
	return ANNOUNCEABLE_LIFECYCLE_CHANGES.has(change);
}

/**
 * The captured INPUTS that resolve to a single participant's audio delivery decision. The track-availability
 * inputs (`source` + the per-asset local/cache/online flags) are passed through to the EXISTING AUDIO-010
 * gate verbatim — this resolver does not re-derive offline behavior, it composes it.
 */
export interface AudioDeliveryRequest {
	/** The DM-authored source the active track plays through (AUDIO-009/010). */
	source: AudioSource;
	/** Whether the requested asset's bytes are locally available on this device (AUDIO-010 input). */
	assetLocallyAvailable: boolean;
	/** Whether the requested asset is explicitly cached (AUDIO-010 input). */
	assetCached: boolean;
	/** Whether a previously-cached asset was EVICTED (AUDIO-010 AC3 input). */
	cacheEvicted: boolean;
	/** Whether the device currently has network (AUDIO-010 input). */
	online: boolean;
	/**
	 * Whether the asset's LICENSE is cleared for playback (AUDIO-004 gate result, computed by the caller via
	 * `assetNeedsLicenseReview`). A flagged/unlicensed asset is `track-unavailable` here (never plays). The
	 * caller passes the already-computed gate result so this module stays decoupled from the asset record.
	 */
	licenseCleared: boolean;
	/** The platform capability captured for this participant's device (AUDIO-006/012). */
	capability: AudioPlatformCapability;
	/** The participant's device-local preferences (AUDIO-007/012). */
	preferences: AudioParticipantPreferences;
	/** The recorded performance-safety state for this track on this device (AUDIO-013). */
	safety: AudioSafetyState;
	/** Whether the app is currently BACKGROUNDED on this device (AUDIO-006 AC1 input). */
	backgrounded: boolean;
	/** The consecutive-failure limit at which safety degrades playback (defaults to {@link DEFAULT_AUDIO_FAILURE_LIMIT}). */
	failureLimit?: number;
}

/** The full resolved DELIVERY DECISION for one participant — the deterministic output of the policy. */
export interface AudioDeliveryDecision {
	disposition: AudioDeliveryDisposition;
	/** The output routing resolved for the device (independent of whether audio sounds — AUDIO-012). */
	routing: AudioOutputRouting;
	/**
	 * The effective DEVICE-LOCAL volume that WILL be applied (0..1). It reflects the participant's local
	 * preference (and is 0 when the device is silent for any reason). This is device-local only; it never
	 * reports or mutates the DM-authored session volume (AUDIO-007 AC2).
	 */
	effectiveVolume: number;
	/** The underlying AUDIO-010 availability when the disposition is `track-unavailable`, else null. */
	availability: AudioPlaybackAvailability | null;
	/** A non-leaking human reason for the disposition (DM-facing diagnostic — never device secrets). */
	message: string;
}

const DISPOSITION_MESSAGES: Record<AudioDeliveryDisposition, string> = {
	playing: 'Audio is playing on this device.',
	'consent-blocked': 'The participant declined audio; the device is silent.',
	'user-action-required': 'A user action is required before audio can start on this device.',
	muted: 'The participant muted audio locally; the device is silent.',
	'background-blocked': 'The platform cannot play audio in the background; playback is paused.',
	'platform-unsupported': 'This platform cannot play audio.',
	'safety-degraded': 'Playback was degraded after repeated failures or excessive resource use.',
	'track-unavailable': 'The track is unavailable on this device.',
};

/**
 * AUDIO-006/007/012/013 — resolve ONE participant's AUDIO DELIVERY DECISION, fail-closed and deterministic.
 *
 * The decision order is intentionally fixed so identical inputs always yield the same disposition. Each step
 * is a CLEARLY-SIGNALLED non-playing state on failure (never a broken/retrying/silently-wrong one):
 *
 *   1. PLATFORM FLOOR (AUDIO-006). The platform must be able to play audio at all; an unknown/locked-down
 *      platform is `platform-unsupported`. Fail closed for an undeclared capability.
 *   2. SAFETY (AUDIO-013). If the safety limit tripped (consecutive failures ≥ limit OR resource exceeded),
 *      playback is `safety-degraded` — stopped, NOT retried — so it cannot block other session commands.
 *   3. TRACK AVAILABILITY (AUDIO-004/009/010). The track must be license-cleared AND resolve `available`
 *      through the EXISTING offline gate; otherwise it is `track-unavailable` (the precise availability is
 *      surfaced for the DM). No network retry, no track substitution.
 *   4. CONSENT (AUDIO-007 AC1). A participant who DECLINED is `consent-blocked` (silent). Consent that is
 *      not yet granted falls through to step 6 (a user action can still grant it).
 *   5. MUTE (AUDIO-007). A locally-muted device is `muted` (silent by choice).
 *   6. AUTOPLAY / CONSENT GESTURE (AUDIO-002 AC2 / AUDIO-006). If consent is not yet granted, or the
 *      platform blocks autoplay, a user gesture is required ⇒ `user-action-required` (not a failure).
 *   7. BACKGROUND (AUDIO-006 AC1). If the app is backgrounded and the platform cannot play in the
 *      background ⇒ `background-blocked` — degraded, not retried indefinitely.
 *   8. Otherwise ⇒ `playing`.
 *
 * Routing (AUDIO-012) and effective device-local volume are resolved independently and ALWAYS reported, so
 * a device's route choice is visible even while silent and never mutates DM-authored session state.
 */
export function resolveAudioDelivery(request: AudioDeliveryRequest): AudioDeliveryDecision {
	const capability = normalizeAudioPlatformCapability(request.capability);
	const preferences = normalizeAudioParticipantPreferences(request.preferences);
	const safety = normalizeAudioSafetyState(request.safety);
	const failureLimit = Math.max(1, Math.floor(request.failureLimit ?? DEFAULT_AUDIO_FAILURE_LIMIT));

	// Routing + device-local volume are resolved regardless of the play/silent disposition (AUDIO-012).
	const routing = resolveAudioOutputRouting(capability, preferences);

	const decide = (
		disposition: AudioDeliveryDisposition,
		availability: AudioPlaybackAvailability | null = null,
	): AudioDeliveryDecision => ({
		disposition,
		routing,
		// Device-local volume only matters while sounding; a silent device applies 0 (no DM-state change).
		effectiveVolume: disposition === 'playing' ? preferences.localVolume : 0,
		availability,
		message: DISPOSITION_MESSAGES[disposition],
	});

	// (1) Platform floor — fail closed for an unknown/locked-down platform.
	if (!capability.canPlayAudio) return decide('platform-unsupported');

	// (2) Performance-safe failure mode (AUDIO-013) — stop/degrade rather than retry indefinitely.
	if (safety.resourceExceeded || safety.consecutiveFailures >= failureLimit) {
		return decide('safety-degraded');
	}

	// (3) Track availability — compose the EXISTING AUDIO-004 license + AUDIO-009/010 offline gates.
	if (!request.licenseCleared) {
		return decide('track-unavailable', 'missing-asset');
	}
	const availability = resolveAudioPlaybackAvailability({
		source: request.source,
		assetLocallyAvailable: request.assetLocallyAvailable,
		assetCached: request.assetCached,
		cacheEvicted: request.cacheEvicted,
		online: request.online,
	});
	if (availability !== 'available') {
		return decide('track-unavailable', availability);
	}

	// (4) Explicit decline keeps the device silent (AUDIO-007 AC1).
	if (preferences.consent === 'declined') return decide('consent-blocked');

	// (5) Local mute keeps the device silent (AUDIO-007).
	if (preferences.muted) return decide('muted');

	// (6) Consent gesture / autoplay gate (AUDIO-002 AC2 / AUDIO-006). Consent not yet granted, or a
	// platform that blocks autoplay, requires a user action before audio can start.
	if (preferences.consent !== 'granted' || !capability.canAutoplay) {
		return decide('user-action-required');
	}

	// (7) Background playback gate (AUDIO-006 AC1) — degrade, do not retry indefinitely.
	if (request.backgrounded && !capability.canPlayInBackground) {
		return decide('background-blocked');
	}

	// (8) Everything cleared — audio sounds at the device-local volume.
	return decide('playing');
}
