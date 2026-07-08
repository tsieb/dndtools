import { getContext, setContext } from 'svelte';
import {
	isCompactPresentation,
	selectPlatformProfile,
	type PlatformEnvironmentDescriptor,
	type PlatformProfile,
	type PlatformProfileId,
	type PlatformServiceCapabilities,
	type PlatformViewportClass,
} from '@dndtools/core';
import {
	probeEnvironment,
	probeOrientation,
	watchOrientation,
	type DeviceOrientation,
} from './capabilities';

export type ViewportClass = PlatformViewportClass;
export type { DeviceOrientation } from './capabilities';

/**
 * PLAT-001 (the spine): the reactive platform profile owned by the app shell.
 *
 * The shell probes the host ONCE through the platform layer ({@link probeEnvironment}) to build a
 * capability/environment descriptor, then resolves the full {@link PlatformProfile} via the core
 * `selectPlatformProfile`. Feature components branch on `profile.capabilities` / the resolved
 * descriptor — never on raw `window.innerWidth` (Contract 1, Platform Profile Selection;
 * PLAT-001 AC2). The boundary lint forbids raw viewport sniffing outside the platform layer, so
 * this rule is mechanically enforced.
 */
export class PlatformProfileStore {
	#profile = $state<PlatformProfile>(
		selectPlatformProfile({ viewportClass: 'expanded', hasTouch: false, hasFinePointer: true }),
	);

	// UX-NAV-005: the coarse orientation drives the Tablet navigation surface (landscape rail vs.
	// portrait tab bar). Tracked separately from the profile because orientation can change without
	// the viewport class changing.
	#orientation = $state<DeviceOrientation>('landscape');

	/** The full resolved capability descriptor passed to GUI packages. */
	get profile(): PlatformProfile {
		return this.#profile;
	}

	get profileId(): PlatformProfileId {
		return this.#profile.id;
	}

	get viewportClass(): ViewportClass {
		return this.#profile.viewportClass;
	}

	/** Coarse device orientation (UX-NAV-005): Tablet landscape uses a rail, portrait a tab bar. */
	get orientation(): DeviceOrientation {
		return this.#orientation;
	}

	/** The typed platform-service capability surface feature components branch on. */
	get capabilities(): PlatformServiceCapabilities {
		return this.#profile.capabilities;
	}

	/** Compact = one focused work surface at a time (slim device contract; PLAT-003). */
	get isCompact(): boolean {
		return isCompactPresentation(this.#profile);
	}

	/** Resolve and set the profile from an explicit environment descriptor (used by tests). */
	resolve(env: PlatformEnvironmentDescriptor): void {
		this.#profile = selectPlatformProfile(env);
	}

	/**
	 * Subscribe to viewport changes through the platform probe. Returns a cleanup function. The
	 * resize handler re-probes the environment (the only place width is read) and re-resolves the
	 * profile; feature components react to the new descriptor.
	 */
	init(): () => void {
		if (typeof window === 'undefined') return () => {};
		const update = () => {
			this.#profile = selectPlatformProfile(probeEnvironment());
		};
		update();
		this.#orientation = probeOrientation();
		const stopOrientation = watchOrientation((orientation) => {
			this.#orientation = orientation;
		});
		window.addEventListener('resize', update);
		return () => {
			window.removeEventListener('resize', update);
			stopOrientation();
		};
	}
}

const KEY = Symbol('dndtools:v2:platform-profile');

export function provideProfile(store: PlatformProfileStore): PlatformProfileStore {
	setContext(KEY, store);
	return store;
}

export function useProfile(): PlatformProfileStore {
	const store = getContext<PlatformProfileStore | undefined>(KEY);
	if (!store) {
		throw new Error('PlatformProfileStore context is missing; mount inside the root layout.');
	}
	return store;
}
