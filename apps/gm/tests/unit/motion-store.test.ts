import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_MOTION_PREFERENCE,
	MOTION_OPTIONS,
	MotionStore,
	resolveMotion,
} from '../../src/lib/platform/motion.svelte';

// UX-VIS-010 / A11Y-005: a single resolved motion preference drives whether animations play. The
// precedence is: user-explicit-off > OS-reduce > user-explicit-on > OS-no-preference.

interface FakeMql {
	matches: boolean;
	media: string;
	addEventListener: (type: string, cb: (e: { matches: boolean }) => void) => void;
	removeEventListener: (type: string, cb: (e: { matches: boolean }) => void) => void;
	emit: (matches: boolean) => void;
}

function installMatchMedia(prefersReduced: boolean): FakeMql {
	const listeners = new Set<(e: { matches: boolean }) => void>();
	const mql: FakeMql = {
		matches: prefersReduced,
		media: '(prefers-reduced-motion: reduce)',
		addEventListener: (_type, cb) => listeners.add(cb),
		removeEventListener: (_type, cb) => listeners.delete(cb),
		emit: (matches: boolean) => {
			mql.matches = matches;
			for (const cb of listeners) cb({ matches });
		},
	};
	// @ts-expect-error test stub
	window.matchMedia = vi.fn(() => mql);
	return mql;
}

describe('resolveMotion precedence (UX-VIS-010)', () => {
	it('1. user-explicit-off wins over everything, incl. OS no-preference (AC2)', () => {
		expect(resolveMotion('reduced', false)).toBe('reduced');
		expect(resolveMotion('reduced', true)).toBe('reduced');
	});

	it('2. OS-reduce outranks user-explicit-on', () => {
		expect(resolveMotion('full', true)).toBe('reduced');
		expect(resolveMotion('system', true)).toBe('reduced'); // AC1
	});

	it('3. user-explicit-on applies when the OS has no preference', () => {
		expect(resolveMotion('full', false)).toBe('full');
	});

	it('4. system with no OS preference resolves to full', () => {
		expect(resolveMotion('system', false)).toBe('full');
	});
});

describe('MotionStore', () => {
	beforeEach(() => {
		try {
			window.localStorage.clear();
		} catch {
			/* ignore */
		}
		document.documentElement.removeAttribute('data-motion');
		// Default jsdom has no matchMedia; capabilities.prefersReducedMotion() then reports `true`
		// (the safer, less-animated default).
		// @ts-expect-error reset stub
		delete window.matchMedia;
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('defaults to system and offers system / full / reduced', () => {
		const store = new MotionStore();
		expect(store.preference).toBe(DEFAULT_MOTION_PREFERENCE);
		expect(store.preference).toBe('system');
		expect(store.options.map((o) => o.id)).toEqual(['system', 'full', 'reduced']);
		expect(MOTION_OPTIONS).toHaveLength(3);
	});

	it('applies reduced motion for an explicit-off choice, persists, and announces', () => {
		const store = new MotionStore();
		store.setPreference('reduced');
		expect(store.resolvedMotion).toBe('reduced');
		expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
		expect(window.localStorage.getItem('dndtools:v2:motion')).toBe('reduced');
		expect(store.announcement).toBe('Motion set to Reduced motion');
	});

	it('AC1: with OS prefers-reduced-motion and no override, init resolves to reduced (0ms)', () => {
		installMatchMedia(true);
		const store = new MotionStore();
		const stop = store.init();
		expect(store.preference).toBe('system');
		expect(store.resolvedMotion).toBe('reduced');
		expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
		stop();
	});

	it('applies full motion for explicit-on when the OS has no preference', () => {
		installMatchMedia(false);
		const store = new MotionStore();
		store.init();
		store.setPreference('full');
		expect(store.resolvedMotion).toBe('full');
		expect(document.documentElement.getAttribute('data-motion')).toBe('full');
	});

	it('AC2: an explicit-off choice survives an OS change to no-preference', () => {
		const mql = installMatchMedia(true);
		const store = new MotionStore();
		const stop = store.init();
		store.setPreference('reduced');
		expect(store.resolvedMotion).toBe('reduced');
		// OS later reports no preference; the user's explicit-off still wins.
		mql.emit(false);
		expect(store.resolvedMotion).toBe('reduced');
		expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
		stop();
	});

	it('live-tracks the OS signal when following system', () => {
		const mql = installMatchMedia(false);
		const store = new MotionStore();
		const stop = store.init();
		expect(store.resolvedMotion).toBe('full');
		mql.emit(true); // OS turns reduce on
		expect(store.resolvedMotion).toBe('reduced');
		expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
		stop();
	});

	it('rehydrates a persisted preference on init', () => {
		installMatchMedia(false);
		window.localStorage.setItem('dndtools:v2:motion', 'reduced');
		const store = new MotionStore();
		const stop = store.init();
		expect(store.preference).toBe('reduced');
		expect(document.documentElement.getAttribute('data-motion')).toBe('reduced');
		stop();
	});

	it('ignores an unknown preference (fail closed)', () => {
		const store = new MotionStore();
		store.setPreference('turbo' as never);
		expect(store.preference).toBe('system');
		expect(document.documentElement.getAttribute('data-motion')).toBeNull();
	});
});
