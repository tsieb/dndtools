import { getContext, setContext } from 'svelte';

/**
 * UX-NAV-004 — device-local navigation chrome preference: the Desktop sidebar icon-rail
 * collapse state. Persisted so it survives a reload (UX-NAV-004 AC3), but never the default on
 * first launch — a fresh device starts expanded so primary-nav information scent is maximal.
 *
 * Platform-layer store: `localStorage` is the persistence primitive (allowlisted here, like the
 * theme/density preferences). Feature components branch on {@link collapsed}, never touch storage.
 */
const STORAGE_KEY = 'dndtools:v2:nav-collapsed';

export class NavChromeStore {
	// First launch is always expanded (UX-NAV-004): the icon-rail is opt-in, never the default.
	#collapsed = $state(false);

	get collapsed(): boolean {
		return this.#collapsed;
	}

	toggle(): void {
		this.#collapsed = !this.#collapsed;
		this.#persist();
	}

	set(value: boolean): void {
		this.#collapsed = value;
		this.#persist();
	}

	/** Read the persisted preference once, from the app shell. SSR/test-safe. */
	init(): () => void {
		if (typeof window === 'undefined') return () => {};
		try {
			const raw = window.localStorage?.getItem(STORAGE_KEY);
			if (raw === 'true') this.#collapsed = true;
			else if (raw === 'false') this.#collapsed = false;
		} catch {
			// Storage may be unavailable (private mode); keep the expanded default.
		}
		return () => {};
	}

	#persist(): void {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage?.setItem(STORAGE_KEY, this.#collapsed ? 'true' : 'false');
		} catch {
			// Best-effort; the in-memory state still drives the UI this session.
		}
	}
}

const KEY = Symbol('dndtools:v2:nav-chrome');

export function provideNavChrome(store: NavChromeStore): NavChromeStore {
	setContext(KEY, store);
	return store;
}

export function useNavChrome(): NavChromeStore {
	const store = getContext<NavChromeStore | undefined>(KEY);
	if (!store) {
		throw new Error('NavChromeStore context is missing; mount inside the root layout.');
	}
	return store;
}
