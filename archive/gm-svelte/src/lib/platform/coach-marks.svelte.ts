import { getContext, setContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';

/**
 * UX-ONB-013 / UX-ONB-017 — contextual coach marks: trigger rules + frequency cap.
 *
 * A coach mark is a non-modal, first-reach teaching hint (see {@link CoachMark}). The trigger rules
 * are DEVICE-LOCAL display state, never durable vault state (Contract 1: the GUI owns local display
 * preferences). Two pieces of state drive eligibility:
 *
 * - **`seen` (persisted):** mark IDs the user has DISMISSED on this device. Persisted to
 *   `localStorage`, so a dismissed mark never fires again across sessions (UX-ONB-013 AC2).
 * - **`firedThisSession` (in-memory set):** the IDs that have fired since the app opened. Resets on
 *   each app open. A NEW id is eligible only while fewer than {@link SESSION_CAP} distinct marks have
 *   fired this session (UX-ONB-013 AC3 — the anti-fatigue cap); an id that has ALREADY fired this
 *   session stays eligible, so a transient component remount re-shows the same mark rather than
 *   silently dropping it.
 *
 * Marks are NEVER triggered by time, login count, or session count alone (UX-ONB-013): the surface
 * calls {@link tryFire} on first-reach (or on a detected failure) and the store decides eligibility.
 */

/** No more than two coach marks may fire in a single user session across all surfaces (UX-ONB-013). */
export const SESSION_CAP = 2;

const STORAGE_KEY = 'dndtools:v2:coach-marks-seen';

export class CoachMarkStore {
	/** Persisted: mark IDs dismissed on this device (so they never fire again). */
	readonly #seen = new SvelteSet<string>();
	/** In-memory: distinct mark IDs fired since app open; resets each session (frequency cap). */
	readonly #firedThisSession = new SvelteSet<string>();

	/** Whether a mark has been dismissed on this device (and so will not fire again). */
	seen(id: string): boolean {
		return this.#seen.has(id);
	}

	/** How many distinct marks have fired this session (counts toward {@link SESSION_CAP}). */
	get firedThisSessionCount(): number {
		return this.#firedThisSession.size;
	}

	/** Whether `id` may be shown right now: not dismissed, and either already fired this session or
	 * still under the per-session cap. */
	eligible(id: string): boolean {
		if (this.#seen.has(id)) return false;
		if (this.#firedThisSession.has(id)) return true;
		return this.#firedThisSession.size < SESSION_CAP;
	}

	/**
	 * Attempt to fire (show) the mark `id`. Returns `true` when it should be visible. The first fire
	 * of an id this session counts it toward the cap; re-calling for an already-fired id is a no-op
	 * that still returns `true` (so a remount re-shows the same mark). Firing does NOT mark the id
	 * seen — only {@link dismiss} does — so a transient remount never consumes the mark.
	 */
	tryFire(id: string): boolean {
		if (!this.eligible(id)) return false;
		this.#firedThisSession.add(id);
		return true;
	}

	/** Dismiss `id`: persist it as seen so it never fires again on this device (UX-ONB-013 AC2). */
	dismiss(id: string): void {
		if (this.#seen.has(id)) return;
		this.#seen.add(id);
		this.#persist();
	}

	/** Read the persisted seen-set once, from the app shell. SSR/test-safe. */
	init(): () => void {
		if (typeof window === 'undefined') return () => {};
		try {
			const raw = window.localStorage?.getItem(STORAGE_KEY);
			if (raw) {
				const ids = JSON.parse(raw) as unknown;
				if (Array.isArray(ids)) {
					for (const id of ids) if (typeof id === 'string') this.#seen.add(id);
				}
			}
		} catch {
			// Storage may be unavailable (private mode) or corrupt; start with an empty seen-set.
		}
		return () => {};
	}

	#persist(): void {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...this.#seen]));
		} catch {
			// Best-effort; the in-memory seen-set still suppresses repeats this session.
		}
	}
}

const KEY = Symbol('dndtools:v2:coach-marks');

export function provideCoachMarks(store: CoachMarkStore): CoachMarkStore {
	setContext(KEY, store);
	return store;
}

export function useCoachMarks(): CoachMarkStore {
	const store = getContext<CoachMarkStore | undefined>(KEY);
	if (!store) {
		throw new Error('CoachMarkStore context is missing; mount inside the root layout.');
	}
	return store;
}
