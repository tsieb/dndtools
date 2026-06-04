import { getContext, setContext } from 'svelte';
import type { PlatformProfileId } from '@dndtools/v2-core';

export type ViewportClass = 'compact' | 'medium' | 'expanded';

const COMPACT_MAX = 720;
const EXPANDED_MIN = 1200;

export function classifyViewport(width: number): ViewportClass {
	if (width <= COMPACT_MAX) return 'compact';
	if (width >= EXPANDED_MIN) return 'expanded';
	return 'medium';
}

export function profileIdForViewport(viewport: ViewportClass): PlatformProfileId {
	return viewport === 'compact' ? 'mobile' : 'desktop';
}

/**
 * Reactive platform profile owned by the app shell. Feature components branch on
 * the profile's capabilities (compact vs expanded), never on raw `innerWidth`
 * (Contract 1, Platform Profile Selection).
 */
export class PlatformProfileStore {
	#viewport = $state<ViewportClass>('expanded');

	get viewportClass(): ViewportClass {
		return this.#viewport;
	}

	get profileId(): PlatformProfileId {
		return profileIdForViewport(this.#viewport);
	}

	/** Compact = one focused work surface at a time (slim device contract). */
	get isCompact(): boolean {
		return this.#viewport === 'compact';
	}

	set(viewport: ViewportClass): void {
		this.#viewport = viewport;
	}

	/** Subscribe to viewport changes. Returns a cleanup function. */
	init(): () => void {
		if (typeof window === 'undefined') return () => {};
		const update = () => {
			this.#viewport = classifyViewport(window.innerWidth);
		};
		update();
		window.addEventListener('resize', update);
		return () => window.removeEventListener('resize', update);
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
