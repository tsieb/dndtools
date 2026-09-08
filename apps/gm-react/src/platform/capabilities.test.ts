import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	bindAppIntents,
	capabilitiesForRuntime,
	createPlatformNotificationAdapter,
	detectIosWebKit,
	detectRuntimeKind,
	isNetworkDestinationAllowed,
	LIVE_SESSION_NOTIFICATION_ID,
	PLATFORM_NOTIFICATION_CHANNELS,
	sharedImportFor,
	shortcutRouteFor,
	widgetProfileForRuntime,
	type NativeAppIntent,
	type RuntimeSignals,
} from './capabilities';

const WEB_SIGNALS: RuntimeSignals = {
	capacitorNative: false,
	capacitorPlatform: 'web',
	electronSecureStore: false,
	electronWindow: false,
	electronDiscovery: false,
	notifications: false,
	iosWebKit: false,
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

	it('reports iPhone and iPad WebKit as its own runtime kind with Home Screen notification copy', () => {
		const signals = { ...WEB_SIGNALS, iosWebKit: true };
		expect(detectRuntimeKind(signals)).toBe('ios');
		const capabilities = capabilitiesForRuntime('ios', signals);
		expect(capabilities).toMatchObject({
			runtimeKind: 'ios',
			nativeBridgeAvailable: false,
			quickMapMode: false,
			secureStorage: { available: false },
			fileExport: { available: true, nativeShareSheet: false },
			localDiscovery: { available: false },
			windowManagement: { available: false },
			secondScreen: { available: true },
		});
		expect(capabilities.notifications.unavailableMessage).toMatch(/Home Screen/);
		expect(widgetProfileForRuntime('ios')).toBe('mobile');
	});

	it('lets a real bridge outrank the iOS agent test in either direction', () => {
		// A future Capacitor iOS shell (ADR-038) reports its own kind rather than falling to web.
		expect(
			detectRuntimeKind({ ...WEB_SIGNALS, capacitorNative: true, capacitorPlatform: 'ios' }),
		).toBe('ios');
		// Electron on macOS must never be mistaken for an iPad.
		expect(detectRuntimeKind({ ...WEB_SIGNALS, iosWebKit: true, electronWindow: true })).toBe(
			'electron',
		);
	});

	it('recognizes iPhone agents and touch-capable iPadOS desktop agents, not real Macs', () => {
		const agents: [string, number, boolean][] = [
			['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', 0, true],
			['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15', 5, true],
			['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 5, true],
			['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', 0, false],
			['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', 0, false],
		];
		for (const [userAgent, maxTouchPoints, expected] of agents) {
			vi.stubGlobal('navigator', { userAgent, maxTouchPoints });
			expect(detectIosWebKit(), userAgent).toBe(expected);
		}
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
			cancel: vi.fn(async () => ({})),
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
			cancel: vi.fn(async () => ({})),
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

// RC-PLT-2.2 — Android share target, home-screen shortcuts and notification channels.

const ANDROID_NOTIFICATION_CAPABILITIES = {
	runtimeKind: 'android',
	nativeBridgeAvailable: true,
	notifications: { available: true, unavailableMessage: null },
} as const;

interface ScheduledNotification {
	id: number;
	title: string;
	body: string;
	channelId?: string;
	ongoing?: boolean;
	autoCancel?: boolean;
}

function grantedNative() {
	return {
		checkPermissions: vi.fn(async () => ({ display: 'granted' })),
		requestPermissions: vi.fn(async () => ({ display: 'granted' })),
		schedule: vi.fn(async (_input: { notifications: ScheduledNotification[] }) => ({})),
		cancel: vi.fn(async (_input: { notifications: Array<{ id: number }> }) => ({})),
	};
}

describe('notification channels', () => {
	it('posts one-shot notifications on the updates channel', async () => {
		const native = grantedNative();
		const adapter = createPlatformNotificationAdapter(ANDROID_NOTIFICATION_CAPABILITIES, native);

		await expect(adapter.notify('Run finished', 'Two notes drafted')).resolves.toBe(true);

		expect(native.schedule.mock.calls[0]?.[0].notifications[0]).toMatchObject({
			channelId: PLATFORM_NOTIFICATION_CHANNELS.updates,
			title: 'Run finished',
		});
	});

	it('posts the live-session status as an ongoing notification with a stable id', async () => {
		const native = grantedNative();
		const adapter = createPlatformNotificationAdapter(ANDROID_NOTIFICATION_CAPABILITIES, native);

		await expect(
			adapter.setLiveSession({ title: 'Session is live', body: 'Tap to return to the table.' }),
		).resolves.toBe(true);

		expect(native.schedule.mock.calls[0]?.[0].notifications[0]).toMatchObject({
			id: LIVE_SESSION_NOTIFICATION_ID,
			channelId: PLATFORM_NOTIFICATION_CHANNELS.liveSession,
			ongoing: true,
			autoCancel: false,
		});
	});

	it('clears the live-session status by cancelling the same id, without checking permission', async () => {
		const native = grantedNative();
		const adapter = createPlatformNotificationAdapter(ANDROID_NOTIFICATION_CAPABILITIES, native);

		await expect(adapter.setLiveSession(null)).resolves.toBe(true);

		expect(native.cancel).toHaveBeenCalledWith({
			notifications: [{ id: LIVE_SESSION_NOTIFICATION_ID }],
		});
		expect(native.schedule).not.toHaveBeenCalled();
	});

	it('never prompts for permission when a session goes live', async () => {
		const native = {
			checkPermissions: vi.fn(async () => ({ display: 'prompt' })),
			requestPermissions: vi.fn(async () => ({ display: 'granted' })),
			schedule: vi.fn(async (_input: { notifications: ScheduledNotification[] }) => ({})),
			cancel: vi.fn(async (_input: { notifications: Array<{ id: number }> }) => ({})),
		};
		const adapter = createPlatformNotificationAdapter(ANDROID_NOTIFICATION_CAPABILITIES, native);

		await expect(
			adapter.setLiveSession({ title: 'Live', body: 'Back to the table.' }),
		).resolves.toBe(false);
		expect(native.requestPermissions).not.toHaveBeenCalled();
		expect(native.schedule).not.toHaveBeenCalled();
	});

	it('reports no ongoing status off Android rather than faking one', async () => {
		const native = grantedNative();
		const adapter = createPlatformNotificationAdapter(
			{
				runtimeKind: 'web',
				nativeBridgeAvailable: false,
				notifications: { available: true, unavailableMessage: null },
			},
			native,
		);

		await expect(adapter.setLiveSession({ title: 'Live', body: 'Back.' })).resolves.toBe(false);
		expect(native.schedule).not.toHaveBeenCalled();
	});
});

describe('shortcut routes and shared payloads', () => {
	it('accepts only the two routes the shortcuts declare', () => {
		expect(shortcutRouteFor('/session')).toBe('/session');
		expect(shortcutRouteFor(' /play ')).toBe('/play');
		expect(shortcutRouteFor('/settings')).toBeNull();
		expect(shortcutRouteFor('https://evil.example/#/session')).toBeNull();
		expect(shortcutRouteFor(null)).toBeNull();
	});

	it('rejects a share that carries no usable text', () => {
		expect(sharedImportFor(null)).toBeNull();
		expect(sharedImportFor({ filename: 'a.json', mimeType: 'application/json' })).toBeNull();
		expect(
			sharedImportFor({ filename: 'a.json', mimeType: 'application/json', text: '  ' }),
		).toBeNull();
	});

	it('falls back to a stated filename rather than showing an empty name', () => {
		expect(sharedImportFor({ text: '{}' })).toEqual({
			filename: 'Shared file',
			mimeType: '',
			text: '{}',
		});
	});
});

describe('bindAppIntents', () => {
	function fakePlugin(intent: NativeAppIntent) {
		const remove = vi.fn(async () => {});
		const state: { listener: ((intent: NativeAppIntent) => void) | null } = { listener: null };
		return {
			state,
			remove,
			consumePendingIntent: vi.fn(async () => intent),
			addListener: vi.fn(async (_event: 'appIntent', listener: (i: NativeAppIntent) => void) => {
				state.listener = listener;
				return { remove };
			}),
		};
	}

	it('is inert without a native bridge', async () => {
		const plugin = fakePlugin({ share: null, route: '/session' });
		const onShortcut = vi.fn();
		await bindAppIntents({ onShare: vi.fn(), onShortcut }, plugin as never, {
			nativeBridgeAvailable: false,
		});
		expect(plugin.consumePendingIntent).not.toHaveBeenCalled();
		expect(onShortcut).not.toHaveBeenCalled();
	});

	it('delivers the launch intent once, and later intents through the listener', async () => {
		const plugin = fakePlugin({
			share: { filename: 'town.dndmodule', mimeType: '', text: '{}' },
			route: '/play',
		});
		const onShare = vi.fn();
		const onShortcut = vi.fn();
		const dispose = await bindAppIntents({ onShare, onShortcut }, plugin as never, {
			nativeBridgeAvailable: true,
		});

		expect(onShortcut.mock.calls).toEqual([['/play']]);
		expect(onShare.mock.calls).toEqual([
			[{ filename: 'town.dndmodule', mimeType: '', text: '{}' }],
		]);

		plugin.state.listener?.({ share: null, route: '/session' });
		expect(onShortcut).toHaveBeenLastCalledWith('/session');

		// A route the shortcuts never declare is dropped rather than navigated to.
		plugin.state.listener?.({ share: null, route: '/settings' });
		expect(onShortcut).toHaveBeenCalledTimes(2);

		await dispose();
		expect(plugin.remove).toHaveBeenCalledTimes(1);
	});
});
