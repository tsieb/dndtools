import { describe, expect, it } from 'vitest';
import { PlatformProfileStore } from '../../src/lib/platform/platform-profile.svelte';
import { classifyViewport, probeEnvironment } from '../../src/lib/platform/capabilities';

// PLAT-001: the app shell store resolves the full platform profile from a capability/environment
// descriptor and exposes the resolved capabilities to GUI packages. Feature components read these
// — never raw viewport width (the boundary lint enforces that separately).

describe('PlatformProfileStore: descriptor-driven profile selection', () => {
	it('resolves the web profile for an expanded mouse browser', () => {
		const store = new PlatformProfileStore();
		store.resolve({ viewportClass: 'expanded', hasTouch: false, hasFinePointer: true });
		expect(store.profileId).toBe('web');
		expect(store.viewportClass).toBe('expanded');
		expect(store.isCompact).toBe(false);
		// The full capability descriptor is exposed for feature components to branch on.
		expect(store.capabilities.serviceWorkerCache).toBe('available');
		expect(store.capabilities.trustedFilesystem).toBe('unsupported');
	});

	it('resolves mobile for a touch device with a compact viewport', () => {
		const store = new PlatformProfileStore();
		store.resolve({ viewportClass: 'compact', hasTouch: true, hasFinePointer: false });
		expect(store.profileId).toBe('mobile');
		expect(store.isCompact).toBe(true);
		expect(store.profile.input).toContain('touch');
	});

	it('reflects a narrow browser window as compact without changing profile identity', () => {
		const store = new PlatformProfileStore();
		store.resolve({ viewportClass: 'compact', hasTouch: false, hasFinePointer: true });
		// Still the web shell, but compact presentation drives the slim/density-reduced layout.
		expect(store.profileId).toBe('web');
		expect(store.isCompact).toBe(true);
	});
});

describe('capabilities probe: viewport classification (the single owned width read)', () => {
	it('classifies widths into coarse classes', () => {
		expect(classifyViewport(500)).toBe('compact');
		expect(classifyViewport(720)).toBe('compact');
		expect(classifyViewport(900)).toBe('medium');
		expect(classifyViewport(1200)).toBe('expanded');
		expect(classifyViewport(1600)).toBe('expanded');
	});

	it('produces a descriptor declaring the web shell in the browser/jsdom environment', () => {
		const env = probeEnvironment();
		expect(env.declaredShell).toBe('web');
		expect(['compact', 'medium', 'expanded']).toContain(env.viewportClass);
	});
});
