import { getContext, setContext } from 'svelte';
import { LATEST_CHANGELOG_VERSION } from '$lib/content/changelog';

/**
 * UX-ONB-020 — device-local "What's New" seen-state. Which changelog version this device has already
 * viewed is a display preference (Contract 1), not durable vault state. When the latest release
 * differs from the last-seen version, the "?" button shows a passive badge (UX-ONB-016/020); opening
 * the help center (or the `/changelog` page) clears it by recording the latest version as seen.
 *
 * A fresh device starts with NOTHING seen, so the badge is present on first launch — but it is only a
 * badge, never an interruptive modal (UX-ONB-020 AC3).
 */
const STORAGE_KEY = 'dndtools:v2:changelog-seen';

export class ChangelogSeenStore {
	#seenVersion = $state<string | null>(null);

	/** True when a release newer than the last-seen one exists → the badge should show. */
	get hasUnseen(): boolean {
		return LATEST_CHANGELOG_VERSION !== '' && this.#seenVersion !== LATEST_CHANGELOG_VERSION;
	}

	/** Record the current latest release as seen → clears the badge. Idempotent. */
	markSeen(): void {
		if (this.#seenVersion === LATEST_CHANGELOG_VERSION) return;
		this.#seenVersion = LATEST_CHANGELOG_VERSION;
		this.#persist();
	}

	/** Read the persisted seen-version once, from the app shell. SSR/test-safe. */
	init(): () => void {
		if (typeof window === 'undefined') return () => {};
		try {
			const raw = window.localStorage?.getItem(STORAGE_KEY);
			if (typeof raw === 'string' && raw !== '') this.#seenVersion = raw;
		} catch {
			// Storage unavailable (private mode); the badge simply shows until opened this session.
		}
		return () => {};
	}

	#persist(): void {
		if (typeof window === 'undefined' || this.#seenVersion === null) return;
		try {
			window.localStorage?.setItem(STORAGE_KEY, this.#seenVersion);
		} catch {
			// Best-effort; the in-memory state still clears the badge this session.
		}
	}
}

const KEY = Symbol('dndtools:v2:changelog-seen');

export function provideChangelogSeen(store: ChangelogSeenStore): ChangelogSeenStore {
	setContext(KEY, store);
	return store;
}

export function useChangelogSeen(): ChangelogSeenStore {
	const store = getContext<ChangelogSeenStore | undefined>(KEY);
	if (!store) {
		throw new Error('ChangelogSeenStore context is missing; mount inside the root layout.');
	}
	return store;
}
