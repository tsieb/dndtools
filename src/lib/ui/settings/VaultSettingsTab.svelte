<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { resolve } from '$app/paths';
	import Button from '$lib/ui/common/Button.svelte';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { vaultState } from '$lib/state/vault.svelte.js';
	import { linksState } from '$lib/state/links.svelte.js';
	import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
	import { vaultHealthState } from '$lib/state/vaultHealth.svelte.js';
	import { navigationState } from '$lib/state/navigation.svelte.js';
	import { settingsStorageState } from '$lib/state/settings-storage.svelte.js';
	import { reportRuntimeError, markSubsystemSuccess } from '$lib/runtime/diagnostics.js';
	import { searchService } from '$lib/domain/search.js';
	import { buildVaultUnresolvedLinkReport } from '$lib/domain/unresolved-links.js';
	import { buildLinkGraphQualityReport } from '$lib/domain/link-graph-intelligence.js';
	import {
		buildNotesExportPayload,
		exportAllNotes,
		parseMarkdownFile,
		parseJsonBundle,
	} from '$lib/domain/export.js';
	import type { Note } from '$lib/types/note.js';
	import type { SafetySnapshot } from '$lib/types/storage.js';
	import type { AppSettings } from '$lib/types/settings.js';
	import { createFolderId } from '$lib/types/note.js';
	import { createNewNote } from '$lib/utils/note-factory.js';
	import {
		DEFAULT_MOBILE_VAULT_ROOT,
		MOBILE_VAULT_ROOT_STORAGE_KEY,
		normalizeMobileVaultRoot,
	} from '$lib/platform/mobile-vault-root.js';
	import {
		pickImportFilesViaFileSystemAccess,
		saveTextFileViaFileSystemAccess,
		supportsOpenFilePicker,
		supportsSaveFilePicker,
	} from '$lib/platform/browser/file-system-access.js';
	import {
		pickDesktopVaultDirectory,
		listDesktopRecentVaults,
		getDesktopVaultPermissions,
		switchDesktopVault,
		repairDesktopIntegrity,
		getDesktopIntegrityReport,
		pickDesktopImportSourceDirectory,
		analyzeDesktopImportSource,
		startDesktopImportJob,
		getDesktopImportJob,
		getDesktopImportCheckpoint,
		resumeDesktopImportCheckpoint,
		clearDesktopImportCheckpoint,
		exportDesktopMarkdownZip,
		type DesktopIntegrityReport,
		type DesktopRecentVaultEntry,
		type DesktopVaultPermissionReport,
		type DesktopVaultSwitchResult,
		type DesktopImportAnalysisReport,
		type DesktopImportCheckpointSummary,
		type DesktopImportJobProgress,
		type DesktopImportResolutionChoice,
		type DesktopExportZipResult,
	} from '$lib/platform/desktop/bridge.js';

	interface Props {
		desktopVaultDir: string;
		refreshingDesktopState: boolean;
		rebuildingIndex: boolean;
		onrefreshdesktopstate: () => Promise<void>;
		onrebuildindex: () => Promise<void>;
	}

	let {
		desktopVaultDir,
		refreshingDesktopState,
		rebuildingIndex,
		onrefreshdesktopstate,
		onrebuildindex,
	}: Props = $props();

	type LinkQualityDrilldownKey = 'broken' | 'alias' | 'loops' | 'cross_folder' | 'orphans' | 'hubs';

	// Vault state
	let integrityReport = $state<DesktopIntegrityReport | null>(null);
	let recentVaults = $state<DesktopRecentVaultEntry[]>([]);
	let currentVaultPermissions = $state<DesktopVaultPermissionReport | null>(null);
	let loadingRecentVaults = $state(false);
	let checkingVaultPermissions = $state(false);
	let repairingIntegrity = $state(false);
	let switchingVault = $state(false);
	let latestVaultSwitch = $state<DesktopVaultSwitchResult | null>(null);
	let mobileVaultRootInput = $state(DEFAULT_MOBILE_VAULT_ROOT);

	// Link health
	let creatingMissingLinkNotes = $state(false);
	let linkQualityDrilldown = $state<LinkQualityDrilldownKey>('broken');

	// Snapshots / backup
	let backupCadence = $state<AppSettings['backupCadence']>('daily');
	let backupRetentionCount = $state(20);
	let savingBackupSettings = $state(false);
	let creatingSnapshot = $state(false);
	let restoringSnapshot = $state(false);
	let safetySnapshots = $state<SafetySnapshot[]>([]);
	let selectedSnapshotId = $state<string>('');

	// Import
	let analyzingImportSource = $state(false);
	let importAnalysisReport = $state<DesktopImportAnalysisReport | null>(null);
	let importDefaultResolution = $state<DesktopImportResolutionChoice>('merge');
	let importJob = $state<DesktopImportJobProgress | null>(null);
	let importCheckpoint = $state<DesktopImportCheckpointSummary | null>(null);
	let resumingImportCheckpoint = $state(false);
	let clearingImportCheckpointState = $state(false);
	let importPollTimer: ReturnType<typeof setInterval> | null = null;

	// Export
	let exportingPortableZip = $state(false);
	let exportingDeterministicZip = $state(false);
	let latestExportReport = $state<DesktopExportZipResult | null>(null);

	// Blocking overlay
	let showBlockingOverlay = $state(false);
	let blockingOverlayTimer = $state<ReturnType<typeof setTimeout> | null>(null);

	const blockingOperationLabel = $derived.by(() => {
		if (analyzingImportSource) return 'Analyzing import source...';
		if (importJob?.status === 'running') return 'Importing vault files...';
		if (resumingImportCheckpoint) return 'Resuming vault import...';
		if (switchingVault) return 'Switching vault...';
		return null;
	});

	$effect(() => {
		if (!blockingOperationLabel) {
			if (blockingOverlayTimer) clearTimeout(blockingOverlayTimer);
			blockingOverlayTimer = null;
			showBlockingOverlay = false;
			return;
		}
		if (showBlockingOverlay) return;
		blockingOverlayTimer = setTimeout(() => {
			showBlockingOverlay = true;
			blockingOverlayTimer = null;
		}, 300);
		return () => {
			if (blockingOverlayTimer) {
				clearTimeout(blockingOverlayTimer);
				blockingOverlayTimer = null;
			}
		};
	});

	// Derived link quality
	const vaultLinkQualityReport = $derived.by(() =>
		buildLinkGraphQualityReport({ notes: notesState.activeNotes }),
	);
	const vaultHubNoteIds = $derived(linksState.getHubNoteIds());
	const vaultOrphanNoteIds = $derived(linksState.getOrphanNoteIds());
	const linkQualityDrilldownNoteIds = $derived.by(() => {
		switch (linkQualityDrilldown) {
			case 'broken':
				return vaultLinkQualityReport.drilldown.brokenLinkNoteIds;
			case 'alias':
				return vaultLinkQualityReport.drilldown.aliasMatchedNoteIds;
			case 'loops':
				return vaultLinkQualityReport.drilldown.loopNoteIds;
			case 'cross_folder':
				return vaultLinkQualityReport.drilldown.crossFolderNoteIds;
			case 'orphans':
				return vaultOrphanNoteIds;
			case 'hubs':
				return vaultHubNoteIds;
		}
	});
	const linkQualityDrilldownLabel = $derived.by(() => {
		switch (linkQualityDrilldown) {
			case 'broken':
				return 'Broken-link source notes';
			case 'alias':
				return 'Alias-matched link notes';
			case 'loops':
				return 'Loop-connected notes';
			case 'cross_folder':
				return 'Cross-folder linked notes';
			case 'orphans':
				return 'Orphan notes';
			case 'hubs':
				return 'Hub notes';
		}
	});
	const vaultUnresolvedLinkIssues = $derived(
		buildVaultUnresolvedLinkReport(notesState.activeNotes).slice(0, 80),
	);
	const creatableVaultUnresolvedTitles = $derived(
		[
			...new Set(
				vaultUnresolvedLinkIssues
					.filter((issue) => issue.targetKind === 'title')
					.map((issue) => issue.targetLabel.trim())
					.filter((title) => title.length > 0),
			),
		].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
	);

	function hasDesktopBridge(): boolean {
		return typeof window !== 'undefined' && !!window.dndtoolsDesktop;
	}

	onMount(() => {
		loadMobileVaultRootPreference();
		if (hasDesktopBridge()) {
			void loadIntegrityReport();
			void loadRecentVaults();
			void loadCurrentVaultPermissions();
		}
		void loadBackupSettings();
		void loadSafetySnapshots();
		void loadImportCheckpointSummary();
	});

	onDestroy(() => {
		stopImportPolling();
	});

	function loadMobileVaultRootPreference(): void {
		if (typeof window === 'undefined' || hasDesktopBridge()) return;
		const stored = window.localStorage.getItem(MOBILE_VAULT_ROOT_STORAGE_KEY);
		mobileVaultRootInput = normalizeMobileVaultRoot(stored ?? DEFAULT_MOBILE_VAULT_ROOT);
	}

	function saveMobileVaultRootPreference(): void {
		if (typeof window === 'undefined' || hasDesktopBridge()) return;
		const next = normalizeMobileVaultRoot(mobileVaultRootInput);
		window.localStorage.setItem(MOBILE_VAULT_ROOT_STORAGE_KEY, next);
		mobileVaultRootInput = next;
		toastState.success('Android vault directory saved. Restart the app to apply.');
	}

	async function loadIntegrityReport(): Promise<void> {
		try {
			integrityReport = await getDesktopIntegrityReport();
		} catch (error) {
			integrityReport = null;
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_LOAD_INTEGRITY_REPORT_FAILED',
				error,
				context: { route: '/settings' },
			});
		}
	}

	async function loadRecentVaults(): Promise<void> {
		if (!hasDesktopBridge()) {
			recentVaults = [];
			return;
		}
		loadingRecentVaults = true;
		try {
			recentVaults = await listDesktopRecentVaults(8);
		} catch (error) {
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_RECENT_VAULTS_FAILED',
				error,
				context: { route: '/settings' },
			});
			recentVaults = [];
		} finally {
			loadingRecentVaults = false;
		}
	}

	async function loadCurrentVaultPermissions(): Promise<void> {
		if (!hasDesktopBridge()) {
			currentVaultPermissions = null;
			return;
		}
		checkingVaultPermissions = true;
		try {
			currentVaultPermissions = await getDesktopVaultPermissions();
		} catch (error) {
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_VAULT_PERMISSION_CHECK_FAILED',
				error,
				context: { route: '/settings' },
			});
			currentVaultPermissions = null;
		} finally {
			checkingVaultPermissions = false;
		}
	}

	async function handleRepairIntegrity(): Promise<void> {
		repairingIntegrity = true;
		try {
			const repaired = await repairDesktopIntegrity();
			integrityReport = repaired;
			await Promise.all([
				notesState.loadAll(),
				searchService.buildIndex(notesState.notes),
				mcpChangesState.refresh(),
			]);
			await Promise.all([
				markSubsystemSuccess('vault_sync'),
				markSubsystemSuccess('search_index'),
				markSubsystemSuccess('link_graph_build'),
			]);
			navigationState.reset(resolve('/settings'), { label: 'Settings' });
			await onrefreshdesktopstate();
			await vaultHealthState.refresh();
			if (repaired.issues.length === 0 && repaired.noteIssues.length === 0) {
				toastState.success('Metadata integrity is healthy');
				return;
			}
			const repairedCount = repaired.issues.filter((issue) => issue.repaired).length;
			toastState.success(
				`Repaired ${repairedCount} metadata file${repairedCount === 1 ? '' : 's'}`,
			);
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_REPAIR_INTEGRITY_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to repair metadata integrity: ${String(error)}`);
		} finally {
			repairingIntegrity = false;
		}
	}

	async function applyVaultSwitchResult(result: DesktopVaultSwitchResult): Promise<void> {
		latestVaultSwitch = result;
		if (!result.ok || !result.vaultDir) {
			const remediation = result.remediation ? ` ${result.remediation}` : '';
			toastState.error(`Vault switch failed: ${result.error ?? 'Unknown error.'}${remediation}`);
			await Promise.all([loadRecentVaults(), loadCurrentVaultPermissions()]);
			return;
		}

		await notesState.loadAll();
		await Promise.all([
			searchService.buildIndex(notesState.notes),
			onrefreshdesktopstate(),
			mcpChangesState.refresh(),
			loadIntegrityReport(),
			loadRecentVaults(),
			loadCurrentVaultPermissions(),
		]);
		await Promise.all([
			markSubsystemSuccess('vault_sync'),
			markSubsystemSuccess('search_index'),
			markSubsystemSuccess('link_graph_build'),
		]);
		navigationState.reset(resolve('/settings'), { label: 'Settings' });
		toastState.success(
			result.rollbackApplied
				? 'Switched vault with automatic rollback safeguards.'
				: 'Switched vault folder.',
		);
	}

	async function handleChangeDesktopVault(): Promise<void> {
		switchingVault = true;
		try {
			const result = await pickDesktopVaultDirectory();
			if (!result) return;
			await applyVaultSwitchResult(result);
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_SWITCH_VAULT_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to switch vault folder: ${String(error)}`);
		} finally {
			switchingVault = false;
		}
	}

	async function handleSwitchToRecentVault(vaultDir: string): Promise<void> {
		switchingVault = true;
		try {
			const result = await switchDesktopVault(vaultDir);
			await applyVaultSwitchResult(result);
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_SWITCH_RECENT_VAULT_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to switch vault folder: ${String(error)}`);
		} finally {
			switchingVault = false;
		}
	}

	async function handleCreateAllMissingLinkNotes(): Promise<void> {
		if (creatableVaultUnresolvedTitles.length === 0) return;
		creatingMissingLinkNotes = true;
		let created = 0;
		let skipped = 0;
		try {
			for (const title of creatableVaultUnresolvedTitles) {
				if (notesState.resolveTitleCandidates(title).length > 0) {
					skipped += 1;
					continue;
				}
				await notesState.createNote({ title, content: `# ${title}\n` });
				created += 1;
			}
			if (created > 0) {
				await Promise.all([
					markSubsystemSuccess('vault_sync'),
					markSubsystemSuccess('search_index'),
					markSubsystemSuccess('link_graph_build'),
				]);
			}
			await vaultHealthState.refresh();
			if (created === 0) {
				toastState.success('No missing link targets required creation');
			} else {
				toastState.success(
					`Created ${created} note${created === 1 ? '' : 's'} from unresolved links${skipped > 0 ? ` (${skipped} skipped)` : ''}`,
				);
			}
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_CREATE_MISSING_LINK_NOTES_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to create missing link notes: ${String(error)}`);
		} finally {
			creatingMissingLinkNotes = false;
		}
	}

	async function loadBackupSettings(): Promise<void> {
		try {
			const settings = await settingsStorageState.getBackupSettings();
			backupCadence = settings.cadence;
			backupRetentionCount = settings.retentionCount;
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_LOAD_BACKUP_SETTINGS_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to load backup settings: ${String(error)}`);
		}
	}

	async function saveBackupSettings(): Promise<void> {
		savingBackupSettings = true;
		try {
			const settings = await settingsStorageState.saveBackupSettings({
				cadence: backupCadence,
				retentionCount: backupRetentionCount,
			});
			backupRetentionCount = settings.retentionCount;
			toastState.success('Backup settings saved');
			await loadSafetySnapshots();
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_SAVE_BACKUP_SETTINGS_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to save backup settings: ${String(error)}`);
		} finally {
			savingBackupSettings = false;
		}
	}

	async function loadSafetySnapshots(): Promise<void> {
		try {
			const snapshots = await settingsStorageState.listSafetySnapshots();
			safetySnapshots = snapshots;
			if (!selectedSnapshotId && snapshots.length > 0) {
				selectedSnapshotId = snapshots[0]!.id;
			}
		} catch (error) {
			safetySnapshots = [];
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_LOAD_SNAPSHOTS_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to load safety snapshots: ${String(error)}`);
		}
	}

	async function createSafetySnapshot(reason: string): Promise<void> {
		creatingSnapshot = true;
		try {
			await settingsStorageState.createSafetySnapshot(reason);
			await loadSafetySnapshots();
			toastState.success('Created safety snapshot');
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_CREATE_SNAPSHOT_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to create snapshot: ${String(error)}`);
		} finally {
			creatingSnapshot = false;
		}
	}

	async function handleRestoreDeletedFromSnapshot(): Promise<void> {
		if (!selectedSnapshotId) return;
		restoringSnapshot = true;
		try {
			const result = await settingsStorageState.restoreDeletedFromSnapshot(selectedSnapshotId);
			await Promise.all([notesState.loadAll(), searchService.buildIndex(notesState.notes)]);
			await Promise.all([
				markSubsystemSuccess('vault_sync'),
				markSubsystemSuccess('search_index'),
				markSubsystemSuccess('link_graph_build'),
			]);
			toastState.success(
				`Restored ${result.restored} note${result.restored === 1 ? '' : 's'} from snapshot`,
			);
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_RESTORE_FROM_SNAPSHOT_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to restore notes from snapshot: ${String(error)}`);
		} finally {
			restoringSnapshot = false;
		}
	}

	async function handleEmptyTrash(): Promise<void> {
		const deletedIds = notesState.deletedNotes.map((note) => note.id);
		if (deletedIds.length === 0) return;
		await createSafetySnapshot('before-mass-delete');
		await notesState.permanentDeleteMany(deletedIds);
		toastState.success(
			`Permanently deleted ${deletedIds.length} ${deletedIds.length === 1 ? 'note' : 'notes'} from trash`,
		);
	}

	async function handleExportAll(): Promise<void> {
		const payload = await buildNotesExportPayload(notesState.activeNotes);
		if (!payload) {
			toastState.error('No notes available to export.');
			return;
		}
		if (supportsSaveFilePicker()) {
			try {
				const saved = await saveTextFileViaFileSystemAccess({
					suggestedName: payload.filename,
					content: payload.content,
					mimeType: payload.mimeType,
					description: payload.mimeType === 'application/zip' ? 'Markdown archive' : 'Markdown export',
					extensions:
						payload.mimeType === 'application/zip' ? ['.zip'] : ['.md', '.markdown'],
				});
				if (saved) {
					const warningSuffix =
						payload.validation && payload.validation.issues.length > 0
							? ` (${payload.validation.issues.length} validation warnings)`
							: '';
					toastState.success(`Exported ${vaultState.noteCount} notes${warningSuffix}`);
				}
				return;
			} catch (error) {
				void reportRuntimeError({
					category: 'storage',
					code: 'SETTINGS_EXPORT_SAVE_PICKER_FAILED',
					error,
					context: { route: '/settings' },
				});
				toastState.error(`Failed to write export file: ${String(error)}`);
				return;
			}
		}
		await exportAllNotes();
		const warningSuffix =
			payload.validation && payload.validation.issues.length > 0
				? ` (${payload.validation.issues.length} validation warnings)`
				: '';
		toastState.success(`Exported ${vaultState.noteCount} notes${warningSuffix}`);
	}

	function stopImportPolling(): void {
		if (importPollTimer) {
			clearInterval(importPollTimer);
			importPollTimer = null;
		}
	}

	async function loadImportCheckpointSummary(): Promise<void> {
		if (!window.dndtoolsDesktop) {
			importCheckpoint = null;
			return;
		}
		try {
			importCheckpoint = await getDesktopImportCheckpoint();
		} catch (error) {
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_IMPORT_CHECKPOINT_LOAD_FAILED',
				error,
				context: { route: '/settings' },
			});
			importCheckpoint = null;
		}
	}

	async function refreshImportJobProgress(jobId: string): Promise<void> {
		try {
			const latest = await getDesktopImportJob({ jobId });
			if (!latest) {
				stopImportPolling();
				return;
			}
			const previousStatus = importJob?.status ?? null;
			importJob = latest;
			if (latest.status === 'completed' && previousStatus !== 'completed') {
				stopImportPolling();
				await Promise.all([notesState.loadAll(), searchService.buildIndex(notesState.notes)]);
				await Promise.all([
					markSubsystemSuccess('vault_sync'),
					markSubsystemSuccess('search_index'),
					markSubsystemSuccess('link_graph_build'),
				]);
				await loadImportCheckpointSummary();
				toastState.success(
					`Import completed: ${latest.imported} imported, ${latest.overwritten} overwritten, ${latest.merged} merged, ${latest.skipped} skipped.`,
				);
			} else if (latest.status === 'failed' && previousStatus !== 'failed') {
				stopImportPolling();
				await loadImportCheckpointSummary();
				toastState.error(latest.lastError ?? 'Import failed. Resume is available from checkpoint.');
			}
		} catch (error) {
			stopImportPolling();
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_IMPORT_JOB_POLL_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to poll import job status: ${String(error)}`);
		}
	}

	function startImportPolling(jobId: string): void {
		stopImportPolling();
		importPollTimer = setInterval(() => {
			void refreshImportJobProgress(jobId);
		}, 700);
	}

	async function handleAnalyzeImportSource(): Promise<void> {
		if (!window.dndtoolsDesktop) {
			toastState.error('Desktop import analyzer is only available in Electron mode.');
			return;
		}
		analyzingImportSource = true;
		try {
			const picked = await pickDesktopImportSourceDirectory();
			if (!picked) return;
			importAnalysisReport = await analyzeDesktopImportSource({ sourceRoot: picked.sourceRoot });
			importDefaultResolution = importAnalysisReport.stats.errors > 0 ? 'skip' : 'merge';
			toastState.success(
				`Analyzed ${importAnalysisReport.markdownFiles} markdown files (${importAnalysisReport.issues.length} issues).`,
			);
		} catch (error) {
			void reportRuntimeError({
				category: 'parsing',
				code: 'SETTINGS_IMPORT_ANALYZE_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to analyze import source: ${String(error)}`);
		} finally {
			analyzingImportSource = false;
		}
	}

	async function handleStartAnalyzedImport(): Promise<void> {
		if (!window.dndtoolsDesktop || !importAnalysisReport) return;
		try {
			const started = await startDesktopImportJob({
				sourceRoot: importAnalysisReport.sourceRoot,
				defaultResolution: importDefaultResolution,
				resumeFromCheckpoint: false,
			});
			importJob = started;
			startImportPolling(started.jobId);
			toastState.success(
				started.totalFiles > 500
					? 'Large import started in background.'
					: 'Import started. Progress will update automatically.',
			);
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_IMPORT_START_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to start import: ${String(error)}`);
		}
	}

	async function handleResumeImportFromCheckpoint(): Promise<void> {
		if (!window.dndtoolsDesktop || !importCheckpoint?.exists) return;
		resumingImportCheckpoint = true;
		try {
			const resumed = await resumeDesktopImportCheckpoint();
			if (!resumed) {
				toastState.error('No resumable checkpoint found.');
				await loadImportCheckpointSummary();
				return;
			}
			importJob = resumed;
			startImportPolling(resumed.jobId);
			toastState.success('Resumed import from checkpoint.');
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_IMPORT_RESUME_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to resume import: ${String(error)}`);
		} finally {
			resumingImportCheckpoint = false;
		}
	}

	async function handleClearImportCheckpoint(): Promise<void> {
		if (!window.dndtoolsDesktop) return;
		clearingImportCheckpointState = true;
		try {
			importCheckpoint = await clearDesktopImportCheckpoint();
			toastState.success('Cleared import checkpoint.');
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_IMPORT_CLEAR_CHECKPOINT_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to clear checkpoint: ${String(error)}`);
		} finally {
			clearingImportCheckpointState = false;
		}
	}

	async function handleExportMarkdownZip(
		profile: 'portable_markdown_zip' | 'deterministic_markdown_zip',
	): Promise<void> {
		if (!window.dndtoolsDesktop) {
			toastState.error('Markdown ZIP export is only available in Electron mode.');
			return;
		}
		if (profile === 'portable_markdown_zip') {
			exportingPortableZip = true;
		} else {
			exportingDeterministicZip = true;
		}
		try {
			const result = await exportDesktopMarkdownZip({ profile });
			latestExportReport = result;
			if (result.canceled) return;
			const warningSuffix =
				result.validation.issues.length > 0
					? ` (${result.validation.issues.length} validation warnings)`
					: '';
			toastState.success(
				`Exported ${result.noteCount} notes and ${result.assetCount} assets to ZIP${warningSuffix}.`,
			);
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_EXPORT_ZIP_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to export markdown ZIP: ${String(error)}`);
		} finally {
			exportingPortableZip = false;
			exportingDeterministicZip = false;
		}
	}

	async function importFiles(files: File[]): Promise<void> {
		const parsedNotes: Note[] = [];
		const importErrors: string[] = [];

		for (const file of files) {
			try {
				const content = await file.text();
				if (file.name.endsWith('.json')) {
					const notes = parseJsonBundle(content);
					for (const partial of notes) {
						parsedNotes.push(
							createNewNote({
								title: partial.title ?? 'Imported',
								content: partial.content ?? '',
								tags: partial.tags ?? [],
								folder: partial.folder
									? createFolderId(String(partial.folder))
									: createFolderId('/'),
								frontmatter: { ...(partial.frontmatter ?? {}) },
							}),
						);
					}
					continue;
				}
				const partial = parseMarkdownFile(content, file.name);
				const folder = partial.folder
					? createFolderId(String(partial.folder))
					: createFolderId('/');
				parsedNotes.push(
					createNewNote({
						title: partial.title ?? 'Imported',
						content: partial.content ?? '',
						tags: partial.tags ?? [],
						folder,
						frontmatter: { ...(partial.frontmatter ?? {}) },
					}),
				);
			} catch (error) {
				importErrors.push(`Failed to import "${file.name}": ${String(error)}`);
			}
		}

		if (parsedNotes.length === 0) {
			for (const message of importErrors) {
				toastState.error(message);
			}
			return;
		}

		try {
			await settingsStorageState.createSafetySnapshot('before-import');
			const result = await settingsStorageState.importNotes(parsedNotes);
			await notesState.loadAll();
			await searchService.buildIndex(notesState.notes);
			await Promise.all([
				markSubsystemSuccess('vault_sync'),
				markSubsystemSuccess('search_index'),
				markSubsystemSuccess('link_graph_build'),
			]);
			if (result.errors.length > 0) {
				importErrors.push(...result.errors);
			}
			if (result.imported > 0) {
				toastState.success(
					`Imported ${result.imported} ${result.imported === 1 ? 'note' : 'notes'}`,
				);
			}
		} catch (error) {
			void reportRuntimeError({
				category: 'parsing',
				code: 'SETTINGS_IMPORT_NOTES_FAILED',
				error,
				context: { route: '/settings' },
			});
			importErrors.push(`Failed to import notes: ${String(error)}`);
		}

		for (const message of importErrors) {
			toastState.error(message);
		}
	}

	async function handleImportFiles(): Promise<void> {
		if (supportsOpenFilePicker()) {
			try {
				const files = await pickImportFilesViaFileSystemAccess();
				if (files && files.length > 0) {
					await importFiles(files);
				}
				return;
			} catch (error) {
				void reportRuntimeError({
					category: 'storage',
					code: 'SETTINGS_IMPORT_PICKER_FAILED',
					error,
					context: { route: '/settings' },
				});
				toastState.error(`Failed to pick files for import: ${String(error)}`);
				return;
			}
		}
		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = true;
		input.accept = '.md,.markdown,.json';
		input.onchange = async () => {
			if (!input.files?.length) return;
			await importFiles(Array.from(input.files));
		};
		input.click();
	}
</script>

<div
	role="tabpanel"
	id="settings-panel-vault"
	aria-labelledby="settings-tab-vault"
	class="space-y-8"
>
	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">Vault</h2>
		<div class="rounded-lg border border-border bg-surface p-4">
			<div class="grid grid-cols-3 gap-4 text-center mb-4">
				<div>
					<div class="text-2xl font-bold text-accent">
						{vaultState.noteCount}
					</div>
					<div class="text-xs text-ink-muted">Notes</div>
				</div>
				<div>
					<div class="text-2xl font-bold text-accent">
						{vaultState.tagCounts.length}
					</div>
					<div class="text-xs text-ink-muted">Tags</div>
				</div>
				<div>
					<div class="text-2xl font-bold text-accent">
						{notesState.deletedNotes.length}
					</div>
					<div class="text-xs text-ink-muted">In Trash</div>
				</div>
			</div>

			{#if notesState.deletedNotes.length > 0}
				<div class="pt-3 border-t border-border">
					<Button variant="danger" size="sm" onclick={handleEmptyTrash}>
						Empty Trash ({notesState.deletedNotes.length})
					</Button>
				</div>
			{/if}

			<div class="pt-3 border-t border-border">
				{#if hasDesktopBridge()}
					<p class="text-xs text-ink-muted">Desktop Vault Folder</p>
					<p class="text-xs font-mono text-ink-faint break-all mt-1">
						{desktopVaultDir || (refreshingDesktopState ? 'Loading...' : 'Unavailable')}
					</p>
					<div class="mt-2 flex items-center gap-2">
						{#if currentVaultPermissions}
							<span
								class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-surface-alt text-ink"
							>
								Permissions: {currentVaultPermissions.health}
							</span>
						{:else}
							<span
								class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-surface-alt text-ink-muted"
							>
								Permissions: unknown
							</span>
						{/if}
					</div>
					{#if currentVaultPermissions?.remediation}
						<p class="mt-2 text-xs text-amber-700 dark:text-amber-400">
							{currentVaultPermissions.remediation}
						</p>
					{/if}
					<div class="mt-3 flex items-center gap-2">
						<Button
							variant="secondary"
							size="sm"
							onclick={handleChangeDesktopVault}
							loading={switchingVault}
						>
							{switchingVault ? 'Switching...' : 'Change Vault Folder'}
						</Button>
						<Button variant="ghost" size="sm" onclick={onrefreshdesktopstate}>
							Refresh Status
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={loadCurrentVaultPermissions}
							loading={checkingVaultPermissions}
						>
							{checkingVaultPermissions ? 'Checking...' : 'Check Permissions'}
						</Button>
					</div>
					<div class="mt-4 rounded border border-border p-3">
						<div class="flex items-center justify-between gap-2 mb-2">
							<p class="text-xs font-medium text-ink">Recent Vaults</p>
							<Button
								variant="ghost"
								size="sm"
								onclick={loadRecentVaults}
								loading={loadingRecentVaults}
							>
								{loadingRecentVaults ? 'Loading...' : 'Refresh'}
							</Button>
						</div>
						{#if recentVaults.length === 0}
							<p class="text-xs text-ink-muted">No recent vaults.</p>
						{:else}
							<ul class="space-y-2">
								{#each recentVaults as recent (recent.vaultDir)}
									<li class="rounded border border-border bg-surface-alt px-2 py-2">
										<div class="flex items-start justify-between gap-2">
											<div class="min-w-0">
												<p class="text-xs font-mono text-ink break-all">
													{recent.vaultDir}
												</p>
												<p class="text-xs text-ink-muted mt-1">
													Last opened: {recent.lastOpenedAt}
												</p>
												<p class="text-xs text-ink-faint mt-1">
													Health: {recent.health}
												</p>
												{#if recent.remediation}
													<p class="text-xs text-amber-700 dark:text-amber-400 mt-1">
														{recent.remediation}
													</p>
												{/if}
											</div>
											<Button
												variant="ghost"
												size="sm"
												onclick={() => handleSwitchToRecentVault(recent.vaultDir)}
												disabled={switchingVault || !recent.readable || !recent.writable}
											>
												Switch
											</Button>
										</div>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
					{#if latestVaultSwitch}
						<div class="mt-4 rounded border border-border p-3">
							<p class="text-xs font-medium text-ink mb-2">Last Vault Switch</p>
							<ul class="space-y-1">
								{#each latestVaultSwitch.steps as step (step.id + step.at)}
									<li class="text-xs text-ink-muted">
										<span class="font-medium text-ink">{step.id}</span>
										({step.status}) â€” {step.detail}
									</li>
								{/each}
							</ul>
							{#if latestVaultSwitch.remediation}
								<p class="mt-2 text-xs text-amber-700 dark:text-amber-400">
									{latestVaultSwitch.remediation}
								</p>
							{/if}
						</div>
					{/if}
				{:else}
					<p class="text-xs text-ink-muted">Android Vault Directory</p>
					<p class="text-xs text-ink-faint mt-1">
						Stored under app-private files. Change the relative folder path and restart to switch
						vault roots.
					</p>
					<div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
						<input
							type="text"
							value={mobileVaultRootInput}
							oninput={(event) =>
								(mobileVaultRootInput = (event.currentTarget as HTMLInputElement).value)}
							class="w-full rounded border border-border bg-surface-alt px-2 py-1 text-xs font-mono text-ink"
							placeholder="dndtools/vault"
							aria-label="Android vault directory"
						/>
						<Button variant="secondary" size="sm" onclick={saveMobileVaultRootPreference}>
							Save
						</Button>
					</div>
					<p class="mt-2 text-xs text-ink-faint">
						Current path: <span class="font-mono">{mobileVaultRootInput}</span>
					</p>
				{/if}
			</div>

			{#if hasDesktopBridge()}
				<div class="pt-3 border-t border-border space-y-3">
					<div class="flex items-center justify-between gap-2">
						<div>
							<p class="text-xs text-ink-muted">Metadata Integrity</p>
							<p class="text-xs text-ink-faint mt-1">
								{integrityReport
									? integrityReport.healthy
										? 'All .vault metadata and note markers passed validation.'
										: `${integrityReport.issues.filter((i) => !i.repaired && i.status !== 'ok').length + integrityReport.noteIssues.filter((i) => !i.repaired).length} unrepaired issue${integrityReport.issues.filter((i) => !i.repaired && i.status !== 'ok').length + integrityReport.noteIssues.filter((i) => !i.repaired).length === 1 ? '' : 's'} detected.`
									: refreshingDesktopState
										? 'Scanning...'
										: 'Status unavailable'}
							</p>
							{#if integrityReport?.journalRecovery.replayed}
								<p class="text-xs text-amber-700 mt-1">
									Recovered from {integrityReport.journalRecovery.pendingEntries} interrupted write{integrityReport
										.journalRecovery.pendingEntries === 1
										? ''
										: 's'} on startup.
								</p>
							{/if}
						</div>
						<span
							class="px-2 py-0.5 rounded-full text-xs font-medium"
							class:bg-emerald-100={integrityReport?.healthy}
							class:text-emerald-800={integrityReport?.healthy}
							class:bg-rose-100={integrityReport && !integrityReport.healthy}
							class:text-rose-800={integrityReport && !integrityReport.healthy}
						>
							{integrityReport?.healthy ? 'healthy' : 'attention'}
						</span>
					</div>

					{#if integrityReport && integrityReport.issues.some((i) => !i.repaired && i.status !== 'ok')}
						<p class="text-xs font-medium text-rose-700 dark:text-rose-400">
							Critical â€” metadata files
						</p>
						<ul
							class="rounded border border-rose-200 dark:border-rose-900 divide-y divide-rose-100 dark:divide-rose-900"
						>
							{#each integrityReport.issues.filter((i) => !i.repaired && i.status !== 'ok') as issue (issue.file)}
								<li class="px-3 py-2 text-xs">
									<p class="font-mono text-ink">{issue.file}</p>
									<p class="text-ink-muted mt-0.5">{issue.status}</p>
									{#if issue.details}<p class="text-ink-faint mt-0.5">
											{issue.details}
										</p>{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if integrityReport?.noteIssues.some((i) => !i.repaired && (i.status === 'checksum_mismatch' || i.status === 'orphan_entry'))}
						<p class="text-xs font-medium text-amber-700 dark:text-amber-400">
							Warning â€” note integrity
						</p>
						<ul
							class="rounded border border-amber-200 dark:border-amber-900 divide-y divide-amber-100 dark:divide-amber-900"
						>
							{#each integrityReport.noteIssues.filter((i) => !i.repaired && (i.status === 'checksum_mismatch' || i.status === 'orphan_entry')) as issue (issue.noteId + issue.filePath)}
								<li class="px-3 py-2 text-xs">
									<p class="font-mono text-ink">{issue.filePath}</p>
									<p class="text-ink-muted mt-0.5">{issue.status}</p>
									{#if issue.status === 'checksum_mismatch'}<p class="text-ink-faint mt-0.5">
											Content changed outside DND Tools. Re-open and save the note to update the
											checksum.
										</p>{/if}
									{#if issue.status === 'orphan_entry'}<p class="text-ink-faint mt-0.5">
											File missing on disk. Rebuild the index to remove the stale entry.
										</p>{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if integrityReport?.noteIssues.some((i) => !i.repaired && (i.status === 'missing_marker' || i.status === 'invalid_marker'))}
						<p class="text-xs font-medium text-ink-muted">
							Info â€” marker issues (auto-repaired on next save)
						</p>
						<ul class="rounded border border-border divide-y divide-border">
							{#each integrityReport.noteIssues.filter((i) => !i.repaired && (i.status === 'missing_marker' || i.status === 'invalid_marker')) as issue (issue.noteId + issue.filePath)}
								<li class="px-3 py-2 text-xs">
									<p class="font-mono text-ink">{issue.filePath}</p>
									<p class="text-ink-muted mt-0.5">{issue.status}</p>
								</li>
							{/each}
						</ul>
					{/if}

					{#if integrityReport && integrityReport.issues.some((i) => i.repaired)}
						<ul
							class="rounded border border-emerald-100 dark:border-emerald-900 divide-y divide-emerald-50 dark:divide-emerald-900"
						>
							{#each integrityReport.issues.filter((i) => i.repaired) as issue (issue.file)}
								<li class="px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
									{issue.file} â€” repaired automatically
								</li>
							{/each}
						</ul>
					{/if}

					<div class="flex flex-wrap items-center gap-2">
						<Button
							variant="secondary"
							size="sm"
							onclick={handleRepairIntegrity}
							loading={repairingIntegrity}
						>
							{repairingIntegrity ? 'Repairing...' : 'Repair Metadata'}
						</Button>
						<Button variant="ghost" size="sm" onclick={onrebuildindex} loading={rebuildingIndex}>
							{rebuildingIndex ? 'Rebuilding...' : 'Rebuild Index'}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={onrefreshdesktopstate}
							loading={refreshingDesktopState}
						>
							Rescan
						</Button>
					</div>
				</div>
			{/if}
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">Vault Link Health</h2>
		<div class="rounded-lg border border-border bg-surface p-4 space-y-4">
			<div class="grid gap-2 md:grid-cols-3">
				<button
					type="button"
					class="rounded border border-border px-3 py-2 text-left hover:bg-surface-alt"
					onclick={() => (linkQualityDrilldown = 'orphans')}
				>
					<p class="text-xs text-ink-muted">Orphan notes</p>
					<p class="text-base font-semibold text-ink">
						{vaultOrphanNoteIds.length}
					</p>
				</button>
				<button
					type="button"
					class="rounded border border-border px-3 py-2 text-left hover:bg-surface-alt"
					onclick={() => (linkQualityDrilldown = 'hubs')}
				>
					<p class="text-xs text-ink-muted">Hub notes</p>
					<p class="text-base font-semibold text-ink">
						{vaultHubNoteIds.length}
					</p>
				</button>
				<div class="rounded border border-border px-3 py-2">
					<p class="text-xs text-ink-muted">Total links</p>
					<p class="text-base font-semibold text-ink">
						{vaultLinkQualityReport.totals.totalLinks}
					</p>
				</div>
			</div>

			<div class="grid gap-2 md:grid-cols-4">
				<button
					type="button"
					class="rounded border border-border px-3 py-2 text-left hover:bg-surface-alt"
					onclick={() => (linkQualityDrilldown = 'broken')}
				>
					<p class="text-xs text-ink-muted">Broken links</p>
					<p class="text-sm font-semibold text-ink">
						{vaultLinkQualityReport.totals.brokenLinks}
					</p>
				</button>
				<button
					type="button"
					class="rounded border border-border px-3 py-2 text-left hover:bg-surface-alt"
					onclick={() => (linkQualityDrilldown = 'alias')}
				>
					<p class="text-xs text-ink-muted">Alias-matched links</p>
					<p class="text-sm font-semibold text-ink">
						{vaultLinkQualityReport.totals.aliasMatchedLinks}
					</p>
				</button>
				<button
					type="button"
					class="rounded border border-border px-3 py-2 text-left hover:bg-surface-alt"
					onclick={() => (linkQualityDrilldown = 'loops')}
				>
					<p class="text-xs text-ink-muted">Loops (Aâ†”B)</p>
					<p class="text-sm font-semibold text-ink">
						{vaultLinkQualityReport.totals.loops}
					</p>
				</button>
				<button
					type="button"
					class="rounded border border-border px-3 py-2 text-left hover:bg-surface-alt"
					onclick={() => (linkQualityDrilldown = 'cross_folder')}
				>
					<p class="text-xs text-ink-muted">Cross-folder density</p>
					<p class="text-sm font-semibold text-ink">
						{Math.round(vaultLinkQualityReport.totals.crossFolderLinkDensity * 100)}%
					</p>
				</button>
			</div>

			<div class="rounded border border-border p-3">
				<p class="text-xs font-medium text-ink">
					{linkQualityDrilldownLabel} ({linkQualityDrilldownNoteIds.length})
				</p>
				{#if linkQualityDrilldownNoteIds.length === 0}
					<p class="mt-1 text-xs text-ink-muted">No notes in this category.</p>
				{:else}
					<ul class="mt-2 space-y-1">
						{#each linkQualityDrilldownNoteIds.slice(0, 16) as noteId (noteId)}
							{@const note = notesState.getNoteById(noteId)}
							{#if note}
								<li class="text-xs text-ink-muted">
									<a
										href={resolve(`/knowledge/notes/${note.id}`)}
										class="text-accent hover:underline"
									>
										{note.title}
									</a>
									<span class="ml-1 text-ink-faint">{String(note.folder)}</span>
									{#if linkQualityDrilldown === 'hubs'}
										{@const hubInfo = linksState.getHubInfo(note.id)}
										{#if hubInfo}
											<span class="ml-1 text-ink-faint">
												({hubInfo.betweenness.toFixed(3)})
											</span>
										{/if}
									{/if}
								</li>
							{/if}
						{/each}
					</ul>
				{/if}
			</div>

			<div class="border-t border-border pt-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div>
						<p class="text-xs text-ink-muted">Unresolved wikilinks across active notes</p>
						<p class="text-sm font-medium text-ink mt-0.5">
							{vaultUnresolvedLinkIssues.length}
							issue{vaultUnresolvedLinkIssues.length === 1 ? '' : 's'}
						</p>
					</div>
					<Button
						variant="secondary"
						size="sm"
						onclick={handleCreateAllMissingLinkNotes}
						disabled={creatingMissingLinkNotes || creatableVaultUnresolvedTitles.length === 0}
					>
						{creatingMissingLinkNotes
							? 'Creating...'
							: `Create All Missing Notes (${creatableVaultUnresolvedTitles.length})`}
					</Button>
				</div>

				{#if vaultUnresolvedLinkIssues.length === 0}
					<p class="mt-2 text-xs text-ink-muted">No unresolved wikilinks detected.</p>
				{:else}
					<ul class="mt-2 rounded border border-border divide-y divide-border">
						{#each vaultUnresolvedLinkIssues as issue (issue.sourceId + issue.targetKind + (issue.targetIdHint ?? issue.targetLabel))}
							<li class="px-3 py-2 text-xs space-y-1">
								<p class="font-medium text-ink">
									{issue.sourceTitle}
									<span class="text-ink-faint">({issue.sourceFolder})</span>
								</p>
								<p class="text-ink-muted">
									[[{issue.targetLabel}]]
									{#if issue.targetKind === 'id' && issue.targetIdHint}
										<span class="ml-1 text-ink-faint">missing id: {issue.targetIdHint}</span>
									{/if}
									<span class="ml-1 text-ink-faint">x{issue.count}</span>
								</p>
								{#if issue.contexts.length > 0}
									<p class="text-ink-faint">{issue.contexts[0]}</p>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">Safety Snapshots</h2>
		<div class="rounded-lg border border-border bg-surface p-4 space-y-4">
			<div class="grid md:grid-cols-2 gap-4">
				<div>
					<label class="text-xs text-ink-muted block mb-1" for="backup-cadence">
						Auto backup cadence
					</label>
					<select
						id="backup-cadence"
						class="w-full rounded border border-border bg-white px-2 py-1.5 text-sm"
						bind:value={backupCadence}
					>
						<option value="hourly">Hourly</option>
						<option value="daily">Daily</option>
						<option value="on-close">On close</option>
						<option value="manual">Manual only</option>
					</select>
				</div>
				<div>
					<label class="text-xs text-ink-muted block mb-1" for="backup-retention">
						Retention count
					</label>
					<input
						id="backup-retention"
						type="number"
						min="1"
						step="1"
						class="w-full rounded border border-border bg-white px-2 py-1.5 text-sm"
						bind:value={backupRetentionCount}
					/>
				</div>
			</div>

			<div class="flex items-center gap-2">
				<Button
					variant="secondary"
					size="sm"
					onclick={saveBackupSettings}
					loading={savingBackupSettings}
				>
					{savingBackupSettings ? 'Saving...' : 'Save Backup Settings'}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onclick={() => createSafetySnapshot('manual')}
					loading={creatingSnapshot}
				>
					{creatingSnapshot ? 'Creating...' : 'Create Safety Snapshot'}
				</Button>
			</div>

			<div class="border-t border-border pt-4 space-y-2">
				<p class="text-sm font-medium text-ink">Restore deleted notes from snapshot</p>
				{#if safetySnapshots.length === 0}
					<p class="text-xs text-ink-muted">No snapshots available yet.</p>
				{:else}
					<div class="flex flex-col md:flex-row gap-2 md:items-center">
						<select
							class="flex-1 rounded border border-border bg-white px-2 py-1.5 text-sm"
							bind:value={selectedSnapshotId}
						>
							{#each safetySnapshots as snapshot (snapshot.id)}
								<option value={snapshot.id}>
									{new Date(snapshot.createdAt).toLocaleString()} â€” {snapshot.reason} ({snapshot.noteCount}
									notes{snapshot.sizeBytes
										? `, ${snapshot.sizeBytes > 1048576 ? (snapshot.sizeBytes / 1048576).toFixed(1) + ' MB' : Math.round(snapshot.sizeBytes / 1024) + ' KB'}`
										: ''})
								</option>
							{/each}
						</select>
						<Button
							variant="secondary"
							size="sm"
							onclick={handleRestoreDeletedFromSnapshot}
							disabled={restoringSnapshot || !selectedSnapshotId}
							loading={restoringSnapshot}
						>
							{restoringSnapshot ? 'Restoring...' : 'Restore Deleted Notes'}
						</Button>
					</div>
				{/if}
			</div>
		</div>
	</section>

	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">Import and Export</h2>
		<div class="rounded-lg border border-border bg-surface p-4 space-y-4">
			<div class="flex items-start justify-between gap-4">
				<div>
					<p class="text-sm font-medium text-ink">Portable Markdown ZIP</p>
					<p class="text-xs text-ink-muted mt-0.5">
						Exports plain `.md` files, an `assets/` directory, README, and validation report.
					</p>
				</div>
				<Button
					variant="secondary"
					size="sm"
					onclick={() => handleExportMarkdownZip('portable_markdown_zip')}
					disabled={exportingPortableZip}
				>
					{exportingPortableZip ? 'Exporting...' : 'Export ZIP'}
				</Button>
			</div>
			<div class="border-t border-border pt-4 flex items-start justify-between gap-4">
				<div>
					<p class="text-sm font-medium text-ink">Deterministic Git-Friendly ZIP</p>
					<p class="text-xs text-ink-muted mt-0.5">
						Canonical path ordering, sorted frontmatter, normalized timestamps, stable IDs.
					</p>
				</div>
				<Button
					variant="secondary"
					size="sm"
					onclick={() => handleExportMarkdownZip('deterministic_markdown_zip')}
					disabled={exportingDeterministicZip}
				>
					{exportingDeterministicZip ? 'Exporting...' : 'Export Deterministic ZIP'}
				</Button>
			</div>

			<div class="border-t border-border pt-4 space-y-3">
				<div class="flex items-start justify-between gap-4">
					<div>
						<p class="text-sm font-medium text-ink">Obsidian Import Analyzer</p>
						<p class="text-xs text-ink-muted mt-0.5">
							Checks duplicate titles, ID collisions, frontmatter validity, encoding, missing files,
							and manual link mappings before import.
						</p>
					</div>
					<Button
						variant="secondary"
						size="sm"
						onclick={handleAnalyzeImportSource}
						loading={analyzingImportSource}
					>
						{analyzingImportSource ? 'Analyzing...' : 'Analyze Source'}
					</Button>
				</div>

				{#if importAnalysisReport}
					<div class="rounded-md border border-border bg-surface-alt p-3 space-y-2">
						<p class="text-xs text-ink">
							Source: <span class="font-mono">{importAnalysisReport.sourceRoot}</span>
						</p>
						<p class="text-xs text-ink-muted">
							Markdown files: {importAnalysisReport.markdownFiles} Â· Issues:
							{importAnalysisReport.issues.length} (errors: {importAnalysisReport.stats.errors},
							warnings: {importAnalysisReport.stats.warnings})
						</p>
						<p class="text-xs text-ink-muted">
							Mapped: {importAnalysisReport.featureMapping.mapped.length} Â· Ignored:
							{importAnalysisReport.featureMapping.ignored.length} Â· Manual:
							{importAnalysisReport.featureMapping.manualResolution.length}
						</p>
						<div class="flex flex-wrap items-center gap-3 pt-1">
							<label for="import-resolution-default" class="text-xs font-medium text-ink">
								Default conflict resolution
							</label>
							<select
								id="import-resolution-default"
								bind:value={importDefaultResolution}
								class="rounded border border-border bg-white px-2 py-1 text-xs"
							>
								<option value="merge">Merge</option>
								<option value="overwrite">Overwrite</option>
								<option value="skip">Skip</option>
							</select>
							<Button
								variant="secondary"
								size="sm"
								onclick={handleStartAnalyzedImport}
								disabled={importJob?.status === 'running'}
							>
								Start Import
							</Button>
						</div>

						{#if importAnalysisReport.issues.length > 0}
							<div class="max-h-40 overflow-y-auto rounded border border-border">
								<table class="w-full text-xs">
									<thead class="bg-surface-alt">
										<tr>
											<th class="px-2 py-1 text-left font-medium">Severity</th>
											<th class="px-2 py-1 text-left font-medium">Issue</th>
											<th class="px-2 py-1 text-left font-medium">Source</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-border">
										{#each importAnalysisReport.issues.slice(0, 120) as issue (issue.id)}
											<tr>
												<td class="px-2 py-1 uppercase">{issue.severity}</td>
												<td class="px-2 py-1">{issue.message}</td>
												<td class="px-2 py-1 font-mono">{issue.sourcePath}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				{/if}
			</div>

			{#if importCheckpoint?.exists}
				<div class="border-t border-border pt-4 flex flex-wrap items-center gap-3">
					<p class="text-xs text-ink-muted">
						Checkpoint available: {importCheckpoint.processedFiles}/{importCheckpoint.totalFiles}
						processed Â· {importCheckpoint.remainingFiles} remaining
					</p>
					<Button
						variant="secondary"
						size="sm"
						onclick={handleResumeImportFromCheckpoint}
						loading={resumingImportCheckpoint}
					>
						{resumingImportCheckpoint ? 'Resuming...' : 'Resume Import'}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onclick={handleClearImportCheckpoint}
						loading={clearingImportCheckpointState}
					>
						{clearingImportCheckpointState ? 'Clearing...' : 'Clear Checkpoint'}
					</Button>
				</div>
			{/if}

			{#if importJob}
				<div class="border-t border-border pt-4 rounded-md bg-surface-alt p-3 space-y-2">
					<p class="text-xs font-medium text-ink">
						Import Job: {importJob.status}
					</p>
					<p class="text-xs text-ink-muted">
						Processed {importJob.processedFiles}/{importJob.totalFiles} Â· Imported
						{importJob.imported} Â· Overwritten {importJob.overwritten} Â· Merged
						{importJob.merged} Â· Skipped {importJob.skipped}
					</p>
					<div
						class="h-2 rounded bg-border overflow-hidden"
						role="progressbar"
						aria-valuemin="0"
						aria-valuemax={Math.max(1, importJob.totalFiles)}
						aria-valuenow={importJob.processedFiles}
					>
						<div
							class="h-full bg-accent transition-all"
							style={`width: ${Math.min(100, Math.round((importJob.processedFiles / Math.max(1, importJob.totalFiles)) * 100))}%`}
						></div>
					</div>
					{#if importJob.errors.length > 0}
						<p class="text-xs text-rose-600 dark:text-rose-400">
							{importJob.errors[importJob.errors.length - 1]}
						</p>
					{/if}
				</div>
			{/if}

			<div class="border-t border-border pt-4 flex items-start justify-between gap-4">
				<div>
					<p class="text-sm font-medium text-ink">Legacy JSON/Markdown Export</p>
					<p class="text-xs text-ink-muted mt-0.5">
						Compatibility fallback for browser mode and older bundles.
					</p>
				</div>
				<div class="flex items-center gap-2">
					<Button variant="ghost" size="sm" onclick={handleExportAll}>Export Legacy</Button>
					<Button variant="ghost" size="sm" onclick={handleImportFiles}>Import Legacy</Button>
				</div>
			</div>

			{#if latestExportReport && !latestExportReport.canceled}
				<div class="rounded-md border border-border bg-surface-alt p-3 text-xs">
					<p class="font-medium text-ink">
						Last export ({latestExportReport.profile})
					</p>
					<p class="text-ink-muted">
						Notes: {latestExportReport.noteCount} Â· Assets: {latestExportReport.assetCount} Â· Validation
						issues: {latestExportReport.validation.issues.length}
					</p>
				</div>
			{/if}
		</div>
	</section>
</div>

{#if showBlockingOverlay && blockingOperationLabel}
	<div
		class="fixed inset-0 z-[120] bg-black/35 backdrop-blur-sm flex items-center justify-center p-4"
		aria-live="polite"
		aria-busy="true"
	>
		<div class="w-full max-w-sm rounded-lg border border-border bg-surface px-4 py-5 shadow-xl">
			<div class="flex items-center gap-3">
				<span
					class="loading-spinner-delayed inline-block h-5 w-5 rounded-full border-2 border-accent border-r-transparent"
					aria-hidden="true"
				></span>
				<p class="text-sm font-medium text-ink">{blockingOperationLabel}</p>
			</div>
		</div>
	</div>
{/if}
