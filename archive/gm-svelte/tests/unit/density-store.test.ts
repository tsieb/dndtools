import { beforeEach, describe, expect, it } from 'vitest';
import {
	DEFAULT_DESKTOP_DENSITY,
	DENSITY_OPTIONS,
	DensityStore,
	isDesktopViewport,
	resolveDensity,
} from '../../src/lib/platform/density.svelte';

// UX-VIS-011: density is profile-linked. Mobile/Tablet (compact/medium viewports) lock to
// comfortable (>=44px targets); Desktop (expanded) defaults to standard and is user-overridable.

describe('resolveDensity (UX-VIS-011)', () => {
	it('uses the desktop preference on the expanded (Desktop) viewport', () => {
		expect(resolveDensity('expanded', 'standard')).toBe('standard');
		expect(resolveDensity('expanded', 'compact')).toBe('compact');
		expect(resolveDensity('expanded', 'comfortable')).toBe('comfortable');
	});

	it('locks touch viewports (compact/medium) to comfortable regardless of the stored preference', () => {
		expect(resolveDensity('compact', 'compact')).toBe('comfortable');
		expect(resolveDensity('medium', 'compact')).toBe('comfortable');
		expect(resolveDensity('compact', 'standard')).toBe('comfortable');
	});

	it('classifies the desktop viewport', () => {
		expect(isDesktopViewport('expanded')).toBe(true);
		expect(isDesktopViewport('medium')).toBe(false);
		expect(isDesktopViewport('compact')).toBe(false);
	});
});

describe('DensityStore', () => {
	beforeEach(() => {
		try {
			window.localStorage.clear();
		} catch {
			/* ignore */
		}
		document.documentElement.removeAttribute('data-density');
	});

	it('defaults to the standard desktop density and offers three modes', () => {
		const store = new DensityStore();
		expect(store.desktopPreference).toBe(DEFAULT_DESKTOP_DENSITY);
		expect(store.desktopPreference).toBe('standard');
		expect(store.options.map((o) => o.id)).toEqual(['comfortable', 'standard', 'compact']);
		expect(DENSITY_OPTIONS).toHaveLength(3);
	});

	it('applies standard density and allows override on the Desktop viewport', () => {
		const store = new DensityStore();
		store.applyForViewport('expanded');
		expect(store.density).toBe('standard');
		expect(store.canOverride).toBe(true);
		expect(document.documentElement.getAttribute('data-density')).toBe('standard');

		store.setDesktopPreference('compact');
		expect(store.density).toBe('compact');
		expect(document.documentElement.getAttribute('data-density')).toBe('compact');
		expect(window.localStorage.getItem('dndtools:v2:density')).toBe('compact');
	});

	it('AC1: the Mobile (compact) viewport locks to comfortable and cannot be overridden', () => {
		const store = new DensityStore();
		store.applyForViewport('compact');
		expect(store.density).toBe('comfortable');
		expect(store.canOverride).toBe(false);
		expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
	});

	it('treats the Tablet (medium) viewport as comfortable', () => {
		const store = new DensityStore();
		store.applyForViewport('medium');
		expect(store.density).toBe('comfortable');
		expect(store.canOverride).toBe(false);
		expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
	});

	it('AC3: a stored Desktop compact choice resets to comfortable on a touch viewport, then restores', () => {
		const store = new DensityStore();
		store.applyForViewport('expanded');
		store.setDesktopPreference('compact');
		expect(store.density).toBe('compact');

		// Switch to a Tablet viewport (e.g. a 2-in-1): density resets to comfortable, overriding the
		// stored preference — but the stored preference is preserved.
		store.applyForViewport('medium');
		expect(store.density).toBe('comfortable');
		expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
		expect(store.desktopPreference).toBe('compact');

		// Returning to a Desktop viewport restores the stored compact preference.
		store.applyForViewport('expanded');
		expect(store.density).toBe('compact');
		expect(document.documentElement.getAttribute('data-density')).toBe('compact');
	});

	it('rehydrates a persisted desktop preference on init', () => {
		window.localStorage.setItem('dndtools:v2:density', 'comfortable');
		const store = new DensityStore();
		store.init();
		store.applyForViewport('expanded');
		expect(store.desktopPreference).toBe('comfortable');
		expect(store.density).toBe('comfortable');
	});

	it('ignores an unknown desktop preference (fail closed)', () => {
		const store = new DensityStore();
		store.applyForViewport('expanded');
		store.setDesktopPreference('cozy' as never);
		expect(store.desktopPreference).toBe('standard');
		expect(store.density).toBe('standard');
	});
});
