import { describe, expect, it } from 'vitest';
import {
	PLATFORM_PROFILES,
	hasService,
	isCompactPresentation,
	platformProfile,
	selectPlatformProfile,
	serviceAvailability,
	type PlatformEnvironmentDescriptor,
	type PlatformProfile,
} from '../src/index';

const PROFILE_IDS = ['desktop', 'tablet', 'mobile', 'web'] as const;

function env(overrides: Partial<PlatformEnvironmentDescriptor>): PlatformEnvironmentDescriptor {
	return {
		viewportClass: 'expanded',
		hasTouch: false,
		hasFinePointer: true,
		...overrides,
	};
}

describe('PLAT-001: platform profile selection from a capability descriptor', () => {
	it('exposes exactly the four declared profiles', () => {
		expect(PLATFORM_PROFILES.map((p) => p.id).sort()).toEqual([...PROFILE_IDS].sort());
	});

	// PLAT-001 AC1: a device with touch input and a compact viewport selects a profile and the
	// shell hands its capabilities downstream. The selection reads the descriptor, not raw width.
	it('selects mobile for a touch device with a compact viewport (AC1)', () => {
		const profile = selectPlatformProfile(
			env({ hasTouch: true, hasFinePointer: false, viewportClass: 'compact' }),
		);
		expect(profile.id).toBe('mobile');
		expect(profile.input).toContain('touch');
		expect(isCompactPresentation(profile)).toBe(true);
	});

	it('selects tablet for a touch device with a medium viewport', () => {
		const profile = selectPlatformProfile(
			env({ hasTouch: true, hasFinePointer: false, viewportClass: 'medium' }),
		);
		expect(profile.id).toBe('tablet');
	});

	it('selects the web profile for a mouse browser at an expanded viewport', () => {
		const profile = selectPlatformProfile(env({ viewportClass: 'expanded' }));
		expect(profile.id).toBe('web');
		expect(profile.shellImplemented).toBe(true);
	});

	it('reflects the live viewport class for a narrow browser window without changing identity', () => {
		const profile = selectPlatformProfile(env({ viewportClass: 'compact' }));
		expect(profile.id).toBe('web');
		expect(profile.viewportClass).toBe('compact');
		expect(isCompactPresentation(profile)).toBe(true);
		// Storage/services identity is still the web shell's.
		expect(profile.storage).toBe('indexeddb');
	});

	it('honors a declared native shell over heuristics (a desktop touch device is still desktop)', () => {
		const profile = selectPlatformProfile(
			env({ declaredShell: 'desktop', hasTouch: true, hasFinePointer: false, viewportClass: 'expanded' }),
		);
		expect(profile.id).toBe('desktop');
		expect(profile.storage).toBe('filesystem');
	});

	it('preserves a declared shell identity while adapting its viewport class', () => {
		const profile = selectPlatformProfile(env({ declaredShell: 'desktop', viewportClass: 'compact' }));
		expect(profile.id).toBe('desktop');
		expect(profile.viewportClass).toBe('compact');
	});

	it('is deterministic: the same descriptor always resolves the same profile', () => {
		const descriptor = env({ hasTouch: true, hasFinePointer: false, viewportClass: 'compact' });
		expect(selectPlatformProfile(descriptor)).toEqual(selectPlatformProfile(descriptor));
	});
});

describe('PLAT-002 / PLAT-005: declared-unavailable native capability descriptors', () => {
	it('marks the web shell as the only implemented prototype shell (ADR-014)', () => {
		expect(platformProfile('web').shellImplemented).toBe(true);
		expect(platformProfile('desktop').shellImplemented).toBe(false);
		expect(platformProfile('tablet').shellImplemented).toBe(false);
		expect(platformProfile('mobile').shellImplemented).toBe(false);
	});

	// Feature components must degrade correctly: a deferred native service is `unavailable`, a
	// structurally-impossible one is `unsupported`. Neither is `available`, so no feature path
	// reaches a missing native bridge.
	it('declares desktop native services as unavailable (deferred), never available', () => {
		const desktop = platformProfile('desktop');
		for (const service of [
			'trustedFilesystem',
			'nativeFilePicker',
			'mcpSidecar',
			'windowTitlebarControls',
			'fileWatching',
		] as const) {
			expect(serviceAvailability(desktop, service)).not.toBe('available');
			expect(hasService(desktop, service)).toBe(false);
		}
	});

	it('declares native-only services as unsupported on the web profile (fail closed)', () => {
		const web = platformProfile('web');
		for (const service of [
			'trustedFilesystem',
			'osCredentialStore',
			'protocolHandler',
			'mcpSidecar',
		] as const) {
			expect(serviceAvailability(web, service)).toBe('unsupported');
		}
		// The web shell DOES have its real capabilities wired.
		expect(hasService(web, 'serviceWorkerCache')).toBe(true);
		expect(hasService(web, 'cloudCache')).toBe(true);
	});

	it('treats an unknown service key as unsupported (fail closed)', () => {
		const web = platformProfile('web') as PlatformProfile;
		// @ts-expect-error intentionally probing an undeclared service key
		expect(serviceAvailability(web, 'nonexistentService')).toBe('unsupported');
	});
});
