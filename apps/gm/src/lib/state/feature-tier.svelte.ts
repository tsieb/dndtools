import { getContext, setContext } from 'svelte';
import { DEFAULT_FEATURE_TIER, FEATURE_TIERS, type FeatureTier } from '@dndtools/core';

/**
 * PLAT-013: the active maturity / feature tier is a DEVICE-LOCAL display preference, not durable
 * vault state (Contract 1: the GUI owns local display preferences). It controls progressive
 * disclosure of capabilities; the core `visibleFeatures(tier)` query decides what each tier
 * shows. A fresh vault starts at the `core` tier so onboarding shows exactly the core surface.
 */
export class FeatureTierStore {
	#tier = $state<FeatureTier>(DEFAULT_FEATURE_TIER);

	get tier(): FeatureTier {
		return this.#tier;
	}

	get tiers(): readonly FeatureTier[] {
		return FEATURE_TIERS;
	}

	setTier(tier: FeatureTier): void {
		if (FEATURE_TIERS.includes(tier)) this.#tier = tier;
	}
}

const KEY = Symbol('dndtools:v2:feature-tier');

export function provideFeatureTier(store: FeatureTierStore): FeatureTierStore {
	setContext(KEY, store);
	return store;
}

export function useFeatureTier(): FeatureTierStore {
	const store = getContext<FeatureTierStore | undefined>(KEY);
	if (!store) {
		throw new Error('FeatureTierStore context is missing; mount inside the root layout.');
	}
	return store;
}
