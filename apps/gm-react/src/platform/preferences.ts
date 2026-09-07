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
} as const;

export type PreferenceKey = (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS];

/** Read a device preference. `null` when unset, unreadable (private mode) or off-browser. */
export function readPreference(key: PreferenceKey): string | null {
	try {
		if (typeof window === 'undefined') return null;
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

/** Persist a device preference. Best-effort: a browser that refuses storage just forgets it. */
export function writePreference(key: PreferenceKey, value: string): void {
	try {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(key, value);
	} catch {
		/* private mode — the preference simply does not survive this session */
	}
}

/** Forget a device preference. Best-effort, same reasoning as `writePreference`. */
export function removePreference(key: PreferenceKey): void {
	try {
		if (typeof window === 'undefined') return;
		window.localStorage.removeItem(key);
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
