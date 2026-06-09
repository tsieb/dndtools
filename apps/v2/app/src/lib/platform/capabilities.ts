/**
 * Platform capability probes (Contract 1: Platform Services own access to browser APIs).
 *
 * These functions read browser/native primitives (`indexedDB`, `navigator`, `window`) so that
 * GUI components never touch those primitives directly (PLAT-006). Feature components branch on
 * the returned capability facts / resolved platform profile, not on the raw globals or raw
 * viewport width (PLAT-001 AC2). This module is an explicitly owned, scoped platform-access
 * surface (PLAT-012) and is allowlisted in the boundary exception manifest.
 */

import type { PlatformEnvironmentDescriptor, PlatformViewportClass } from '@dndtools/v2-core';

/** Whether durable browser storage (IndexedDB) is reachable on this profile. */
export function storageAvailable(): boolean {
	return typeof indexedDB !== 'undefined';
}

/** Whether the device currently reports an online network connection. */
export function isOnline(): boolean {
	return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/**
 * UX-NAV-016 — subscribe to online/offline transitions so the deep-link "unavailable" surface can
 * show its offline-specific copy only when the device is genuinely offline. This is the owned
 * platform probe for connectivity (the boundary lint forbids `navigator` outside this layer);
 * GUI components consume {@link isOnline} + this watcher instead of touching the global. Returns a
 * cleanup function; a no-op on the server.
 */
export function watchConnectivity(onChange: (online: boolean) => void): () => void {
	if (typeof window === 'undefined') return () => {};
	const update = () => onChange(isOnline());
	window.addEventListener('online', update);
	window.addEventListener('offline', update);
	return () => {
		window.removeEventListener('online', update);
		window.removeEventListener('offline', update);
	};
}

/**
 * AUDIO-008 — whether the device prefers REDUCED MOTION. This is the ONLY place this media query is read
 * (the boundary forbids `matchMedia` outside this owned probe). Feature components pass the result to the
 * core `resolveAudioMotionState` and never touch the media query themselves. Fail closed: on the server, or
 * where `matchMedia` is unavailable, it reports `true` (the safer, less-animated default).
 */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * UX-VIS-010 / A11Y-005 — subscribe to OS reduced-motion preference changes so the motion store can
 * re-resolve the single motion preference live. This is the ONLY place the media query is watched
 * (the boundary forbids `matchMedia` outside this owned probe). Returns a cleanup function; on the
 * server or where `matchMedia` is unavailable it is a no-op.
 */
export function watchReducedMotion(onChange: (prefersReduced: boolean) => void): () => void {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
	const query = window.matchMedia('(prefers-reduced-motion: reduce)');
	const handler = (event: MediaQueryListEvent) => onChange(event.matches);
	query.addEventListener('change', handler);
	return () => query.removeEventListener('change', handler);
}

/** Coarse device orientation, used by the shell to choose Tablet rail vs. tab bar (UX-NAV-005). */
export type DeviceOrientation = 'portrait' | 'landscape';

/**
 * UX-NAV-005 — read the coarse device orientation. This is a presentation fact the shell uses to
 * pick the Tablet navigation surface (landscape rail vs. portrait tab bar). It lives in the owned
 * platform probe because the boundary lint forbids `matchMedia` outside this layer. Fail closed to
 * `landscape` (the wider, rail layout) on the server or where `matchMedia` is unavailable.
 */
export function probeOrientation(): DeviceOrientation {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'landscape';
	return window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
}

/**
 * Subscribe to orientation changes (UX-NAV-005). The ONLY orientation media-query watcher; the
 * boundary lint forbids `matchMedia` outside this owned probe. Returns a cleanup function; no-op
 * on the server.
 */
export function watchOrientation(onChange: (orientation: DeviceOrientation) => void): () => void {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
	const query = window.matchMedia('(orientation: portrait)');
	const handler = (event: MediaQueryListEvent) => onChange(event.matches ? 'portrait' : 'landscape');
	query.addEventListener('change', handler);
	return () => query.removeEventListener('change', handler);
}

// PLAT-001: the ONLY place a raw viewport width is read. The platform layer classifies it once
// into a coarse class so the profile resolver and every feature component stay free of raw pixel
// math. The boundary lint forbids `innerWidth` / `matchMedia` outside this owned probe.
const COMPACT_MAX = 720;
const EXPANDED_MIN = 1200;

/** Classify a raw width into the coarse viewport class used by the profile descriptor. */
export function classifyViewport(width: number): PlatformViewportClass {
	if (width <= COMPACT_MAX) return 'compact';
	if (width >= EXPANDED_MIN) return 'expanded';
	return 'medium';
}

/**
 * Probe the host environment once and build the capability/environment descriptor the shell
 * hands to the core `selectPlatformProfile` resolver. This reads `window.innerWidth`,
 * `matchMedia`, and `navigator` — the trusted platform-service boundary — so no feature
 * component ever does (PLAT-001). On the server (SSR) it returns a stable expanded default.
 */
export function probeEnvironment(): PlatformEnvironmentDescriptor {
	if (typeof window === 'undefined') {
		return { viewportClass: 'expanded', hasTouch: false, hasFinePointer: true };
	}
	const viewportClass = classifyViewport(window.innerWidth);
	const coarse =
		typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)').matches : false;
	const fine =
		typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: fine)').matches : true;
	return {
		viewportClass,
		hasTouch: coarse,
		hasFinePointer: fine,
		// The browser prototype is always the web shell. A native Electron/Capacitor host would
		// inject its own declared shell here.
		declaredShell: 'web',
	};
}
