export interface DesktopBackendInfo {
	backend: 'desktop-filesystem';
	vaultDir: string;
}

export interface DesktopMcpStatus {
	state: 'stopped' | 'running' | 'error';
	vaultDir: string | null;
	entry: string | null;
	pid: number | null;
	lastStartedAt: string | null;
	error: string | null;
}

export interface DesktopMcpChangeRecord {
	id: string;
	createdAt: string;
	resolvedAt: string | null;
	source: 'mcp';
	type: 'create' | 'update' | 'soft_delete' | 'restore' | 'permanent_delete';
	status: 'pending' | 'approved' | 'rejected';
	noteId: string;
	title: string;
	summary: string;
	before: { note: import('$lib/types/note.js').Note } | null;
	after: { note: import('$lib/types/note.js').Note } | null;
	preview?: {
		summary: string;
		metadata: string[];
		addedLines: number;
		removedLines: number;
		compactDiff: string;
		fullDiff: string;
		hasMore: boolean;
	};
}

export interface DesktopWindowState {
	isMaximized: boolean;
}

export interface DesktopIntegrityIssue {
	file: 'index.json' | 'session-boards.json' | 'objects.json' | 'mcp-changelog.json';
	status: 'ok' | 'missing' | 'invalid_json' | 'invalid_shape';
	repaired: boolean;
	details: string | null;
}

export interface DesktopIntegrityReport {
	checkedAt: string;
	healthy: boolean;
	repairApplied: boolean;
	issues: DesktopIntegrityIssue[];
}

function requireBridge(): NonNullable<Window['dndtoolsDesktop']> {
	const bridge = window.dndtoolsDesktop;
	if (!bridge) {
		throw new Error('Desktop bridge is unavailable. Run inside Electron desktop mode.');
	}
	return bridge;
}

export async function getDesktopBackendInfo(): Promise<DesktopBackendInfo> {
	return requireBridge().getBackendInfo();
}

export async function pickDesktopVaultDirectory(): Promise<{ vaultDir: string } | null> {
	return requireBridge().pickVaultDirectory();
}

export async function getDesktopMcpStatus(): Promise<DesktopMcpStatus> {
	return requireBridge().getMcpStatus();
}

export async function restartDesktopMcpSidecar(): Promise<DesktopMcpStatus> {
	return requireBridge().restartMcpSidecar();
}

export async function refreshDesktopVault(): Promise<{ noteCount: number }> {
	return requireBridge().refreshVault();
}

export async function getDesktopIntegrityReport(): Promise<DesktopIntegrityReport> {
	return requireBridge().getIntegrityReport();
}

export async function repairDesktopIntegrity(): Promise<DesktopIntegrityReport> {
	return requireBridge().repairIntegrity();
}

export async function listDesktopMcpPendingChanges(): Promise<DesktopMcpChangeRecord[]> {
	return requireBridge().listMcpPendingChanges();
}

export async function approveDesktopMcpChange(
	changeId: string,
): Promise<DesktopMcpChangeRecord | null> {
	return requireBridge().approveMcpChange(changeId);
}

export async function approveAllDesktopMcpChanges(): Promise<DesktopMcpChangeRecord[]> {
	return requireBridge().approveAllMcpChanges();
}

export async function rejectDesktopMcpChange(
	changeId: string,
): Promise<DesktopMcpChangeRecord | null> {
	return requireBridge().rejectMcpChange(changeId);
}

export async function rejectAllDesktopMcpChanges(): Promise<DesktopMcpChangeRecord[]> {
	return requireBridge().rejectAllMcpChanges();
}

export async function minimizeDesktopWindow(): Promise<void> {
	return requireBridge().minimizeWindow();
}

export async function toggleDesktopWindowMaximize(): Promise<void> {
	return requireBridge().toggleWindowMaximize();
}

export async function closeDesktopWindow(): Promise<void> {
	return requireBridge().closeWindow();
}

export async function getDesktopWindowState(): Promise<DesktopWindowState> {
	return requireBridge().getWindowState();
}

export function onDesktopWindowStateChange(
	callback: (state: DesktopWindowState) => void,
): () => void {
	return requireBridge().onWindowStateChange(callback);
}
