import { afterEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { detectStorageRuntime } from './index.js';

describe('detectStorageRuntime', () => {
	afterEach(() => {
		delete window.dndtoolsDesktop;
		vi.restoreAllMocks();
	});

	it('prefers electron runtime when desktop bridge is available', () => {
		window.dndtoolsDesktop = {} as Window['dndtoolsDesktop'];
		const nativeSpy = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);

		expect(detectStorageRuntime()).toBe('electron');
		expect(nativeSpy).not.toHaveBeenCalled();
	});

	it('uses capacitor runtime when running on native platform', () => {
		const nativeSpy = vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);

		expect(detectStorageRuntime()).toBe('capacitor');
		expect(nativeSpy).toHaveBeenCalledTimes(1);
	});

	it('uses indexeddb runtime in browser web mode', () => {
		vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);

		expect(detectStorageRuntime()).toBe('indexeddb');
	});
});
