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
	lastStoppedAt: string | null;
	lastExitReason: string | null;
	restartCount: number;
	crashCount: number;
	error: string | null;
}

export interface DesktopMcpLifecycleEvent {
	at: string;
	event: 'start' | 'stop' | 'restart' | 'crash';
	reason: string | null;
	pid: number | null;
}

export interface DesktopSystemHealth {
	generatedAt: string;
	lastSuccessful: {
		runtime_bootstrap: string | null;
		vault_sync: string | null;
		search_index: string | null;
		link_graph_build: string | null;
	};
	recentErrors: Array<{
		id: string;
		at: string;
		category: 'storage' | 'parsing' | 'ipc' | 'mcp_sidecar' | 'ui_runtime';
		code: string;
		message: string;
		severity: 'error' | 'warning' | 'info';
		details: string | null;
		context: Record<string, string | number | boolean | null>;
	}>;
	mcpStatus: DesktopMcpStatus;
	mcpLifecycle: DesktopMcpLifecycleEvent[];
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
		semantic: {
			titleChanged: boolean;
			folderChanged: boolean;
			tagsChanged: boolean;
			frontmatterChanged: boolean;
			deletedStateChanged: boolean;
			structural: boolean;
		};
		linkImpact: {
			added: number;
			removed: number;
			addedTargets: string[];
			removedTargets: string[];
		};
	};
	agentId?: string;
	conflict?: {
		reason:
			| 'target_missing'
			| 'target_exists'
			| 'target_changed_since_stage'
			| 'target_already_deleted';
		details: string;
		detectedAt: string;
	} | null;
	policy?: {
		presetId: 'strict_review' | 'balanced' | 'trusted';
		decision: 'pending_review' | 'auto_approved';
		reason: string;
	};
	audit?: Array<{
		at: string;
		actor: string;
		action: 'staged' | 'approved' | 'rejected' | 'auto_approved' | 'conflict_blocked';
		reason: string;
		notes?: string;
	}>;
}

export interface DesktopMcpPolicySettings {
	defaultPresetId: 'strict_review' | 'balanced' | 'trusted';
	perAgent: Record<string, 'strict_review' | 'balanced' | 'trusted'>;
}

export interface DesktopWindowState {
	isMaximized: boolean;
}

export interface DesktopIntegrityIssue {
	file:
		| 'index.json'
		| 'settings.json'
		| 'session-boards.json'
		| 'objects.json'
		| 'object-history.json'
		| 'mcp-changelog.json';
	status: 'ok' | 'missing' | 'invalid_json' | 'invalid_shape';
	repaired: boolean;
	details: string | null;
}

export interface DesktopIntegrityReport {
	checkedAt: string;
	healthy: boolean;
	repairApplied: boolean;
	issues: DesktopIntegrityIssue[];
	noteIssues: Array<{
		noteId: string;
		filePath: string;
		status: 'missing_marker' | 'invalid_marker' | 'checksum_mismatch';
		details: string;
		repaired: boolean;
	}>;
	journalRecovery: {
		replayed: boolean;
		pendingEntries: number;
		recoveredAt: string | null;
	};
}

export interface DesktopSafetySnapshot {
	id: string;
	createdAt: string;
	reason: string;
	noteCount: number;
}

export interface DesktopSnapshotRestoreResult {
	restored: number;
	skipped: number;
}

export interface DesktopSchemaMigrationFailure {
	step: string;
	file: string | null;
	message: string;
}

export interface DesktopSchemaMigrationStepReport {
	id: 'metadata_v1_to_v2' | 'notes_v1_to_v2' | 'objects_v1_to_v2';
	description: string;
	fromVersion: number;
	toVersion: number;
	pending: number;
	applied: number;
	changedFiles: string[];
	warnings: string[];
	failures: DesktopSchemaMigrationFailure[];
}

export interface DesktopSchemaMigrationReport {
	startedAt: string;
	finishedAt: string;
	dryRun: boolean;
	upgradeRequired: boolean;
	upgradeApplied: boolean;
	rollbackApplied: boolean;
	checkpointDir: string | null;
	from: {
		notes: number;
		objects: number;
		metadata: number;
	};
	to: {
		notes: number;
		objects: number;
		metadata: number;
	};
	changedFiles: string[];
	warnings: string[];
	failures: DesktopSchemaMigrationFailure[];
	steps: DesktopSchemaMigrationStepReport[];
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

export async function getDesktopSystemHealth(): Promise<DesktopSystemHealth> {
	return requireBridge().getDiagnosticsHealth();
}

export async function markDesktopSubsystemSuccess(
	subsystem: 'runtime_bootstrap' | 'vault_sync' | 'search_index' | 'link_graph_build',
): Promise<void> {
	if (!window.dndtoolsDesktop) return;
	await window.dndtoolsDesktop.markDiagnosticsSuccess(subsystem);
}

export async function reportDesktopStructuredError(event: {
	id: string;
	at: string;
	category: 'storage' | 'parsing' | 'ipc' | 'mcp_sidecar' | 'ui_runtime';
	code: string;
	message: string;
	severity: 'error' | 'warning' | 'info';
	details: string | null;
	context: Record<string, string | number | boolean | null>;
}): Promise<void> {
	if (!window.dndtoolsDesktop) return;
	await window.dndtoolsDesktop.recordDiagnosticsError(event);
}

export async function exportDesktopDiagnosticsBundle(): Promise<{
	canceled: boolean;
	path: string | null;
}> {
	return requireBridge().exportDiagnosticsBundle();
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

export async function getDesktopSchemaMigrationReport(): Promise<DesktopSchemaMigrationReport> {
	return requireBridge().getSchemaMigrationReport();
}

export async function runDesktopSchemaMigrations(options?: {
	dryRun?: boolean;
	createCheckpoint?: boolean;
}): Promise<DesktopSchemaMigrationReport> {
	return requireBridge().runSchemaMigrations(options);
}

export async function createDesktopSafetySnapshot(reason?: string): Promise<DesktopSafetySnapshot> {
	return requireBridge().createSafetySnapshot(reason);
}

export async function listDesktopSafetySnapshots(): Promise<DesktopSafetySnapshot[]> {
	return requireBridge().listSafetySnapshots();
}

export async function restoreDeletedFromDesktopSnapshot(
	snapshotId: string,
): Promise<DesktopSnapshotRestoreResult> {
	return requireBridge().restoreDeletedFromSnapshot(snapshotId);
}

export async function listDesktopMcpPendingChanges(): Promise<DesktopMcpChangeRecord[]> {
	return requireBridge().listMcpPendingChanges();
}

export async function listDesktopMcpAuditTrail(limit?: number): Promise<DesktopMcpChangeRecord[]> {
	return requireBridge().listMcpAuditTrail(limit);
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

export async function getDesktopMcpPolicySettings(): Promise<DesktopMcpPolicySettings> {
	return requireBridge().getMcpPolicySettings();
}

export async function setDesktopMcpPolicySettings(
	settings: DesktopMcpPolicySettings,
): Promise<DesktopMcpPolicySettings> {
	return requireBridge().setMcpPolicySettings(settings);
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
