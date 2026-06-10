import type { PlatformProfileId } from '../state/widget-package-state';

/**
 * PLAT-001 / Contract 1 (Platform Profile Selection): the runtime capability descriptor.
 *
 * The shell selects exactly one of `desktop | tablet | mobile | web` at runtime by resolving
 * an {@link PlatformEnvironmentDescriptor} (touch input, viewport class, declared shell), NOT
 * by branching on raw `window.innerWidth` in feature components. Feature components receive
 * the resolved {@link PlatformProfile} and branch on its capability facts.
 *
 * The first v2 slice implements the WEB profile for real (ADR-014). Desktop, tablet, and
 * Android/Capacitor profiles ship as *typed, declared-unavailable* descriptors: their native
 * shells are out of first-slice scope, so the capabilities they cannot honor yet are marked
 * unavailable. Feature components degrade correctly against the descriptor instead of
 * attempting a native path (PLAT-002/PLAT-005 boundary; PLAT-016 fail-closed).
 *
 * This module is pure: no DOM, no browser globals, no Svelte. The app shell probes the
 * environment in its platform layer and hands the descriptor to {@link selectPlatformProfile}.
 */

export type PlatformInputModality = 'keyboard' | 'mouse' | 'touch' | 'pen';

/** Where durable prototype state lives for a profile (Contract 1 storage axis). */
export type PlatformStorageKind = 'filesystem' | 'indexeddb' | 'cloud-cache' | 'capacitor-filesystem';

export type PlatformViewportClass = 'compact' | 'medium' | 'expanded';

/**
 * A platform service whose availability differs per shell. The descriptor declares whether
 * the service is wired (`available`), present but not built in this slice (`unavailable`), or
 * structurally impossible for the profile (`unsupported`). Feature components read this rather
 * than feature-detecting native APIs themselves.
 */
export type PlatformServiceAvailability = 'available' | 'unavailable' | 'unsupported';

/**
 * The typed platform-service capability surface every profile must declare. These are the
 * trusted services owned by the Platform Services layer (Contract 1): the GUI/feature layer
 * never reaches the underlying native API, it reads these flags. Desktop/Android descriptors
 * declare the shape so feature components compile and degrade against them even though the
 * native bridge is deferred (PLAT-002/PLAT-005).
 */
export interface PlatformServiceCapabilities {
	/** Trusted OS filesystem vault storage (desktop) / Capacitor filesystem (Android). */
	readonly trustedFilesystem: PlatformServiceAvailability;
	/** Native OS open/save dialogs and file picker. */
	readonly nativeFilePicker: PlatformServiceAvailability;
	/** Auto-update service. */
	readonly appUpdates: PlatformServiceAvailability;
	/** Custom protocol / deep-link handler registration. */
	readonly protocolHandler: PlatformServiceAvailability;
	/** Window titlebar controls (minimize/maximize/restore/close) and chrome. */
	readonly windowTitlebarControls: PlatformServiceAvailability;
	/** Native OS context menus. */
	readonly nativeContextMenus: PlatformServiceAvailability;
	/** Filesystem change watching. */
	readonly fileWatching: PlatformServiceAvailability;
	/** Local MCP sidecar process lifecycle. */
	readonly mcpSidecar: PlatformServiceAvailability;
	/** OS credential / keychain store for auth tokens. */
	readonly osCredentialStore: PlatformServiceAvailability;
	/** Multi-window support. */
	readonly multiWindow: PlatformServiceAvailability;
	/** Native share / import sheet (mobile). */
	readonly nativeShareImport: PlatformServiceAvailability;
	/** Virtual-keyboard inset adaptation (mobile). */
	readonly virtualKeyboardInsets: PlatformServiceAvailability;
	/** Browser/PWA service-worker offline cache. */
	readonly serviceWorkerCache: PlatformServiceAvailability;
	/** Cloud cache for vault content (local-first cached copy). */
	readonly cloudCache: PlatformServiceAvailability;
}

/**
 * The resolved platform profile passed from the shell to GUI packages. Mirrors the Contract 1
 * descriptor shape and adds the typed {@link PlatformServiceCapabilities} so feature
 * components have one object to branch on.
 */
export interface PlatformProfile {
	readonly id: PlatformProfileId;
	readonly input: readonly PlatformInputModality[];
	readonly storage: PlatformStorageKind;
	readonly viewportClass: PlatformViewportClass;
	/** Convenience flags Contract 1 lists explicitly (`canRunMcpSidecar`, etc.). */
	readonly canRunMcpSidecar: boolean;
	readonly canUseNativeFilePicker: boolean;
	readonly canUseMultiWindow: boolean;
	/** Whether the native shell for this profile is implemented in the current slice. */
	readonly shellImplemented: boolean;
	readonly capabilities: PlatformServiceCapabilities;
}

const UNAVAILABLE = 'unavailable' as const;
const UNSUPPORTED = 'unsupported' as const;
const AVAILABLE = 'available' as const;

/**
 * The four declared profile descriptors. WEB is the only fully-implemented shell in this
 * slice. The others declare every service they would own, marked `unavailable` where the
 * native bridge is deferred, so feature components and the support matrix can render correct
 * degraded/unsupported states today (and the descriptors flip to `available` unchanged when a
 * later epic wires the real shell).
 */
const DESKTOP_PROFILE: PlatformProfile = {
	id: 'desktop',
	input: ['keyboard', 'mouse'],
	storage: 'filesystem',
	viewportClass: 'expanded',
	canRunMcpSidecar: true,
	canUseNativeFilePicker: true,
	canUseMultiWindow: true,
	// Native Electron shell is out of first-slice scope (ADR-014); the descriptor is typed and
	// declared-unavailable so feature components degrade rather than calling a missing bridge.
	shellImplemented: false,
	capabilities: {
		trustedFilesystem: UNAVAILABLE,
		nativeFilePicker: UNAVAILABLE,
		appUpdates: UNAVAILABLE,
		protocolHandler: UNAVAILABLE,
		windowTitlebarControls: UNAVAILABLE,
		nativeContextMenus: UNAVAILABLE,
		fileWatching: UNAVAILABLE,
		mcpSidecar: UNAVAILABLE,
		osCredentialStore: UNAVAILABLE,
		multiWindow: UNAVAILABLE,
		nativeShareImport: UNSUPPORTED,
		virtualKeyboardInsets: UNSUPPORTED,
		serviceWorkerCache: UNSUPPORTED,
		cloudCache: UNAVAILABLE,
	},
};

const TABLET_PROFILE: PlatformProfile = {
	id: 'tablet',
	input: ['touch', 'pen', 'keyboard'],
	storage: 'capacitor-filesystem',
	viewportClass: 'medium',
	canRunMcpSidecar: false,
	canUseNativeFilePicker: true,
	canUseMultiWindow: false,
	shellImplemented: false,
	capabilities: {
		trustedFilesystem: UNAVAILABLE,
		nativeFilePicker: UNAVAILABLE,
		appUpdates: UNAVAILABLE,
		protocolHandler: UNAVAILABLE,
		windowTitlebarControls: UNSUPPORTED,
		nativeContextMenus: UNAVAILABLE,
		fileWatching: UNAVAILABLE,
		mcpSidecar: UNSUPPORTED,
		osCredentialStore: UNAVAILABLE,
		multiWindow: UNSUPPORTED,
		nativeShareImport: UNAVAILABLE,
		virtualKeyboardInsets: UNAVAILABLE,
		serviceWorkerCache: UNSUPPORTED,
		cloudCache: UNAVAILABLE,
	},
};

const MOBILE_PROFILE: PlatformProfile = {
	id: 'mobile',
	input: ['touch'],
	storage: 'capacitor-filesystem',
	viewportClass: 'compact',
	canRunMcpSidecar: false,
	canUseNativeFilePicker: true,
	canUseMultiWindow: false,
	shellImplemented: false,
	capabilities: {
		trustedFilesystem: UNAVAILABLE,
		nativeFilePicker: UNAVAILABLE,
		appUpdates: UNAVAILABLE,
		protocolHandler: UNAVAILABLE,
		windowTitlebarControls: UNSUPPORTED,
		nativeContextMenus: UNSUPPORTED,
		fileWatching: UNAVAILABLE,
		mcpSidecar: UNSUPPORTED,
		osCredentialStore: UNAVAILABLE,
		multiWindow: UNSUPPORTED,
		nativeShareImport: UNAVAILABLE,
		virtualKeyboardInsets: UNAVAILABLE,
		serviceWorkerCache: UNSUPPORTED,
		cloudCache: UNAVAILABLE,
	},
};

const WEB_PROFILE: PlatformProfile = {
	id: 'web',
	input: ['keyboard', 'mouse'],
	storage: 'indexeddb',
	viewportClass: 'expanded',
	canRunMcpSidecar: false,
	canUseNativeFilePicker: false,
	canUseMultiWindow: false,
	// The browser/PWA shell is the implemented prototype (ADR-014).
	shellImplemented: true,
	capabilities: {
		// Trusted OS filesystem is structurally unavailable in a browser; durable state is
		// browser IndexedDB through the storage adapter, and cloud-cache content is local-first.
		trustedFilesystem: UNSUPPORTED,
		nativeFilePicker: UNSUPPORTED,
		appUpdates: UNSUPPORTED,
		protocolHandler: UNSUPPORTED,
		windowTitlebarControls: UNSUPPORTED,
		nativeContextMenus: UNSUPPORTED,
		fileWatching: UNSUPPORTED,
		mcpSidecar: UNSUPPORTED,
		osCredentialStore: UNSUPPORTED,
		multiWindow: UNSUPPORTED,
		nativeShareImport: UNSUPPORTED,
		virtualKeyboardInsets: UNSUPPORTED,
		serviceWorkerCache: AVAILABLE,
		cloudCache: AVAILABLE,
	},
};

const PROFILES_BY_ID: Readonly<Record<PlatformProfileId, PlatformProfile>> = {
	desktop: DESKTOP_PROFILE,
	tablet: TABLET_PROFILE,
	mobile: MOBILE_PROFILE,
	web: WEB_PROFILE,
};

/** All declared profiles, ordered for stable presentation (matrix / capability views). */
export const PLATFORM_PROFILES: readonly PlatformProfile[] = [
	WEB_PROFILE,
	DESKTOP_PROFILE,
	TABLET_PROFILE,
	MOBILE_PROFILE,
];

/** Look up a declared profile descriptor by id. */
export function platformProfile(id: PlatformProfileId): PlatformProfile {
	return PROFILES_BY_ID[id];
}

/**
 * The environment facts the shell probes once, in its platform layer, and hands to
 * {@link selectPlatformProfile}. Crucially this is NOT raw `window.innerWidth`: the shell
 * classifies the viewport into a coarse class and reports input capabilities, so the
 * selection rule and every feature component stay free of raw pixel math (PLAT-001 AC2).
 */
export interface PlatformEnvironmentDescriptor {
	/** Coarse viewport class derived once by the shell, never a raw pixel width. */
	readonly viewportClass: PlatformViewportClass;
	/** Whether the primary pointer is coarse/touch (e.g. `pointer: coarse`). */
	readonly hasTouch: boolean;
	/** Whether a fine pointer (mouse) is present. */
	readonly hasFinePointer: boolean;
	/**
	 * The shell the runtime is hosted in, when known. The web prototype always reports
	 * `web`; an Electron/Capacitor host would report its shell so the native descriptor is
	 * selected even on a desktop-sized touch device.
	 */
	readonly declaredShell?: PlatformProfileId;
}

/**
 * PLAT-001 (the spine): resolve the platform profile from a capability/environment
 * descriptor. The rule is deterministic and pure:
 *
 * 1. An explicitly declared shell wins (a native host knows what it is).
 * 2. Otherwise: a touch primary pointer + compact viewport selects `mobile`; touch + medium
 *    selects `tablet`; everything else is the `web`/desktop-class browser profile.
 *
 * Because the input is a descriptor, the selection logic — and every feature component that
 * consumes the result — never reads `window.innerWidth`. The shell is the single owner of
 * profile detection (Contract 1 binding rule 1).
 */
export function selectPlatformProfile(env: PlatformEnvironmentDescriptor): PlatformProfile {
	if (env.declaredShell) {
		const declared = PROFILES_BY_ID[env.declaredShell];
		// Honor the declared shell but reflect the live viewport class so layout density still
		// adapts (a desktop window can be narrow). Identity (id/storage/services) is fixed by
		// the shell; only the presentation-affecting viewport class is overridden.
		return declared.viewportClass === env.viewportClass
			? declared
			: { ...declared, viewportClass: env.viewportClass };
	}

	if (env.hasTouch && !env.hasFinePointer) {
		if (env.viewportClass === 'compact') return MOBILE_PROFILE;
		if (env.viewportClass === 'medium') return TABLET_PROFILE;
	}

	// Default browser prototype profile. Reflect the live viewport class so a narrow browser
	// window still drives density-reduced layout without changing profile identity.
	return WEB_PROFILE.viewportClass === env.viewportClass
		? WEB_PROFILE
		: { ...WEB_PROFILE, viewportClass: env.viewportClass };
}

/**
 * Whether the profile should render the density-reduced ("slim") presentation: one primary
 * work surface at a time, sheets/drawers instead of persistent side panels (Contract 1 Slimmer
 * Device Definition; PLAT-003). This is the single capability fact feature components branch
 * on — not a width comparison.
 */
export function isCompactPresentation(profile: PlatformProfile): boolean {
	return profile.viewportClass === 'compact';
}

/**
 * Resolve a single named platform service's availability for a profile. Fail-closed default:
 * an unknown service key is treated as `unsupported`, never silently available.
 */
export function serviceAvailability(
	profile: PlatformProfile,
	service: keyof PlatformServiceCapabilities,
): PlatformServiceAvailability {
	return profile.capabilities[service] ?? UNSUPPORTED;
}

/** True only when the named service is wired and usable on this profile. */
export function hasService(
	profile: PlatformProfile,
	service: keyof PlatformServiceCapabilities,
): boolean {
	return serviceAvailability(profile, service) === AVAILABLE;
}
