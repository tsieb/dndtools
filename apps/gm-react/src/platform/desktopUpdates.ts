import { getPlatformCapabilities } from './capabilities';

/** Mirrors the state machine in `electron/updater.cjs`. */
export type DesktopUpdateStatus =
	| 'unsupported'
	| 'idle'
	| 'checking'
	| 'available'
	| 'downloading'
	| 'downloaded'
	| 'up-to-date'
	| 'error';

export interface DesktopUpdateState {
	status: DesktopUpdateStatus;
	currentVersion: string;
	availableVersion: string | null;
	/** Plain text — the main process flattens GitHub's HTML before it crosses the bridge. */
	releaseNotes: string | null;
	releaseDate: string | null;
	percent: number;
	message: string | null;
	checkedAt: string | null;
}

export interface DesktopUpdatesBridge {
	state(): Promise<DesktopUpdateState>;
	check(): Promise<DesktopUpdateState>;
	download(): Promise<DesktopUpdateState>;
	install(): Promise<DesktopUpdateState>;
	onState(cb: (state: DesktopUpdateState) => void): () => void;
}

/**
 * The desktop shell's update bridge, or null everywhere else. Web and Android builds are updated by
 * the browser and the store respectively, so the About screen hides the panel rather than offering
 * a control that could not do anything (UX-STATE fail-closed rule).
 */
export function getDesktopUpdatesBridge(): DesktopUpdatesBridge | null {
	if (getPlatformCapabilities().runtimeKind !== 'electron') return null;
	const bridge = (globalThis as typeof globalThis & { dndtoolsUpdates?: DesktopUpdatesBridge })
		.dndtoolsUpdates;
	return bridge ?? null;
}
