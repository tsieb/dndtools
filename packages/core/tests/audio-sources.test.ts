import { describe, expect, it } from 'vitest';
import {
	classifyAudioSource,
	configureAudioSource,
	dispatchCommand,
	ensureAudioState,
	isSupportedAudioSourceType,
	listAudioSourceClassificationsForActor,
	resolveAudioPlaybackAvailability,
	resolveAudioPlaybackForActor,
	type AudioSource,
	type CommandResult,
	type CoreCommand,
	type CoreEnvironment,
	type CoreStateSlice,
} from '../src';
import {
	DM_ACTOR,
	PLAYER_ACTOR,
	buildInitialState,
	makeEnvironment,
} from '../src/testing/fixtures';

/**
 * AUDIO-009 — only DECLARED audio source types can be configured; an unsupported provider is REJECTED with
 * an unsupported-source diagnostic and NO playback state is created. AUDIO-010 — cache/offline behavior is
 * declared per source type and is the PREREQUISITE for enabling playback; offline availability is resolved
 * fail-closed with NO network retry and NO track substitution. Tests are the primary fail-closed evidence.
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

function dispatch(
	state: CoreStateSlice,
	env: CoreEnvironment,
	command: CoreCommand,
): CommandResult {
	return dispatchCommand(state, env, command);
}

function configureCommand(payload: Record<string, unknown>): CoreCommand {
	return { type: 'audio.configure-source', actorId: DM_ACTOR.id, payload };
}

function localSource(overrides: Partial<AudioSource> = {}): AudioSource {
	const result = configureAudioSource({
		id: 's-local',
		type: 'local-file',
		displayName: 'Local',
		cacheBehavior: 'local',
		createdBy: 'd',
		createdAt: 't',
	});
	if (!result.ok) throw new Error('expected ok');
	return { ...result.source, ...overrides };
}

describe('AUDIO-009 — declared source-type registry + fail-closed configuration', () => {
	it('recognizes only the three declared supported types; everything else is unsupported', () => {
		expect(isSupportedAudioSourceType('local-file')).toBe(true);
		expect(isSupportedAudioSourceType('bundled-preset')).toBe(true);
		expect(isSupportedAudioSourceType('web-stream')).toBe(true);
		expect(isSupportedAudioSourceType('spotify')).toBe(false);
		expect(isSupportedAudioSourceType('youtube')).toBe(false);
	});

	it('AC1: classifies a configured source by type + licensing + cache behavior', () => {
		const result = configureAudioSource({
			id: 's1',
			type: 'web-stream',
			displayName: 'Ambient stream',
			url: 'https://example.com/stream',
			cacheBehavior: 'cache-required',
			createdBy: 'd',
			createdAt: 't',
		});
		if (!result.ok) throw new Error('expected ok');
		const classification = classifyAudioSource(result.source);
		expect(classification).toMatchObject({
			type: 'web-stream',
			supported: true,
			cacheBehavior: 'cache-required',
			offlineAvailability: 'cached',
			playbackEnabled: true,
			requiresPerAssetLicense: true,
		});
	});

	it('AC2: an unsupported provider is rejected fail-closed (no source record)', () => {
		const result = configureAudioSource({
			id: 's-bad',
			type: 'spotify',
			displayName: 'Spotify',
			createdBy: 'd',
			createdAt: 't',
		});
		expect(result.ok).toBe(false);
		if (result.ok) throw new Error('expected reject');
		expect(result.reason).toBe('unsupported-source-type');
	});

	it('a web-stream without a URL, and a cache behavior the type forbids, are rejected', () => {
		const noUrl = configureAudioSource({
			id: 's',
			type: 'web-stream',
			displayName: 'Stream',
			cacheBehavior: 'none',
			createdBy: 'd',
			createdAt: 't',
		});
		expect(noUrl.ok).toBe(false);
		if (!noUrl.ok) expect(noUrl.reason).toBe('missing-url');

		const badCache = configureAudioSource({
			id: 's',
			type: 'local-file',
			displayName: 'Local',
			cacheBehavior: 'cache-required',
			createdBy: 'd',
			createdAt: 't',
		});
		expect(badCache.ok).toBe(false);
		if (!badCache.ok) expect(badCache.reason).toBe('cache-behavior-not-allowed');
	});

	it('rejects unsafe, relative, and credential-bearing stream URLs', () => {
		for (const url of [
			'javascript:alert(1)',
			'data:audio/mpeg;base64,AA==',
			'./relative.mp3',
			'https://user:secret@example.test/stream.mp3',
		]) {
			const result = configureAudioSource({
				id: 's-unsafe',
				type: 'web-stream',
				displayName: 'Unsafe stream',
				url,
				cacheBehavior: 'none',
				createdBy: 'd',
				createdAt: 't',
			});
			expect(result).toMatchObject({ ok: false, reason: 'unsafe-url' });
		}
	});
});

describe('AUDIO-009 — configure-source command', () => {
	it('AC1: the DM configures a declared source; it lands in the registry classified', () => {
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const result = accept(
			dispatch(
				state,
				env,
				configureCommand({
					type: 'bundled-preset',
					displayName: 'Tavern preset',
					cacheBehavior: 'local',
				}),
			),
		);
		expect(result.events[0]).toMatchObject({
			kind: 'audio.source-configured',
			sourceType: 'bundled-preset',
			playbackEnabled: true,
		});
		const classifications = listAudioSourceClassificationsForActor(
			result.nextState.audio,
			result.nextState.permissions,
			DM_ACTOR.id,
		);
		expect(classifications).toHaveLength(1);
		expect(classifications[0]).toMatchObject({ type: 'bundled-preset', supported: true });
	});

	it('AC2: an unsupported provider is rejected with the unsupported-audio-source code; NO playback state', () => {
		const state = buildInitialState(DM_ACTOR);
		const env = makeEnvironment();
		const result = rejected(
			dispatch(state, env, configureCommand({ type: 'soundcloud', displayName: 'SoundCloud' })),
		);
		expect(result.rejection.code).toBe('unsupported-audio-source');
		// No source record was created, so no playback state exists.
		expect(Object.keys(result.nextState.audio.sources)).toHaveLength(0);
	});

	it('rejects a non-DM configuring a source fail-closed', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const env = makeEnvironment();
		const result = rejected(
			dispatch(state, env, {
				...configureCommand({ type: 'local-file', displayName: 'Local', cacheBehavior: 'local' }),
				actorId: PLAYER_ACTOR.id,
			}),
		);
		expect(result.rejection.code).toBe('actor-not-authorized');
	});

	it('a player sees an EMPTY source classification list (no leak)', () => {
		let state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const env = makeEnvironment();
		state = accept(
			dispatch(
				state,
				env,
				configureCommand({ type: 'local-file', displayName: 'Local', cacheBehavior: 'local' }),
			),
		).nextState;
		expect(
			listAudioSourceClassificationsForActor(state.audio, state.permissions, PLAYER_ACTOR.id),
		).toHaveLength(0);
	});
});

describe('AUDIO-010 — cache/offline behavior as a playback prerequisite', () => {
	it('a source with undeclared cache behavior is NOT playback-enabled (prerequisite)', () => {
		const result = configureAudioSource({
			id: 's',
			type: 'local-file',
			displayName: 'Local',
			// no cacheBehavior declared
			createdBy: 'd',
			createdAt: 't',
		});
		if (!result.ok) throw new Error('expected ok');
		expect(result.source.cacheBehavior).toBe('undeclared');
		expect(result.source.playbackEnabled).toBe(false);
		expect(classifyAudioSource(result.source).playbackEnabled).toBe(false);
	});

	it('an undeclared-cache source reports playback-disabled when a playback request is resolved', () => {
		const source = configureAudioSource({
			id: 's',
			type: 'local-file',
			displayName: 'Local',
			createdBy: 'd',
			createdAt: 't',
		});
		if (!source.ok) throw new Error('ok');
		expect(
			resolveAudioPlaybackAvailability({
				source: source.source,
				assetLocallyAvailable: true,
				assetCached: false,
				cacheEvicted: false,
				online: true,
			}),
		).toBe('playback-disabled');
	});

	it('AC1: a local-file source offline uses local availability (no retry); missing reports missing-asset', () => {
		const source = localSource();
		expect(
			resolveAudioPlaybackAvailability({
				source,
				assetLocallyAvailable: true,
				assetCached: false,
				cacheEvicted: false,
				online: false,
			}),
		).toBe('available');
		expect(
			resolveAudioPlaybackAvailability({
				source,
				assetLocallyAvailable: false,
				assetCached: false,
				cacheEvicted: false,
				online: false,
			}),
		).toBe('missing-asset');
	});

	it('AC2: a web-stream source offline reports unavailable unless an explicitly cached asset exists', () => {
		const result = configureAudioSource({
			id: 's',
			type: 'web-stream',
			displayName: 'Stream',
			url: 'https://example.com/s',
			cacheBehavior: 'cache-required',
			createdBy: 'd',
			createdAt: 't',
		});
		if (!result.ok) throw new Error('ok');
		const source = result.source;
		// Offline + not cached ⇒ unavailable.
		expect(
			resolveAudioPlaybackAvailability({
				source,
				assetLocallyAvailable: false,
				assetCached: false,
				cacheEvicted: false,
				online: false,
			}),
		).toBe('unavailable-offline');
		// Offline + cached ⇒ available.
		expect(
			resolveAudioPlaybackAvailability({
				source,
				assetLocallyAvailable: false,
				assetCached: true,
				cacheEvicted: false,
				online: false,
			}),
		).toBe('available');
		// Online ⇒ available regardless of cache.
		expect(
			resolveAudioPlaybackAvailability({
				source,
				assetLocallyAvailable: false,
				assetCached: false,
				cacheEvicted: false,
				online: true,
			}),
		).toBe('available');
	});

	it('AC3: an evicted cache reports cache-evicted and never substitutes another track', () => {
		const result = configureAudioSource({
			id: 's',
			type: 'web-stream',
			displayName: 'Stream',
			url: 'https://example.com/s',
			cacheBehavior: 'cache-required',
			createdBy: 'd',
			createdAt: 't',
		});
		if (!result.ok) throw new Error('ok');
		expect(
			resolveAudioPlaybackAvailability({
				source: result.source,
				assetLocallyAvailable: false,
				assetCached: true,
				cacheEvicted: true,
				online: false,
			}),
		).toBe('cache-evicted');
	});

	it('a none-cache source is available online and unavailable offline', () => {
		const result = configureAudioSource({
			id: 's',
			type: 'web-stream',
			displayName: 'Stream',
			url: 'https://example.com/s',
			cacheBehavior: 'none',
			createdBy: 'd',
			createdAt: 't',
		});
		if (!result.ok) throw new Error('ok');
		expect(
			resolveAudioPlaybackAvailability({
				source: result.source,
				assetLocallyAvailable: false,
				assetCached: false,
				cacheEvicted: false,
				online: true,
			}),
		).toBe('available');
		expect(
			resolveAudioPlaybackAvailability({
				source: result.source,
				assetLocallyAvailable: false,
				assetCached: false,
				cacheEvicted: false,
				online: false,
			}),
		).toBe('unavailable-offline');
	});

	it('resolveAudioPlaybackForActor: a non-DM gets null; an unknown source/asset gets null (fail closed)', () => {
		const state = buildInitialState(DM_ACTOR, PLAYER_ACTOR);
		const audio = ensureAudioState({
			assets: {},
			sources: { s: localSource() },
			schemaVersion: 1 as const,
		});
		const withAudio = { ...state, audio };
		expect(
			resolveAudioPlaybackForActor(withAudio.audio, withAudio.permissions, PLAYER_ACTOR.id, {
				sourceId: 's',
				assetLocallyAvailable: true,
				assetCached: false,
				cacheEvicted: false,
				online: true,
			}),
		).toBeNull();
		expect(
			resolveAudioPlaybackForActor(withAudio.audio, withAudio.permissions, DM_ACTOR.id, {
				sourceId: 'missing',
				assetLocallyAvailable: true,
				assetCached: false,
				cacheEvicted: false,
				online: true,
			}),
		).toBeNull();
	});

	it('hydration fails closed: a persisted source with undeclared cache cannot re-enable playback', () => {
		const audio = ensureAudioState({
			assets: {},
			sources: {
				s: { ...localSource(), cacheBehavior: 'undeclared', playbackEnabled: true },
			},
			schemaVersion: 1 as const,
		});
		expect(audio.sources['s']?.playbackEnabled).toBe(false);
	});
});
