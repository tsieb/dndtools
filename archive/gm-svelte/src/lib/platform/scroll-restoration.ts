/**
 * UX-NAV-012 — scroll-position restoration across browser back/forward (pure store).
 *
 * The web platform navigation contract requires that a back/forward (`popstate`) navigation
 * restore the scroll position the user was at when they navigated away (UX-NAV-012, WHATWG
 * history). With `history.scrollRestoration = 'manual'` the app owns this: the shell records the
 * scroll position of the page it is leaving (keyed by that page's URL) before each navigation,
 * and restores it after a `popstate` navigation lands back on the page.
 *
 * The shell uses TWO scroll containers depending on the platform profile: the document/window
 * scrolls on the Desktop / Tablet-landscape grid layout, and the `<main>` content region scrolls
 * internally on the compact (Mobile / Tablet-portrait) flex layout. Both offsets are captured so a
 * restore is correct on every profile.
 *
 * This module is pure (a keyed position map, no DOM, no Svelte runtime) so the save/restore
 * bookkeeping is unit-tested directly; the shell reads/writes the live DOM offsets.
 */

export interface ScrollPosition {
	/** Document horizontal scroll (`window.scrollX`). */
	x: number;
	/** Document vertical scroll (`window.scrollY`) — used on the Desktop/landscape layout. */
	y: number;
	/** The `<main>` content region's internal scrollTop — used on the compact layout. */
	main: number;
}

/** Cap the number of remembered positions so the map cannot grow without bound across a long
 *  session (UX-NAV-017: a single user action must never grow history-related state unboundedly). */
export const MAX_REMEMBERED_POSITIONS = 50;

export class ScrollRestorationStore {
	#positions = new Map<string, ScrollPosition>();
	readonly #max: number;

	constructor(max: number = MAX_REMEMBERED_POSITIONS) {
		this.#max = Math.max(1, max);
	}

	/** Record the scroll position for a page (keyed by its URL), evicting the oldest entry once
	 *  the cap is exceeded so the map stays bounded. Re-saving a key refreshes its recency. */
	save(key: string, position: ScrollPosition): void {
		if (!key) return;
		if (this.#positions.has(key)) this.#positions.delete(key);
		this.#positions.set(key, position);
		while (this.#positions.size > this.#max) {
			const oldest = this.#positions.keys().next().value;
			if (oldest === undefined) break;
			this.#positions.delete(oldest);
		}
	}

	/** Read the remembered scroll position for a page without consuming it (a forward then back to
	 *  the same page should restore the same offset). Returns `undefined` when none is recorded. */
	peek(key: string): ScrollPosition | undefined {
		return this.#positions.get(key);
	}

	/** True when a position is recorded for the page. */
	has(key: string): boolean {
		return this.#positions.has(key);
	}

	/** Test/diagnostic helper: how many positions are currently remembered. */
	get size(): number {
		return this.#positions.size;
	}
}
