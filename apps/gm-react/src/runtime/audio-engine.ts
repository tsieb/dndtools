/**
 * audio-engine — RC-AUD-1.1. The DEVICE-LOCAL audio OUTPUT ENGINE: a Web Audio graph that replaces
 * the bare `HTMLAudioElement` driver behind the same authoritative-state reconciliation.
 *
 * The split this file completes:
 *   - `audio-plan.ts` (pure) decides WHAT should sound, from core state alone.
 *   - `audio-playback.ts` reconciles that plan against this engine on every runtime emit.
 *   - THIS file owns HOW sound is produced: the graph, the gain nodes, the crossfades, the loop
 *     points, the output device, and the honest fallback when the platform denies us a context.
 *
 * ## The graph
 *
 *     voice gain ─┐
 *     voice gain ─┴→ channel gain ─┐
 *                    channel gain ─┼→ master gain → destination
 *                        sfx gain ─┘
 *
 * A CHANNEL is one mixer strip: the primary session track (`TRACK_CHANNEL_ID`), one per ambience
 * layer (up to `MAX_MIX_CHANNELS`), plus the one-shot `SFX_CHANNEL_ID` strip. A channel holds its
 * authoritative volume; each VOICE inside it holds a fade envelope, so a channel can hold two
 * voices at once — that is what a crossfade IS here: the outgoing voice ramps to 0 and stops while
 * the incoming voice ramps up, both under the unchanged channel gain.
 *
 * ## Two voice kinds, chosen by URL scheme (deliberate, not incidental)
 *
 *   - `blob:` — an IMPORTED asset's bytes. Fetched, decoded once (cached by URL) and played through
 *     an `AudioBufferSourceNode` with `loop` + `loopStart`/`loopEnd`. This is the only way to get a
 *     SEAMLESS loop: an `<audio>` element re-buffers at the loop boundary and audibly gaps.
 *   - anything else (`http(s):`, `data:`) — a web STREAM of unknown, possibly infinite length.
 *     Played on an `HTMLAudioElement` DIRECTLY, not through a `MediaElementAudioSourceNode`. That
 *     is the honest choice: routing a cross-origin stream that serves no CORS headers into a Web
 *     Audio graph outputs SILENCE, which would be a regression against the element driver this
 *     engine replaces. Element voices still crossfade (a timer ramp on `volume`) and still route
 *     with `el.setSinkId`; they simply cannot carry loop points.
 *
 * ## Degradation (fail closed and honest — no fake success)
 *
 *   - `web-audio` — a context was granted. Full mixing, crossfades, loop points, `setSinkId`.
 *   - `element` — `AudioContext` is absent or was denied. Every voice is an element voice; the
 *     engine still mixes volumes and crossfades, but loop points collapse to whole-file looping.
 *   - `silent` — neither a context nor an audio element can be created. Nothing sounds and every
 *     channel reports WHY. The engine never pretends, never retries in a hot loop, never
 *     substitutes a track.
 *
 * Pure-ish by construction: every platform dependency (`AudioContext`, `Audio`, `fetch`) is an
 * injectable factory, so the whole engine runs under a mocked context in `audio-engine.test.ts`.
 */

/** The ambience-layer mixing cap (RC-AUD-1.1). `TRACK_CHANNEL_ID`/`SFX_CHANNEL_ID` are outside it. */
export const MAX_MIX_CHANNELS = 6;

/** The engine's default crossfade, in seconds. Every channel command may override it. */
export const DEFAULT_CROSSFADE_SECONDS = 3;

/** The reserved channel id of the primary session track. */
export const TRACK_CHANNEL_ID = 'track';

/** The reserved channel id of the one-shot sound-effect strip. */
export const SFX_CHANNEL_ID = 'sfx';

/** The shortest fade the engine will schedule — a click-free step, used for volume changes. */
const SMOOTHING_SECONDS = 0.03;

/** How often an element voice's timer-driven fade steps. */
const ELEMENT_FADE_STEP_MS = 50;

// ── Structural platform types ────────────────────────────────────────────────────────────────
// Deliberately minimal so a plain object can stand in for the real thing under Node in tests.

export interface AudioParamLike {
	value: number;
	cancelScheduledValues(startTime: number): void;
	setValueAtTime(value: number, startTime: number): void;
	linearRampToValueAtTime(value: number, endTime: number): void;
}

export interface AudioNodeLike {
	connect(destination: AudioNodeLike): void;
	disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike {
	gain: AudioParamLike;
}

export interface AudioBufferLike {
	duration: number;
}

export interface AudioBufferSourceLike extends AudioNodeLike {
	buffer: AudioBufferLike | null;
	loop: boolean;
	loopStart: number;
	loopEnd: number;
	onended: (() => void) | null;
	start(when?: number, offset?: number): void;
	stop(when?: number): void;
}

export interface AudioContextLike {
	readonly currentTime: number;
	readonly state: string;
	readonly destination: AudioNodeLike;
	createGain(): GainNodeLike;
	createBufferSource(): AudioBufferSourceLike;
	decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
	resume(): Promise<void>;
	close(): Promise<void>;
	setSinkId?(sinkId: string): Promise<void>;
}

export interface AudioElementLike {
	src: string;
	volume: number;
	loop: boolean;
	preload: string;
	readonly paused: boolean;
	play(): Promise<void>;
	pause(): void;
	load(): void;
	removeAttribute(name: string): void;
	addEventListener(type: 'error', listener: () => void): void;
	setSinkId?(sinkId: string): Promise<void>;
}

// ── Engine surface ───────────────────────────────────────────────────────────────────────────

/** Which backend is actually producing sound on this device. */
export type AudioEngineMode = 'web-audio' | 'element' | 'silent';

/** A seamless loop window inside a decoded buffer, in seconds. `end: null` ⇒ the buffer's end. */
export interface AudioLoopWindow {
	start: number;
	end: number | null;
}

/** What one channel should be doing right now. The engine reconciles toward it, idempotently. */
export interface AudioChannelCommand {
	/** The URL to sound, or null to fade the channel out and release its voices. */
	url: string | null;
	/** The channel's authoritative volume (0..1). Clamped. */
	volume: number;
	/** Hold position without releasing the voice (the primary track's `paused` status). */
	paused?: boolean;
	/** The crossfade for THIS transition. Defaults to `DEFAULT_CROSSFADE_SECONDS`; 0 ⇒ a hard cut. */
	crossfadeSeconds?: number;
	/** Seamless loop points. Honoured only by buffer voices (`blob:` URLs). */
	loop?: AudioLoopWindow | null;
}

/**
 * WHY a channel is (or is not) sounding. A closed enum so the reconciler maps engine state onto the
 * driver's honest status without sniffing prose: the reason is the contract, `detail` is the copy.
 */
export type AudioChannelReason =
	| 'sounding'
	| 'paused'
	| 'loading'
	| 'blocked'
	| 'error'
	| 'unsupported'
	| 'idle';

/** One channel's honest device-output state. `detail` is null only while it is genuinely sounding. */
export interface AudioChannelState {
	sounding: boolean;
	reason: AudioChannelReason;
	detail: string | null;
}

export interface AudioEngineOptions {
	/** Build the audio context. Return null (or throw) when the platform denies one. */
	createContext?: () => AudioContextLike | null;
	/** Build a media element for stream voices. Return null when the platform has none. */
	createElement?: () => AudioElementLike | null;
	/** Fetch a URL's bytes for decoding. Defaults to `fetch(url).arrayBuffer()`. */
	fetchBytes?: (url: string) => Promise<ArrayBuffer>;
	/** Called whenever a channel's honest state changed asynchronously (decode, play, error). */
	onChange?: () => void;
}

export interface AudioEngine {
	/** The backend actually in use. `silent` means nothing can sound on this device. */
	readonly mode: AudioEngineMode;
	/** The honest, human reason the engine is degraded; null when running on Web Audio. */
	readonly modeDetail: string | null;
	/** Whether the ACTIVE backend can route output to a chosen device. */
	readonly supportsOutputRouting: boolean;
	/** Reconcile one channel and return its honest state. Idempotent for an unchanged command. */
	setChannel(channelId: string, command: AudioChannelCommand): AudioChannelState;
	/** Read a channel's current honest state without reconciling it. */
	channelState(channelId: string): AudioChannelState;
	/** Fade a channel out, stop it and forget it. Safe for an unknown id. */
	releaseChannel(channelId: string): void;
	/** The non-reserved channel ids currently held, in stable order. */
	channelIds(): string[];
	/** Set the MASTER volume (0..1) every channel is mixed under. */
	setMasterVolume(volume: number): void;
	/** The current master volume. */
	masterVolume(): number;
	/** Fire a one-shot effect on the SFX strip. Never loops; never disturbs the beds. */
	playSfx(url: string, volume?: number): void;
	/** Route output to a device id (`''` ⇒ the platform default). Rejects when it cannot. */
	setSinkId(sinkId: string): Promise<void>;
	/** Tell the engine a user gesture happened, so a suspended context may resume. */
	noteUserGesture(): void;
	/** Release the graph. Used by tests and by a runtime teardown. */
	dispose(): void;
}

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 1;
	return Math.min(1, Math.max(0, value));
}

function fadeSecondsOf(command: AudioChannelCommand): number {
	const seconds = command.crossfadeSeconds;
	if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
		return DEFAULT_CROSSFADE_SECONDS;
	}
	return seconds;
}

/** True when a URL names bytes we hold locally and can therefore decode and loop seamlessly. */
function isDecodableUrl(url: string): boolean {
	return url.startsWith('blob:');
}

const DEFAULT_CONTEXT_FACTORY = (): AudioContextLike | null => {
	const ctor = globalThis as unknown as {
		AudioContext?: new () => AudioContextLike;
		webkitAudioContext?: new () => AudioContextLike;
	};
	const Ctor = ctor.AudioContext ?? ctor.webkitAudioContext;
	return Ctor ? new Ctor() : null;
};

const DEFAULT_ELEMENT_FACTORY = (): AudioElementLike | null => {
	if (typeof document === 'undefined') return null;
	return document.createElement('audio') as unknown as AudioElementLike;
};

const DEFAULT_FETCH_BYTES = async (url: string): Promise<ArrayBuffer> => {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return response.arrayBuffer();
};

// ── Voices ───────────────────────────────────────────────────────────────────────────────────

/** One sounding (or honestly-silent) source inside a channel. A crossfade holds two at once. */
interface Voice {
	readonly url: string;
	sounding: boolean;
	reason: AudioChannelReason;
	detail: string | null;
	/** Ramp this voice's own envelope to `target` over `seconds`; release it when it reaches 0. */
	fadeTo(target: number, seconds: number): void;
	/** Re-apply the channel's effective level (element voices carry it on `volume` themselves). */
	refreshLevel(): void;
	/** Hold position without releasing (the primary track's paused status). */
	pause(): void;
	resume(): void;
	/** Move this voice to an output device id, when the voice can be routed at all. */
	route?(sinkId: string): Promise<void>;
	/** Stop now and release every platform resource. */
	dispose(): void;
}

export function createAudioEngine(options: AudioEngineOptions = {}): AudioEngine {
	const createContext = options.createContext ?? DEFAULT_CONTEXT_FACTORY;
	const createElement = options.createElement ?? DEFAULT_ELEMENT_FACTORY;
	const fetchBytes = options.fetchBytes ?? DEFAULT_FETCH_BYTES;
	const notify = options.onChange ?? ((): void => {});

	let context: AudioContextLike | null = null;
	let contextDenied: string | null = null;
	try {
		context = createContext();
		if (!context) contextDenied = 'This device has no Web Audio support.';
	} catch (error) {
		context = null;
		contextDenied = error instanceof Error ? error.message : 'the audio context was denied';
	}

	// Probe the element backend once: it is the stream voice in web-audio mode AND the whole
	// backend in the fallback mode, so its availability decides `element` vs `silent`.
	let elementsAvailable: boolean;
	try {
		elementsAvailable = createElement() !== null;
	} catch {
		elementsAvailable = false;
	}

	const mode: AudioEngineMode = context ? 'web-audio' : elementsAvailable ? 'element' : 'silent';
	const modeDetail: string | null =
		mode === 'web-audio'
			? null
			: mode === 'element'
				? `Mixing without Web Audio (${contextDenied ?? 'the audio context was denied'}) — loop points and effects are unavailable, and tracks cut instead of crossfading cleanly.`
				: 'This device cannot output audio (no Web Audio context and no media element) — the session still tracks what is playing, but nothing sounds here.';

	let masterGain: GainNodeLike | null = null;
	let sfxGain: GainNodeLike | null = null;
	if (context) {
		masterGain = context.createGain();
		masterGain.gain.value = 1;
		masterGain.connect(context.destination);
		sfxGain = context.createGain();
		sfxGain.gain.value = 1;
		sfxGain.connect(masterGain);
	}

	let master = 1;
	let sinkId = '';
	let disposed = false;

	const supportsOutputRouting =
		mode === 'web-audio'
			? typeof context?.setSinkId === 'function'
			: mode === 'element'
				? elementSupportsRouting()
				: false;

	function elementSupportsRouting(): boolean {
		try {
			const probe = createElement();
			return probe !== null && typeof probe.setSinkId === 'function';
		} catch {
			return false;
		}
	}

	/** Ramp a gain param from wherever it is to `target` over `seconds`, click-free. */
	function ramp(param: AudioParamLike, target: number, seconds: number): void {
		if (!context) return;
		const now = context.currentTime;
		const duration = Math.max(seconds, SMOOTHING_SECONDS);
		param.cancelScheduledValues(now);
		param.setValueAtTime(param.value, now);
		param.linearRampToValueAtTime(target, now + duration);
	}

	// ── Decoded-buffer cache (one decode per URL, shared across channels and crossfades) ────────

	type DecodeEntry =
		| { kind: 'pending'; promise: Promise<AudioBufferLike> }
		| { kind: 'buffer'; buffer: AudioBufferLike }
		| { kind: 'failed'; detail: string };
	const decodes = new Map<string, DecodeEntry>();

	function decode(url: string): DecodeEntry {
		const existing = decodes.get(url);
		if (existing) return existing;
		const promise = fetchBytes(url).then((bytes) => {
			if (!context) throw new Error('no audio context');
			return context.decodeAudioData(bytes);
		});
		const entry: DecodeEntry = { kind: 'pending', promise };
		decodes.set(url, entry);
		promise.then(
			(buffer) => {
				decodes.set(url, { kind: 'buffer', buffer });
				notify();
			},
			(error: unknown) => {
				decodes.set(url, {
					kind: 'failed',
					detail: `The audio could not be decoded (${
						error instanceof Error ? error.message : 'unsupported format'
					}) — no retry, no substitution.`,
				});
				notify();
			},
		);
		return entry;
	}

	// ── Buffer voice (Web Audio, seamless loop points) ──────────────────────────────────────────

	function createBufferVoice(
		url: string,
		channelGain: GainNodeLike,
		loopWindow: AudioLoopWindow | null,
		startLevel: number,
	): Voice {
		const gain = context!.createGain();
		gain.gain.value = startLevel;
		gain.connect(channelGain);

		let source: AudioBufferSourceLike | null = null;
		let buffer: AudioBufferLike | null = null;
		let startedAt = 0;
		let offset = 0;
		let paused = false;
		let released = false;
		let stopTimer: ReturnType<typeof setTimeout> | null = null;

		const voice: Voice = {
			url,
			sounding: false,
			reason: 'loading',
			detail: 'Loading the track’s audio bytes…',
			fadeTo(target, seconds) {
				if (released) return;
				if (target === 0 && seconds <= 0) {
					// A hard cut is a hard cut: stop now rather than leaving the source running under a
					// declick ramp, so the outgoing track is audibly gone the instant it was told to be.
					voice.dispose();
					return;
				}
				ramp(gain.gain, target, seconds);
				if (target > 0) return;
				// Releasing: let the ramp finish audibly, then tear the source down.
				if (stopTimer !== null) clearTimeout(stopTimer);
				stopTimer = setTimeout(
					() => {
						voice.dispose();
						notify();
					},
					Math.max(seconds, SMOOTHING_SECONDS) * 1000,
				);
			},
			refreshLevel() {
				// The channel gain carries the level in Web Audio; nothing per-voice to re-apply.
			},
			pause() {
				if (paused || released) return;
				paused = true;
				if (source && buffer) {
					const played = context!.currentTime - startedAt + offset;
					offset = buffer.duration > 0 ? played % buffer.duration : 0;
					stopSource();
				}
				voice.sounding = false;
				voice.reason = 'paused';
				voice.detail = null;
			},
			resume() {
				if (!paused || released) return;
				paused = false;
				if (buffer) startSource(buffer);
			},
			dispose() {
				if (released) return;
				released = true;
				if (stopTimer !== null) clearTimeout(stopTimer);
				stopTimer = null;
				stopSource();
				gain.disconnect();
				voice.sounding = false;
			},
		};

		function stopSource(): void {
			if (!source) return;
			source.onended = null;
			try {
				source.stop();
			} catch {
				// Already stopped — nothing to undo.
			}
			source.disconnect();
			source = null;
		}

		function startSource(decoded: AudioBufferLike): void {
			stopSource();
			const node = context!.createBufferSource();
			node.buffer = decoded;
			node.loop = true;
			// Seamless loop points: clamped into the buffer, and ignored (whole-file loop) when the
			// window is empty or inverted rather than producing a stuttering zero-length loop.
			const start = Math.min(Math.max(loopWindow?.start ?? 0, 0), decoded.duration);
			const end = Math.min(loopWindow?.end ?? decoded.duration, decoded.duration);
			if (end > start) {
				node.loopStart = start;
				node.loopEnd = end;
			}
			node.connect(gain);
			node.start(0, Math.min(offset, decoded.duration));
			startedAt = context!.currentTime;
			source = node;
			voice.sounding = true;
			voice.reason = 'sounding';
			voice.detail = null;
		}

		const entry = decode(url);
		if (entry.kind === 'buffer') {
			buffer = entry.buffer;
			startSource(entry.buffer);
		} else if (entry.kind === 'failed') {
			voice.sounding = false;
			voice.reason = 'error';
			voice.detail = entry.detail;
		} else {
			void entry.promise.then(
				(decoded) => {
					if (released || paused) return;
					buffer = decoded;
					startSource(decoded);
					notify();
				},
				() => {
					if (released) return;
					const settled = decodes.get(url);
					voice.sounding = false;
					voice.reason = 'error';
					voice.detail =
						settled?.kind === 'failed' ? settled.detail : 'The audio could not be decoded.';
					notify();
				},
			);
		}

		return voice;
	}

	// ── Element voice (streams, and the whole fallback backend) ─────────────────────────────────

	function createElementVoice(url: string, levelOf: () => number, startLevel: number): Voice {
		let element: AudioElementLike | null = null;
		try {
			element = createElement();
		} catch {
			element = null;
		}

		let envelope = startLevel;
		let timer: ReturnType<typeof setInterval> | null = null;
		let released = false;
		let paused = false;
		/** Monotonic guard so a stale `play()` rejection is not reported after a newer transition. */
		let seq = 0;

		const voice: Voice = {
			url,
			sounding: false,
			reason: element ? 'loading' : 'unsupported',
			detail: element
				? 'Loading the stream…'
				: 'This device has no media element to play the stream on.',
			fadeTo(target, seconds) {
				if (released) return;
				stopTimer();
				const from = envelope;
				const span = Math.max(seconds, 0);
				if (span === 0 || from === target) {
					envelope = target;
					apply();
					if (target === 0) voice.dispose();
					return;
				}
				const steps = Math.max(1, Math.round((span * 1000) / ELEMENT_FADE_STEP_MS));
				let step = 0;
				timer = setInterval(() => {
					step += 1;
					envelope = from + ((target - from) * step) / steps;
					apply();
					if (step < steps) return;
					stopTimer();
					envelope = target;
					apply();
					if (target === 0) {
						voice.dispose();
						notify();
					}
				}, ELEMENT_FADE_STEP_MS);
			},
			refreshLevel: apply,
			pause() {
				if (paused || released) return;
				paused = true;
				seq += 1;
				element?.pause();
				voice.sounding = false;
				voice.reason = 'paused';
				voice.detail = null;
			},
			resume() {
				if (!paused || released) return;
				paused = false;
				attemptPlay();
			},
			route(next) {
				if (!element || typeof element.setSinkId !== 'function') {
					return Promise.reject(new Error('this browser cannot choose an audio output device'));
				}
				return element.setSinkId(next);
			},
			dispose() {
				if (released) return;
				released = true;
				stopTimer();
				seq += 1;
				if (element) {
					element.pause();
					element.removeAttribute('src');
					element.load();
				}
				voice.sounding = false;
			},
		};

		function stopTimer(): void {
			if (timer === null) return;
			clearInterval(timer);
			timer = null;
		}

		function apply(): void {
			if (!element || released) return;
			element.volume = clamp01(levelOf() * envelope);
		}

		function attemptPlay(): void {
			if (!element || released) return;
			const mine = ++seq;
			element.play().then(
				() => {
					if (mine !== seq || released) return;
					voice.sounding = true;
					voice.reason = 'sounding';
					voice.detail = null;
					notify();
				},
				(error: unknown) => {
					if (mine !== seq || released) return;
					const name = error instanceof Error ? error.name : '';
					if (name === 'AbortError') return; // superseded by a newer transition — not ours to report
					voice.sounding = false;
					voice.reason = name === 'NotAllowedError' ? 'blocked' : 'error';
					voice.detail =
						name === 'NotAllowedError'
							? 'The browser blocked autoplay — click or press any key to start sound.'
							: 'The stream could not be played (unreachable URL or unsupported format).';
					notify();
				},
			);
		}

		if (element) {
			element.preload = 'auto';
			element.loop = true;
			element.addEventListener('error', () => {
				if (released) return;
				voice.sounding = false;
				voice.reason = 'error';
				voice.detail = 'The stream failed to load — check the source (no retry, no substitution).';
				notify();
			});
			element.src = url;
			apply();
			if (sinkId !== '' && typeof element.setSinkId === 'function') {
				void element.setSinkId(sinkId).catch(() => {
					// Routing degrades to the platform default; the engine reports it via `setSinkId`.
				});
			}
			attemptPlay();
		}

		return voice;
	}

	// ── Channels ────────────────────────────────────────────────────────────────────────────────

	interface ChannelEntry {
		gain: GainNodeLike | null;
		volume: number;
		paused: boolean;
		loop: AudioLoopWindow | null;
		voices: Voice[];
		current: Voice | null;
		/** The honest state a channel with no voice reports (cap reached, silent mode, …). */
		vacantDetail: string | null;
	}

	const channels = new Map<string, ChannelEntry>();

	const isReserved = (channelId: string): boolean =>
		channelId === TRACK_CHANNEL_ID || channelId === SFX_CHANNEL_ID;

	/** How loud an element voice on this channel must actually be (Web Audio does it with nodes). */
	const levelOf = (entry: ChannelEntry): (() => number) => {
		return () => entry.volume * master;
	};

	function ensureChannel(channelId: string, destination: GainNodeLike | null): ChannelEntry {
		let entry = channels.get(channelId);
		if (entry) return entry;
		let gain: GainNodeLike | null = null;
		if (context && destination) {
			gain = context.createGain();
			gain.gain.value = 0;
			gain.connect(destination);
		}
		entry = {
			gain,
			volume: 0,
			paused: false,
			loop: null,
			voices: [],
			current: null,
			vacantDetail: null,
		};
		channels.set(channelId, entry);
		return entry;
	}

	function sweep(entry: ChannelEntry): void {
		entry.voices = entry.voices.filter((voice) => voice === entry.current || voice.sounding);
	}

	function stateOf(entry: ChannelEntry): AudioChannelState {
		if (!entry.current) {
			return {
				sounding: false,
				reason: entry.vacantDetail === null ? 'idle' : 'unsupported',
				detail: entry.vacantDetail,
			};
		}
		return {
			sounding: entry.current.sounding,
			reason: entry.current.reason,
			detail: entry.current.detail,
		};
	}

	function startVoice(entry: ChannelEntry, url: string, fade: number): Voice {
		const useBuffer = mode === 'web-audio' && isDecodableUrl(url);
		const startLevel = fade > 0 ? 0 : 1;
		const voice = useBuffer
			? createBufferVoice(url, entry.gain!, entry.loop, startLevel)
			: createElementVoice(url, levelOf(entry), startLevel);
		if (fade > 0) voice.fadeTo(1, fade);
		return voice;
	}

	function releaseVoices(entry: ChannelEntry, fade: number): void {
		for (const voice of entry.voices) voice.fadeTo(0, fade);
		if (fade === 0) entry.voices = [];
		entry.current = null;
	}

	function loopEquals(a: AudioLoopWindow | null, b: AudioLoopWindow | null): boolean {
		if (a === null || b === null) return a === b;
		return a.start === b.start && a.end === b.end;
	}

	function setChannel(channelId: string, command: AudioChannelCommand): AudioChannelState {
		if (disposed) {
			return { sounding: false, reason: 'idle', detail: 'The audio engine was released.' };
		}
		const existing = channels.get(channelId);
		if (
			!existing &&
			!isReserved(channelId) &&
			[...channels.keys()].filter((id) => !isReserved(id)).length >= MAX_MIX_CHANNELS
		) {
			return {
				sounding: false,
				reason: 'unsupported',
				detail: `This device mixes up to ${MAX_MIX_CHANNELS} ambience layers — remove a layer to hear this one.`,
			};
		}
		const entry = existing ?? ensureChannel(channelId, masterGain);

		if (mode === 'silent') {
			entry.vacantDetail = modeDetail;
			return { sounding: false, reason: 'unsupported', detail: modeDetail };
		}

		const fade = fadeSecondsOf(command);
		const volume = clamp01(command.volume);
		const nextLoop = command.loop ?? null;

		// Loop points are baked into a buffer voice when it starts, so a changed window restarts it.
		const loopChanged = !loopEquals(entry.loop, nextLoop);
		entry.loop = nextLoop;

		if (entry.volume !== volume) {
			entry.volume = volume;
			if (entry.gain) ramp(entry.gain.gain, volume, SMOOTHING_SECONDS);
			for (const voice of entry.voices) voice.refreshLevel();
		}

		if (command.url === null) {
			if (entry.current) releaseVoices(entry, fade);
			entry.vacantDetail = null;
			sweep(entry);
			return stateOf(entry);
		}

		const restart = loopChanged && entry.current !== null && isDecodableUrl(command.url);
		if (!entry.current || entry.current.url !== command.url || restart) {
			const outgoing = entry.current;
			if (outgoing) outgoing.fadeTo(0, fade);
			// A crossfade is exactly this: the outgoing voice keeps sounding under the same channel
			// gain while the incoming one ramps up. `sweep` drops the outgoing one once it is gone.
			if (entry.gain && entry.volume > 0) ramp(entry.gain.gain, entry.volume, SMOOTHING_SECONDS);
			const voice = startVoice(entry, command.url, fade);
			entry.voices.push(voice);
			entry.current = voice;
			entry.paused = false;
		}

		const paused = command.paused === true;
		if (paused !== entry.paused) {
			entry.paused = paused;
			if (paused) entry.current.pause();
			else entry.current.resume();
		}

		entry.vacantDetail = null;
		sweep(entry);
		return stateOf(entry);
	}

	function releaseChannel(channelId: string): void {
		const entry = channels.get(channelId);
		if (!entry) return;
		for (const voice of entry.voices) voice.dispose();
		entry.gain?.disconnect();
		channels.delete(channelId);
	}

	/**
	 * Route output to a device. Buffer voices follow `AudioContext.setSinkId`; stream voices are
	 * elements played outside the graph, so they follow `HTMLMediaElement.setSinkId`. Both must
	 * move, so ONE rejection is the engine's rejection — the driver then reports `unavailable` and
	 * playback continues on the platform default (AUDIO-012: routing never fails session audio).
	 */
	function setSinkIdInternal(next: string): Promise<void> {
		if (mode === 'silent') {
			return Promise.reject(new Error('this device cannot output audio'));
		}
		sinkId = next;
		const pending: Promise<void>[] = [];
		if (mode === 'web-audio') {
			if (typeof context?.setSinkId !== 'function') {
				return Promise.reject(new Error('this browser cannot choose an audio output device'));
			}
			pending.push(context.setSinkId(next));
		}
		let routableVoices = 0;
		for (const entry of channels.values()) {
			for (const voice of entry.voices) {
				if (!voice.route) continue;
				routableVoices += 1;
				pending.push(voice.route(next));
			}
		}
		if (mode === 'element' && routableVoices === 0 && !supportsOutputRouting) {
			return Promise.reject(new Error('this browser cannot choose an audio output device'));
		}
		return Promise.all(pending).then(() => undefined);
	}

	return {
		mode,
		modeDetail,
		supportsOutputRouting,
		setChannel,
		channelState(channelId) {
			const entry = channels.get(channelId);
			return entry ? stateOf(entry) : { sounding: false, reason: 'idle', detail: null };
		},
		releaseChannel,
		channelIds() {
			return [...channels.keys()].filter((id) => !isReserved(id)).sort();
		},
		setMasterVolume(volume) {
			master = clamp01(volume);
			if (masterGain) ramp(masterGain.gain, master, SMOOTHING_SECONDS);
			for (const entry of channels.values()) {
				for (const voice of entry.voices) voice.refreshLevel();
			}
		},
		masterVolume: () => master,
		playSfx(url, volume = 1) {
			if (disposed || mode === 'silent') return;
			// A one-shot rides its own strip so it never ducks, restarts or crossfades the beds.
			const entry = ensureChannel(SFX_CHANNEL_ID, sfxGain ?? masterGain);
			entry.volume = clamp01(volume);
			if (entry.gain) ramp(entry.gain.gain, entry.volume, SMOOTHING_SECONDS);
			const voice = startVoice(entry, url, 0);
			entry.voices.push(voice);
			entry.current = voice;
		},
		setSinkId: setSinkIdInternal,
		noteUserGesture() {
			if (!context || context.state !== 'suspended') return;
			void context.resume().then(notify, () => {
				// A refused resume leaves the honest blocked/silent states exactly as they are.
			});
		},
		dispose() {
			if (disposed) return;
			disposed = true;
			for (const channelId of [...channels.keys()]) releaseChannel(channelId);
			sfxGain?.disconnect();
			masterGain?.disconnect();
			void context?.close().catch(() => {
				// Closing a context that already closed is not a failure worth reporting.
			});
		},
	};
}
