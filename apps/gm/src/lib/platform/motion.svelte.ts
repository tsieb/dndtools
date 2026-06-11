import { getContext, setContext } from 'svelte';
import { prefersReducedMotion, watchReducedMotion } from './capabilities';

/**
 * UX-VIS-010 / A11Y-005: motion is a DEVICE-LOCAL display preference owned by the GUI (Contract 1),
 * not durable vault state. The store resolves a SINGLE motion preference into the applied
 * `data-motion` attribute on <html>, persists the user's choice across sessions, follows the OS
 * `prefers-reduced-motion` signal when set to `system`, and announces the change.
 *
 * Precedence (UX-VIS-010 spec, highest first):
 *   1. user-explicit-off  (preference = 'reduced')  -> reduced
 *   2. OS-reduce          (OS prefers reduced)      -> reduced
 *   3. user-explicit-on   (preference = 'full')     -> full
 *   4. OS-no-preference                             -> full
 *
 * Note that OS-reduce (an accessibility/medical signal) outranks a user's in-app "on" choice: a
 * user who turned motion on still gets reduced motion while the OS asks for it. Conversely a user
 * who turned motion OFF stays off even when the OS later reports no preference (AC2).
 *
 * The applied attribute drives the duration tokens in `styles.css` (reduced/none => 0ms); no
 * component needs its own `prefers-reduced-motion` media query. The OS reduced-motion probe stays
 * behind the owned platform capability surface (`capabilities.ts`); this store only persists the
 * choice (localStorage), declared in `platform-access-exceptions.json`.
 */

/** User-selectable motion preferences. */
export const MOTION_PREFERENCES = ['system', 'full', 'reduced'] as const;
export type MotionPreference = (typeof MOTION_PREFERENCES)[number];

/** The resolved motion state written to `data-motion`. */
export type ResolvedMotion = 'full' | 'reduced';

export const DEFAULT_MOTION_PREFERENCE: MotionPreference = 'system';

export interface MotionOption {
	readonly id: MotionPreference;
	readonly label: string;
	readonly description: string;
	/** Registry icon name for the option (UX-VIS-009). */
	readonly icon: 'motion' | 'accessibility' | 'check';
}

export const MOTION_OPTIONS: readonly MotionOption[] = [
	{ id: 'system', label: 'System', description: 'Follow the operating system', icon: 'motion' },
	{ id: 'full', label: 'Full motion', description: 'Animations enabled', icon: 'check' },
	{
		id: 'reduced',
		label: 'Reduced motion',
		description: 'Instant state changes, no animation',
		icon: 'accessibility',
	},
];

const STORAGE_KEY = 'dndtools:v2:motion';

function isMotionPreference(value: unknown): value is MotionPreference {
	return typeof value === 'string' && (MOTION_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Resolve the single motion state from the user preference and the OS reduced-motion signal,
 * applying the UX-VIS-010 precedence ladder.
 */
export function resolveMotion(
	preference: MotionPreference,
	osPrefersReduced: boolean,
): ResolvedMotion {
	if (preference === 'reduced') return 'reduced'; // 1. user-explicit-off
	if (osPrefersReduced) return 'reduced'; // 2. OS-reduce
	if (preference === 'full') return 'full'; // 3. user-explicit-on
	return 'full'; // 4. OS-no-preference (system)
}

export class MotionStore {
	#preference = $state<MotionPreference>(DEFAULT_MOTION_PREFERENCE);
	// Safe default: assume reduced until the OS is probed (less motion is the safer first paint).
	#osPrefersReduced = $state<boolean>(true);
	#announcement = $state<string>('');

	get preference(): MotionPreference {
		return this.#preference;
	}

	/** The resolved state actually written to `data-motion`. */
	get resolvedMotion(): ResolvedMotion {
		return resolveMotion(this.#preference, this.#osPrefersReduced);
	}

	get osPrefersReduced(): boolean {
		return this.#osPrefersReduced;
	}

	get options(): readonly MotionOption[] {
		return MOTION_OPTIONS;
	}

	get announcement(): string {
		return this.#announcement;
	}

	/** Set the preference (fail-closed on unknown values), persist, apply, and announce. */
	setPreference(preference: MotionPreference): void {
		if (!isMotionPreference(preference)) return;
		this.#preference = preference;
		this.#persist();
		this.#apply();
		this.#announce();
	}

	/**
	 * Wire the store to the host once, from the app shell. Reads the persisted preference, probes
	 * the OS reduced-motion signal through the owned capability surface, applies the resolved state,
	 * and subscribes to OS changes so `system` (and the OS-reduce override) track live. Returns a
	 * cleanup function. SSR/test-safe.
	 */
	init(): () => void {
		const stored = this.#readStored();
		if (stored) this.#preference = stored;

		this.#osPrefersReduced = prefersReducedMotion();
		this.#apply();

		return watchReducedMotion((prefersReduced) => {
			this.#osPrefersReduced = prefersReduced;
			this.#apply();
		});
	}

	#readStored(): MotionPreference | null {
		if (typeof window === 'undefined') return null;
		try {
			const raw = window.localStorage?.getItem(STORAGE_KEY);
			return isMotionPreference(raw) ? raw : null;
		} catch {
			return null;
		}
	}

	#persist(): void {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage?.setItem(STORAGE_KEY, this.#preference);
		} catch {
			// Storage may be unavailable (private mode); the in-memory preference still applies.
		}
	}

	#apply(): void {
		if (typeof document === 'undefined') return;
		document.documentElement.setAttribute('data-motion', this.resolvedMotion);
	}

	#announce(): void {
		const option = MOTION_OPTIONS.find((entry) => entry.id === this.#preference);
		const label = option?.label ?? this.#preference;
		this.#announcement =
			this.#preference === 'system'
				? `Motion set to System (${this.resolvedMotion})`
				: `Motion set to ${label}`;
	}
}

const KEY = Symbol('dndtools:v2:motion');

export function provideMotion(store: MotionStore): MotionStore {
	setContext(KEY, store);
	return store;
}

export function useMotion(): MotionStore {
	const store = getContext<MotionStore | undefined>(KEY);
	if (!store) {
		throw new Error('MotionStore context is missing; mount inside the root layout.');
	}
	return store;
}
