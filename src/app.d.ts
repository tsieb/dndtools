/// <reference types="vite-plugin-pwa/client" />
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	interface DesktopMcpStatus {
		state: 'stopped' | 'running' | 'error';
		vaultDir: string | null;
		entry: string | null;
		runtimeSource: 'bundled_electron' | 'system_node' | null;
		runtimeVersion: string | null;
		pid: number | null;
		lastStartedAt: string | null;
		lastStoppedAt: string | null;
		lastExitReason: string | null;
		restartCount: number;
		crashCount: number;
		error: string | null;
	}

	interface DesktopUpdateStatus {
		enabled: boolean;
		state:
			| 'idle'
			| 'disabled'
			| 'checking'
			| 'up_to_date'
			| 'available'
			| 'deferred'
			| 'downloading'
			| 'downloaded'
			| 'error';
		currentVersion: string;
		latestVersion: string | null;
		releaseName: string | null;
		releaseDate: string | null;
		releaseNotes: string | null;
		downloadProgressPercent: number | null;
		downloadedBytes: number | null;
		totalBytes: number | null;
		lastCheckedAt: string | null;
		deferredUntil: string | null;
		stagedRollout: {
			active: boolean;
			reason: 'major' | 'not_major';
			eligible: boolean;
			cohortPercent: number;
			allowedPercent: number;
			dailyPercent: number;
			daysSinceRelease: number;
		} | null;
		message: string | null;
		error: string | null;
	}

	interface DesktopVaultPermissionReport {
		vaultDir: string;
		health: 'healthy' | 'read_only' | 'permission_denied' | 'unavailable' | 'error';
		readable: boolean;
		writable: boolean;
		available: boolean;
		remediation: string | null;
	}

	interface DesktopRecentVaultEntry extends DesktopVaultPermissionReport {
		lastOpenedAt: string;
		lastError: string | null;
	}

	interface DesktopVaultSwitchResult {
		ok: boolean;
		vaultDir: string | null;
		previousVaultDir: string | null;
		rollbackApplied: boolean;
		steps: Array<{
			id: 'permission_check' | 'open_target' | 'rollback';
			status: 'completed' | 'failed' | 'skipped';
			at: string;
			detail: string;
		}>;
		error: string | null;
		remediation: string | null;
	}

	interface DesktopEmbeddingStatus {
		available: boolean;
		model: string | null;
		models: string[];
		reason: string | null;
	}

	interface DesktopMcpLifecycleEvent {
		at: string;
		event: 'start' | 'stop' | 'restart' | 'crash';
		reason: string | null;
		pid: number | null;
	}

	interface DesktopStructuredErrorEvent {
		id: string;
		at: string;
		category: 'storage' | 'parsing' | 'ipc' | 'mcp_sidecar' | 'ui_runtime';
		code: string;
		message: string;
		severity: 'error' | 'warning' | 'info';
		recoveryHint: string | null;
		details: string | null;
		context: Record<string, string | number | boolean | null>;
	}

	type DesktopPerformanceOperation =
		| 'cold_start'
		| 'vault_open'
		| 'note_open'
		| 'search_response'
		| 'note_save'
		| 'graph_rebuild_incremental'
		| 'mcp_bundle_call';

	interface DesktopPerformanceSummary {
		operation: DesktopPerformanceOperation;
		label: string;
		description: string;
		targetMs: number;
		regressionThresholdMs: number;
		sampleCount: number;
		p50Ms: number | null;
		p95Ms: number | null;
		p99Ms: number | null;
		averageMs: number | null;
		maxMs: number | null;
		lastMs: number | null;
		lastAt: string | null;
		exceededBudgetCount: number;
	}

	interface DesktopPerformanceMeasurement {
		operation: DesktopPerformanceOperation;
		durationMs: number;
		at: string;
		source: 'renderer' | 'main' | 'mcp';
		context?: Record<string, string | number | boolean | null>;
		budgetMs: number;
		regressionThresholdMs: number;
		exceededBudget: boolean;
	}

	interface DesktopSystemHealth {
		generatedAt: string;
		lastSuccessful: {
			runtime_bootstrap: string | null;
			vault_sync: string | null;
			search_index: string | null;
			link_graph_build: string | null;
		};
		recentErrors: DesktopStructuredErrorEvent[];
		mcpStatus: DesktopMcpStatus;
		mcpLifecycle: DesktopMcpLifecycleEvent[];
		performance: {
			generatedAt: string;
			summaries: DesktopPerformanceSummary[];
			timeline: DesktopPerformanceMeasurement[];
		};
	}

	interface DesktopMcpChangeRecord {
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

	interface DesktopMcpPolicySettings {
		defaultPresetId: 'strict_review' | 'balanced' | 'trusted';
		perAgent: Record<string, 'strict_review' | 'balanced' | 'trusted'>;
	}

	interface DesktopIntegrityIssue {
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

	interface DesktopIntegrityReport {
		checkedAt: string;
		healthy: boolean;
		repairApplied: boolean;
		issues: DesktopIntegrityIssue[];
		noteIssues: Array<{
			noteId: string;
			filePath: string;
			status: 'missing_marker' | 'invalid_marker' | 'checksum_mismatch' | 'orphan_entry';
			details: string;
			repaired: boolean;
		}>;
		journalRecovery: {
			replayed: boolean;
			pendingEntries: number;
			recoveredAt: string | null;
		};
	}

	interface DesktopSafetySnapshot {
		id: string;
		createdAt: string;
		reason: string;
		noteCount: number;
		sizeBytes?: number;
	}

	interface DesktopSchemaMigrationFailure {
		step: string;
		file: string | null;
		message: string;
	}

	interface DesktopSchemaMigrationStepReport {
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

	interface DesktopMigrationCheckpoint {
		name: string;
		dirPath: string;
		createdAt: string;
		fileCount: number;
	}

	interface DesktopSchemaMigrationReport {
		startedAt: string;
		finishedAt: string;
		dryRun: boolean;
		upgradeRequired: boolean;
		upgradeApplied: boolean;
		rollbackApplied: boolean;
		/** True when the vault schema is newer than this app understands. Opening is refused. */
		vaultTooNew: boolean;
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

	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
	}

	interface Window {
		dndtoolsDesktop?: {
			getNote(
				id: import('$lib/types/note.js').NoteId,
			): Promise<import('$lib/types/note.js').Note | null>;
			getAllNotes(options?: {
				includeDeleted?: boolean;
			}): Promise<import('$lib/types/note.js').Note[]>;
			saveNote(note: import('$lib/types/note.js').Note): Promise<void>;
			deleteNote(id: import('$lib/types/note.js').NoteId, permanent?: boolean): Promise<void>;
			restoreNote(id: import('$lib/types/note.js').NoteId): Promise<void>;
			getNotesByFolder(
				folder: import('$lib/types/note.js').FolderId,
			): Promise<import('$lib/types/note.js').Note[]>;
			getNotesByTag(tag: string): Promise<import('$lib/types/note.js').Note[]>;
			getRecentNotes(limit: number): Promise<import('$lib/types/note.js').Note[]>;
			getDeletedNotes(): Promise<import('$lib/types/note.js').Note[]>;
			resolveTitle(title: string): Promise<import('$lib/types/note.js').Note | null>;
			getLinksFrom(
				noteId: import('$lib/types/note.js').NoteId,
			): Promise<import('$lib/types/note.js').Link[]>;
			getLinksTo(
				noteId: import('$lib/types/note.js').NoteId,
			): Promise<import('$lib/types/note.js').Link[]>;
			setLinksFrom(
				noteId: import('$lib/types/note.js').NoteId,
				links: import('$lib/types/note.js').Link[],
			): Promise<void>;
			getAllLinks(): Promise<import('$lib/types/note.js').Link[]>;
			getSessionBoards(): Promise<import('$lib/types/session-board.js').SessionBoard[]>;
			getSessionBoard(
				id: import('$lib/types/session-board.js').SessionBoardId,
			): Promise<import('$lib/types/session-board.js').SessionBoard | null>;
			saveSessionBoard(board: import('$lib/types/session-board.js').SessionBoard): Promise<void>;
			deleteSessionBoard(id: import('$lib/types/session-board.js').SessionBoardId): Promise<void>;
			suggestRelatedNotes(
				noteIds: import('$lib/types/note.js').NoteId[],
				limit?: number,
			): Promise<import('$lib/types/session-board.js').RelatedNoteSuggestion[]>;
			getObject(
				id: import('$lib/types/object.js').VaultObjectId,
			): Promise<import('$lib/types/object.js').VaultObject | null>;
			getAllObjects(options?: {
				type?: import('$lib/types/object.js').VaultObjectType;
				query?: string;
			}): Promise<import('$lib/types/object.js').VaultObject[]>;
			saveObject(object: import('$lib/types/object.js').VaultObject): Promise<void>;
			deleteObject(id: import('$lib/types/object.js').VaultObjectId): Promise<void>;
			getObjectRelationshipGraph(): Promise<import('$lib/types/object.js').ObjectRelationshipGraph>;
			lintObjects(): Promise<import('$lib/types/object.js').ObjectLintIssue[]>;
			getObjectHistory(
				id: import('$lib/types/object.js').VaultObjectId,
				options?: { limit?: number },
			): Promise<import('$lib/types/object.js').VaultObjectHistoryEntry[]>;
			revertObjectToHistory(
				id: import('$lib/types/object.js').VaultObjectId,
				historyEntryId: string,
			): Promise<import('$lib/types/object.js').VaultObject | null>;
			getSetting<K extends keyof import('$lib/types/settings.js').AppSettings>(
				key: K,
			): Promise<import('$lib/types/settings.js').AppSettings[K]>;
			setSetting<K extends keyof import('$lib/types/settings.js').AppSettings>(
				key: K,
				value: import('$lib/types/settings.js').AppSettings[K],
			): Promise<void>;
			getNoteTemplates(): Promise<import('$lib/types/template-library.js').NoteTemplate[]>;
			getReusableSnippets(): Promise<import('$lib/types/template-library.js').ReusableSnippet[]>;
			createSafetySnapshot(reason?: string): Promise<DesktopSafetySnapshot>;
			listSafetySnapshots(): Promise<DesktopSafetySnapshot[]>;
			restoreDeletedFromSnapshot(
				snapshotId: string,
			): Promise<{ restored: number; skipped: number }>;
			importNotes(
				notes: import('$lib/types/note.js').Note[],
			): Promise<import('$lib/types/storage.js').ImportResult>;
			exportAllNotes(): Promise<import('$lib/types/note.js').Note[]>;
			pickImportSourceDirectory(): Promise<{ sourceRoot: string } | null>;
			analyzeImportSource(request: {
				sourceRoot: string;
			}): Promise<import('$lib/types/import-export.js').ImportAnalysisReport>;
			startImportJob(request: {
				sourceRoot: string;
				defaultResolution: import('$lib/types/import-export.js').ImportResolutionChoice;
				resumeFromCheckpoint?: boolean;
			}): Promise<import('$lib/types/import-export.js').ImportJobProgress>;
			getImportJob(request: {
				jobId: string;
			}): Promise<import('$lib/types/import-export.js').ImportJobProgress | null>;
			getImportCheckpoint(): Promise<import('$lib/types/import-export.js').ImportCheckpointSummary>;
			resumeImportCheckpoint(): Promise<
				import('$lib/types/import-export.js').ImportJobProgress | null
			>;
			clearImportCheckpoint(): Promise<
				import('$lib/types/import-export.js').ImportCheckpointSummary
			>;
			exportMarkdownZip(request: {
				profile: import('$lib/types/import-export.js').ExportProfile;
				outputPath?: string;
			}): Promise<import('$lib/types/import-export.js').ExportZipResult>;
			importMapFromDialog(): Promise<
				| { canceled: true }
				| {
						canceled: false;
						filePath: string;
						fileUrl: string;
						byteSize: number;
						mimeType: string;
						name: string;
				  }
			>;
			resolveMapAssetUrl(relativePath: string): Promise<string | null>;
			getNoteCount(): Promise<number>;
			getTagCounts(): Promise<import('$lib/types/note.js').TagEntry[]>;
			refreshFromDisk(): Promise<void>;
			getIntegrityReport(): Promise<DesktopIntegrityReport>;
			repairIntegrity(): Promise<DesktopIntegrityReport>;
			rebuildVaultIndex(): Promise<{ rebuilt: number }>;
			clearMcpChangelog(options?: { maxAgeMs?: number }): Promise<{ removed: number }>;
			getSchemaMigrationReport(): Promise<DesktopSchemaMigrationReport>;
			runSchemaMigrations(options?: {
				dryRun?: boolean;
				createCheckpoint?: boolean;
			}): Promise<DesktopSchemaMigrationReport>;
			listMigrationCheckpoints(): Promise<DesktopMigrationCheckpoint[]>;
			restoreMigrationCheckpoint(checkpointName: string): Promise<{ restored: number }>;
			getBackendInfo(): Promise<{ backend: 'desktop-filesystem'; vaultDir: string }>;
			pickVaultDirectory(): Promise<DesktopVaultSwitchResult | null>;
			listRecentVaults(limit?: number): Promise<DesktopRecentVaultEntry[]>;
			getVaultPermissions(vaultDir?: string): Promise<DesktopVaultPermissionReport>;
			switchVault(vaultDir: string): Promise<DesktopVaultSwitchResult>;
			getMcpStatus(): Promise<DesktopMcpStatus>;
			getUpdateStatus(): Promise<DesktopUpdateStatus>;
			checkForUpdates(): Promise<DesktopUpdateStatus>;
			downloadUpdate(): Promise<DesktopUpdateStatus>;
			installUpdate(): Promise<DesktopUpdateStatus>;
			remindLaterUpdate(hours?: number): Promise<DesktopUpdateStatus>;
			getEmbeddingStatus(): Promise<DesktopEmbeddingStatus>;
			embedTexts(model: string, texts: string[]): Promise<number[][]>;
			restartMcpSidecar(): Promise<DesktopMcpStatus>;
			getDiagnosticsHealth(): Promise<DesktopSystemHealth>;
			markDiagnosticsSuccess(
				subsystem: 'runtime_bootstrap' | 'vault_sync' | 'search_index' | 'link_graph_build',
			): Promise<void>;
			recordDiagnosticsError(event: DesktopStructuredErrorEvent): Promise<void>;
			recordDiagnosticsPerformance(event: {
				operation: DesktopPerformanceOperation;
				durationMs: number;
				at?: string;
				source: 'renderer' | 'main' | 'mcp';
				context?: Record<string, string | number | boolean | null>;
			}): Promise<void>;
			exportDiagnosticsBundle(): Promise<{ canceled: boolean; path: string | null }>;
			refreshVault(): Promise<{ noteCount: number }>;
			listMcpPendingChanges(): Promise<DesktopMcpChangeRecord[]>;
			listMcpAuditTrail(limit?: number): Promise<DesktopMcpChangeRecord[]>;
			getMcpPolicySettings(): Promise<DesktopMcpPolicySettings>;
			setMcpPolicySettings(settings: DesktopMcpPolicySettings): Promise<DesktopMcpPolicySettings>;
			approveMcpChange(changeId: string): Promise<DesktopMcpChangeRecord | null>;
			approveAllMcpChanges(): Promise<DesktopMcpChangeRecord[]>;
			rejectMcpChange(changeId: string): Promise<DesktopMcpChangeRecord | null>;
			rejectAllMcpChanges(): Promise<DesktopMcpChangeRecord[]>;
			minimizeWindow(): Promise<void>;
			toggleWindowMaximize(): Promise<void>;
			closeWindow(): Promise<void>;
			getWindowState(): Promise<{ isMaximized: boolean }>;
			onWindowStateChange(callback: (state: { isMaximized: boolean }) => void): () => void;
		};
	}

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
