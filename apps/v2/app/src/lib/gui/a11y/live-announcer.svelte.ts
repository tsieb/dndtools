/**
 * Live-announcer primitive (UX-A11Y §6.2 live-region architecture; supports UX-A11Y-002/014).
 *
 * The single writer of the polite and assertive ARIA live regions. Surface components call
 * `announce(message, politeness)` instead of adding their own `aria-live` nodes, so there is exactly
 * one polite and one assertive region in the DOM (no duplicates — an axe finding) and the politeness
 * policy is enforced in one place: `assertive` is reserved for genuinely urgent events (AP-4) and is
 * cleared after a few seconds so stale text is not re-read (§6.2).
 *
 * Re-announcing identical text blanks the region first so screen readers detect the change. The
 * matching `LiveRegion.svelte` renders the two visually-hidden regions and binds them to this store.
 *
 * SSR/test-safe (timers guarded). Actor-safety note: callers must pass visibility-FILTERED text —
 * the announcer never sees the raw model, so it cannot leak DM-only content (AP-1, UX-A11Y-008).
 */

import { getContext, setContext } from 'svelte';

export type Politeness = 'polite' | 'assertive';

/** Milliseconds an assertive message stays before it is cleared (§6.2). */
const ASSERTIVE_CLEAR_MS = 3000;

export class LiveAnnouncer {
	polite = $state('');
	assertive = $state('');
	#assertiveTimer: ReturnType<typeof setTimeout> | null = null;
	#pendingPolite: ReturnType<typeof setTimeout> | null = null;

	/**
	 * Announce `message` at the given politeness (default polite). Identical consecutive text is
	 * blanked then re-set on the next tick so the region change is detected. Assertive messages
	 * auto-clear after {@link ASSERTIVE_CLEAR_MS}.
	 */
	announce(message: string, politeness: Politeness = 'polite'): void {
		const text = message.trim();
		if (!text) return;
		if (politeness === 'assertive') {
			this.#setAssertive(text);
		} else {
			this.#setPolite(text);
		}
	}

	#setPolite(text: string): void {
		if (this.#pendingPolite) clearTimeout(this.#pendingPolite);
		if (this.polite === text) {
			// Same text: blank then re-set so the live region fires again.
			this.polite = '';
			this.#pendingPolite = this.#schedule(() => {
				this.polite = text;
			}, 0);
		} else {
			this.polite = text;
		}
	}

	#setAssertive(text: string): void {
		if (this.#assertiveTimer) clearTimeout(this.#assertiveTimer);
		this.assertive = this.assertive === text ? '' : text;
		// If we blanked a duplicate, set it again next tick.
		if (this.assertive === '') {
			this.#schedule(() => {
				this.assertive = text;
			}, 0);
		}
		this.#assertiveTimer = this.#schedule(() => {
			this.assertive = '';
			this.#assertiveTimer = null;
		}, ASSERTIVE_CLEAR_MS);
	}

	#schedule(fn: () => void, ms: number): ReturnType<typeof setTimeout> | null {
		if (typeof setTimeout === 'undefined') {
			fn();
			return null;
		}
		return setTimeout(fn, ms);
	}

	/** Clear both regions and any pending timers (e.g. on teardown). */
	reset(): void {
		if (this.#assertiveTimer) clearTimeout(this.#assertiveTimer);
		if (this.#pendingPolite) clearTimeout(this.#pendingPolite);
		this.#assertiveTimer = null;
		this.#pendingPolite = null;
		this.polite = '';
		this.assertive = '';
	}
}

const KEY = Symbol('dndtools:v2:live-announcer');

export function provideLiveAnnouncer(store: LiveAnnouncer): LiveAnnouncer {
	setContext(KEY, store);
	return store;
}

/** Returns the announcer if mounted, else `null` (callers degrade gracefully). */
export function useLiveAnnouncer(): LiveAnnouncer | null {
	return getContext<LiveAnnouncer | undefined>(KEY) ?? null;
}
