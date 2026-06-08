import { getContext, setContext } from 'svelte';
import type { PlatformViewportClass } from '@dndtools/v2-core';

/**
 * UX-VIS-011: density is a DEVICE-LOCAL display preference owned by the GUI (Contract 1). The store
 * resolves the active density mode into the `data-density` attribute on <html>, which switches the
 * `--density-*` token set in `styles.css`.
 *
 * Density is PROFILE-LINKED, not free-form. It is derived from the resolved platform viewport class
 * (PLAT-001) — never from a raw width read here — so this store consumes the profile rather than
 * sniffing the viewport:
 *   - `expanded`  (Desktop)        -> the user's desktop preference (standard | compact | comfortable)
 *   - `medium`    (Tablet)         -> comfortable (locked; >=44px touch targets)
 *   - `compact`   (Mobile)         -> comfortable (locked; >=44px touch targets)
 *
 * The desktop preference persists across sessions (localStorage, declared in
 * `platform-access-exceptions.json`). On a touch profile the stored desktop preference is IGNORED
 * and density resets to comfortable (UX-VIS-011 AC3); switching back to a desktop viewport restores
 * the stored preference.
 */

/** Density modes (UX-VIS-011). */
export const DENSITIES = ['comfortable', 'standard', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

/** The densities a Desktop user may choose between. */
export const DESKTOP_DENSITIES = ['standard', 'compact', 'comfortable'] as const;
export type DesktopDensity = (typeof DESKTOP_DENSITIES)[number];

export const DEFAULT_DESKTOP_DENSITY: DesktopDensity = 'standard';

export interface DensityOption {
	readonly id: DesktopDensity;
	readonly label: string;
	readonly description: string;
	/** Registry icon name for the option (UX-VIS-009). */
	readonly icon: 'density';
}

export const DENSITY_OPTIONS: readonly DensityOption[] = [
	{ id: 'comfortable', label: 'Comfortable', description: 'Largest targets (touch-friendly)', icon: 'density' },
	{ id: 'standard', label: 'Standard', description: 'Balanced (default)', icon: 'density' },
	{ id: 'compact', label: 'Compact', description: 'Maximum information density', icon: 'density' },
];

const STORAGE_KEY = 'dndtools:v2:density';

function isDesktopDensity(value: unknown): value is DesktopDensity {
	return typeof value === 'string' && (DESKTOP_DENSITIES as readonly string[]).includes(value);
}

/** True when the viewport class is the Desktop (expanded) presentation that allows an override. */
export function isDesktopViewport(viewportClass: PlatformViewportClass): boolean {
	return viewportClass === 'expanded';
}

/**
 * Resolve the active density from the viewport class and the user's desktop preference. Touch
 * presentations (compact/medium) lock to comfortable regardless of the stored desktop preference.
 */
export function resolveDensity(
	viewportClass: PlatformViewportClass,
	desktopPreference: DesktopDensity,
): Density {
	return isDesktopViewport(viewportClass) ? desktopPreference : 'comfortable';
}

export class DensityStore {
	#desktopPreference = $state<DesktopDensity>(DEFAULT_DESKTOP_DENSITY);
	#viewportClass = $state<PlatformViewportClass>('expanded');
	#announcement = $state<string>('');

	/** The user's stored Desktop density choice (applies only on the Desktop profile). */
	get desktopPreference(): DesktopDensity {
		return this.#desktopPreference;
	}

	get viewportClass(): PlatformViewportClass {
		return this.#viewportClass;
	}

	/** The density actually applied to <html> for the current viewport class. */
	get density(): Density {
		return resolveDensity(this.#viewportClass, this.#desktopPreference);
	}

	/** Whether the user may change density (Desktop only; Mobile/Tablet are locked). */
	get canOverride(): boolean {
		return isDesktopViewport(this.#viewportClass);
	}

	get options(): readonly DensityOption[] {
		return DENSITY_OPTIONS;
	}

	get announcement(): string {
		return this.#announcement;
	}

	/**
	 * Apply density for the resolved platform viewport class. Called by the shell whenever the
	 * platform profile's viewport class changes (PLAT-001 -> UX-VIS-011). Re-reads the desktop
	 * preference so a 2-in-1 returning to a desktop viewport restores the stored choice.
	 */
	applyForViewport(viewportClass: PlatformViewportClass): void {
		this.#viewportClass = viewportClass;
		this.#apply();
	}

	/**
	 * Set the Desktop density preference (fail-closed). It is always persisted so it survives a
	 * temporary switch to a touch profile, but only takes visible effect on the Desktop viewport.
	 */
	setDesktopPreference(preference: DesktopDensity): void {
		if (!isDesktopDensity(preference)) return;
		this.#desktopPreference = preference;
		this.#persist();
		this.#apply();
		this.#announce();
	}

	/** Read the persisted desktop preference. SSR/test-safe. Returns a cleanup no-op for symmetry. */
	init(): () => void {
		const stored = this.#readStored();
		if (stored) this.#desktopPreference = stored;
		this.#apply();
		return () => {};
	}

	#readStored(): DesktopDensity | null {
		if (typeof window === 'undefined') return null;
		try {
			const raw = window.localStorage?.getItem(STORAGE_KEY);
			return isDesktopDensity(raw) ? raw : null;
		} catch {
			return null;
		}
	}

	#persist(): void {
		if (typeof window === 'undefined') return;
		try {
			window.localStorage?.setItem(STORAGE_KEY, this.#desktopPreference);
		} catch {
			// Storage may be unavailable (private mode); the in-memory preference still applies.
		}
	}

	#apply(): void {
		if (typeof document === 'undefined') return;
		document.documentElement.setAttribute('data-density', this.density);
	}

	#announce(): void {
		const option = DENSITY_OPTIONS.find((entry) => entry.id === this.#desktopPreference);
		const label = option?.label ?? this.#desktopPreference;
		this.#announcement = this.canOverride
			? `Density set to ${label}`
			: `Density is Comfortable on this device`;
	}
}

const KEY = Symbol('dndtools:v2:density');

export function provideDensity(store: DensityStore): DensityStore {
	setContext(KEY, store);
	return store;
}

export function useDensity(): DensityStore {
	const store = getContext<DensityStore | undefined>(KEY);
	if (!store) {
		throw new Error('DensityStore context is missing; mount inside the root layout.');
	}
	return store;
}
