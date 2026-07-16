import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	capabilitiesForRuntime,
	createPlatformNotificationAdapter,
	detectRuntimeKind,
	isNetworkDestinationAllowed,
	type RuntimeSignals,
} from './capabilities';

const WEB_SIGNALS: RuntimeSignals = {
	capacitorNative: false,
	capacitorPlatform: 'web',
	electronSecureStore: false,
	electronWindow: false,
	electronDiscovery: false,
	notifications: false,
};

afterEach(() => vi.unstubAllGlobals());

describe('runtime detection and capability gates', () => {
	it('prefers the native Android signal and enables quick-map/native export', () => {
		const signals = { ...WEB_SIGNALS, capacitorNative: true, capacitorPlatform: 'android' };
		expect(detectRuntimeKind(signals)).toBe('android');
		expect(capabilitiesForRuntime('android', signals)).toMatchObject({
			runtimeKind: 'android',
			nativeBridgeAvailable: true,
			quickMapMode: true,
			allowHttpLoopbackAi: false,
			fileExport: { available: true, nativeShareSheet: true },
			secureStorage: { available: true },
			localDiscovery: { available: false },
			secondScreen: { available: false },
		});
	});

	it('supports a DEV-only Android layout override without enabling native bridges', async () => {
		vi.stubGlobal('__DNDTOOLS_TEST_RUNTIME_KIND__', 'android');
		vi.resetModules();
		const fresh = await import('./capabilities');
		expect(fresh.getPlatformCapabilities()).toMatchObject({
			runtimeKind: 'android',
			quickMapMode: true,
			nativeBridgeAvailable: false,
			secureStorage: { available: false },
			fileExport: { nativeShareSheet: false },
		});
	});

	it('detects Electron from its preload bridges and exposes only present integrations', () => {
		const signals = {
			...WEB_SIGNALS,
			electronSecureStore: true,
			electronWindow: true,
			electronDiscovery: false,
			notifications: true,
		};
		expect(detectRuntimeKind(signals)).toBe('electron');
		expect(capabilitiesForRuntime('electron', signals)).toMatchObject({
			quickMapMode: false,
			secureStorage: { available: true },
			windowManagement: { available: true },
			localDiscovery: { available: false },
			notifications: { available: true },
		});
	});

	it('keeps ordinary web builds session-only with honest fallback copy', () => {
		expect(detectRuntimeKind(WEB_SIGNALS)).toBe('web');
		const capabilities = capabilitiesForRuntime('web', WEB_SIGNALS);
		expect(capabilities.secureStorage.available).toBe(false);
		expect(capabilities.secureStorage.unavailableMessage).toMatch(/session/i);
		expect(capabilities.fileExport.nativeShareSheet).toBe(false);
	});

	it('admits only encrypted application destinations on Android', () => {
		expect(isNetworkDestinationAllowed('https://audio.example/ambience.mp3', 'android')).toBe(true);
		expect(isNetworkDestinationAllowed('wss://table.example/session', 'android')).toBe(true);
		expect(isNetworkDestinationAllowed('http://localhost:11434/v1', 'android')).toBe(false);
		expect(isNetworkDestinationAllowed('ws://192.168.1.4/session', 'android')).toBe(false);
		expect(isNetworkDestinationAllowed('not a url', 'android')).toBe(false);
		expect(isNetworkDestinationAllowed('http://localhost:11434/v1', 'electron')).toBe(true);
	});
});

describe('notification permissions', () => {
	it('checks permission without prompting and requests only through the explicit method', async () => {
		const native = {
			checkPermissions: vi.fn(async () => ({ display: 'prompt' })),
			requestPermissions: vi.fn(async () => ({ display: 'granted' })),
			schedule: vi.fn(async () => ({})),
		};
		const adapter = createPlatformNotificationAdapter(
			{
				runtimeKind: 'android',
				nativeBridgeAvailable: true,
				notifications: { available: true, unavailableMessage: null },
			},
			native,
		);

		await expect(adapter.permission()).resolves.toBe('prompt');
		expect(native.requestPermissions).not.toHaveBeenCalled();
		await expect(adapter.requestPermission()).resolves.toBe('granted');
		expect(native.requestPermissions).toHaveBeenCalledTimes(1);
	});

	it('does not schedule when permission is denied', async () => {
		const native = {
			checkPermissions: vi.fn(async () => ({ display: 'denied' })),
			requestPermissions: vi.fn(async () => ({ display: 'denied' })),
			schedule: vi.fn(async () => ({})),
		};
		const adapter = createPlatformNotificationAdapter(
			{
				runtimeKind: 'android',
				nativeBridgeAvailable: true,
				notifications: { available: true, unavailableMessage: null },
			},
			native,
		);
		await expect(adapter.notify('Done', 'Ready')).resolves.toBe(false);
		expect(native.schedule).not.toHaveBeenCalled();
	});
});
