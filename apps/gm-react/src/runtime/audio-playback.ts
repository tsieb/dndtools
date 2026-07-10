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

/**
 * audio-playback — the DEVICE-LOCAL audible output driver for the session's authoritative audio state
 * (AUDIO-002/003). The core owns WHAT is playing (`session.audioPlayback`: track/ambience layers/
 * output device); this module is the impure output layer that makes that durable state AUDIBLE on this
 * device. It renders nothing and dispatches nothing — the transport UI mutates the core, the core
 * state changes, and this driver follows. The WHAT/HOW split is deliberate: `audio-plan.ts` computes
 * (pure, tested) what should sound; this file owns the DOM half — elements, object URLs, autoplay
 * gestures, `setSinkId`.
 *
 * What it drives:
 *   - The PRIMARY track on a single looped `HTMLAudioElement`. A web-stream source plays its URL; a
 *     local/bundled track resolves its content-addressed ASSET BYTES from the device asset-byte store
 *     (`getAssetBytes` → Blob → object URL, revoked when stale). Missing bytes degrade to the honest
 *     `no-stream` state — never a crash, never a substituted track (AUDIO-010).
 *   - One looped element PER AMBIENCE LAYER (`session.audioPlayback.ambienceLayers`), reconciled by
 *     layerId: created on set, volume/mute applied per layer, torn down (and its object URL revoked)
 *     on remove. Each layer's honest sounding/silent state is reported in the snapshot.
 *   - The DM-selected OUTPUT DEVICE (`session.audioPlayback.outputDevice`) via `el.setSinkId` on every
 *     element, feature-detected. Routing is resolved through the core degradation model
 *     (`resolveAudioOutputRouting`, AUDIO-012): unsupported platforms or a failed `setSinkId` report
 *     `unavailable` and FALL BACK to the platform default output — routing never fails session audio.
 *
 *   - Autoplay policy is handled fail-closed and deterministically: NO load/play is attempted until
 *     the user's first gesture (pointer/key) — that satisfies browser autoplay rules AND keeps
 *     automated route sweeps from spraying network errors for unreachable demo URLs.
 *   - `loop` is always on: the session track and ambience layers are loop-until-stopped beds; a finite
 *     file loops rather than silently ending while the durable status still says `playing`.
 *
 * One driver per runtime (WeakMap), started idempotently from Audio.tsx via `ensureAudioPlayback` and
 * kept for the app's lifetime (session audio must keep sounding after navigating away from /audio).
 */

export type AudioPlaybackStatus = 'idle' | 'playing' | 'paused' | 'blocked' | 'no-stream' | 'error';

/** One ambience layer's honest device-output state. */
export interface AmbienceLayerPlayback {
	layerId: string;
	/** True only when the layer's element is actually sounding on this device. */
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
}

export interface AudioPlaybackHandle {
	/** Subscribe to snapshot changes (for `useSyncExternalStore`). */
	subscribe(listener: () => void): () => void;
	/** The current snapshot — a stable object identity until the content actually changes. */
	getSnapshot(): AudioPlaybackSnapshot;
}

const drivers = new WeakMap<SceneRuntime, AudioPlaybackHandle>();

/** Start (or return the already-started) playback driver for this runtime. Idempotent; app-lifetime. */
export function ensureAudioPlayback(runtime: SceneRuntime): AudioPlaybackHandle {
	let driver = drivers.get(runtime);
	if (!driver) {
		driver = createDriver(runtime);
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

interface AmbienceEntry {
	el: HTMLAudioElement;
	/** The URL currently assigned to the element (element.src normalizes, so track it ourselves). */
	currentUrl: string | null;
	/** Monotonic guard so a stale play() promise is ignored after pause/teardown/src change. */
	seq: number;
	sounding: boolean;
	detail: string | null;
	/** The URL whose load errored (cleared when the src changes) — honest, no retry loop. */
	erroredUrl: string | null;
}

function createDriver(runtime: SceneRuntime): AudioPlaybackHandle {
	const el = document.createElement('audio');
	el.preload = 'none';
	el.loop = true; // see module docstring — session audio is loop-until-stopped ambience

	const listeners = new Set<() => void>();
	const pool = new Map<string, AmbienceEntry>();
	const assetUrls = new Map<string, AssetUrlEntry>();
	/** Per-element applied sink id ('' = platform default) so setSinkId is only called on change. */
	const appliedSinks = new WeakMap<HTMLAudioElement, string>();

	/** Main-track element state (mirrors the old single-element driver). */
	let mainStatus: AudioPlaybackStatus = 'idle';
	let mainDetail: string | null = null;
	let currentUrl: string | null = null;
	let playSeq = 0;
	let hadGesture = false;
	let gestureArmed = false;
	/** Counts runtime emits — the retry key for `missing` byte lookups and failed sink switches. */
	let emitSeq = 0;
	/** The sink id whose setSinkId REJECTED (don't hot-loop retrying it every sync). */
	let failedSinkId: string | null = null;
	let failedSinkAtEmit = -1;
	let sinkFailureDetail: string | null = null;

	const supportsSinkSelection =
		typeof (el as HTMLAudioElement & { setSinkId?: unknown }).setSinkId === 'function';

	let snapshot: AudioPlaybackSnapshot = {
		status: 'idle',
		detail: null,
		routing: 'default',
		routingDetail: null,
		ambience: [],
	};

	const snapshotsEqual = (a: AudioPlaybackSnapshot, b: AudioPlaybackSnapshot): boolean =>
		a.status === b.status &&
		a.detail === b.detail &&
		a.routing === b.routing &&
		a.routingDetail === b.routingDetail &&
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
			ambience: [...pool.entries()]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([layerId, entry]) => ({ layerId, sounding: entry.sounding, detail: entry.detail })),
		};
		if (snapshotsEqual(snapshot, next)) return;
		snapshot = next;
		for (const listener of listeners) listener();
	};

	/** The routing computed by the LAST sync (so async play/sink callbacks can publish coherently). */
	let lastRouting: AudioOutputRouting = 'default';
	let lastRoutingDetail: string | null = null;
	const republish = (): void => publish(lastRouting, lastRoutingDetail);

	// First-gesture retry: capture-phase one-shot listeners so the play() attempt runs INSIDE the user
	// activation (that is what clears an autoplay block). Re-armed if a later attempt is blocked again.
	const onGesture = (): void => {
		gestureArmed = false;
		window.removeEventListener('pointerdown', onGesture, true);
		window.removeEventListener('keydown', onGesture, true);
		hadGesture = true;
		sync();
	};
	const armGestureRetry = (): void => {
		if (gestureArmed) return;
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
					blob ? { kind: 'url', url: URL.createObjectURL(blob) } : { kind: 'missing', atEmit: emitSeq },
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
		| { kind: 'loading' }
		| { kind: 'silent'; detail: string };

	const materialize = (resolution: AudioByteResolution): Materialized => {
		if (resolution.url) return { kind: 'url', url: resolution.url };
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

	/** Apply the DM-selected output device to one element (feature-detected, fail-open to default). */
	const applySink = (element: HTMLAudioElement, sinkId: string): void => {
		if (!supportsSinkSelection) return;
		if (failedSinkId === sinkId && failedSinkAtEmit === emitSeq) return; // don't hot-loop a failing sink
		if ((appliedSinks.get(element) ?? '') === sinkId) return;
		const sinkCapable = element as HTMLAudioElement & { setSinkId(id: string): Promise<void> };
		sinkCapable.setSinkId(sinkId).then(
			() => {
				appliedSinks.set(element, sinkId);
				if (failedSinkId === sinkId) {
					failedSinkId = null;
					sinkFailureDetail = null;
				}
				sync();
			},
			(error: unknown) => {
				// Honest degradation (AUDIO-012 AC1): report, fall back to the default output, never
				// fail session audio. Retried on the next state emit (e.g. the DM picks another device).
				failedSinkId = sinkId;
				failedSinkAtEmit = emitSeq;
				sinkFailureDetail = `The selected output device could not be used (${
					error instanceof Error ? error.message : 'device unavailable'
				}) — falling back to the platform default output.`;
				sync();
			},
		);
	};

	/** Stop the main element's output and detach its stream (idle / no-stream states). */
	const silenceMain = (): void => {
		playSeq += 1;
		if (!el.paused) el.pause();
		if (currentUrl !== null) {
			currentUrl = null;
			el.removeAttribute('src');
			el.load();
		}
	};

	const attemptMainPlay = (): void => {
		const seq = ++playSeq;
		el.play().then(
			() => {
				if (seq !== playSeq) return;
				mainStatus = 'playing';
				mainDetail = null;
				republish();
			},
			(error: unknown) => {
				if (seq !== playSeq) return; // superseded by a newer pause/stop/play — not ours to report
				const name = error instanceof Error ? error.name : '';
				if (name === 'NotAllowedError') {
					mainStatus = 'blocked';
					mainDetail = 'The browser blocked autoplay — click or press any key to start sound.';
					armGestureRetry();
				} else if (name !== 'AbortError') {
					mainStatus = 'error';
					mainDetail = 'The stream could not be played (unreachable URL or unsupported format).';
				}
				republish();
			},
		);
	};

	const attemptLayerPlay = (entry: AmbienceEntry): void => {
		const seq = ++entry.seq;
		entry.el.play().then(
			() => {
				if (seq !== entry.seq) return;
				entry.sounding = true;
				entry.detail = null;
				republish();
			},
			(error: unknown) => {
				if (seq !== entry.seq) return;
				const name = error instanceof Error ? error.name : '';
				if (name === 'NotAllowedError') {
					entry.sounding = false;
					entry.detail = 'Autoplay blocked — click or press any key to start sound.';
					armGestureRetry();
				} else if (name !== 'AbortError') {
					entry.sounding = false;
					entry.detail = 'This layer could not be played (unreachable URL or unsupported format).';
				}
				republish();
			},
		);
	};

	const pauseLayer = (entry: AmbienceEntry, detail: string | null): void => {
		entry.seq += 1;
		if (!entry.el.paused) entry.el.pause();
		entry.sounding = false;
		entry.detail = detail;
	};

	const teardownLayer = (entry: AmbienceEntry): void => {
		entry.seq += 1;
		if (!entry.el.paused) entry.el.pause();
		entry.el.removeAttribute('src');
		entry.el.load();
	};

	/** Reconcile every element with the authoritative session state. Cheap; runs on each runtime emit. */
	const sync = (): void => {
		const state = runtime.state;
		const trackPlan = planSessionTrack(state.session.audioPlayback, state.audio);
		const layerPlans = planAmbienceLayers(state.session.audioPlayback, state.audio);

		// ── Output routing (AUDIO-012): resolve through the core degradation model, apply per element.
		const desiredSinkId = state.session.audioPlayback.outputDevice?.deviceId ?? null;
		let routing = resolveAudioOutputRouting(
			normalizeAudioPlatformCapability({ canRouteOutput: supportsSinkSelection, canPlayAudio: true }),
			normalizeAudioParticipantPreferences({ outputRouteId: desiredSinkId }),
		);
		let routingDetail: string | null =
			routing === 'unavailable'
				? 'This browser cannot route audio to a specific output device — the platform default output is used.'
				: null;
		const sinkTarget = desiredSinkId ?? '';
		if (routing === 'routed' && failedSinkId === sinkTarget) {
			routing = 'unavailable';
			routingDetail = sinkFailureDetail;
		}

		// ── Primary track.
		if (!trackPlan.active) {
			silenceMain();
			mainStatus = 'idle';
			mainDetail = null;
		} else {
			const media = materialize(trackPlan.resolution);
			if (media.kind !== 'url') {
				// Honest silent state: the transport still drives the durable session state, but this
				// device has nothing it can output (no stream URL / bytes absent / bytes still loading).
				silenceMain();
				mainStatus = 'no-stream';
				mainDetail =
					media.kind === 'loading' ? 'Loading the track’s audio bytes from this device…' : media.detail;
			} else {
				el.volume = trackPlan.volume;
				applySink(el, sinkTarget);
				if (trackPlan.paused) {
					playSeq += 1;
					if (!el.paused) el.pause();
					mainStatus = 'paused';
					mainDetail = null;
				} else if (!hadGesture) {
					// Fail closed until the first gesture: play() before any user interaction is
					// guaranteed-blocked by autoplay policy AND would start a fetch nobody can hear.
					mainStatus = 'blocked';
					mainDetail = 'Sound starts after your first click or key press (browser autoplay rules).';
					armGestureRetry();
				} else {
					if (currentUrl !== media.url) {
						currentUrl = media.url;
						el.src = media.url;
					}
					if (el.paused) attemptMainPlay();
					else {
						mainStatus = 'playing';
						mainDetail = null;
					}
				}
			}
		}

		// ── Ambience layer pool, reconciled by layerId.
		const seen = new Set<string>();
		for (const plan of layerPlans) {
			seen.add(plan.layerId);
			let entry = pool.get(plan.layerId);
			if (!entry) {
				const layerEl = document.createElement('audio');
				layerEl.preload = 'none';
				layerEl.loop = true;
				entry = { el: layerEl, currentUrl: null, seq: 0, sounding: false, detail: null, erroredUrl: null };
				const created = entry;
				layerEl.addEventListener('error', () => {
					if (created.currentUrl === null) return;
					created.erroredUrl = created.currentUrl;
					created.sounding = false;
					created.detail = 'This layer failed to load — check its source (no retry, no substitution).';
					republish();
				});
				pool.set(plan.layerId, entry);
			}
			entry.el.volume = plan.volume;
			applySink(entry.el, sinkTarget);
			const media = materialize(plan.resolution);
			if (media.kind !== 'url') {
				pauseLayer(entry, media.kind === 'loading' ? 'Loading audio bytes…' : media.detail);
				continue;
			}
			if (plan.muted) {
				pauseLayer(entry, 'Muted.');
				continue;
			}
			if (!hadGesture) {
				pauseLayer(entry, 'Sound starts after your first click or key press (browser autoplay rules).');
				armGestureRetry();
				continue;
			}
			if (entry.currentUrl !== media.url) {
				entry.currentUrl = media.url;
				entry.erroredUrl = null;
				entry.el.src = media.url;
			}
			if (entry.erroredUrl === media.url) continue; // honest error already reported; no retry loop
			if (entry.el.paused) attemptLayerPlay(entry);
			else {
				entry.sounding = true;
				entry.detail = null;
			}
		}
		for (const [layerId, entry] of pool) {
			if (seen.has(layerId)) continue;
			teardownLayer(entry);
			pool.delete(layerId);
		}

		// ── Release object URLs no plan uses anymore (a removed layer / stopped local track).
		const inUse = assetIdsInUse(trackPlan, layerPlans);
		for (const [assetId, entry] of assetUrls) {
			if (entry.kind === 'url' && !inUse.has(assetId)) {
				URL.revokeObjectURL(entry.url);
				assetUrls.delete(assetId);
			}
		}

		lastRouting = routing;
		lastRoutingDetail = routingDetail;
		publish(routing, routingDetail);
	};

	el.addEventListener('error', () => {
		// A media/network failure on the CURRENT stream (ignored when we already detached the src). Honest
		// report, no retry loop and no track substitution (AUDIO-010) — the core state stays authoritative.
		if (currentUrl === null) return;
		mainStatus = 'error';
		mainDetail = 'The stream failed to load — check the source URL (no retry, no substitution).';
		republish();
	});

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
	};
}
