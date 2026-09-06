import { App, type AppState, type BackButtonListenerEvent } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/** The renderer runtime. Layout and features branch on this value, never on native globals. */
export type RuntimeKind = 'web' | 'electron' | 'android';

export interface CapabilityAvailability {
	available: boolean;
	/** User-facing fallback when the native integration is unavailable. */
	unavailableMessage: string | null;
}

export interface PlatformCapabilities {
	runtimeKind: RuntimeKind;
	/** False only for the DEV browser override used by deterministic responsive E2E tests. */
	nativeBridgeAvailable: boolean;
	secureStorage: CapabilityAvailability;
	fileExport: CapabilityAvailability & { nativeShareSheet: boolean };
	localDiscovery: CapabilityAvailability;
	notifications: CapabilityAvailability;
	windowManagement: CapabilityAvailability;
	secondScreen: CapabilityAvailability;
	externalLinks: CapabilityAvailability;
	/** Android deliberately uses the touch-first, preservation-safe map workspace. */
	quickMapMode: boolean;
	/** Android WebViews never admit cleartext provider destinations, including loopback. */
	allowHttpLoopbackAi: boolean;
}

export interface RuntimeSignals {
	capacitorNative: boolean;
	capacitorPlatform: string;
	electronSecureStore: boolean;
	electronWindow: boolean;
	electronDiscovery: boolean;
	notifications: boolean;
}

function readRuntimeSignals(): RuntimeSignals {
	const bridges = globalThis as typeof globalThis & {
		dndtoolsSecureStore?: unknown;
		dndtoolsWindow?: unknown;
		dndtoolsDiscovery?: unknown;
	};
	return {
		capacitorNative: Capacitor.isNativePlatform(),
		capacitorPlatform: Capacitor.getPlatform(),
		electronSecureStore: bridges.dndtoolsSecureStore !== undefined,
		electronWindow: bridges.dndtoolsWindow !== undefined,
		electronDiscovery: bridges.dndtoolsDiscovery !== undefined,
		notifications: typeof globalThis.Notification !== 'undefined',
	};
}

/**
 * The core's widget-package profile ids (`PlatformProfileId`). Declared structurally rather than
 * imported so this module stays free of core types; `widgetProfileForRuntime` is the single place
 * that maps our renderer runtime onto them, so no screen has to hard-code `'desktop'` and quietly
 * offer widgets that cannot run where the DM actually is (CMD-005 AC2).
 */
export type WidgetPlatformProfileId = 'desktop' | 'tablet' | 'mobile' | 'web';

export function widgetProfileForRuntime(
	runtimeKind: RuntimeKind = platformCapabilities.runtimeKind,
): WidgetPlatformProfileId {
	if (runtimeKind === 'android') return 'mobile';
	if (runtimeKind === 'electron') return 'desktop';
	return 'web';
}

/** Pure runtime detection seam used by startup and deterministic tests. */
export function detectRuntimeKind(signals: RuntimeSignals = readRuntimeSignals()): RuntimeKind {
	if (signals.capacitorNative && signals.capacitorPlatform === 'android') return 'android';
	if (signals.electronSecureStore || signals.electronWindow || signals.electronDiscovery) {
		return 'electron';
	}
	return 'web';
}

/** Resolve every platform decision in one place so components never probe globals. */
export function capabilitiesForRuntime(
	runtimeKind: RuntimeKind,
	signals: RuntimeSignals = readRuntimeSignals(),
): PlatformCapabilities {
	const android = runtimeKind === 'android';
	const nativeAndroid =
		android && signals.capacitorNative && signals.capacitorPlatform === 'android';
	const electron = runtimeKind === 'electron';
	const secureStorageAvailable = nativeAndroid || (electron && signals.electronSecureStore);
	const discoveryAvailable = electron && signals.electronDiscovery;
	const windowManagementAvailable = electron && signals.electronWindow;
	const notificationsAvailable = nativeAndroid || signals.notifications;
	return {
		runtimeKind,
		nativeBridgeAvailable: nativeAndroid,
		secureStorage: {
			available: secureStorageAvailable,
			unavailableMessage: secureStorageAvailable
				? null
				: 'Encrypted credential persistence is unavailable; secrets last only for this session.',
		},
		fileExport: {
			available: true,
			nativeShareSheet: nativeAndroid,
			unavailableMessage: null,
		},
		localDiscovery: {
			available: discoveryAvailable,
			unavailableMessage: discoveryAvailable
				? null
				: android
					? 'Automatic nearby-table discovery is desktop-only. Use a manual or cloud session code on Android.'
					: 'Automatic nearby-table discovery needs the desktop app. Manual and cloud session codes still work.',
		},
		notifications: {
			available: notificationsAvailable,
			unavailableMessage: notificationsAvailable
				? null
				: 'Notifications are unavailable in this browser.',
		},
		windowManagement: {
			available: windowManagementAvailable,
			unavailableMessage: windowManagementAvailable
				? null
				: 'Native window controls are available in the desktop app.',
		},
		secondScreen: {
			available: !android,
			unavailableMessage: android
				? 'Opening a separate player display is desktop-only on Android. Player projection remains available from a browser or desktop app.'
				: null,
		},
		externalLinks: { available: true, unavailableMessage: null },
		quickMapMode: android,
		allowHttpLoopbackAi: !android,
	};
}

const startupSignals = readRuntimeSignals();
const devRuntimeOverride: RuntimeKind | null =
	// `import.meta.env` is injected by Vite. Optional so this module also loads under a plain Node
	// runner (`scripts/ai-agent-smoke.ts` imports the AI bridge, which reaches here transitively).
	import.meta.env?.DEV &&
	(globalThis as typeof globalThis & { __DNDTOOLS_TEST_RUNTIME_KIND__?: unknown })
		.__DNDTOOLS_TEST_RUNTIME_KIND__ === 'android'
		? 'android'
		: null;

export const platformCapabilities = capabilitiesForRuntime(
	devRuntimeOverride ?? detectRuntimeKind(startupSignals),
	startupSignals,
);

export function getPlatformCapabilities(): PlatformCapabilities {
	return platformCapabilities;
}

/** Stable hook-shaped accessor; the runtime cannot change without recreating the WebView. */
export function usePlatformCapabilities(): PlatformCapabilities {
	return platformCapabilities;
}

/**
 * Validate an application-controlled network destination for the current runtime. Android's
 * embedded WebView is deliberately stricter than browsers and Electron: it may contact only
 * encrypted HTTPS/WSS endpoints, including when a legacy vault contains a cleartext URL.
 */
export function isNetworkDestinationAllowed(
	value: string,
	runtimeKind: RuntimeKind = platformCapabilities.runtimeKind,
): boolean {
	let destination: URL;
	try {
		destination = new URL(value);
	} catch {
		return false;
	}
	return (
		runtimeKind !== 'android' ||
		destination.protocol === 'https:' ||
		destination.protocol === 'wss:'
	);
}

function electronBridge<T>(name: string): T | null {
	if (platformCapabilities.runtimeKind !== 'electron') return null;
	return (
		((globalThis as typeof globalThis & Record<string, unknown>)[name] as T | null | undefined) ??
		null
	);
}

/** Typed Electron preload access stays centralized beside the capability decision. */
export const getElectronSecureStoreBridge = <T>(): T | null =>
	electronBridge<T>('dndtoolsSecureStore');
export const getElectronDiscoveryBridge = <T>(): T | null => electronBridge<T>('dndtoolsDiscovery');
export const getElectronWindowBridge = <T>(): T | null => electronBridge<T>('dndtoolsWindow');
export const getElectronNetworkPolicyBridge = <T>(): T | null =>
	electronBridge<T>('dndtoolsNetworkPolicy');

export interface NativeSecureStorePlugin {
	get(input: { key: string }): Promise<{ value: string | null }>;
	set(input: { key: string; value: string }): Promise<{ ok: boolean }>;
	delete(input: { key: string }): Promise<{ ok: boolean }>;
	clear(): Promise<{ ok: boolean }>;
	keys(): Promise<{ keys: string[] }>;
}

export interface NativeFileExportPlugin {
	exportFile(input: {
		filename: string;
		mimeType: string;
		base64: string;
		title: string;
	}): Promise<{ status: 'exported' | 'cancelled' }>;
}

interface NativeSystemBarsPlugin {
	setStyle(input: { style: 'LIGHT' | 'DARK' }): Promise<void>;
}

/** Typed custom-plugin seams. Registration is inert in web/Electron builds. */
export const DndtoolsSecureStore = registerPlugin<NativeSecureStorePlugin>('DndtoolsSecureStore');
export const DndtoolsFileExport = registerPlugin<NativeFileExportPlugin>('DndtoolsFileExport');
const SystemBars = registerPlugin<NativeSystemBarsPlugin>('SystemBars');

export async function setAndroidSystemBarStyle(style: 'LIGHT' | 'DARK'): Promise<boolean> {
	if (!platformCapabilities.nativeBridgeAvailable) return false;
	try {
		await SystemBars.setStyle({ style });
		return true;
	} catch {
		return false;
	}
}

export type PlatformNotificationPermission = 'granted' | 'denied' | 'prompt';

interface PlatformNotificationNativeAdapter {
	checkPermissions(): Promise<{ display: string }>;
	requestPermissions(): Promise<{ display: string }>;
	schedule(input: {
		notifications: Array<{ id: number; title: string; body: string }>;
	}): Promise<unknown>;
}

interface PlatformNotificationWebAdapter {
	permission(): NotificationPermission | null;
	requestPermission(): Promise<NotificationPermission>;
	notify(title: string, body: string): void;
}

const webNotifications: PlatformNotificationWebAdapter = {
	permission: () =>
		typeof globalThis.Notification === 'undefined' ? null : globalThis.Notification.permission,
	requestPermission: async () =>
		typeof globalThis.Notification === 'undefined'
			? 'denied'
			: globalThis.Notification.requestPermission(),
	notify: (title, body) => {
		new globalThis.Notification(title, { body });
	},
};

export interface PlatformNotificationAdapter {
	available(): boolean;
	permission(): Promise<PlatformNotificationPermission>;
	requestPermission(): Promise<PlatformNotificationPermission>;
	notify(title: string, body: string): Promise<boolean>;
}

/** Injectable adapter proves that only explicit opt-in calls the permission prompt. */
export function createPlatformNotificationAdapter(
	capabilities: Pick<
		PlatformCapabilities,
		'runtimeKind' | 'nativeBridgeAvailable' | 'notifications'
	>,
	native: PlatformNotificationNativeAdapter = LocalNotifications,
	web: PlatformNotificationWebAdapter = webNotifications,
): PlatformNotificationAdapter {
	const permission = async (): Promise<PlatformNotificationPermission> => {
		if (capabilities.runtimeKind === 'android' && capabilities.nativeBridgeAvailable) {
			const result = await native.checkPermissions();
			return result.display === 'granted'
				? 'granted'
				: result.display === 'prompt' || result.display === 'prompt-with-rationale'
					? 'prompt'
					: 'denied';
		}
		const result = web.permission();
		return result === null || result === 'denied'
			? 'denied'
			: result === 'default'
				? 'prompt'
				: 'granted';
	};
	return {
		available: () => capabilities.notifications.available,
		permission,
		/** Called only from an explicit opt-in action. Startup never prompts. */
		async requestPermission(): Promise<PlatformNotificationPermission> {
			if (capabilities.runtimeKind === 'android' && capabilities.nativeBridgeAvailable) {
				const result = await native.requestPermissions();
				return result.display === 'granted' ? 'granted' : 'denied';
			}
			const result = await web.requestPermission();
			return result === 'default' ? 'prompt' : result;
		},
		async notify(title: string, body: string): Promise<boolean> {
			if ((await permission()) !== 'granted') return false;
			if (capabilities.runtimeKind === 'android' && capabilities.nativeBridgeAvailable) {
				await native.schedule({
					notifications: [{ id: Date.now() & 0x7fffffff, title, body }],
				});
				return true;
			}
			try {
				web.notify(title, body);
				return true;
			} catch {
				return false;
			}
		},
	};
}

export const platformNotifications = createPlatformNotificationAdapter(platformCapabilities);

/** Open a trusted external HTTPS URL outside the embedded Android WebView. */
export async function openExternalUrl(url: string): Promise<boolean> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	if (parsed.protocol !== 'https:') return false;
	if (
		platformCapabilities.runtimeKind === 'android' &&
		platformCapabilities.nativeBridgeAvailable
	) {
		await Browser.open({ url: parsed.toString(), presentationStyle: 'popover' });
		return true;
	}
	const opened = globalThis.open(parsed.toString(), '_blank', 'noopener,noreferrer');
	return opened !== null;
}

export interface PlatformLifecycleHandlers {
	onBack(event: BackButtonListenerEvent): void | Promise<void>;
	onStateChange?(state: AppState): void | Promise<void>;
	onResume?(): void | Promise<void>;
	onAppUrl?(url: string): void | Promise<void>;
}

/** Bind native lifecycle events once; web/Electron builds receive a no-op disposer. */
export async function bindPlatformLifecycle(
	handlers: PlatformLifecycleHandlers,
): Promise<() => Promise<void>> {
	if (!platformCapabilities.nativeBridgeAvailable) return async () => {};
	const listeners: PluginListenerHandle[] = [];
	const safely = (handler: () => void | Promise<void>) => {
		void Promise.resolve()
			.then(handler)
			.catch(() => undefined);
	};
	listeners.push(
		await App.addListener('backButton', (event) => safely(() => handlers.onBack(event))),
	);
	if (handlers.onStateChange) {
		listeners.push(
			await App.addListener('appStateChange', (state) =>
				safely(() => handlers.onStateChange?.(state)),
			),
		);
	}
	if (handlers.onResume) {
		listeners.push(await App.addListener('resume', () => safely(() => handlers.onResume?.())));
	}
	if (handlers.onAppUrl) {
		listeners.push(
			await App.addListener('appUrlOpen', ({ url }) => {
				safely(() => handlers.onAppUrl?.(url));
			}),
		);
	}
	return async () => {
		await Promise.all(listeners.map((listener) => listener.remove()));
	};
}

export async function minimizeAndroidApp(): Promise<void> {
	if (platformCapabilities.nativeBridgeAvailable) await App.minimizeApp();
}
