import {
	normalizeAudioParticipantPreferences,
	normalizeAudioPlatformCapability,
	resolveAudioOutputRouting,
	type AudioOutputRouting,
} from '@dndtools/core';
import type { SceneRuntime } from './SceneRuntime';
import { getAssetBytes } from '../platform/storage/assetStore';
import {
	assetIdsInUse,
	planAmbienceLayers,
	planSessionTrack,
	type AudioByteResolution,
} from './audio-plan';
import {
	createAudioEngine,
	MAX_MIX_CHANNELS,
	TRACK_CHANNEL_ID,
	type AudioChannelReason,
	type AudioChannelState,
	type AudioEngine,
	type AudioEngineMode,
	type AudioEngineOptions,
} from './audio-engine';
import { getPlatformCapabilities, isNetworkDestinationAllowed } from '../platform/capabilities';
import { detectAudioEmbedProvider } from './audio-embed';

/**
 * audio-playback — the RECONCILER between the session's authoritative audio state (AUDIO-002/003)
 * and this device's audio output. The core owns WHAT is playing (`session.audioPlayback`: track /
 * ambience layers / output device); `audio-plan.ts` turns that into a pure, testable plan; and
 * `audio-engine.ts` (RC-AUD-1.1) owns HOW sound is produced — the Web Audio graph, its gain nodes,
 * crossfades, seamless loop points and output routing, with an honest element/silent fallback.
 *
 * This file renders nothing and dispatches nothing. The transport UI mutates the core, the core
 * state changes, and this reconciler follows by pushing one CHANNEL COMMAND per plan into the
 * engine on every runtime emit. It stays responsible for the parts that are neither pure planning
 * nor sound synthesis:
 *
 *   - ASSET BYTES. A local/bundled track names a content-addressed asset; its bytes are read from
 *     the device asset-byte store (`getAssetBytes` → Blob → object URL, revoked when no plan uses
 *     it). Missing bytes degrade to the honest `no-stream` state — never a crash, never a
 *     substituted track (AUDIO-010).
 *   - AUTOPLAY POLICY. Nothing is loaded or played until the user's first gesture, which both
 *     satisfies browser autoplay rules and keeps automated route sweeps from spraying network
 *     errors at unreachable demo URLs. The first gesture also resumes a suspended `AudioContext`.
 *   - OUTPUT ROUTING (AUDIO-012). The DM's device selection is resolved through the core
 *     degradation model and handed to the engine once per change. An unsupported platform or a
 *     rejected switch reports `unavailable` and FALLS BACK to the platform default output —
 *     routing never fails session audio.
 *   - The LAYER CAP. The engine mixes up to `MAX_MIX_CHANNELS` ambience layers; layers past the cap
 *     report why they are silent instead of quietly disappearing.
 *   - WEB EMBEDS (RC-AUD-3.3). A primary-track URL recognized as YouTube/SoundCloud
 *     (`detectAudioEmbedProvider`) never reaches the engine at all — the Audio screen renders the
 *     provider's own sandboxed iframe player, and the local ambience layers (unaffected by this
 *     branch) keep sounding underneath it exactly as they would for any other track, so losing the
 *     embed (offline, blocked) never leaves the table in silence.
 *
 * Crossfade policy: the PRIMARY track honours the core's authoritative `track.crossfadeSeconds`
 * verbatim (0 ⇒ an immediate cut, exactly as `session-audio.ts` documents it). Ambience layers
 * carry no crossfade metadata, so they use the engine's 3 s default.
 *
 * One driver per runtime (WeakMap), started idempotently from App.tsx via `ensureAudioPlayback` and
 * kept for the app's lifetime (session audio must keep sounding after navigating away from /audio).
 */

export type AudioPlaybackStatus =
	| 'idle'
	| 'playing'
	| 'paused'
	| 'blocked'
	| 'no-stream'
	| 'error'
	// RC-AUD-3.3 — the primary track is a YouTube/SoundCloud URL; it plays through the sandboxed
	// embed the Audio screen renders, not this device's `<audio>` element (there is nothing to report
	// as a failure — this status exists so the UI does not also show a "silent" warning next to it).
	| 'embed';

/** One ambience layer's honest device-output state. */
export interface AmbienceLayerPlayback {
	layerId: string;
	/** True only when the layer is actually sounding on this device. */
	sounding: boolean;
	/** The honest reason the layer is silent (muted / missing bytes / blocked / error); null while sounding. */
	detail: string | null;
}

export interface AudioPlaybackSnapshot {
	status: AudioPlaybackStatus;
	/** A short, honest reason for the silent states (`blocked` / `no-stream` / `error`); null otherwise. */
	detail: string | null;
	/** AUDIO-012 — the resolved output routing for this device (default / routed / unavailable). */
	routing: AudioOutputRouting;
	/** The honest routing note (unsupported platform / failed sink switch); null when nothing to say. */
	routingDetail: string | null;
	/** Per-ambience-layer device-output state, in stable layer-id order. */
	ambience: AmbienceLayerPlayback[];
	/** RC-AUD-1.1 — which output backend is actually running (`silent` ⇒ nothing sounds here). */
	engine: AudioEngineMode;
	/** The honest reason the engine is degraded; null while running on Web Audio. */
	engineDetail: string | null;
}

export interface AudioPlaybackHandle {
	/** Subscribe to snapshot changes (for `useSyncExternalStore`). */
	subscribe(listener: () => void): () => void;
	/** The current snapshot — a stable object identity until the content actually changes. */
	getSnapshot(): AudioPlaybackSnapshot;
	/**
	 * Fire a one-shot sound effect on the engine's dedicated SFX strip. It never loops and never
	 * disturbs the beds. Ignored in `silent` mode (fail closed rather than pretend).
	 */
	playSfx(url: string, volume?: number): void;
	/**
	 * Set the DEVICE-LOCAL master volume every channel is mixed under (0..1). This is a device
	 * output control, NOT session state: it never mutates the DM's authoritative session volume.
	 */
	setMasterVolume(volume: number): void;
}

const drivers = new WeakMap<SceneRuntime, AudioPlaybackHandle>();

/** Start (or return the already-started) playback driver for this runtime. Idempotent; app-lifetime. */
export function ensureAudioPlayback(runtime: SceneRuntime): AudioPlaybackHandle {
	let driver = drivers.get(runtime);
	if (!driver) {
		driver = createAudioPlaybackDriver(runtime);
		drivers.set(runtime, driver);
	}
	return driver;
}

/** A cached object-URL resolution for one asset's bytes. `missing` remembers WHEN it missed so a
 *  later state emit (e.g. the file was just imported) retries instead of staying stale forever. */
type AssetUrlEntry =
	| { kind: 'url'; url: string }
	| { kind: 'pending' }
	| { kind: 'missing'; atEmit: number };

/** The engine's reason codes mapped onto the driver's honest playback status. Total by construction. */
const STATUS_BY_REASON: Record<AudioChannelReason, AudioPlaybackStatus> = {
	sounding: 'playing',
	paused: 'paused',
	// A channel that is still fetching/decoding has nothing to output YET — the honest state is the
	// same "no stream on this device" the byte store reports, with the engine's own wording.
	loading: 'no-stream',
	blocked: 'blocked',
	error: 'error',
	unsupported: 'no-stream',
	idle: 'idle',
};

/** The channel id one ambience layer occupies. Namespaced so it can never collide with a reserved id. */
function layerChannelId(layerId: string): string {
	return `layer:${layerId}`;
}

/** Seams for the unit suite: the engine (and therefore every platform API) is injectable. */
export interface AudioPlaybackDriverOptions {
	createEngine?: (options: AudioEngineOptions) => AudioEngine;
}

/**
 * Build a reconciler for `runtime`. Exported for the unit suite; app code uses `ensureAudioPlayback`
 * so exactly one driver exists per runtime.
 */
export function createAudioPlaybackDriver(
	runtime: SceneRuntime,
	options: AudioPlaybackDriverOptions = {},
): AudioPlaybackHandle {
	const listeners = new Set<() => void>();
	const assetUrls = new Map<string, AssetUrlEntry>();

	let mainStatus: AudioPlaybackStatus = 'idle';
	let mainDetail: string | null = null;
	let ambience: AmbienceLayerPlayback[] = [];
	/**
	 * Autoplay policy is a browser-WINDOW concept. Without one (the unit suite, a non-DOM host) there
	 * is no gesture to wait for, so the driver does not fail closed on a gate that cannot exist.
	 */
	let hadGesture = typeof window === 'undefined';
	let gestureArmed = false;
	/** Counts runtime emits — the retry key for `missing` byte lookups and failed sink switches. */
	let emitSeq = 0;
	/** Re-entrancy guard: an engine callback that lands mid-sync re-runs the sync afterwards. */
	let syncing = false;
	let syncAgain = false;

	/** The sink id currently handed to the engine ('' = platform default), and the one that failed. */
	let appliedSinkId: string | null = null;
	let failedSinkId: string | null = null;
	let failedSinkAtEmit = -1;
	let sinkFailureDetail: string | null = null;

	const engine = (options.createEngine ?? createAudioEngine)({
		onChange: () => {
			sync();
		},
	});

	let snapshot: AudioPlaybackSnapshot = {
		status: 'idle',
		detail: null,
		routing: 'default',
		routingDetail: null,
		ambience: [],
		engine: engine.mode,
		engineDetail: engine.modeDetail,
	};

	const snapshotsEqual = (a: AudioPlaybackSnapshot, b: AudioPlaybackSnapshot): boolean =>
		a.status === b.status &&
		a.detail === b.detail &&
		a.routing === b.routing &&
		a.routingDetail === b.routingDetail &&
		a.engine === b.engine &&
		a.engineDetail === b.engineDetail &&
		a.ambience.length === b.ambience.length &&
		a.ambience.every(
			(layer, i) =>
				layer.layerId === b.ambience[i].layerId &&
				layer.sounding === b.ambience[i].sounding &&
				layer.detail === b.ambience[i].detail,
		);

	/** Rebuild the snapshot from the current driver state and notify only when it actually changed. */
	const publish = (routing: AudioOutputRouting, routingDetail: string | null): void => {
		const next: AudioPlaybackSnapshot = {
			status: mainStatus,
			detail: mainDetail,
			routing,
			routingDetail,
			ambience,
			engine: engine.mode,
			engineDetail: engine.modeDetail,
		};
		if (snapshotsEqual(snapshot, next)) return;
		snapshot = next;
		for (const listener of listeners) listener();
	};

	// First-gesture retry: capture-phase one-shot listeners so the play attempt runs INSIDE the user
	// activation (that is what clears an autoplay block and resumes a suspended context).
	const onGesture = (): void => {
		gestureArmed = false;
		window.removeEventListener('pointerdown', onGesture, true);
		window.removeEventListener('keydown', onGesture, true);
		hadGesture = true;
		engine.noteUserGesture();
		sync();
	};
	const armGestureRetry = (): void => {
		if (gestureArmed || typeof window === 'undefined') return;
		gestureArmed = true;
		window.addEventListener('pointerdown', onGesture, true);
		window.addEventListener('keydown', onGesture, true);
	};

	/**
	 * Resolve an asset's bytes to an object URL through the cache. Returns the URL when ready, or null
	 * while pending/missing (the async lookup re-runs sync() when it settles). A `missing` entry is
	 * retried on the NEXT runtime emit — importing the file writes bytes and then dispatches, so the
	 * emit that adds the metadata also invalidates the miss.
	 */
	const resolveAssetUrl = (assetId: string): string | null => {
		const entry = assetUrls.get(assetId);
		if (entry?.kind === 'url') return entry.url;
		if (entry?.kind === 'pending') return null;
		if (entry?.kind === 'missing' && entry.atEmit === emitSeq) return null;
		assetUrls.set(assetId, { kind: 'pending' });
		void getAssetBytes(assetId).then(
			(blob) => {
				assetUrls.set(
					assetId,
					blob
						? { kind: 'url', url: URL.createObjectURL(blob) }
						: { kind: 'missing', atEmit: emitSeq },
				);
				sync();
			},
			() => {
				assetUrls.set(assetId, { kind: 'missing', atEmit: emitSeq });
				sync();
			},
		);
		const settled = assetUrls.get(assetId);
		return settled?.kind === 'url' ? settled.url : null;
	};

	/** How a plan's resolution materializes on THIS device right now. */
	type Materialized =
		| { kind: 'url'; url: string }
		| { kind: 'embed' }
		| { kind: 'loading' }
		| { kind: 'silent'; detail: string };

	const materialize = (resolution: AudioByteResolution): Materialized => {
		if (resolution.url) {
			const runtimeKind = getPlatformCapabilities().runtimeKind;
			if (!isNetworkDestinationAllowed(resolution.url, runtimeKind)) {
				return {
					kind: 'silent',
					detail: 'Android blocks cleartext audio streams. Use HTTPS or import the audio file.',
				};
			}
			// RC-AUD-3.3 — a YouTube/SoundCloud URL never plays through this device's `<audio>` element
			// (it is a page, not a media file); the Audio screen renders the real player in a sandboxed
			// iframe instead, so the engine leaves this channel silent rather than reporting a media error.
			if (detectAudioEmbedProvider(resolution.url)) {
				return { kind: 'embed' };
			}
			return { kind: 'url', url: resolution.url };
		}
		if (resolution.assetId) {
			const url = resolveAssetUrl(resolution.assetId);
			if (url) return { kind: 'url', url };
			const entry = assetUrls.get(resolution.assetId);
			if (entry?.kind === 'missing') {
				return {
					kind: 'silent',
					detail:
						'The track’s audio bytes are not stored on this device — import the file again to restore them.',
				};
			}
			return { kind: 'loading' };
		}
		return { kind: 'silent', detail: resolution.silentReason ?? 'Nothing to output.' };
	};

	/** Hand the DM-selected output device to the engine, once per change; honest on rejection. */
	const applySink = (sinkTarget: string): void => {
		if (!engine.supportsOutputRouting) return;
		if (failedSinkId === sinkTarget && failedSinkAtEmit === emitSeq) return; // no hot retry loop
		if (appliedSinkId === sinkTarget) return;
		appliedSinkId = sinkTarget;
		void engine.setSinkId(sinkTarget).then(
			() => {
				if (failedSinkId !== sinkTarget) return;
				failedSinkId = null;
				sinkFailureDetail = null;
				sync();
			},
			(error: unknown) => {
				// Honest degradation (AUDIO-012 AC1): report, fall back to the default output, never
				// fail session audio. Retried on the next state emit (e.g. the DM picks another device).
				failedSinkId = sinkTarget;
				failedSinkAtEmit = emitSeq;
				appliedSinkId = null;
				sinkFailureDetail = `The selected output device could not be used (${
					error instanceof Error ? error.message : 'device unavailable'
				}) — falling back to the platform default output.`;
				sync();
			},
		);
	};

	/** Map an engine channel state onto the driver's status, re-arming the gesture on a block. */
	const statusOf = (state: AudioChannelState): AudioPlaybackStatus => {
		if (state.reason === 'blocked') armGestureRetry();
		return STATUS_BY_REASON[state.reason];
	};

	/** Reconcile every channel with the authoritative session state. Cheap; runs on each runtime emit. */
	function sync(): void {
		if (syncing) {
			syncAgain = true;
			return;
		}
		syncing = true;
		try {
			reconcile();
		} finally {
			syncing = false;
		}
		if (syncAgain) {
			syncAgain = false;
			sync();
		}
	}

	function reconcile(): void {
		const state = runtime.state;
		const session = state.session.audioPlayback;
		const trackPlan = planSessionTrack(session, state.audio);
		const layerPlans = planAmbienceLayers(session, state.audio);
		const silentMode = engine.mode === 'silent';

		// ── Output routing (AUDIO-012): resolve through the core degradation model, apply once.
		const desiredSinkId = session.outputDevice?.deviceId ?? null;
		let routing = resolveAudioOutputRouting(
			normalizeAudioPlatformCapability({
				canRouteOutput: engine.supportsOutputRouting,
				canPlayAudio: !silentMode,
			}),
			normalizeAudioParticipantPreferences({ outputRouteId: desiredSinkId }),
		);
		let routingDetail: string | null =
			routing === 'unavailable'
				? 'This browser cannot route audio to a specific output device — the platform default output is used.'
				: null;
		const sinkTarget = desiredSinkId ?? '';
		applySink(sinkTarget);
		if (routing === 'routed' && failedSinkId === sinkTarget) {
			routing = 'unavailable';
			routingDetail = sinkFailureDetail;
		}

		// ── Primary track. The core's crossfade is authoritative: 0 means an immediate cut.
		const crossfadeSeconds = session.track?.crossfadeSeconds ?? 0;
		if (!trackPlan.active) {
			engine.setChannel(TRACK_CHANNEL_ID, { url: null, volume: 1, crossfadeSeconds: 0 });
			mainStatus = 'idle';
			mainDetail = null;
		} else if (silentMode) {
			mainStatus = 'no-stream';
			mainDetail = engine.modeDetail;
		} else {
			const media = materialize(trackPlan.resolution);
			if (media.kind === 'embed') {
				// The Audio screen renders the actual player; this engine has nothing to do with the
				// channel at all (not even a silent placeholder — there is no failure here to report).
				engine.setChannel(TRACK_CHANNEL_ID, {
					url: null,
					volume: trackPlan.volume,
					crossfadeSeconds: 0,
				});
				mainStatus = 'embed';
				mainDetail = null;
			} else if (media.kind !== 'url') {
				// Honest silent state: the transport still drives the durable session state, but this
				// device has nothing it can output (no stream URL / bytes absent / bytes still loading).
				engine.setChannel(TRACK_CHANNEL_ID, {
					url: null,
					volume: trackPlan.volume,
					crossfadeSeconds: 0,
				});
				mainStatus = 'no-stream';
				mainDetail =
					media.kind === 'loading'
						? 'Loading the track’s audio bytes from this device…'
						: media.detail;
			} else if (!hadGesture) {
				// Fail closed until the first gesture: playing before any user activation is
				// guaranteed-blocked by autoplay policy AND would start a fetch nobody can hear.
				engine.setChannel(TRACK_CHANNEL_ID, {
					url: null,
					volume: trackPlan.volume,
					crossfadeSeconds: 0,
				});
				mainStatus = 'blocked';
				mainDetail = 'Sound starts after your first click or key press (browser autoplay rules).';
				armGestureRetry();
			} else {
				const channel = engine.setChannel(TRACK_CHANNEL_ID, {
					url: media.url,
					volume: trackPlan.volume,
					paused: trackPlan.paused,
					crossfadeSeconds,
				});
				mainStatus = statusOf(channel);
				mainDetail = channel.detail;
			}
		}

		// ── Ambience layers, one engine channel each, capped at MAX_MIX_CHANNELS.
		const next: AmbienceLayerPlayback[] = [];
		const kept = new Set<string>();
		let mixed = 0;
		for (const plan of layerPlans) {
			const channelId = layerChannelId(plan.layerId);
			if (mixed >= MAX_MIX_CHANNELS) {
				// Over the cap: released rather than left sounding at a stale volume, and said out loud.
				engine.releaseChannel(channelId);
				next.push({
					layerId: plan.layerId,
					sounding: false,
					detail: `This device mixes up to ${MAX_MIX_CHANNELS} ambience layers — remove a layer to hear this one.`,
				});
				continue;
			}
			mixed += 1;
			kept.add(channelId);
			if (silentMode) {
				next.push({ layerId: plan.layerId, sounding: false, detail: engine.modeDetail });
				continue;
			}
			const media = materialize(plan.resolution);
			if (media.kind === 'embed') {
				// RC-AUD-3.3 — a web embed plays only as the PRIMARY track (one visible player, not one
				// per ambience layer); an ambience layer bound to the same source stays silent and says why.
				engine.setChannel(channelId, { url: null, volume: plan.volume, crossfadeSeconds: 0 });
				next.push({
					layerId: plan.layerId,
					sounding: false,
					detail: 'A web embed plays only as the primary track, not as an ambience layer.',
				});
				continue;
			}
			if (media.kind !== 'url') {
				engine.setChannel(channelId, { url: null, volume: plan.volume, crossfadeSeconds: 0 });
				next.push({
					layerId: plan.layerId,
					sounding: false,
					detail: media.kind === 'loading' ? 'Loading audio bytes…' : media.detail,
				});
				continue;
			}
			if (!hadGesture) {
				engine.setChannel(channelId, { url: null, volume: plan.volume, crossfadeSeconds: 0 });
				armGestureRetry();
				next.push({
					layerId: plan.layerId,
					sounding: false,
					detail: 'Sound starts after your first click or key press (browser autoplay rules).',
				});
				continue;
			}
			// A muted layer keeps its voice at zero gain rather than stopping: unmuting is instant and
			// the beds stay aligned with each other. It is reported as honestly silent either way.
			const channel = engine.setChannel(channelId, {
				url: media.url,
				volume: plan.muted ? 0 : plan.volume,
			});
			if (channel.reason === 'blocked') armGestureRetry();
			next.push({
				layerId: plan.layerId,
				sounding: plan.muted ? false : channel.sounding,
				detail: plan.muted ? 'Muted.' : channel.detail,
			});
		}
		for (const channelId of engine.channelIds()) {
			if (!kept.has(channelId)) engine.releaseChannel(channelId);
		}
		ambience = next;

		// ── Release object URLs no plan uses anymore (a removed layer / stopped local track).
		const inUse = assetIdsInUse(trackPlan, layerPlans);
		for (const [assetId, entry] of assetUrls) {
			if (entry.kind === 'url' && !inUse.has(assetId)) {
				URL.revokeObjectURL(entry.url);
				assetUrls.delete(assetId);
			}
		}

		publish(routing, routingDetail);
	}

	// App-lifetime subscription (deliberately never unsubscribed): session audio keeps following the
	// core state after the Audio screen unmounts. The emit counter keys the byte-miss/sink retries.
	runtime.subscribe(() => {
		emitSeq += 1;
		sync();
	});
	sync();

	return {
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getSnapshot: () => snapshot,
		playSfx: (url, volume) => engine.playSfx(url, volume),
		setMasterVolume: (volume) => engine.setMasterVolume(volume),
	};
}
