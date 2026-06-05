import { describe, expect, it } from 'vitest';
import {
	configureAudioSource,
	normalizeAudioParticipantPreferences,
	normalizeAudioPlatformCapability,
	normalizeAudioSafetyState,
	resolveAudioDelivery,
	resolveAudioMotionState,
	resolveAudioOutputRouting,
	shouldAnnounceAudioChange,
	isAudioConsentState,
	isAudioSounding,
	DEFAULT_AUDIO_FAILURE_LIMIT,
	UNKNOWN_AUDIO_PLATFORM_CAPABILITY,
	type AudioDeliveryRequest,
	type AudioPlatformCapability,
	type AudioSource,
} from '../src';

/**
 * AUDIO-006 / AUDIO-007 / AUDIO-008 / AUDIO-012 / AUDIO-013 — the PLATFORM + PLAYER DEGRADATION policy.
 *
 * These tests are the primary FAIL-CLOSED + DETERMINISM evidence: when consent is absent, the platform
 * cannot play, the track is offline/unlicensed/out-of-scope, or capability is unknown, the resolved
 * decision is a clearly-signalled NON-PLAYING state (never autoplay where forbidden, never an indefinite
 * retry, never a DM-state mutation). Identical capability + preference + safety inputs always produce the
 * identical decision.
 */

/** A fully-capable platform: can play audio, autoplay allowed, background allowed, routing supported. */
const FULL_CAPABILITY: AudioPlatformCapability = {
	canAutoplay: true,
	canPlayInBackground: true,
	canRouteOutput: true,
	canPlayAudio: true,
};

/** A granted, unmuted participant at full local volume on the default output. */
const GRANTED_PREFERENCES = {
	consent: 'granted' as const,
	muted: false,
	localVolume: 1,
	outputRouteId: null,
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
		url: 'https://example.com/s',
		cacheBehavior: 'cache-required',
		createdBy: 'd',
		createdAt: 't',
	});
	if (!result.ok) throw new Error('expected ok');
	return result.source;
}

/** A fully-cleared, playable request for a local-file track on a fully-capable, granted device. */
function clearedRequest(overrides: Partial<AudioDeliveryRequest> = {}): AudioDeliveryRequest {
	return {
		source: localSource(),
		assetLocallyAvailable: true,
		assetCached: false,
		cacheEvicted: false,
		online: true,
		licenseCleared: true,
		capability: FULL_CAPABILITY,
		preferences: GRANTED_PREFERENCES,
		safety: { consecutiveFailures: 0, resourceExceeded: false },
		backgrounded: false,
		...overrides,
	};
}

describe('audio degradation — normalizers fail closed', () => {
	it('an undeclared platform capability normalizes to "cannot do anything"', () => {
		expect(normalizeAudioPlatformCapability(undefined)).toEqual(UNKNOWN_AUDIO_PLATFORM_CAPABILITY);
		// A non-boolean field defaults to false (cannot do the thing).
		expect(
			normalizeAudioPlatformCapability({ canPlayAudio: 'yes' as unknown as boolean }),
		).toEqual(UNKNOWN_AUDIO_PLATFORM_CAPABILITY);
	});

	it('an absent consent value normalizes to "unset" (silent until granted — no implicit consent)', () => {
		expect(normalizeAudioParticipantPreferences(undefined).consent).toBe('unset');
		expect(
			normalizeAudioParticipantPreferences({ consent: 'bogus' as unknown as 'granted' }).consent,
		).toBe('unset');
		expect(isAudioConsentState('granted')).toBe(true);
		expect(isAudioConsentState('maybe')).toBe(false);
	});

	it('local volume clamps to [0,1] and a blank output route becomes the default', () => {
		expect(normalizeAudioParticipantPreferences({ localVolume: 2 }).localVolume).toBe(1);
		expect(normalizeAudioParticipantPreferences({ localVolume: -1 }).localVolume).toBe(0);
		expect(normalizeAudioParticipantPreferences({ localVolume: 0.4 }).localVolume).toBe(0.4);
		expect(normalizeAudioParticipantPreferences({ outputRouteId: '  ' }).outputRouteId).toBeNull();
		expect(normalizeAudioParticipantPreferences({ outputRouteId: 'spk-2' }).outputRouteId).toBe('spk-2');
	});

	it('a negative/non-finite failure count normalizes to 0', () => {
		expect(normalizeAudioSafetyState({ consecutiveFailures: -3 }).consecutiveFailures).toBe(0);
		expect(normalizeAudioSafetyState({ consecutiveFailures: NaN }).consecutiveFailures).toBe(0);
		expect(normalizeAudioSafetyState({ consecutiveFailures: 2.9 }).consecutiveFailures).toBe(2);
		expect(normalizeAudioSafetyState(undefined).resourceExceeded).toBe(false);
	});
});

describe('AUDIO-006 — platform degradation (autoplay / background / unsupported)', () => {
	it('a fully-cleared granted device on a capable platform plays at the device-local volume', () => {
		const decision = resolveAudioDelivery(clearedRequest({ preferences: { ...GRANTED_PREFERENCES, localVolume: 0.6 } }));
		expect(decision.disposition).toBe('playing');
		expect(isAudioSounding(decision.disposition)).toBe(true);
		expect(decision.effectiveVolume).toBe(0.6);
		expect(decision.availability).toBeNull();
	});

	it('a platform that cannot play audio at all fails closed to platform-unsupported', () => {
		const decision = resolveAudioDelivery(clearedRequest({ capability: { ...FULL_CAPABILITY, canPlayAudio: false } }));
		expect(decision.disposition).toBe('platform-unsupported');
		expect(decision.effectiveVolume).toBe(0);
	});

	it('an undeclared capability fails closed to platform-unsupported (not optimistic autoplay)', () => {
		const decision = resolveAudioDelivery(clearedRequest({ capability: {} as AudioPlatformCapability }));
		expect(decision.disposition).toBe('platform-unsupported');
	});

	it('a platform that blocks autoplay requires a user action rather than silently failing', () => {
		const decision = resolveAudioDelivery(clearedRequest({ capability: { ...FULL_CAPABILITY, canAutoplay: false } }));
		expect(decision.disposition).toBe('user-action-required');
		expect(decision.effectiveVolume).toBe(0);
	});

	it('AC1: a backgrounded device on a platform that blocks background playback degrades (no retry)', () => {
		const decision = resolveAudioDelivery(
			clearedRequest({ backgrounded: true, capability: { ...FULL_CAPABILITY, canPlayInBackground: false } }),
		);
		expect(decision.disposition).toBe('background-blocked');
		// A platform that DOES support background playback keeps playing while backgrounded.
		const ok = resolveAudioDelivery(clearedRequest({ backgrounded: true }));
		expect(ok.disposition).toBe('playing');
	});
});

describe('AUDIO-007 — device-local consent / mute / volume (never mutates DM state)', () => {
	it('AC1: a participant who declined audio stays silent and reports consent-blocked', () => {
		const decision = resolveAudioDelivery(clearedRequest({ preferences: { ...GRANTED_PREFERENCES, consent: 'declined' } }));
		expect(decision.disposition).toBe('consent-blocked');
		expect(decision.effectiveVolume).toBe(0);
	});

	it('consent not yet granted requires a user action (silent until consent — no implicit consent)', () => {
		const decision = resolveAudioDelivery(clearedRequest({ preferences: { ...GRANTED_PREFERENCES, consent: 'unset' } }));
		expect(decision.disposition).toBe('user-action-required');
	});

	it('a locally-muted device is silent by choice', () => {
		const decision = resolveAudioDelivery(clearedRequest({ preferences: { ...GRANTED_PREFERENCES, muted: true } }));
		expect(decision.disposition).toBe('muted');
		expect(decision.effectiveVolume).toBe(0);
	});

	it('AC2: the device-local volume only scales the device output; it is not the DM session volume', () => {
		// Two participants with different local volumes against the SAME request resolve to different
		// device-local volumes — the request (DM-authored track) is unchanged between them.
		const quiet = resolveAudioDelivery(clearedRequest({ preferences: { ...GRANTED_PREFERENCES, localVolume: 0.2 } }));
		const loud = resolveAudioDelivery(clearedRequest({ preferences: { ...GRANTED_PREFERENCES, localVolume: 0.9 } }));
		expect(quiet.effectiveVolume).toBe(0.2);
		expect(loud.effectiveVolume).toBe(0.9);
		// The decision carries no field that could mutate the DM-authored source.
		expect(quiet).not.toHaveProperty('sessionVolume');
	});
});

describe('AUDIO-008 — accessibility (reduced motion + concise announcements)', () => {
	it('AC1: reduced motion disables animated effects; otherwise effects run', () => {
		expect(resolveAudioMotionState(true)).toBe('reduced');
		expect(resolveAudioMotionState(false)).toBe('full');
		// Fail closed: a missing preference reduces motion (the safer, less-animated default).
		expect(resolveAudioMotionState(undefined)).toBe('reduced');
	});

	it('AC2: lifecycle changes are announced but high-frequency progress updates are not', () => {
		expect(shouldAnnounceAudioChange('track-started')).toBe(true);
		expect(shouldAnnounceAudioChange('track-stopped')).toBe(true);
		expect(shouldAnnounceAudioChange('track-degraded')).toBe(true);
		expect(shouldAnnounceAudioChange('progress')).toBe(false);
	});
});

describe('AUDIO-010 composition — track availability degrades cleanly (no retry, no substitution)', () => {
	it('an unlicensed asset is track-unavailable (never plays via the delivery path)', () => {
		const decision = resolveAudioDelivery(clearedRequest({ licenseCleared: false }));
		expect(decision.disposition).toBe('track-unavailable');
		expect(decision.availability).toBe('missing-asset');
	});

	it('a missing local asset reports missing-asset (the existing AUDIO-010 gate, no network retry)', () => {
		const decision = resolveAudioDelivery(clearedRequest({ assetLocallyAvailable: false }));
		expect(decision.disposition).toBe('track-unavailable');
		expect(decision.availability).toBe('missing-asset');
	});

	it('an offline uncached web stream is track-unavailable (unavailable-offline)', () => {
		const decision = resolveAudioDelivery(
			clearedRequest({ source: streamSource(), online: false, assetCached: false, assetLocallyAvailable: false }),
		);
		expect(decision.disposition).toBe('track-unavailable');
		expect(decision.availability).toBe('unavailable-offline');
	});

	it('an evicted cache reports cache-evicted (preserved, never substitutes another track)', () => {
		const decision = resolveAudioDelivery(
			clearedRequest({ source: streamSource(), online: false, cacheEvicted: true }),
		);
		expect(decision.disposition).toBe('track-unavailable');
		expect(decision.availability).toBe('cache-evicted');
	});
});

describe('AUDIO-012 — output routing (default fallback / device-local, never fails session)', () => {
	it('no chosen route uses the default output', () => {
		expect(resolveAudioOutputRouting(FULL_CAPABILITY, GRANTED_PREFERENCES)).toBe('default');
	});

	it('AC1: a chosen route on a platform without routing reports unavailable and falls back to default', () => {
		const routing = resolveAudioOutputRouting(
			{ ...FULL_CAPABILITY, canRouteOutput: false },
			{ ...GRANTED_PREFERENCES, outputRouteId: 'spk-2' },
		);
		expect(routing).toBe('unavailable');
	});

	it('AC2: a supported chosen route is honored as a device-local route', () => {
		const routing = resolveAudioOutputRouting(FULL_CAPABILITY, { ...GRANTED_PREFERENCES, outputRouteId: 'spk-2' });
		expect(routing).toBe('routed');
	});

	it('routing is reported even when the device is silent (unavailable routing never fails playback)', () => {
		// Consent-blocked (silent) but with an unsupported chosen route: the decision still reports the
		// routing fallback rather than failing — session audio state is untouched.
		const decision = resolveAudioDelivery(
			clearedRequest({
				preferences: { consent: 'declined', muted: false, localVolume: 1, outputRouteId: 'spk-2' },
				capability: { ...FULL_CAPABILITY, canRouteOutput: false },
			}),
		);
		expect(decision.disposition).toBe('consent-blocked');
		expect(decision.routing).toBe('unavailable');
	});
});

describe('AUDIO-013 — performance-safe failure modes (degrade, do not retry/block)', () => {
	it('AC1: reaching the consecutive-failure limit degrades the track rather than retrying', () => {
		const atLimit = resolveAudioDelivery(
			clearedRequest({ safety: { consecutiveFailures: DEFAULT_AUDIO_FAILURE_LIMIT, resourceExceeded: false } }),
		);
		expect(atLimit.disposition).toBe('safety-degraded');
		// One below the limit still plays (the retry budget is not yet exhausted).
		const belowLimit = resolveAudioDelivery(
			clearedRequest({ safety: { consecutiveFailures: DEFAULT_AUDIO_FAILURE_LIMIT - 1, resourceExceeded: false } }),
		);
		expect(belowLimit.disposition).toBe('playing');
	});

	it('excessive resource use degrades the track immediately', () => {
		const decision = resolveAudioDelivery(
			clearedRequest({ safety: { consecutiveFailures: 0, resourceExceeded: true } }),
		);
		expect(decision.disposition).toBe('safety-degraded');
	});

	it('a custom (lower) failure limit trips sooner', () => {
		const decision = resolveAudioDelivery(
			clearedRequest({ failureLimit: 1, safety: { consecutiveFailures: 1, resourceExceeded: false } }),
		);
		expect(decision.disposition).toBe('safety-degraded');
	});

	it('safety degradation takes precedence over track availability (stop, do not keep retrying a failing track)', () => {
		// A failing track that is ALSO offline still degrades by safety first — it is stopped, not retried.
		const decision = resolveAudioDelivery(
			clearedRequest({
				source: streamSource(),
				online: false,
				safety: { consecutiveFailures: DEFAULT_AUDIO_FAILURE_LIMIT, resourceExceeded: false },
			}),
		);
		expect(decision.disposition).toBe('safety-degraded');
	});
});

describe('determinism — identical inputs produce identical decisions', () => {
	it('the same capability + preference + safety inputs always resolve to the same decision', () => {
		const request = clearedRequest({
			preferences: { ...GRANTED_PREFERENCES, localVolume: 0.55, outputRouteId: 'spk-7' },
			safety: { consecutiveFailures: 1, resourceExceeded: false },
		});
		const a = resolveAudioDelivery(request);
		const b = resolveAudioDelivery(request);
		expect(a).toEqual(b);
	});

	it('the fixed decision ORDER is stable: platform floor → safety → track → consent → mute → autoplay → background', () => {
		// A request that fails EVERY gate resolves to the FIRST gate (platform floor), proving the order.
		const everything = resolveAudioDelivery(
			clearedRequest({
				capability: { canAutoplay: false, canPlayInBackground: false, canRouteOutput: false, canPlayAudio: false },
				preferences: { consent: 'declined', muted: true, localVolume: 1, outputRouteId: 'x' },
				safety: { consecutiveFailures: 99, resourceExceeded: true },
				licenseCleared: false,
				backgrounded: true,
			}),
		);
		expect(everything.disposition).toBe('platform-unsupported');
		// With the platform floor cleared, safety wins next.
		const safetyNext = resolveAudioDelivery(
			clearedRequest({
				preferences: { consent: 'declined', muted: true, localVolume: 1, outputRouteId: 'x' },
				safety: { consecutiveFailures: 99, resourceExceeded: true },
				licenseCleared: false,
			}),
		);
		expect(safetyNext.disposition).toBe('safety-degraded');
		// With platform + safety cleared, an unlicensed/unavailable track wins next.
		const trackNext = resolveAudioDelivery(
			clearedRequest({
				preferences: { consent: 'declined', muted: true, localVolume: 1, outputRouteId: 'x' },
				licenseCleared: false,
			}),
		);
		expect(trackNext.disposition).toBe('track-unavailable');
		// With platform + safety + track cleared, an explicit decline (consent) wins over mute.
		const consentNext = resolveAudioDelivery(
			clearedRequest({ preferences: { consent: 'declined', muted: true, localVolume: 1, outputRouteId: 'x' } }),
		);
		expect(consentNext.disposition).toBe('consent-blocked');
	});
});
