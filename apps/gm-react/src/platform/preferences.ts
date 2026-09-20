import { useSyncExternalStore } from 'react';
import { vaultPreferenceKey } from './storage/coreStore';

/**
 * RC-UX-4.1 (DEBT-2026-001) — the device-preferences slice and platform capability layer.
 *
 * ONE place in the React app that touches `localStorage`, `matchMedia` and the `navigator`
 * capabilities. Everything above it (screens, the app shell, the design system) imports these
 * typed helpers instead of reaching for the primitive, which is what PLAT-006 asks for and what
 * `scripts/boundary-lint.ts` enforces: `src/platform/` sits outside the GUI boundary, so the
 * primitive access is legitimate here and a violation anywhere else.
 *
 * Contract 1 still holds: nothing stored through this module is durable vault or sync state. These
 * are device-scoped display/UI preferences — the same values `index.html` restores pre-paint —
 * plus live capability probes that carry no state at all. Durable facts go through
 * `SceneRuntime.dispatch`, never here.
 *
 * Every accessor fails closed and silently: a private-mode browser that throws on `localStorage`,
 * a jsdom build without `matchMedia`, a denied clipboard — each degrades to an honest default
 * rather than throwing into a render.
 */

/**
 * The device-scoped preference keys, spelled once. The union (not `string`) is the point: a typo
 * is a type error, and the whole set of things this app persists per-device is readable here.
 */
export const PREFERENCE_KEYS = {
	/** Scene ids that have contained tiles, for repeat-empty onboarding. */
	boardFilled: 'dndtools:react:board-filled',
	markGmOnly: 'dndtools:react:mark-gm-only',
	/** Active theme preset — shared by Settings › Appearance and the Theme studio. */
	theme: 'dndtools:react:theme',
	/** The theme in effect before high contrast was switched on, so the switch is reversible. */
	previousTheme: 'dndtools:react:theme-prehc',
	/** Comfortable/compact display density. */
	density: 'dndtools:react:density',
	/** Reduced-motion display preference. */
	motion: 'dndtools:react:motion',
	/** Progressive-disclosure feature tier (core/intermediate/advanced). */
	tier: 'dndtools:react:tier',
	/** Whether first-run onboarding has been completed or skipped on this device. */
	onboarded: 'dndtools:react:onboarded',
	/** Which starting vault the onboarding wizard chose. */
	vaultChoice: 'dndtools:react:vault-choice',
	/** Device-local player-invite notes captured during onboarding. */
	partyNotes: 'dndtools:react:invites',
	/** Opt-in: raise a platform notification when an assistant run finishes. */
	aiNotify: 'dndtools.ai.notify-on-complete',
	/** The last release version whose "What's new" the DM has opened. */
	whatsNewSeen: 'dndtools:react:whatsNewSeen',
	/** Chosen UI language. A property of the person holding the device, never of the vault (ADR-032). */
	locale: 'dndtools:locale',
	/** RC-KNW-2.3 — the command palette's just-run rows, newest first. UI history, not vault state. */
	paletteRecents: 'dndtools:react:palette-recents',
	/** RC-UX-3.2 — feature spotlights already shown, per vault (core `parseSeenSpotlights`). */
	seenSpotlights: 'dndtools:react:seen-spotlights',
	/** Reading width for prose surfaces: comfortable / wide / full. */
	proseWidth: 'dndtools:react:prose-width',
} as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS];

export const PROSE_WIDTH_OPTIONS = ['comfortable', 'wide', 'full'] as const;
export type ProseWidth = (typeof PROSE_WIDTH_OPTIONS)[number];

/** Whether a string is one of the valid reading-width values. */
export function isProseWidth(value: string | null): value is ProseWidth {
	return value !== null && (PROSE_WIDTH_OPTIONS as readonly string[]).includes(value);
}

/** Resolve the active prose-width preference from DOM attr then localStorage with a safe fallback. */
export function readProseWidthPreference(fallback: ProseWidth = 'comfortable'): ProseWidth {
	const candidate =
		(typeof document !== 'undefined'
			? document.documentElement.getAttribute('data-prose-width')
			: null) ?? readPreference(PREFERENCE_KEYS.proseWidth);
	return isProseWidth(candidate) ? candidate : fallback;
}

// RC-UX-5.4 — campaign history and choices follow the document's local vault (the original vault
// keeps its released keys). Language, appearance, accessibility, feature tier and first-run
// onboarding describe the person holding the device and stay device-wide.
const VAULT_PREFERENCES: ReadonlySet<PreferenceKey> = new Set<PreferenceKey>([
	PREFERENCE_KEYS.vaultChoice,
	PREFERENCE_KEYS.partyNotes,
	PREFERENCE_KEYS.paletteRecents,
	PREFERENCE_KEYS.seenSpotlights,
]);

/** The storage key a preference lives under in this document. Exported for isolation tests. */
export function preferenceStorageKey(key: PreferenceKey): string {
	return VAULT_PREFERENCES.has(key) ? vaultPreferenceKey(key) : key;
}

/** Read a device preference. `null` when unset, unreadable (private mode) or off-browser. */
export function readPreference(key: PreferenceKey): string | null {
	try {
		if (typeof window === 'undefined') return null;
		return window.localStorage.getItem(preferenceStorageKey(key));
	} catch {
		return null;
	}
}

/** Persist a device preference. Best-effort: a browser that refuses storage just forgets it. */
export function writePreference(key: PreferenceKey, value: string): void {
	try {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(preferenceStorageKey(key), value);
	} catch {
		/* private mode — the preference simply does not survive this session */
	}
}

/** Forget a device preference. Best-effort, same reasoning as `writePreference`. */
export function removePreference(key: PreferenceKey): void {
	try {
		if (typeof window === 'undefined') return;
		window.localStorage.removeItem(preferenceStorageKey(key));
	} catch {
		/* nothing was persisted anyway */
	}
}

/**
 * Whether a media query currently matches. Off-browser (SSR, a jsdom build without `matchMedia`)
 * reports `false`, which resolves every responsive query to the roomiest profile.
 */
export function matchesMedia(query: string): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
	try {
		return window.matchMedia(query).matches;
	} catch {
		return false;
	}
}

/**
 * Subscribe to a set of media queries; `onChange` fires whenever any of them flips. Returns the
 * unsubscribe function. Event-driven, no resize listeners and no layout thrash.
 */
export function subscribeMedia(queries: readonly string[], onChange: () => void): () => void {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
	const lists: MediaQueryList[] = [];
	for (const query of queries) {
		try {
			const list = window.matchMedia(query);
			list.addEventListener('change', onChange);
			lists.push(list);
		} catch {
			/* an unsupported query simply never notifies */
		}
	}
	return () => {
		for (const list of lists) list.removeEventListener('change', onChange);
	};
}

/**
 * Live connectivity. Consumed as honest online/offline context on dispatched commands (the core's
 * degradation model reads it) — assume online where the capability is unavailable, so an
 * environment that cannot answer never fabricates an outage.
 */
export function isOnline(): boolean {
	if (typeof navigator === 'undefined') return true;
	return navigator.onLine !== false;
}

/**
 * Copy text to the clipboard. Resolves `false` when the capability is missing or the write is
 * denied so the caller can degrade honestly (show the text for manual copying) instead of
 * claiming a copy that never happened.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		if (typeof navigator === 'undefined' || !navigator.clipboard) return false;
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/**
 * The usable viewport height — the VisualViewport's when it exists (so an open Android keyboard
 * shrinks it), the window's otherwise. Off-browser reports a sane desktop-ish default.
 */
export function readViewportHeight(): number {
	if (typeof window === 'undefined') return 640;
	return Math.max(1, Math.round(window.visualViewport?.height ?? window.innerHeight));
}

/** Subscribe to viewport-size changes (window resize and VisualViewport resize). */
export function subscribeViewportSize(onChange: () => void): () => void {
	if (typeof window === 'undefined') return () => {};
	window.addEventListener('resize', onChange);
	window.visualViewport?.addEventListener('resize', onChange);
	return () => {
		window.removeEventListener('resize', onChange);
		window.visualViewport?.removeEventListener('resize', onChange);
	};
}

const preferenceListeners = new Set<() => void>();
export function setMarkGmOnly(value: boolean): void {
	writePreference(PREFERENCE_KEYS.markGmOnly, String(value));
	for (const listener of preferenceListeners) listener();
}
function subscribeMarkGmOnly(listener: () => void): () => void {
	preferenceListeners.add(listener);
	window.addEventListener('storage', listener);
	return () => {
		preferenceListeners.delete(listener);
		window.removeEventListener('storage', listener);
	};
}
/** Device-only display preference; never changes an item's visibility. */
export function useMarkGmOnly(): boolean {
	return useSyncExternalStore(
		subscribeMarkGmOnly,
		() => readPreference(PREFERENCE_KEYS.markGmOnly) === 'true',
		() => false,
	);
}
