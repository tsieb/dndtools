import { describe, expect, it, vi } from 'vitest';
import {
	createAudioEngine,
	DEFAULT_CROSSFADE_SECONDS,
	MAX_MIX_CHANNELS,
	SFX_CHANNEL_ID,
	TRACK_CHANNEL_ID,
	type AudioBufferLike,
	type AudioBufferSourceLike,
	type AudioContextLike,
	type AudioElementLike,
	type AudioNodeLike,
	type AudioParamLike,
	type GainNodeLike,
} from './audio-engine';

/**
 * audio-engine (RC-AUD-1.1) — the Web Audio output engine, driven entirely through a MOCKED context
 * so the graph, the crossfade ramps, the seamless loop points, the layer cap, the SFX strip, output
 * routing and every degraded mode are asserted under Node with no browser and no real sound.
 *
 * The mock is deliberately dumb: an `AudioParam` records its ramps and takes the target value
 * immediately, so a test can assert "this gain was ramped to 0 over 3 seconds" without a clock.
 */

class MockParam implements AudioParamLike {
	value = 1;
	ramps: { target: number; duration: number }[] = [];
	cancelScheduledValues(): void {}
	setValueAtTime(value: number): void {
		this.value = value;
	}
	linearRampToValueAtTime(value: number, endTime: number): void {
		this.ramps.push({ target: value, duration: endTime });
		this.value = value;
	}
	/** The last ramp scheduled on this param, or null when it was never ramped. */
	get lastRamp(): { target: number; duration: number } | null {
		return this.ramps.length > 0 ? this.ramps[this.ramps.length - 1] : null;
	}
}

class MockGain implements GainNodeLike {
	gain = new MockParam();
	connections: AudioNodeLike[] = [];
	disconnected = false;
	connect(destination: AudioNodeLike): void {
		this.connections.push(destination);
	}
	disconnect(): void {
		this.disconnected = true;
	}
}

class MockBufferSource implements AudioBufferSourceLike {
	buffer: AudioBufferLike | null = null;
	loop = false;
	loopStart = 0;
	loopEnd = 0;
	onended: (() => void) | null = null;
	started: { when?: number; offset?: number } | null = null;
	stopped = false;
	connections: AudioNodeLike[] = [];
	connect(destination: AudioNodeLike): void {
		this.connections.push(destination);
	}
	disconnect(): void {}
	start(when?: number, offset?: number): void {
		this.started = { when, offset };
	}
	stop(): void {
		this.stopped = true;
	}
}

class MockContext implements AudioContextLike {
	currentTime = 0;
	state = 'running';
	destination: AudioNodeLike = { connect: () => {}, disconnect: () => {} };
	gains: MockGain[] = [];
	sources: MockBufferSource[] = [];
	resumed = 0;
	closed = false;
	sinkIds: string[] = [];
	decodeFails = false;
	setSinkId?: (sinkId: string) => Promise<void>;

	constructor(options: { routing?: boolean } = {}) {
		if (options.routing !== false) {
			this.setSinkId = (sinkId: string): Promise<void> => {
				this.sinkIds.push(sinkId);
				return Promise.resolve();
			};
		}
	}
	createGain(): GainNodeLike {
		const gain = new MockGain();
		this.gains.push(gain);
		return gain;
	}
	createBufferSource(): AudioBufferSourceLike {
		const source = new MockBufferSource();
		this.sources.push(source);
		return source;
	}
	decodeAudioData(): Promise<AudioBufferLike> {
		return this.decodeFails
			? Promise.reject(new Error('unsupported format'))
			: Promise.resolve({ duration: 12 });
	}
	resume(): Promise<void> {
		this.resumed += 1;
		this.state = 'running';
		return Promise.resolve();
	}
	close(): Promise<void> {
		this.closed = true;
		return Promise.resolve();
	}
}

class MockElement implements AudioElementLike {
	src = '';
	volume = 1;
	loop = false;
	preload = 'none';
	paused = true;
	plays = 0;
	sinkIds: string[] = [];
	playRejection: Error | null = null;
	private errorListener: (() => void) | null = null;
	constructor(routing = true) {
		if (routing) {
			this.setSinkId = (sinkId: string): Promise<void> => {
				this.sinkIds.push(sinkId);
				return Promise.resolve();
			};
		}
	}
	setSinkId?: (sinkId: string) => Promise<void>;
	play(): Promise<void> {
		this.plays += 1;
		if (this.playRejection) return Promise.reject(this.playRejection);
		this.paused = false;
		return Promise.resolve();
	}
	pause(): void {
		this.paused = true;
	}
	load(): void {}
	removeAttribute(): void {}
	addEventListener(_type: 'error', listener: () => void): void {
		this.errorListener = listener;
	}
	/** Fire the media error the engine listens for. */
	fail(): void {
		this.errorListener?.();
	}
}

/** Let every pending microtask settle (decode/play promises). */
const flush = async (): Promise<void> => {
	await new Promise((resolve) => setTimeout(resolve, 0));
};

const BLOB = 'blob:local-track';
const OTHER_BLOB = 'blob:other-track';
const STREAM = 'https://stream.example.com/atmosphere.mp3';

function webAudioEngine(options: { context?: MockContext; onChange?: () => void } = {}): {
	engine: ReturnType<typeof createAudioEngine>;
	context: MockContext;
	elements: MockElement[];
} {
	const context = options.context ?? new MockContext();
	const elements: MockElement[] = [];
	const engine = createAudioEngine({
		createContext: () => context,
		createElement: () => {
			const element = new MockElement();
			elements.push(element);
			return element;
		},
		fetchBytes: () => Promise.resolve(new ArrayBuffer(8)),
		onChange: options.onChange,
	});
	return { engine, context, elements };
}

describe('audio engine — graph and modes', () => {
	it('runs on Web Audio when a context is granted, with a master and an SFX strip', () => {
		const { engine, context } = webAudioEngine();
		expect(engine.mode).toBe('web-audio');
		expect(engine.modeDetail).toBeNull();
		// The first two gains are master → destination and sfx → master.
		expect(context.gains).toHaveLength(2);
		const [master, sfx] = context.gains;
		expect(master.connections).toEqual([context.destination]);
		expect(sfx.connections).toEqual([master]);
	});

	it('falls back to elements when the context is denied, and says why', () => {
		const elements: MockElement[] = [];
		const engine = createAudioEngine({
			createContext: () => {
				throw new Error('the user denied audio');
			},
			createElement: () => {
				const element = new MockElement();
				elements.push(element);
				return element;
			},
		});
		expect(engine.mode).toBe('element');
		expect(engine.modeDetail).toContain('the user denied audio');
		const state = engine.setChannel(TRACK_CHANNEL_ID, { url: BLOB, volume: 1 });
		expect(state.reason).toBe('loading');
		// A blob URL cannot be decoded without a context, so it plays on an element instead.
		const voice = elements[elements.length - 1];
		expect(voice.src).toBe(BLOB);
		expect(voice.loop).toBe(true);
	});

	it('reports honest silent mode when neither a context nor an element exists', () => {
		const engine = createAudioEngine({
			createContext: () => null,
			createElement: () => null,
		});
		expect(engine.mode).toBe('silent');
		expect(engine.modeDetail).toContain('cannot output audio');
		const state = engine.setChannel(TRACK_CHANNEL_ID, { url: BLOB, volume: 1 });
		expect(state).toEqual({ sounding: false, reason: 'unsupported', detail: engine.modeDetail });
	});

	it('resumes a suspended context on the first user gesture', async () => {
		const context = new MockContext();
		context.state = 'suspended';
		const { engine } = webAudioEngine({ context });
		engine.noteUserGesture();
		await flush();
		expect(context.resumed).toBe(1);
		engine.noteUserGesture();
		expect(context.resumed).toBe(1); // already running — not resumed again
	});
});

describe('audio engine — buffer voices and loop points', () => {
	it('decodes a blob track once and loops it seamlessly inside the given window', async () => {
		const { engine, context } = webAudioEngine();
		expect(engine.setChannel(TRACK_CHANNEL_ID, { url: BLOB, volume: 0.5 }).reason).toBe('loading');
		await flush();
		expect(engine.channelState(TRACK_CHANNEL_ID)).toEqual({
			sounding: true,
			reason: 'sounding',
			detail: null,
		});
		const source = context.sources[0];
		expect(source.loop).toBe(true);
		expect(source.started).toEqual({ when: 0, offset: 0 });

		// The loop window is applied when the voice (re)starts.
		engine.setChannel(TRACK_CHANNEL_ID, {
			url: BLOB,
			volume: 0.5,
			loop: { start: 2, end: 9 },
			crossfadeSeconds: 0,
		});
		await flush();
		const looped = context.sources[context.sources.length - 1];
		expect(looped.loopStart).toBe(2);
		expect(looped.loopEnd).toBe(9);
	});

	it('clamps an inverted or out-of-range loop window to a whole-file loop', async () => {
		const { engine, context } = webAudioEngine();
		engine.setChannel(TRACK_CHANNEL_ID, {
			url: BLOB,
			volume: 1,
			loop: { start: 9, end: 3 },
		});
		await flush();
		const source = context.sources[0];
		expect(source.loop).toBe(true);
		expect(source.loopStart).toBe(0);
		expect(source.loopEnd).toBe(0);
	});

	it('holds position on pause and restarts from the offset on resume', async () => {
		const { engine, context } = webAudioEngine();
		engine.setChannel(TRACK_CHANNEL_ID, { url: BLOB, volume: 1 });
		await flush();
		context.currentTime = 5;
		expect(engine.setChannel(TRACK_CHANNEL_ID, { url: BLOB, volume: 1, paused: true }).reason).toBe(
			'paused',
		);
		expect(context.sources[0].stopped).toBe(true);
		expect(
			engine.setChannel(TRACK_CHANNEL_ID, { url: BLOB, volume: 1, paused: false }).reason,
		).toBe('sounding');
		expect(context.sources[1].started).toEqual({ when: 0, offset: 5 });
	});

	it('reports a decode failure honestly and never retries it', async () => {
		const context = new MockContext();
		context.decodeFails = true;
		const fetchBytes = vi.fn(() => Promise.resolve(new ArrayBuffer(8)));
		const engine = createAudioEngine({
			createContext: () => context,
			createElement: () => new MockElement(),
			fetchBytes,
		});
		engine.setChannel(TRACK_CHANNEL_ID, { url: BLOB, volume: 1 });
		await flush();
		const state = engine.channelState(TRACK_CHANNEL_ID);
		expect(state.sounding).toBe(false);
		expect(state.reason).toBe('error');
		expect(state.detail).toContain('unsupported format');

		// A second channel on the same URL reuses the cached failure — one fetch, no retry loop.
		engine.setChannel('layer:a', { url: BLOB, volume: 1 });
		await flush();
		expect(fetchBytes).toHaveBeenCalledTimes(1);
		expect(engine.channelState('layer:a').reason).toBe('error');
	});
});

describe('audio engine — crossfade', () => {
	it('crossfades between two tracks over the default 3 s, both voices sounding at once', async () => {
		const { engine, context } = webAudioEngine();
		engine.setChannel(TRACK_CHANNEL_ID, { url: BLOB, volume: 1 });
		await flush();
		const gainsBefore = context.gains.length;

		engine.setChannel(TRACK_CHANNEL_ID, { url: OTHER_BLOB, volume: 1 });
		await flush();
		// A new voice gain was created; the outgoing one is ramped to 0 and the incoming one to 1,
		// both over the engine default, under the same unchanged channel gain.
		expect(context.gains.length).toBe(gainsBefore + 1);
		const outgoing = context.gains[gainsBefore - 1];
		const incoming = context.gains[gainsBefore];
		expect(outgoing.gain.lastRamp).toEqual({ target: 0, duration: DEFAULT_CROSSFADE_SECONDS });
		expect(incoming.gain.lastRamp).toEqual({ target: 1, duration: DEFAULT_CROSSFADE_SECONDS });
		expect(context.sources[1].started).not.toBeNull();
		expect(context.sources[0].stopped).toBe(false); // still audible mid-crossfade
	});

	it('cuts immediately when the crossfade is configured to 0', async () => {
		const { engine, context } = webAudioEngine();
		engine.setChannel(TRACK_CHANNEL_ID, { url: BLOB, volume: 1, crossfadeSeconds: 0 });
		await flush();
		const gainsBefore = context.gains.length;
		engine.setChannel(TRACK_CHANNEL_ID, { url: OTHER_BLOB, volume: 1, crossfadeSeconds: 0 });
		await flush();
		const incoming = context.gains[gainsBefore];
		expect(incoming.gain.value).toBe(1); // full level from the first sample — no fade in
		expect(context.sources[0].stopped).toBe(true); // the outgoing voice is gone at once
	});

	it('ramps the channel gain to the commanded volume and the master gain under it', async () => {
		const { engine, context } = webAudioEngine();
		const master = context.gains[0];
		engine.setChannel(TRACK_CHANNEL_ID, { url: BLOB, volume: 0.25 });
		await flush();
		const channelGain = context.gains[2];
		expect(channelGain.gain.value).toBe(0.25);
		expect(channelGain.connections).toEqual([master]);

		engine.setMasterVolume(0.4);
		expect(engine.masterVolume()).toBe(0.4);
		expect(master.gain.lastRamp?.target).toBe(0.4);
	});
});

describe('audio engine — channels, cap and SFX', () => {
	it('mixes up to the layer cap and refuses the next layer with an honest reason', async () => {
		const { engine } = webAudioEngine();
		for (let index = 0; index < MAX_MIX_CHANNELS; index += 1) {
			expect(engine.setChannel(`layer:${index}`, { url: BLOB, volume: 1 }).reason).not.toBe(
				'unsupported',
			);
		}
		await flush();
		expect(engine.channelIds()).toHaveLength(MAX_MIX_CHANNELS);
		const overflow = engine.setChannel('layer:extra', { url: BLOB, volume: 1 });
		expect(overflow.sounding).toBe(false);
		expect(overflow.reason).toBe('unsupported');
		expect(overflow.detail).toContain(`up to ${MAX_MIX_CHANNELS} ambience layers`);

		// The reserved track/SFX strips are outside the cap and stay addressable.
		expect(engine.setChannel(TRACK_CHANNEL_ID, { url: BLOB, volume: 1 }).reason).not.toBe(
			'unsupported',
		);
		expect(engine.channelIds()).not.toContain(TRACK_CHANNEL_ID);

		engine.releaseChannel('layer:0');
		expect(engine.channelIds()).toHaveLength(MAX_MIX_CHANNELS - 1);
		expect(engine.setChannel('layer:extra', { url: BLOB, volume: 1 }).reason).not.toBe(
			'unsupported',
		);
	});

	it('fires a one-shot on the SFX strip without disturbing the beds', async () => {
		const { engine, context } = webAudioEngine();
		engine.setChannel(TRACK_CHANNEL_ID, { url: BLOB, volume: 1 });
		await flush();
		const trackSource = context.sources[0];
		const sfxGain = context.gains[1];

		engine.playSfx(BLOB, 0.8);
		await flush();
		expect(trackSource.stopped).toBe(false);
		expect(engine.channelState(SFX_CHANNEL_ID).sounding).toBe(true);
		// The SFX channel hangs off the dedicated SFX strip, not the track's.
		const sfxChannelGain = context.gains[context.gains.length - 2];
		expect(sfxChannelGain.connections).toEqual([sfxGain]);
		expect(sfxChannelGain.gain.value).toBe(0.8);
	});

	it('releases a channel and reports an idle state for it afterwards', async () => {
		const { engine } = webAudioEngine();
		engine.setChannel('layer:a', { url: BLOB, volume: 1 });
		await flush();
		engine.releaseChannel('layer:a');
		expect(engine.channelIds()).toEqual([]);
		expect(engine.channelState('layer:a')).toEqual({
			sounding: false,
			reason: 'idle',
			detail: null,
		});
	});

	it('goes idle when a channel is commanded to nothing', async () => {
		const { engine } = webAudioEngine();
		engine.setChannel(TRACK_CHANNEL_ID, { url: BLOB, volume: 1 });
		await flush();
		const state = engine.setChannel(TRACK_CHANNEL_ID, {
			url: null,
			volume: 1,
			crossfadeSeconds: 0,
		});
		expect(state).toEqual({ sounding: false, reason: 'idle', detail: null });
	});
});

describe('audio engine — stream voices and output routing', () => {
	it('plays a web stream on an element, outside the graph, and reports it sounding', async () => {
		const { engine, context, elements } = webAudioEngine();
		engine.setChannel(TRACK_CHANNEL_ID, { url: STREAM, volume: 0.5, crossfadeSeconds: 0 });
		await flush();
		const voice = elements[elements.length - 1];
		expect(voice.src).toBe(STREAM);
		expect(voice.plays).toBe(1);
		expect(context.sources).toHaveLength(0); // no buffer source: a stream is never decoded
		expect(engine.channelState(TRACK_CHANNEL_ID).reason).toBe('sounding');
		// The element carries the mixed level itself (channel × master), since it is not in the graph.
		expect(voice.volume).toBeCloseTo(0.5);
		engine.setMasterVolume(0.5);
		expect(voice.volume).toBeCloseTo(0.25);
	});

	it('reports a blocked autoplay and a failed stream honestly', async () => {
		const changes = vi.fn();
		const blocked = new Error('blocked');
		blocked.name = 'NotAllowedError';
		const elements: MockElement[] = [];
		let rejectNextPlay: Error | null = null;
		const engine = createAudioEngine({
			createContext: () => new MockContext(),
			createElement: () => {
				const element = new MockElement();
				element.playRejection = rejectNextPlay;
				elements.push(element);
				return element;
			},
			fetchBytes: () => Promise.resolve(new ArrayBuffer(8)),
			onChange: changes,
		});

		engine.setChannel('layer:a', { url: STREAM, volume: 1, crossfadeSeconds: 0 });
		rejectNextPlay = blocked;
		engine.setChannel('layer:b', { url: `${STREAM}?two`, volume: 1, crossfadeSeconds: 0 });
		await flush();
		expect(engine.channelState('layer:b').reason).toBe('blocked');
		expect(engine.channelState('layer:b').detail).toContain('blocked autoplay');
		expect(changes).toHaveBeenCalled();

		// A media error on the OTHER layer is reported on that layer alone, with no retry.
		elements[elements.length - 2].fail();
		const failed = engine.channelState('layer:a');
		expect(failed.reason).toBe('error');
		expect(failed.detail).toContain('no retry, no substitution');
	});

	it('routes both the context and every stream element to the chosen device', async () => {
		const { engine, context, elements } = webAudioEngine();
		engine.setChannel(TRACK_CHANNEL_ID, { url: STREAM, volume: 1 });
		await flush();
		expect(engine.supportsOutputRouting).toBe(true);
		await engine.setSinkId('headset-1');
		expect(context.sinkIds).toEqual(['headset-1']);
		expect(elements[elements.length - 1].sinkIds).toEqual(['headset-1']);
	});

	it('rejects routing when the platform cannot choose an output device', async () => {
		const { engine } = webAudioEngine({ context: new MockContext({ routing: false }) });
		expect(engine.supportsOutputRouting).toBe(false);
		await expect(engine.setSinkId('headset-1')).rejects.toThrow('cannot choose an audio output');
	});
});
