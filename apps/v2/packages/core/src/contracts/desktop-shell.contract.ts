import type { PlatformServiceMethodName } from './platform-boundary.contract';

/**
 * PLAT-002: type-only contract for the desktop (Electron) shell's platform services.
 *
 * This module declares the typed interfaces the desktop shell would expose behind trusted IPC:
 * filesystem storage, OS dialogs, updates, protocol handling, titlebar controls, context menus,
 * file watching, and MCP sidecar lifecycle. It is INTENTIONALLY type-only (PLAT-011): the real
 * Electron main process is out of first-slice scope (ADR-014). Declaring the contract here lets
 * feature components compile against a stable typed surface and degrade through the
 * declared-unavailable capability descriptor, without any native API being exposed to feature
 * components (the boundary lint stays green because there is no runtime value here).
 *
 * When a later epic builds the Electron shell, it implements these interfaces in the app's
 * platform layer behind the existing platform-service boundary (PLAT-007) — the renderer keeps
 * calling named methods, never the raw Electron bridge.
 */

/** A request that crosses trusted IPC from the renderer into the desktop main process. */
export interface DesktopIpcRequest<TMethod extends string = PlatformServiceMethodName> {
	readonly method: TMethod;
	readonly payload: unknown;
}

/** Trusted filesystem vault storage owned by the desktop main process. */
export interface DesktopFilesystemService {
	/** Read a vault file. The renderer never receives a raw absolute path (Contract 1). */
	readVaultFile(relativePath: string): Promise<Uint8Array>;
	writeVaultFile(relativePath: string, contents: Uint8Array): Promise<void>;
	listVaultEntries(relativePath: string): Promise<readonly string[]>;
}

/** Native OS open/save dialogs. */
export interface DesktopDialogService {
	openFile(options: { readonly filters?: readonly string[] }): Promise<string | null>;
	saveFile(options: { readonly suggestedName?: string }): Promise<string | null>;
}

/** Auto-update service. */
export interface DesktopUpdateService {
	checkForUpdate(): Promise<{ readonly available: boolean; readonly version?: string }>;
	downloadAndInstall(): Promise<void>;
}

/** Custom protocol / deep-link registration. */
export interface DesktopProtocolService {
	registerScheme(scheme: string): Promise<void>;
}

/** Filesystem change watching. */
export interface DesktopFileWatchService {
	watch(relativePath: string): Promise<{ readonly watchId: string }>;
	unwatch(watchId: string): Promise<void>;
}

/** Local MCP sidecar process lifecycle. MCP is optional (cross-contract non-negotiable 6). */
export interface DesktopMcpSidecarService {
	start(): Promise<{ readonly pid: number }>;
	stop(): Promise<void>;
	status(): Promise<'stopped' | 'starting' | 'running' | 'error'>;
}

/** Window titlebar control state (minimize/maximize/restore/close). */
export type TitlebarWindowState = 'normal' | 'maximized' | 'minimized' | 'fullscreen';

export interface TitlebarControl {
	readonly id: 'minimize' | 'maximize' | 'restore' | 'close';
	readonly label: string;
	/**
	 * Whether the control is shown in the current window state. `restore` shows only when
	 * maximized; `maximize` hides when maximized (PLAT-002 AC2).
	 */
	readonly visible: boolean;
}

/**
 * The aggregate desktop platform-service surface. A desktop shell implementation satisfies this
 * interface; feature components never see it directly — they read the resolved platform profile
 * capability descriptor (PLAT-001) and dispatch core commands.
 */
export interface DesktopPlatformServices {
	readonly filesystem: DesktopFilesystemService;
	readonly dialogs: DesktopDialogService;
	readonly updates: DesktopUpdateService;
	readonly protocol: DesktopProtocolService;
	readonly fileWatch: DesktopFileWatchService;
	readonly mcpSidecar: DesktopMcpSidecarService;
}
