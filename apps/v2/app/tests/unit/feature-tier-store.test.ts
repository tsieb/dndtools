import { describe, expect, it } from 'vitest';
import { FeatureTierStore } from '../../src/lib/state/feature-tier.svelte';

// PLAT-013: the feature tier is a device-local display preference owned by the GUI. A fresh vault
// starts at `core` (progressive disclosure default); the store only accepts valid tiers.

describe('FeatureTierStore', () => {
	it('defaults to the core tier', () => {
		const store = new FeatureTierStore();
		expect(store.tier).toBe('core');
		expect(store.tiers).toEqual(['core', 'intermediate', 'advanced']);
	});

	it('switches to a valid tier', () => {
		const store = new FeatureTierStore();
		store.setTier('advanced');
		expect(store.tier).toBe('advanced');
		store.setTier('intermediate');
		expect(store.tier).toBe('intermediate');
	});

	it('ignores an unknown tier (fail closed)', () => {
		const store = new FeatureTierStore();
		store.setTier('bogus' as never);
		expect(store.tier).toBe('core');
	});
});
