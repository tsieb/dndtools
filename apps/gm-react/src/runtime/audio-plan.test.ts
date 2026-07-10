import { describe, expect, it } from 'vitest';
import {
	EMPTY_AUDIO_STATE,
	EMPTY_SESSION_AUDIO_STATE,
	buildAudioAsset,
	type AudioAsset,
	type AudioSource,
	type AudioState,
	type SessionAudioState,
	type SessionAudioTrack,
} from '@dndtools/core';
import {
	assetIdsInUse,
	diffAmbiencePool,
	planAmbienceLayers,
	planSessionTrack,
	resolveAudioBytes,
} from './audio-plan';

/**
 * audio-plan — the PURE planning layer behind the device audio driver. These tests pin the honest
 * resolution policy: stream URLs play directly, local tracks resolve their content-addressed asset,
 * an ambiguous/unresolvable plan reports a human reason instead of guessing, and the ambience pool
 * diff is deterministic.
 */

function source(id: string, overrides: Partial<AudioSource> = {}): AudioSource {
	return {
		id,
		type: 'local-file',
		displayName: `Source ${id}`,
		url: null,
		cacheBehavior: 'local',
		playbackEnabled: true,
		licenseNote: '',
		createdBy: 'dm-1',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		revision: 1,
		...overrides,
	};
}

function asset(sourceId: string, seed: number): AudioAsset {
	const built = buildAudioAsset({
		bytes: Uint8Array.from([seed, seed + 1, seed + 2, seed + 3]),
		mimeType: 'audio/mpeg',
		fileName: `track-${seed}.mp3`,
		sourceId,
		importedBy: 'dm-1',
		importedAt: '2026-01-01T00:00:00.000Z',
	});
	if ('error' in built) throw new Error(built.error.message);
	return built;
}

function audioState(sources: AudioSource[], assets: AudioAsset[]): AudioState {
	return {
		...EMPTY_AUDIO_STATE,
		sources: Object.fromEntries(sources.map((s) => [s.id, s])),
		assets: Object.fromEntries(assets.map((a) => [a.id, a])),
	};
}

function track(overrides: Partial<SessionAudioTrack>): SessionAudioTrack {
	return {
		sourceId: 'src-1',
		assetId: null,
		status: 'playing',
		volume: 1,
		crossfadeSeconds: 0,
		previousSourceId: null,
		createdBy: 'dm-1',
		startedAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		revision: 1,
		...overrides,
	};
}

function session(overrides: Partial<SessionAudioState>): SessionAudioState {
	return { ...EMPTY_SESSION_AUDIO_STATE, ...overrides };
}

describe('resolveAudioBytes', () => {
	it('prefers a web-stream URL — the stream is the track', () => {
		const audio = audioState(
			[source('src-1', { type: 'web-stream', url: 'https://example.com/a.mp3', cacheBehavior: 'cache-required' })],
			[],
		);
		expect(resolveAudioBytes(audio, 'src-1')).toEqual({
			url: 'https://example.com/a.mp3',
			assetId: null,
			silentReason: null,
		});
	});

	it('resolves an explicit asset id for a local source', () => {
		const a = asset('src-1', 10);
		const audio = audioState([source('src-1')], [a]);
		const resolution = resolveAudioBytes(audio, 'src-1', a.id);
		expect(resolution).toEqual({ url: null, assetId: a.id, silentReason: null });
	});

	it('fails closed with a reason when the source is gone', () => {
		const resolution = resolveAudioBytes(audioState([], []), 'src-missing');
		expect(resolution.url).toBeNull();
		expect(resolution.assetId).toBeNull();
		expect(resolution.silentReason).toMatch(/no longer configured/);
	});

	it('fails closed when the explicit asset is no longer in the library', () => {
		const audio = audioState([source('src-1')], []);
		const resolution = resolveAudioBytes(audio, 'src-1', 'asset-gone');
		expect(resolution.assetId).toBeNull();
		expect(resolution.silentReason).toMatch(/no longer in the library/);
	});

	it('resolves the single owned asset of a local source (no explicit asset)', () => {
		const a = asset('src-1', 20);
		const audio = audioState([source('src-1')], [a]);
		expect(resolveAudioBytes(audio, 'src-1')).toEqual({ url: null, assetId: a.id, silentReason: null });
	});

	it('stays honestly silent when a local source owns zero or several assets', () => {
		const none = resolveAudioBytes(audioState([source('src-1')], []), 'src-1');
		expect(none.silentReason).toMatch(/no stream URL and no imported audio file/);

		const many = resolveAudioBytes(
			audioState([source('src-1')], [asset('src-1', 30), asset('src-1', 40)]),
			'src-1',
		);
		expect(many.assetId).toBeNull();
		expect(many.silentReason).toMatch(/2 imported files/);
	});
});

describe('planSessionTrack', () => {
	it('is inactive when stopped/idle', () => {
		const audio = audioState([source('src-1')], []);
		expect(planSessionTrack(session({ track: null }), audio).active).toBe(false);
	});

	it('carries paused status and a clamped volume', () => {
		const a = asset('src-1', 50);
		const audio = audioState([source('src-1')], [a]);
		const plan = planSessionTrack(
			session({ track: track({ assetId: a.id, status: 'paused', volume: 4 }) }),
			audio,
		);
		expect(plan).toMatchObject({
			active: true,
			paused: true,
			volume: 1,
			resolution: { assetId: a.id, url: null },
		});
	});
});

describe('planAmbienceLayers', () => {
	it('plans every layer in stable layer-id order with clamped volume and resolution', () => {
		const a = asset('src-local', 60);
		const audio = audioState(
			[
				source('src-local'),
				source('src-stream', { type: 'web-stream', url: 'https://example.com/rain.mp3', cacheBehavior: 'cache-required' }),
			],
			[a],
		);
		const plans = planAmbienceLayers(
			session({
				ambienceLayers: {
					'layer-b': { sourceId: 'src-stream', volume: 0.4, muted: false },
					'layer-a': { sourceId: 'src-local', volume: -3, muted: true },
				},
			}),
			audio,
		);
		expect(plans.map((p) => p.layerId)).toEqual(['layer-a', 'layer-b']);
		expect(plans[0]).toMatchObject({
			sourceId: 'src-local',
			volume: 0,
			muted: true,
			resolution: { assetId: a.id, url: null, silentReason: null },
		});
		expect(plans[1]).toMatchObject({
			volume: 0.4,
			muted: false,
			resolution: { url: 'https://example.com/rain.mp3' },
		});
	});

	it('keeps an unresolvable layer in the plan with its honest silent reason', () => {
		const plans = planAmbienceLayers(
			session({ ambienceLayers: { 'layer-x': { sourceId: 'src-gone', volume: 0.5, muted: false } } }),
			audioState([], []),
		);
		expect(plans).toHaveLength(1);
		expect(plans[0].resolution.silentReason).toMatch(/no longer configured/);
	});
});

describe('diffAmbiencePool', () => {
	it('splits planned vs existing layer ids into added / kept / removed (sorted)', () => {
		const plans = planAmbienceLayers(
			session({
				ambienceLayers: {
					'layer-b': { sourceId: 's', volume: 1, muted: false },
					'layer-c': { sourceId: 's', volume: 1, muted: false },
				},
			}),
			audioState([], []),
		);
		expect(diffAmbiencePool(['layer-a', 'layer-b'], plans)).toEqual({
			added: ['layer-c'],
			kept: ['layer-b'],
			removed: ['layer-a'],
		});
	});

	it('is empty-safe in both directions', () => {
		expect(diffAmbiencePool([], [])).toEqual({ added: [], kept: [], removed: [] });
	});
});

describe('assetIdsInUse', () => {
	it('collects only the asset-backed resolutions of the active track and layers', () => {
		const a1 = asset('src-1', 70);
		const a2 = asset('src-2', 80);
		const audio = audioState(
			[
				source('src-1'),
				source('src-2'),
				source('src-stream', { type: 'web-stream', url: 'https://example.com/x.mp3', cacheBehavior: 'cache-required' }),
			],
			[a1, a2],
		);
		const trackPlan = planSessionTrack(session({ track: track({ sourceId: 'src-1', assetId: a1.id }) }), audio);
		const layerPlans = planAmbienceLayers(
			session({
				ambienceLayers: {
					'layer-1': { sourceId: 'src-2', volume: 1, muted: false },
					'layer-2': { sourceId: 'src-stream', volume: 1, muted: false },
				},
			}),
			audio,
		);
		expect(assetIdsInUse(trackPlan, layerPlans)).toEqual(new Set([a1.id, a2.id]));
	});

	it('excludes the track asset when the session is stopped', () => {
		const audio = audioState([source('src-1')], []);
		expect(assetIdsInUse(planSessionTrack(session({ track: null }), audio), [])).toEqual(new Set());
	});
});
