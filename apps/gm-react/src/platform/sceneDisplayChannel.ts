import type { SceneCardTransitionStyle, SceneCardView } from '@dndtools/core';

/**
 * I11 S11.2.2 — the CROSS-WINDOW SCENE DISPLAY seam.
 *
 * The secondary "second screen" window (opened via `window.open('#/display')`, or a browser tab) is a
 * FRESH `SceneRuntime` that loads once from IndexedDB and then never sees the primary window's writes —
 * IndexedDB has no cross-tab change events here. So the primary (DM) window BROADCASTS the live display
 * view-model over a `BroadcastChannel` on every dispatch, and the display window applies it. This is the
 * only cross-window state channel in the app; it is deliberately narrow (display view-model only).
 *
 * Fail-safe: when `BroadcastChannel` is unavailable the poster is a no-op and the subscriber returns an
 * immediate unsubscribe, so the display window simply renders its own (last-loaded) runtime state instead
 * of live updates — degraded, never broken.
 */

const CHANNEL_NAME = 'dndtools:scene-display';

/** The JSON-serializable display view-model sent between windows (a subset of the core display read). */
export interface SceneDisplayPayload {
	active: SceneCardView | null;
	transitionStyle: SceneCardTransitionStyle;
	/** Monotonic counter so the receiver can ignore stale/duplicate posts and force a re-render. */
	seq: number;
}

function supported(): boolean {
	return typeof BroadcastChannel !== 'undefined';
}

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
	if (!supported()) return null;
	if (!channel) channel = new BroadcastChannel(CHANNEL_NAME);
	return channel;
}

/** Broadcast the current display view-model to any open display windows. No-op without BroadcastChannel. */
export function postSceneDisplay(payload: SceneDisplayPayload): void {
	getChannel()?.postMessage(payload);
}

/**
 * Subscribe to display view-model updates (used by the `/display` window). Returns an unsubscribe. When
 * BroadcastChannel is unavailable the callback is never invoked and the unsubscribe is a no-op.
 */
export function subscribeSceneDisplay(listener: (payload: SceneDisplayPayload) => void): () => void {
	const ch = getChannel();
	if (!ch) return () => {};
	const handler = (event: MessageEvent) => listener(event.data as SceneDisplayPayload);
	ch.addEventListener('message', handler);
	return () => ch.removeEventListener('message', handler);
}

/**
 * Open the scene display on a second screen (a new window/tab at the chrome-less `#/display` route).
 * Works in the browser (popup) and the Electron shell (a new BrowserWindow via `window.open`). Returns
 * the opened window or null when the platform blocked it (popup blocker).
 */
export function openSecondScreen(): Window | null {
	return window.open(
		'#/display',
		'dndtools-scene-display',
		'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no',
	);
}
