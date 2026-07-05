import type { SceneRuntime } from './SceneRuntime';

/**
 * audio-playback — the DEVICE-LOCAL audible output driver for the session's authoritative audio track
 * (AUDIO-002/003). The core owns WHAT is playing (`session.audioPlayback.track`: source/status/volume);
 * this module is the impure output layer that makes that durable state AUDIBLE on this device by driving
 * a single detached `HTMLAudioElement` from the runtime's observable state. It renders nothing and
 * dispatches nothing — the transport UI mutates the core, the core state changes, and this driver follows.
 *
 * Scope, deliberately narrow (no over-engineering):
 *   - WEB-STREAM sources only. They carry a URL, so the element can actually fetch bytes. A local-file /
 *     bundled-preset track has no asset-byte storage in this prototype, so it stays SILENT and the
 *     snapshot reports `no-stream` — the screen shows the honest label instead of pretending.
 *   - It reads the RAW session/audio slices (not the actor-filtered view): device output belongs to the
 *     device owner (the DM), follows the authoritative session track, and must not cut out while the DM
 *     merely previews as a player. Nothing here is rendered to a player surface.
 *   - Autoplay policy is handled fail-closed and deterministically: NO load/play is attempted until the
 *     user's first gesture (pointer/key). That both satisfies browser autoplay rules ("first user gesture
 *     retries") and keeps automated route sweeps from spraying network errors for unreachable demo URLs.
 *   - `loop` is always on: the core session track has no loop field (it is a single authoritative
 *     ambience track that persists until `session.audio.stop`), and the system audio widget's declared
 *     default IS `loop: true` — so a finite file loops rather than silently ending while the durable
 *     status still says `playing`.
 *
 * One driver per runtime (WeakMap), started idempotently from Audio.tsx via `ensureAudioPlayback` and
 * kept for the app's lifetime (session audio must keep sounding after navigating away from /audio).
 */

export type AudioPlaybackStatus = 'idle' | 'playing' | 'paused' | 'blocked' | 'no-stream' | 'error';

export interface AudioPlaybackSnapshot {
	status: AudioPlaybackStatus;
	/** A short, honest reason for the silent states (`blocked` / `no-stream` / `error`); null otherwise. */
	detail: string | null;
}

export interface AudioPlaybackHandle {
	/** Subscribe to snapshot changes (for `useSyncExternalStore`). */
	subscribe(listener: () => void): () => void;
	/** The current snapshot — a stable object identity until the status/detail actually changes. */
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

function createDriver(runtime: SceneRuntime): AudioPlaybackHandle {
	const el = document.createElement('audio');
	el.preload = 'none';
	el.loop = true; // see module docstring — the session track is a loop-until-stopped ambience track

	let snapshot: AudioPlaybackSnapshot = { status: 'idle', detail: null };
	const listeners = new Set<() => void>();
	/** The stream URL currently assigned to the element (element.src normalizes, so track it ourselves). */
	let currentUrl: string | null = null;
	/** Monotonic guard so a stale play() promise (superseded by pause/stop/src change) is ignored. */
	let playSeq = 0;
	/** True once the user has interacted at all — the browser-autoplay prerequisite for audible play. */
	let hadGesture = false;
	let gestureArmed = false;

	const setSnapshot = (status: AudioPlaybackStatus, detail: string | null = null): void => {
		if (snapshot.status === status && snapshot.detail === detail) return;
		snapshot = { status, detail };
		for (const listener of listeners) listener();
	};

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

	/** Stop any output and detach the stream (used for idle / no-stream states). */
	const silence = (): void => {
		playSeq += 1;
		if (!el.paused) el.pause();
		if (currentUrl !== null) {
			currentUrl = null;
			el.removeAttribute('src');
			el.load();
		}
	};

	const attemptPlay = (): void => {
		const seq = ++playSeq;
		el.play().then(
			() => {
				if (seq === playSeq) setSnapshot('playing');
			},
			(error: unknown) => {
				if (seq !== playSeq) return; // superseded by a newer pause/stop/play — not ours to report
				const name = error instanceof Error ? error.name : '';
				if (name === 'NotAllowedError') {
					setSnapshot('blocked', 'The browser blocked autoplay — click or press any key to start sound.');
					armGestureRetry();
				} else if (name !== 'AbortError') {
					setSnapshot('error', 'The stream could not be played (unreachable URL or unsupported format).');
				}
			},
		);
	};

	/** Reconcile the element with the authoritative session track. Cheap; runs on every runtime emit. */
	const sync = (): void => {
		const state = runtime.state;
		const track = state.session.audioPlayback.track;
		if (!track || track.status === 'stopped') {
			silence();
			setSnapshot('idle');
			return;
		}
		const source = state.audio.sources[track.sourceId];
		const url = source?.type === 'web-stream' ? source.url : null;
		if (!url) {
			// A local-file/bundled-preset track (no asset-byte storage on this prototype) or a deleted
			// source: the transport still drives the durable session state, but this device stays silent.
			silence();
			setSnapshot(
				'no-stream',
				source
					? 'This source has no stream URL — the transport updates session state only (no local sound).'
					: 'The track’s source is no longer configured — nothing to output.',
			);
			return;
		}
		el.volume = Math.min(1, Math.max(0, track.volume));
		if (track.status === 'paused') {
			playSeq += 1;
			if (!el.paused) el.pause();
			setSnapshot('paused');
			return;
		}
		// status === 'playing' — fail closed until the first gesture: attempting play() before any user
		// interaction is guaranteed-blocked by autoplay policy AND would start a network fetch nobody can
		// hear. Deterministic across browsers; the armed gesture listener retries immediately after.
		if (!hadGesture) {
			setSnapshot('blocked', 'Sound starts after your first click or key press (browser autoplay rules).');
			armGestureRetry();
			return;
		}
		if (currentUrl !== url) {
			currentUrl = url;
			el.src = url;
		}
		if (el.paused) attemptPlay();
		else setSnapshot('playing');
	};

	el.addEventListener('error', () => {
		// A media/network failure on the CURRENT stream (ignored when we already detached the src). Honest
		// report, no retry loop and no track substitution (AUDIO-010) — the core state stays authoritative.
		if (currentUrl === null) return;
		setSnapshot('error', 'The stream failed to load — check the source URL (no retry, no substitution).');
	});

	// App-lifetime subscription (deliberately never unsubscribed): session audio keeps following the
	// core state after the Audio screen unmounts.
	runtime.subscribe(sync);
	sync();

	return {
		subscribe: (listener: () => void) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getSnapshot: () => snapshot,
	};
}
