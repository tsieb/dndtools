import { describe, expect, it } from 'vitest';
import {
	EMPTY_AUDIO_STATE,
	EMPTY_SESSION_AUDIO_STATE,
	type AudioSource,
	type AudioState,
	type SessionAmbienceLayer,
	type SessionAudioState,
	type SessionAudioTrack,
} from '@dndtools/core';
import type { SceneRuntime } from './SceneRuntime';
import { createAudioPlaybackDriver } from './audio-playback';
import {
	MAX_MIX_CHANNELS,
	TRACK_CHANNEL_ID,
	type AudioChannelCommand,
	type AudioChannelReason,
	type AudioChannelState,
	type AudioEngine,
	type AudioEngineMode,
} from './audio-engine';

/**
 * audio-playback (RC-AUD-1.1) — the reconciler between authoritative session audio and the output
 * engine. A STUB engine records every channel command, so these tests pin the reconciliation policy
 * itself: what is commanded, with which volume and crossfade, what is released, and which honest
 * status the DM sees for each engine reason.
 */

interface StubEngine extends AudioEngine {
	commands: { channelId: string; command: AudioChannelCommand }[];
	released: string[];
	/** The reason the stub reports for a channel it was given a URL for. */
	reason: AudioChannelReason;
	detail: string | null;
	sinkIds: string[];
	sinkRejection: Error | null;
}

function stubEngine(
	overrides: { mode?: AudioEngineMode; modeDetail?: string | null; routing?: boolean } = {},
): StubEngine {
	const channels = new Map<string, AudioChannelState>();
	const engine: StubEngine = {
		mode: overrides.mode ?? 'web-audio',
		modeDetail: overrides.modeDetail ?? null,
		supportsOutputRouting: overrides.routing ?? true,
		commands: [],
		released: [],
		reason: 'sounding',
		detail: null,
		sinkIds: [],
		sinkRejection: null,
		setChannel(channelId, command) {
			engine.commands.push({ channelId, command });
			const layerCount = [...channels.keys()].filter((id) => id !== TRACK_CHANNEL_ID).length;
			if (
				channelId !== TRACK_CHANNEL_ID &&
				!channels.has(channelId) &&
				layerCount >= MAX_MIX_CHANNELS
			) {
				return { sounding: false, reason: 'unsupported', detail: 'cap' };
			}
			const state: AudioChannelState =
				command.url === null
					? { sounding: false, reason: 'idle', detail: null }
					: {
							sounding: engine.reason === 'sounding',
							reason: engine.reason,
							detail: engine.detail,
						};
			channels.set(channelId, state);
			return state;
		},
		channelState: (channelId) =>
			channels.get(channelId) ?? { sounding: false, reason: 'idle', detail: null },
		releaseChannel(channelId) {
			engine.released.push(channelId);
			channels.delete(channelId);
		},
		channelIds: () => [...channels.keys()].filter((id) => id !== TRACK_CHANNEL_ID).sort(),
		setMasterVolume: () => {},
		masterVolume: () => 1,
		playSfx: () => {},
		setSinkId(sinkId) {
			engine.sinkIds.push(sinkId);
			return engine.sinkRejection ? Promise.reject(engine.sinkRejection) : Promise.resolve();
		},
		noteUserGesture: () => {},
		dispose: () => {},
	};
	return engine;
}

function source(id: string, overrides: Partial<AudioSource> = {}): AudioSource {
	return {
		id,
		type: 'web-stream',
		displayName: `Source ${id}`,
		url: `https://stream.example.com/${id}.mp3`,
		cacheBehavior: 'cache-required',
		playbackEnabled: true,
		licenseNote: '',
		createdBy: 'dm-1',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		revision: 1,
		...overrides,
	};
}

function track(overrides: Partial<SessionAudioTrack> = {}): SessionAudioTrack {
	return {
		sourceId: 'src-1',
		assetId: null,
		status: 'playing',
		volume: 0.5,
		crossfadeSeconds: 0,
		previousSourceId: null,
		createdBy: 'dm-1',
		startedAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		revision: 1,
		...overrides,
	};
}

interface Harness {
	runtime: SceneRuntime;
	emit(): void;
	setState(session: Partial<SessionAudioState>, sources: AudioSource[]): void;
}

function harness(sources: AudioSource[], session: Partial<SessionAudioState> = {}): Harness {
	const listeners = new Set<() => void>();
	const audio = (list: AudioSource[]): AudioState => ({
		...EMPTY_AUDIO_STATE,
		sources: Object.fromEntries(list.map((s) => [s.id, s])),
	});
	const state = {
		audio: audio(sources),
		session: { audioPlayback: { ...EMPTY_SESSION_AUDIO_STATE, ...session } },
	};
	const runtime = {
		get state() {
			return state;
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	} as unknown as SceneRuntime;
	return {
		runtime,
		emit: () => {
			for (const listener of listeners) listener();
		},
		setState: (next, list) => {
			state.audio = audio(list);
			state.session = { audioPlayback: { ...EMPTY_SESSION_AUDIO_STATE, ...next } };
		},
	};
}

function commandsFor(engine: StubEngine, channelId: string): AudioChannelCommand[] {
	return engine.commands.filter((entry) => entry.channelId === channelId).map((e) => e.command);
}

function layer(
	sourceId: string,
	overrides: Partial<SessionAmbienceLayer> = {},
): SessionAmbienceLayer {
	return { sourceId, volume: 1, muted: false, ...overrides };
}

describe('audio playback reconciler — the primary track', () => {
	it('commands nothing and reports idle when the session is stopped', () => {
		const engine = stubEngine();
		const { runtime } = harness([source('src-1')]);
		const driver = createAudioPlaybackDriver(runtime, { createEngine: () => engine });
		expect(driver.getSnapshot().status).toBe('idle');
		expect(commandsFor(engine, TRACK_CHANNEL_ID)).toEqual([
			{ url: null, volume: 1, crossfadeSeconds: 0 },
		]);
	});

	it('commands the stream at the session volume and reports it playing', () => {
		const engine = stubEngine();
		const { runtime } = harness([source('src-1')], { track: track() });
		const driver = createAudioPlaybackDriver(runtime, { createEngine: () => engine });
		expect(commandsFor(engine, TRACK_CHANNEL_ID)).toEqual([
			{
				url: 'https://stream.example.com/src-1.mp3',
				volume: 0.5,
				paused: false,
				crossfadeSeconds: 0,
			},
		]);
		const snapshot = driver.getSnapshot();
		expect(snapshot.status).toBe('playing');
		expect(snapshot.engine).toBe('web-audio');
		expect(snapshot.engineDetail).toBeNull();
	});

	it('passes the core’s authoritative crossfade through verbatim', () => {
		const engine = stubEngine();
		const { runtime } = harness([source('src-1')], { track: track({ crossfadeSeconds: 4.5 }) });
		createAudioPlaybackDriver(runtime, { createEngine: () => engine });
		expect(commandsFor(engine, TRACK_CHANNEL_ID)[0].crossfadeSeconds).toBe(4.5);
	});

	it('holds the track paused rather than releasing it', () => {
		const engine = stubEngine();
		engine.reason = 'paused';
		const { runtime } = harness([source('src-1')], { track: track({ status: 'paused' }) });
		const driver = createAudioPlaybackDriver(runtime, { createEngine: () => engine });
		expect(commandsFor(engine, TRACK_CHANNEL_ID)[0].paused).toBe(true);
		expect(driver.getSnapshot().status).toBe('paused');
	});

	it('reports the plan’s honest reason and commands silence when nothing resolves', () => {
		const engine = stubEngine();
		const { runtime } = harness([source('src-1', { type: 'local-file', url: null })], {
			track: track(),
		});
		const driver = createAudioPlaybackDriver(runtime, { createEngine: () => engine });
		const snapshot = driver.getSnapshot();
		expect(snapshot.status).toBe('no-stream');
		expect(snapshot.detail).toContain('no imported audio file');
		expect(commandsFor(engine, TRACK_CHANNEL_ID)[0].url).toBeNull();
	});

	it('maps an engine error onto the error status with the engine’s own words', () => {
		const engine = stubEngine();
		engine.reason = 'error';
		engine.detail = 'The audio could not be decoded — no retry, no substitution.';
		const { runtime } = harness([source('src-1')], { track: track() });
		const driver = createAudioPlaybackDriver(runtime, { createEngine: () => engine });
		expect(driver.getSnapshot().status).toBe('error');
		expect(driver.getSnapshot().detail).toContain('no retry');
	});

	it('reports honest silent mode without commanding the engine at all', () => {
		const engine = stubEngine({ mode: 'silent', modeDetail: 'no output here', routing: false });
		const { runtime } = harness([source('src-1')], { track: track() });
		const driver = createAudioPlaybackDriver(runtime, { createEngine: () => engine });
		const snapshot = driver.getSnapshot();
		expect(snapshot.status).toBe('no-stream');
		expect(snapshot.detail).toBe('no output here');
		expect(snapshot.engine).toBe('silent');
		expect(commandsFor(engine, TRACK_CHANNEL_ID)).toEqual([]);
	});
});

describe('audio playback reconciler — ambience layers', () => {
	it('gives each layer its own channel and releases a removed one', () => {
		const engine = stubEngine();
		const sources = [source('src-1'), source('src-2')];
		const bed = harness(sources, {
			ambienceLayers: { 'layer-a': layer('src-1'), 'layer-b': layer('src-2', { volume: 0.3 }) },
		});
		const driver = createAudioPlaybackDriver(bed.runtime, { createEngine: () => engine });
		expect(driver.getSnapshot().ambience.map((l) => l.layerId)).toEqual(['layer-a', 'layer-b']);
		expect(commandsFor(engine, 'layer:layer-b')[0].volume).toBe(0.3);

		bed.setState({ ambienceLayers: { 'layer-a': layer('src-1') } }, sources);
		bed.emit();
		expect(engine.released).toContain('layer:layer-b');
		expect(driver.getSnapshot().ambience.map((l) => l.layerId)).toEqual(['layer-a']);
	});

	it('keeps a muted layer at zero gain and says it is muted', () => {
		const engine = stubEngine();
		const { runtime } = harness([source('src-1')], {
			ambienceLayers: { 'layer-a': layer('src-1', { muted: true }) },
		});
		const driver = createAudioPlaybackDriver(runtime, { createEngine: () => engine });
		const command = commandsFor(engine, 'layer:layer-a')[0];
		expect(command.url).toBe('https://stream.example.com/src-1.mp3'); // held, not stopped
		expect(command.volume).toBe(0);
		expect(driver.getSnapshot().ambience[0]).toEqual({
			layerId: 'layer-a',
			sounding: false,
			detail: 'Muted.',
		});
	});

	it('mixes up to the cap and tells the DM why the extra layers are silent', () => {
		const engine = stubEngine();
		const sources = Array.from({ length: MAX_MIX_CHANNELS + 1 }, (_, i) => source(`src-${i}`));
		const layers: Record<string, SessionAmbienceLayer> = {};
		for (let index = 0; index <= MAX_MIX_CHANNELS; index += 1) {
			// Ids are zero-padded so the plan's stable id order matches the numeric order.
			layers[`layer-${String(index).padStart(2, '0')}`] = layer(`src-${index}`);
		}
		const { runtime } = harness(sources, { ambienceLayers: layers });
		const driver = createAudioPlaybackDriver(runtime, { createEngine: () => engine });
		const ambience = driver.getSnapshot().ambience;
		expect(ambience).toHaveLength(MAX_MIX_CHANNELS + 1);
		expect(ambience.slice(0, MAX_MIX_CHANNELS).every((l) => l.sounding)).toBe(true);
		const overflow = ambience[MAX_MIX_CHANNELS];
		expect(overflow.sounding).toBe(false);
		expect(overflow.detail).toContain(`up to ${MAX_MIX_CHANNELS} ambience layers`);
		expect(engine.released).toContain(`layer:layer-0${MAX_MIX_CHANNELS}`);
	});
});

describe('audio playback reconciler — output routing (AUDIO-012)', () => {
	it('reports the routing as unavailable when the engine cannot choose a device', () => {
		const engine = stubEngine({ routing: false });
		const { runtime } = harness([source('src-1')], {
			track: track(),
			outputDevice: { deviceId: 'headset-1' },
		});
		const driver = createAudioPlaybackDriver(runtime, { createEngine: () => engine });
		expect(driver.getSnapshot().routing).toBe('unavailable');
		expect(driver.getSnapshot().routingDetail).toContain('platform default output');
		expect(engine.sinkIds).toEqual([]);
	});

	it('hands the chosen device to the engine once, not on every emit', async () => {
		const engine = stubEngine();
		const bed = harness([source('src-1')], {
			track: track(),
			outputDevice: { deviceId: 'headset-1' },
		});
		const driver = createAudioPlaybackDriver(bed.runtime, { createEngine: () => engine });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(engine.sinkIds).toEqual(['headset-1']);
		expect(driver.getSnapshot().routing).toBe('routed');
		bed.emit();
		bed.emit();
		expect(engine.sinkIds).toEqual(['headset-1']);
	});

	it('falls back to the default output honestly when the switch is refused', async () => {
		const engine = stubEngine();
		engine.sinkRejection = new Error('device unavailable');
		const bed = harness([source('src-1')], {
			track: track(),
			outputDevice: { deviceId: 'headset-1' },
		});
		const driver = createAudioPlaybackDriver(bed.runtime, { createEngine: () => engine });
		await new Promise((resolve) => setTimeout(resolve, 0));
		const snapshot = driver.getSnapshot();
		expect(snapshot.routing).toBe('unavailable');
		expect(snapshot.routingDetail).toContain('device unavailable');
		// Session audio itself is untouched: the track is still commanded and still playing.
		expect(snapshot.status).toBe('playing');
		// No hot loop: the emit that RECORDED the failure does not re-attempt it.
		expect(engine.sinkIds).toEqual(['headset-1']);
	});
});
