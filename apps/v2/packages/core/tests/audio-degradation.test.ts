import { describe, expect, it } from 'vitest';
import {
	configureAudioSource,
	dispatchCommand,
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

	it('AC1: a fully-cleared playing device with unsupported routing still plays — unavailable routing never fails the play disposition', () => {
		// AUDIO-012 AC1: when playback starts on a platform that cannot route output, the device falls back to
		// the default output and keeps playing. The disposition MUST stay 'playing' — unavailable routing does
		// NOT fail session audio state (the routing failure is reported separately, not as a play failure).
		const decision = resolveAudioDelivery(
			clearedRequest({
				preferences: { ...GRANTED_PREFERENCES, outputRouteId: 'spk-2' },
				capability: { ...FULL_CAPABILITY, canRouteOutput: false },
			}),
		);
		expect(decision.disposition).toBe('playing');
		expect(decision.routing).toBe('unavailable');
		// The device is actually sounding (unavailable routing falls back to default; audio is not blocked).
		expect(isAudioSounding(decision.disposition)).toBe(true);
		expect(decision.effectiveVolume).toBe(1);
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

describe('AUDIO-013 AC2 — safety degradation is isolated: audio failure does not block session commands', () => {
	/**
	 * AUDIO-013 AC2 — When audio is degraded by safety limits, the DM's other session commands (advance
	 * combat, roll dice, project a handout) remain within their responsiveness budgets. At the domain
	 * model level this means: the safety-degraded disposition is a PURE, NON-THROWING read-time
	 * computation that NEVER enters the combat, dice, or handout command reducers. The dispatch switch
	 * routes each command type to its own isolated handler; no handler reads from the audio safety
	 * snapshot. These tests prove the isolation is real: with audio actively playing, all three command
	 * paths succeed and leave session-audio state UNCHANGED (no cross-contamination).
	 */

	function dispatchAccept(state: CoreStateSlice, env: CoreEnvironment, cmd: CoreCommand): CoreStateSlice {
		const result: CommandResult = dispatchCommand(state, env, cmd);
		if (result.status !== 'accepted') {
			throw new Error(`expected accepted, got rejected: ${result.rejection.message}`);
		}
		return result.nextState;
	}

	/**
	 * Build an ACTIVE session with a configured local-file source and a playing audio track. This
	 * represents the state in which audio is actively playing (the safety snapshot lives device-locally,
	 * not in CoreStateSlice — so "safety-degraded" is a read-time decision that the reducers never see).
	 */
	function activeSessionWithPlayingAudio(env: CoreEnvironment): CoreStateSlice {
		const base = buildInitialState(DM_ACTOR, PLAYER_ACTOR, OBSERVER_ACTOR);
		const home = dispatchAccept(base, env, {
			type: 'command-center.ensure-home',
			actorId: DM_ACTOR.id,
			payload: {},
		});
		const sceneId = home.commandCenter.homeSceneId!;
		const active = dispatchAccept(home, env, {
			type: 'session.set-workflow',
			actorId: DM_ACTOR.id,
			payload: { workflow: 'active', activeSceneId: sceneId },
		});
		const withSource = dispatchAccept(active, env, {
			type: 'audio.configure-source',
			actorId: DM_ACTOR.id,
			payload: { sourceId: 's-local', type: 'local-file', displayName: 'Local', cacheBehavior: 'local' },
		});
		const withAsset = dispatchAccept(withSource, env, {
			type: 'audio.import-asset',
			actorId: DM_ACTOR.id,
			payload: {
				sourceId: 's-local',
				bytes: [1, 2, 3, 4],
				mimeType: 'audio/mpeg',
				fileName: 'track.mp3',
				title: 'Track',
				license: { kind: 'owned' },
			},
		});
		const assetId = Object.keys(withAsset.audio.assets)[0]!;
		return dispatchAccept(withAsset, env, {
			type: 'session.audio.play',
			actorId: DM_ACTOR.id,
			payload: { sourceId: 's-local', assetId, volume: 0.8 },
		});
	}

	it('resolveAudioDelivery at the failure limit returns safety-degraded without throwing (pure, no-side-effect)', () => {
		// Confirm the safety-degraded computation is a pure no-op from the reducers' perspective:
		// it returns a value and does NOT throw, mutate, or block anything.
		const decision = resolveAudioDelivery(
			clearedRequest({ safety: { consecutiveFailures: DEFAULT_AUDIO_FAILURE_LIMIT, resourceExceeded: false } }),
		);
		expect(decision.disposition).toBe('safety-degraded');
		// The message is a DM-facing diagnostic (not null, not empty — a real string).
		expect(decision.message).toMatch(/degraded/i);
		// The device is silent (effectiveVolume 0), which is the "stopped, not retried" behaviour.
		expect(decision.effectiveVolume).toBe(0);
	});

	it('AC2: combat.advance-turn succeeds with audio playing; session-audio state is untouched', () => {
		// Proves: the safety-degraded delivery decision never enters the combat reducer path, so an
		// audio failure cannot block or throw for advance-turn (the AUDIO-013 AC2 combat example).
		const env = makeEnvironment();
		const state = activeSessionWithPlayingAudio(env);
		expect(state.session.audioPlayback.track?.status).toBe('playing');
		const audioSourceId = state.session.audioPlayback.track?.sourceId;

		// Start combat (gate required by advance-turn).
		const withCombat = dispatchAccept(state, env, {
			type: 'combat.start',
			actorId: DM_ACTOR.id,
			payload: { combatants: [{ kind: 'monster', name: 'Goblin', initiative: 18, maxHp: 7 }] },
		});
		expect(withCombat.session.combat.status).toBe('running');
		// Audio track is UNCHANGED after combat started.
		expect(withCombat.session.audioPlayback.track?.status).toBe('playing');

		// Advance the turn — if audio safety degradation entered this path it would throw/reject.
		const afterAdvance = dispatchAccept(withCombat, env, {
			type: 'combat.advance-turn',
			actorId: DM_ACTOR.id,
			payload: {},
		});
		// Combat state advanced (round incremented on wrap with 1 combatant).
		expect(afterAdvance.session.combat.round).toBeGreaterThanOrEqual(1);
		// Audio state is UNCHANGED — the combat reducer never touches session.audioPlayback.
		expect(afterAdvance.session.audioPlayback.track?.status).toBe('playing');
		expect(afterAdvance.session.audioPlayback.track?.sourceId).toBe(audioSourceId);
	});

	it('AC2: dice.roll succeeds with audio playing; session-audio state is untouched', () => {
		// Proves: the safety-degraded delivery decision never enters the dice reducer path, so an
		// audio failure cannot block or throw for dice.roll (the AUDIO-013 AC2 dice example).
		const env = makeEnvironment();
		const state = activeSessionWithPlayingAudio(env);
		const audioSourceId = state.session.audioPlayback.track?.sourceId;
		const historyBefore = state.session.diceHistory.length;

		// Roll dice — if audio safety degradation entered this path it would throw/reject.
		const afterRoll = dispatchAccept(state, env, {
			type: 'dice.roll',
			actorId: DM_ACTOR.id,
			payload: { expression: '1d20', seed: 'test-seed-audio-isolation' },
		});
		// A roll was recorded in the dice history (the roll succeeded with a real, changed result).
		expect(afterRoll.session.diceHistory.length).toBe(historyBefore + 1);
		const roll = afterRoll.session.diceHistory[afterRoll.session.diceHistory.length - 1]!;
		expect(roll.expression).toBe('1d20');
		expect(roll.total).toBeGreaterThanOrEqual(1);
		// Audio state is UNCHANGED — the dice reducer never touches session.audioPlayback.
		expect(afterRoll.session.audioPlayback.track?.status).toBe('playing');
		expect(afterRoll.session.audioPlayback.track?.sourceId).toBe(audioSourceId);
	});

	it('AC2: session.deliver-handout succeeds with audio playing; session-audio state is untouched', () => {
		// Proves: the safety-degraded delivery decision never enters the handout reducer path, so an
		// audio failure cannot block or throw for deliver-handout (the AUDIO-013 AC2 handout example).
		const env = makeEnvironment();
		const state = activeSessionWithPlayingAudio(env);
		const audioSourceId = state.session.audioPlayback.track?.sourceId;
		const sceneId = state.commandCenter.homeSceneId!;

		// Deliver a handout — if audio safety degradation entered this path it would throw/reject.
		const afterHandout = dispatchAccept(state, env, {
			type: 'session.deliver-handout',
			actorId: DM_ACTOR.id,
			payload: {
				title: 'Ancient Scroll',
				sceneId,
				recipientActorIds: [PLAYER_ACTOR.id],
				sections: [{ id: 's-1', heading: 'Text', body: 'It says: run.', visibility: 'player-visible' }],
			},
		});
		// A handout was created and delivered (a real state mutation, not a no-op).
		expect(Object.keys(afterHandout.session.handouts).length).toBeGreaterThan(0);
		const handout = Object.values(afterHandout.session.handouts)[0]!;
		expect(handout.title).toBe('Ancient Scroll');
		// Audio state is UNCHANGED — the handout reducer never touches session.audioPlayback.
		expect(afterHandout.session.audioPlayback.track?.status).toBe('playing');
		expect(afterHandout.session.audioPlayback.track?.sourceId).toBe(audioSourceId);
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
