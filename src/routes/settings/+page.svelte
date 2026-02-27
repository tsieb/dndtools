<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ThemeToggle from '$lib/ui/common/ThemeToggle.svelte';
	import Button from '$lib/ui/common/Button.svelte';
	import { vaultState } from '$lib/state/vault.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { editorPreferencesState } from '$lib/state/editor-preferences.svelte.js';
	import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
	import { onboardingState } from '$lib/state/onboarding.svelte.js';
	import { ONBOARDING_STEPS } from '$lib/domain/onboarding.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { exportAllNotes, parseMarkdownFile, parseJsonBundle } from '$lib/domain/export.js';
	import { searchService } from '$lib/domain/search.js';
	import { getStorage } from '$lib/platform/storage/index.js';
	import type { Note } from '$lib/types/note.js';
	import type { SafetySnapshot } from '$lib/types/storage.js';
	import type { AppSettings } from '$lib/types/settings.js';
	import { createFolderId } from '$lib/types/note.js';
	import { createNewNote } from '$lib/utils/note-factory.js';
	import { resolveSettingsTabFromUrl, type SettingsTabId } from '$lib/domain/settings-tabs.js';
	import {
		getDesktopBackendInfo,
		getDesktopIntegrityReport,
		getDesktopSystemHealth,
		pickDesktopVaultDirectory,
		getDesktopMcpStatus,
		exportDesktopDiagnosticsBundle,
		repairDesktopIntegrity,
		restartDesktopMcpSidecar,
		getDesktopMcpPolicySettings,
		setDesktopMcpPolicySettings,
		listDesktopMcpAuditTrail,
		type DesktopIntegrityReport,
		type DesktopMcpStatus,
		type DesktopSystemHealth,
		type DesktopMcpChangeRecord,
		type DesktopMcpPolicySettings,
	} from '$lib/platform/desktop/bridge.js';
	import { markSubsystemSuccess, reportRuntimeError } from '$lib/runtime/diagnostics.js';

	type SettingsTab = {
		id: SettingsTabId;
		label: string;
	};

	type McpPendingFilterType = DesktopMcpChangeRecord['type'] | 'all';
	type McpPendingFilterRisk = 'all' | 'structural' | 'safe';
	type McpPendingFilterConflict = 'all' | 'conflicted' | 'clean';

	let desktopVaultDir = $state<string>('');
	let mcpStatus = $state<DesktopMcpStatus | null>(null);
	let integrityReport = $state<DesktopIntegrityReport | null>(null);
	let systemHealth = $state<DesktopSystemHealth | null>(null);
	let refreshingDesktopState = $state(false);
	let repairingIntegrity = $state(false);
	let savingBackupSettings = $state(false);
	let creatingSnapshot = $state(false);
	let restoringSnapshot = $state(false);
	let backupCadence = $state<AppSettings['backupCadence']>('daily');
	let backupRetentionCount = $state(20);
	let safetySnapshots = $state<SafetySnapshot[]>([]);
	let selectedSnapshotId = $state<string>('');
	let restartingMcp = $state(false);
	let applyingMcpChanges = $state(false);
	let exportingDiagnostics = $state(false);
	let activeTab = $state<SettingsTabId>('general');
	let templateCampaignName = $state('');
	let templateSessionNumber = $state(1);
	let templateCharacterNamesText = $state('');
	let savingTemplateContext = $state(false);
	let mcpPolicySettings = $state<DesktopMcpPolicySettings>({
		defaultPresetId: 'strict_review',
		perAgent: {},
	});
	let savingMcpPolicySettings = $state(false);
	let mcpAuditTrail = $state<DesktopMcpChangeRecord[]>([]);
	let mcpAuditLoading = $state(false);
	let mcpChangeFilterType = $state<McpPendingFilterType>('all');
	let mcpChangeFilterRisk = $state<McpPendingFilterRisk>('all');
	let mcpChangeFilterConflict = $state<McpPendingFilterConflict>('all');
	let mcpChangeFilterAgent = $state('all');
	let mcpDiffSearch = $state('');
	let selectedMcpChangeIds = $state<string[]>([]);

	const settingsTabs: readonly SettingsTab[] = [
		{ id: 'general', label: 'General' },
		{ id: 'vault', label: 'Vault' },
		{ id: 'mcp', label: 'MCP' },
		{ id: 'health', label: 'System Health' },
	] as const;

	const visibleTabs = $derived(settingsTabs);

	onMount(() => {
		void refreshDesktopState();
		void mcpChangesState.refresh();
		void loadMcpPolicySettings();
		void loadMcpAuditTrail();
		void loadBackupSettings();
		void loadSafetySnapshots();
		void loadTemplateContextSettings();
	});

	$effect(() => {
		if (!visibleTabs.some((tab) => tab.id === activeTab)) {
			activeTab = visibleTabs[0]?.id ?? 'general';
		}
	});

	$effect(() => {
		const requested = resolveSettingsTabFromUrl(page.url);
		if (requested && requested !== activeTab && visibleTabs.some((tab) => tab.id === requested)) {
			activeTab = requested;
		}
	});

	$effect(() => {
		const activeIds = new Set(mcpChangesState.pending.map((change) => change.id));
		const nextSelection = selectedMcpChangeIds.filter((id) => activeIds.has(id));
		if (nextSelection.length !== selectedMcpChangeIds.length) {
			selectedMcpChangeIds = nextSelection;
		}
	});

	function focusTabButton(tabId: SettingsTabId): void {
		if (typeof document === 'undefined') return;
		document.getElementById(`settings-tab-${tabId}`)?.focus();
	}

	function activateTab(tabId: SettingsTabId, focus = false): void {
		if (!visibleTabs.some((tab) => tab.id === tabId)) return;
		activeTab = tabId;
		if (focus) {
			queueMicrotask(() => focusTabButton(tabId));
		}
	}

	function handleTabKeydown(event: KeyboardEvent, currentTabId: SettingsTabId): void {
		const tabs = visibleTabs;
		const currentIndex = tabs.findIndex((tab) => tab.id === currentTabId);
		if (currentIndex < 0 || tabs.length === 0) return;

		let nextIndex: number;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				nextIndex = (currentIndex + 1) % tabs.length;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
				break;
			case 'Home':
				nextIndex = 0;
				break;
			case 'End':
				nextIndex = tabs.length - 1;
				break;
			case ' ':
			case 'Enter':
				event.preventDefault();
				activateTab(currentTabId, true);
				return;
			default:
				return;
		}

		event.preventDefault();
		const nextTab = tabs[nextIndex];
		if (nextTab) {
			activateTab(nextTab.id, true);
		}
	}

	function reportSettingsError(
		category: 'storage' | 'ipc' | 'mcp_sidecar' | 'ui_runtime' | 'parsing',
		code: string,
		error: unknown,
	): void {
		void reportRuntimeError({
			category,
			code,
			error,
			context: { route: '/settings' },
		});
	}

	async function refreshDesktopState(): Promise<void> {
		refreshingDesktopState = true;
		try {
			const [backendInfo, nextMcpStatus, nextIntegrity, nextHealth] = await Promise.all([
				getDesktopBackendInfo(),
				getDesktopMcpStatus(),
				getDesktopIntegrityReport(),
				getDesktopSystemHealth(),
			]);
			desktopVaultDir = backendInfo.vaultDir;
			mcpStatus = nextMcpStatus;
			integrityReport = nextIntegrity;
			systemHealth = nextHealth;
		} catch (error) {
			desktopVaultDir = '';
			mcpStatus = null;
			integrityReport = null;
			systemHealth = null;
			reportSettingsError('ipc', 'SETTINGS_REFRESH_DESKTOP_STATE_FAILED', error);
			toastState.error(`Failed to load desktop runtime info: ${String(error)}`);
		} finally {
			refreshingDesktopState = false;
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
			systemHealth = await getDesktopSystemHealth();
			if (repaired.issues.length === 0) {
				toastState.success('Metadata integrity is healthy');
				return;
			}
			const repairedCount = repaired.issues.filter((issue) => issue.repaired).length;
			toastState.success(
				`Repaired ${repairedCount} metadata file${repairedCount === 1 ? '' : 's'}`,
			);
		} catch (error) {
			reportSettingsError('storage', 'SETTINGS_REPAIR_INTEGRITY_FAILED', error);
			toastState.error(`Failed to repair metadata integrity: ${String(error)}`);
		} finally {
			repairingIntegrity = false;
		}
	}

	async function loadBackupSettings(): Promise<void> {
		try {
			const storage = getStorage();
			const [cadence, retention] = await Promise.all([
				storage.getSetting('backupCadence'),
				storage.getSetting('backupRetentionCount'),
			]);
			backupCadence = cadence;
			backupRetentionCount = retention;
		} catch (error) {
			reportSettingsError('storage', 'SETTINGS_LOAD_BACKUP_SETTINGS_FAILED', error);
			toastState.error(`Failed to load backup settings: ${String(error)}`);
		}
	}

	async function loadTemplateContextSettings(): Promise<void> {
		try {
			const storage = getStorage();
			const templateContext = await storage.getSetting('templateContext');
			templateCampaignName = templateContext.campaignName;
			templateSessionNumber = templateContext.sessionNumber;
			templateCharacterNamesText = templateContext.characterNames.join(', ');
		} catch (error) {
			reportSettingsError('storage', 'SETTINGS_LOAD_TEMPLATE_CONTEXT_FAILED', error);
			toastState.error(`Failed to load template settings: ${String(error)}`);
		}
	}

	async function saveTemplateContextSettings(): Promise<void> {
		savingTemplateContext = true;
		try {
			const storage = getStorage();
			const characterNames = templateCharacterNamesText
				.split(',')
				.map((entry) => entry.trim())
				.filter((entry) => entry.length > 0);
			const sessionNumber = Math.max(1, Math.round(templateSessionNumber || 1));
			await storage.setSetting('templateContext', {
				campaignName: templateCampaignName.trim(),
				sessionNumber,
				characterNames,
			});
			templateSessionNumber = sessionNumber;
			templateCharacterNamesText = characterNames.join(', ');
			toastState.success('Template context saved');
		} catch (error) {
			reportSettingsError('storage', 'SETTINGS_SAVE_TEMPLATE_CONTEXT_FAILED', error);
			toastState.error(`Failed to save template settings: ${String(error)}`);
		} finally {
			savingTemplateContext = false;
		}
	}

	async function saveBackupSettings(): Promise<void> {
		savingBackupSettings = true;
		try {
			const storage = getStorage();
			const retention = Math.max(1, Math.round(backupRetentionCount));
			await Promise.all([
				storage.setSetting('backupCadence', backupCadence),
				storage.setSetting('backupRetentionCount', retention),
			]);
			backupRetentionCount = retention;
			toastState.success('Backup settings saved');
			await loadSafetySnapshots();
		} catch (error) {
			reportSettingsError('storage', 'SETTINGS_SAVE_BACKUP_SETTINGS_FAILED', error);
			toastState.error(`Failed to save backup settings: ${String(error)}`);
		} finally {
			savingBackupSettings = false;
		}
	}

	async function loadSafetySnapshots(): Promise<void> {
		try {
			const storage = getStorage();
			const snapshots = await storage.listSafetySnapshots();
			safetySnapshots = snapshots;
			if (!selectedSnapshotId && snapshots.length > 0) {
				selectedSnapshotId = snapshots[0]!.id;
			}
		} catch (error) {
			safetySnapshots = [];
			reportSettingsError('storage', 'SETTINGS_LOAD_SNAPSHOTS_FAILED', error);
			toastState.error(`Failed to load safety snapshots: ${String(error)}`);
		}
	}

	async function createSafetySnapshot(reason: string): Promise<void> {
		creatingSnapshot = true;
		try {
			const storage = getStorage();
			await storage.createSafetySnapshot(reason);
			await loadSafetySnapshots();
			toastState.success('Created safety snapshot');
		} catch (error) {
			reportSettingsError('storage', 'SETTINGS_CREATE_SNAPSHOT_FAILED', error);
			toastState.error(`Failed to create snapshot: ${String(error)}`);
		} finally {
			creatingSnapshot = false;
		}
	}

	async function handleRestoreDeletedFromSnapshot(): Promise<void> {
		if (!selectedSnapshotId) return;
		restoringSnapshot = true;
		try {
			const storage = getStorage();
			const result = await storage.restoreDeletedFromSnapshot(selectedSnapshotId);
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
			reportSettingsError('storage', 'SETTINGS_RESTORE_FROM_SNAPSHOT_FAILED', error);
			toastState.error(`Failed to restore notes from snapshot: ${String(error)}`);
		} finally {
			restoringSnapshot = false;
		}
	}

	async function handleExportAll(): Promise<void> {
		exportAllNotes();
		toastState.success(`Exported ${vaultState.noteCount} notes`);
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
			const storage = getStorage();
			await storage.createSafetySnapshot('before-import');
			const result = await storage.importNotes(parsedNotes);
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
			reportSettingsError('parsing', 'SETTINGS_IMPORT_NOTES_FAILED', error);
			importErrors.push(`Failed to import notes: ${String(error)}`);
		}

		for (const message of importErrors) {
			toastState.error(message);
		}
	}

	async function handleImportFiles(): Promise<void> {
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

	async function handleEmptyTrash(): Promise<void> {
		const deletedIds = notesState.deletedNotes.map((note) => note.id);
		if (deletedIds.length === 0) {
			return;
		}
		await createSafetySnapshot('before-mass-delete');
		await notesState.permanentDeleteMany(deletedIds);
		toastState.success(
			`Permanently deleted ${deletedIds.length} ${deletedIds.length === 1 ? 'note' : 'notes'} from trash`,
		);
	}

	async function handleChangeDesktopVault(): Promise<void> {
		try {
			const next = await pickDesktopVaultDirectory();
			if (!next) return;

			desktopVaultDir = next.vaultDir;
			await notesState.loadAll();
			await Promise.all([
				searchService.buildIndex(notesState.notes),
				refreshDesktopState(),
				mcpChangesState.refresh(),
				loadMcpPolicySettings(),
				loadMcpAuditTrail(),
			]);
			await Promise.all([
				markSubsystemSuccess('vault_sync'),
				markSubsystemSuccess('search_index'),
				markSubsystemSuccess('link_graph_build'),
			]);
			toastState.success('Switched vault folder');
		} catch (error) {
			reportSettingsError('storage', 'SETTINGS_SWITCH_VAULT_FAILED', error);
			toastState.error(`Failed to switch vault folder: ${String(error)}`);
		}
	}

	async function handleRestartMcpSidecar(): Promise<void> {
		restartingMcp = true;
		try {
			mcpStatus = await restartDesktopMcpSidecar();
			if (mcpStatus.state === 'running') {
				systemHealth = await getDesktopSystemHealth();
				toastState.success('MCP sidecar restarted');
			} else {
				reportSettingsError(
					'mcp_sidecar',
					'SETTINGS_MCP_RESTART_NOT_RUNNING',
					mcpStatus.error ?? 'MCP sidecar is not running',
				);
				toastState.error(mcpStatus.error ?? 'MCP sidecar is not running');
			}
		} catch (error) {
			reportSettingsError('mcp_sidecar', 'SETTINGS_MCP_RESTART_FAILED', error);
			toastState.error(`Failed to restart MCP sidecar: ${String(error)}`);
		} finally {
			restartingMcp = false;
		}
	}

	async function loadMcpPolicySettings(): Promise<void> {
		try {
			mcpPolicySettings = await getDesktopMcpPolicySettings();
		} catch (error) {
			reportSettingsError('ipc', 'SETTINGS_LOAD_MCP_POLICY_SETTINGS_FAILED', error);
			toastState.error(`Failed to load MCP policy settings: ${String(error)}`);
		}
	}

	async function saveMcpPolicySettings(): Promise<void> {
		savingMcpPolicySettings = true;
		try {
			mcpPolicySettings = await setDesktopMcpPolicySettings(mcpPolicySettings);
			toastState.success('Saved MCP policy settings');
		} catch (error) {
			reportSettingsError('ipc', 'SETTINGS_SAVE_MCP_POLICY_SETTINGS_FAILED', error);
			toastState.error(`Failed to save MCP policy settings: ${String(error)}`);
		} finally {
			savingMcpPolicySettings = false;
		}
	}

	async function loadMcpAuditTrail(): Promise<void> {
		mcpAuditLoading = true;
		try {
			mcpAuditTrail = await listDesktopMcpAuditTrail(120);
		} catch (error) {
			mcpAuditTrail = [];
			reportSettingsError('ipc', 'SETTINGS_LOAD_MCP_AUDIT_TRAIL_FAILED', error);
		} finally {
			mcpAuditLoading = false;
		}
	}

	function updateAgentPreset(
		agentId: string,
		presetId: DesktopMcpPolicySettings['defaultPresetId'],
	): void {
		if (!agentId.trim()) return;
		mcpPolicySettings = {
			...mcpPolicySettings,
			perAgent: {
				...mcpPolicySettings.perAgent,
				[agentId]: presetId,
			},
		};
	}

	async function refreshAfterVaultMutation(): Promise<void> {
		await Promise.all([
			notesState.loadAll(),
			refreshDesktopState(),
			mcpChangesState.refresh(),
			loadMcpAuditTrail(),
		]);
		await searchService.buildIndex(notesState.notes);
		await Promise.all([
			markSubsystemSuccess('vault_sync'),
			markSubsystemSuccess('search_index'),
			markSubsystemSuccess('link_graph_build'),
		]);
	}

	async function handleApproveMcpChange(changeId: string): Promise<void> {
		applyingMcpChanges = true;
		try {
			const changed = await mcpChangesState.approve(changeId);
			if (!changed) {
				toastState.error('Pending change not found');
				return;
			}
			await refreshAfterVaultMutation();
			toastState.success('Approved MCP change');
		} catch (error) {
			reportSettingsError('storage', 'SETTINGS_APPROVE_MCP_CHANGE_FAILED', error);
			toastState.error(`Failed to approve change: ${String(error)}`);
		} finally {
			applyingMcpChanges = false;
		}
	}

	async function handleApproveSelectedMcpChanges(changeIds: string[]): Promise<void> {
		if (changeIds.length === 0) return;
		applyingMcpChanges = true;
		try {
			const approved = await mcpChangesState.approveMany(changeIds);
			await refreshAfterVaultMutation();
			selectedMcpChangeIds = [];
			toastState.success(`Approved ${approved} ${approved === 1 ? 'change' : 'changes'}`);
		} catch (error) {
			reportSettingsError('storage', 'SETTINGS_APPROVE_SELECTED_MCP_CHANGES_FAILED', error);
			toastState.error(`Failed to approve selected changes: ${String(error)}`);
		} finally {
			applyingMcpChanges = false;
		}
	}

	async function handleRejectMcpChange(changeId: string): Promise<void> {
		applyingMcpChanges = true;
		try {
			const changed = await mcpChangesState.reject(changeId);
			if (!changed) {
				toastState.error('Pending change not found');
				return;
			}
			await loadMcpAuditTrail();
			toastState.success('Rejected MCP change');
		} catch (error) {
			reportSettingsError('storage', 'SETTINGS_REJECT_MCP_CHANGE_FAILED', error);
			toastState.error(`Failed to reject change: ${String(error)}`);
		} finally {
			applyingMcpChanges = false;
		}
	}

	async function handleRejectSelectedMcpChanges(changeIds: string[]): Promise<void> {
		if (changeIds.length === 0) return;
		applyingMcpChanges = true;
		try {
			const rejected = await mcpChangesState.rejectMany(changeIds);
			await loadMcpAuditTrail();
			selectedMcpChangeIds = [];
			toastState.success(`Rejected ${rejected} ${rejected === 1 ? 'change' : 'changes'}`);
		} catch (error) {
			reportSettingsError('storage', 'SETTINGS_REJECT_SELECTED_MCP_CHANGES_FAILED', error);
			toastState.error(`Failed to reject selected changes: ${String(error)}`);
		} finally {
			applyingMcpChanges = false;
		}
	}

	async function handleApproveAllMcpChanges(): Promise<void> {
		applyingMcpChanges = true;
		try {
			const count = await mcpChangesState.approveAll();
			await refreshAfterVaultMutation();
			toastState.success(`Approved ${count} ${count === 1 ? 'change' : 'changes'}`);
		} catch (error) {
			reportSettingsError('storage', 'SETTINGS_APPROVE_ALL_MCP_CHANGES_FAILED', error);
			toastState.error(`Failed to approve all changes: ${String(error)}`);
		} finally {
			applyingMcpChanges = false;
		}
	}

	async function handleRejectAllMcpChanges(): Promise<void> {
		applyingMcpChanges = true;
		try {
			const count = await mcpChangesState.rejectAll();
			await loadMcpAuditTrail();
			toastState.success(`Rejected ${count} ${count === 1 ? 'change' : 'changes'}`);
		} catch (error) {
			reportSettingsError('storage', 'SETTINGS_REJECT_ALL_MCP_CHANGES_FAILED', error);
			toastState.error(`Failed to reject all changes: ${String(error)}`);
		} finally {
			applyingMcpChanges = false;
		}
	}

	function toggleMcpSelection(changeId: string, checked: boolean): void {
		if (checked) {
			if (!selectedMcpChangeIds.includes(changeId)) {
				selectedMcpChangeIds = [...selectedMcpChangeIds, changeId];
			}
			return;
		}
		selectedMcpChangeIds = selectedMcpChangeIds.filter((id) => id !== changeId);
	}

	function selectAllVisibleMcpChanges(changes: DesktopMcpChangeRecord[]): void {
		selectedMcpChangeIds = changes.map((change) => change.id);
	}

	function clearMcpSelection(): void {
		selectedMcpChangeIds = [];
	}

	async function handleExportDiagnostics(): Promise<void> {
		exportingDiagnostics = true;
		try {
			const result = await exportDesktopDiagnosticsBundle();
			if (result.canceled) return;
			toastState.success(`Diagnostics bundle exported to ${result.path}`);
		} catch (error) {
			reportSettingsError('ipc', 'SETTINGS_EXPORT_DIAGNOSTICS_FAILED', error);
			toastState.error(`Failed to export diagnostics bundle: ${String(error)}`);
		} finally {
			exportingDiagnostics = false;
		}
	}

	let mcpStateLabel = $derived(mcpStatus?.state ?? 'unknown');
	let editorSettings = $derived(editorPreferencesState.settings);
	let mcpKnownAgents = $derived.by(() => {
		const pendingAgents = mcpChangesState.pending
			.map((change) => change.agentId?.trim())
			.filter((agent): agent is string => !!agent);
		const configuredAgents = Object.keys(mcpPolicySettings.perAgent);
		return Array.from(new Set([...configuredAgents, ...pendingAgents])).sort((a, b) =>
			a.localeCompare(b),
		);
	});
	let filteredMcpChanges = $derived.by(() => {
		const query = mcpDiffSearch.trim().toLowerCase();
		return mcpChangesState.pending.filter((change) => {
			if (mcpChangeFilterType !== 'all' && change.type !== mcpChangeFilterType) return false;
			const isStructural = change.preview?.semantic.structural ?? change.type !== 'update';
			if (mcpChangeFilterRisk === 'structural' && !isStructural) return false;
			if (mcpChangeFilterRisk === 'safe' && isStructural) return false;
			const hasConflict = !!change.conflict;
			if (mcpChangeFilterConflict === 'conflicted' && !hasConflict) return false;
			if (mcpChangeFilterConflict === 'clean' && hasConflict) return false;
			if (
				mcpChangeFilterAgent !== 'all' &&
				(change.agentId ?? 'default-agent') !== mcpChangeFilterAgent
			) {
				return false;
			}
			if (!query) return true;
			return (
				change.summary.toLowerCase().includes(query) ||
				(change.preview?.summary.toLowerCase().includes(query) ?? false) ||
				(change.preview?.fullDiff.toLowerCase().includes(query) ?? false)
			);
		});
	});
	let selectedVisibleMcpChanges = $derived(
		filteredMcpChanges.filter((change) => selectedMcpChangeIds.includes(change.id)),
	);
	let mcpStateMessage = $derived.by(() => {
		if (!mcpStatus) return 'Status unavailable.';
		if (mcpStatus.state === 'running') return 'Sidecar is running.';
		if (mcpStatus.state === 'error')
			return 'Sidecar exited with an error. Fix the cause, then restart.';
		return mcpStatus.error
			? 'Sidecar stopped after an error. Restart to launch it again.'
			: 'Sidecar is stopped. Restart to launch it.';
	});

	async function updateEditorSettings(
		updates: Partial<typeof editorPreferencesState.settings>,
	): Promise<void> {
		await editorPreferencesState.update(updates);
		toastState.success('Editor defaults updated');
	}
</script>

<div class="p-6 max-w-content mx-auto">
	<h1
		class="text-2xl font-bold text-ink dark:text-tavern-text mb-6"
		style="font-family: var(--font-serif)"
	>
		Settings
	</h1>

	<div class="mb-6 border-b border-border dark:border-tavern-border">
		<div
			class="flex flex-wrap gap-2 -mb-px"
			role="tablist"
			aria-label="Settings sections"
			aria-orientation="horizontal"
		>
			{#each visibleTabs as tab (tab.id)}
				<button
					type="button"
					role="tab"
					id={`settings-tab-${tab.id}`}
					aria-selected={activeTab === tab.id}
					aria-controls={`settings-panel-${tab.id}`}
					tabindex={activeTab === tab.id ? 0 : -1}
					title={`Open ${tab.label} settings`}
					onclick={() => activateTab(tab.id)}
					onkeydown={(event) => handleTabKeydown(event, tab.id)}
					class={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
						activeTab === tab.id
							? 'border-accent text-accent dark:border-tavern-accent dark:text-tavern-accent'
							: 'border-transparent text-ink-muted dark:text-tavern-muted hover:border-border dark:hover:border-tavern-border hover:text-ink dark:hover:text-tavern-text'
					}`}
				>
					{tab.label}
				</button>
			{/each}
		</div>
	</div>

	{#if activeTab === 'general'}
		<div
			role="tabpanel"
			id="settings-panel-general"
			aria-labelledby="settings-tab-general"
			class="space-y-8"
		>
			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Appearance</h2>
				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface divide-y divide-border dark:divide-tavern-border"
				>
					<div class="flex items-center justify-between p-4">
						<div>
							<p class="text-sm font-medium text-ink dark:text-tavern-text">Theme</p>
							<p class="text-xs text-ink-muted dark:text-tavern-muted mt-0.5">
								Choose light, dark, or follow system
							</p>
						</div>
						<ThemeToggle />
					</div>
				</div>
			</section>

			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">
					Editor Defaults (Vault)
				</h2>
				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4"
				>
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Font Size
							<input
								type="number"
								min="12"
								max="24"
								value={editorSettings.fontSize}
								onchange={(event) =>
									updateEditorSettings({
										fontSize: Number((event.currentTarget as HTMLInputElement).value),
									})}
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
							/>
						</label>
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Line Wrap
							<select
								value={String(editorSettings.wordWrap)}
								onchange={(event) =>
									updateEditorSettings({
										wordWrap: (event.currentTarget as HTMLSelectElement).value === 'true',
									})}
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
							>
								<option value="true">Enabled</option>
								<option value="false">Disabled</option>
							</select>
						</label>
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Vim Mode
							<select
								value={String(editorSettings.vimMode)}
								onchange={(event) =>
									updateEditorSettings({
										vimMode: (event.currentTarget as HTMLSelectElement).value === 'true',
									})}
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
							>
								<option value="false">Disabled</option>
								<option value="true">Enabled</option>
							</select>
						</label>
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Toolbar Density
							<select
								value={editorSettings.toolbarDensity}
								onchange={(event) =>
									updateEditorSettings({
										toolbarDensity: (event.currentTarget as HTMLSelectElement).value as
											| 'compact'
											| 'comfortable',
									})}
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
							>
								<option value="comfortable">Comfortable</option>
								<option value="compact">Compact</option>
							</select>
						</label>
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Split Pane
							<select
								value={String(editorSettings.splitPane)}
								onchange={(event) =>
									updateEditorSettings({
										splitPane: (event.currentTarget as HTMLSelectElement).value === 'true',
									})}
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
							>
								<option value="true">Editor + Preview</option>
								<option value="false">Editor Only</option>
							</select>
						</label>
					</div>
				</div>
			</section>

			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Onboarding</h2>
				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4"
				>
					<p class="text-sm text-ink dark:text-tavern-text font-medium">
						Checklist progress: {onboardingState.completedCount}/{ONBOARDING_STEPS.length}
					</p>
					<p class="text-xs text-ink-muted dark:text-tavern-muted mt-1">
						Use these controls to reopen or reset first-run guidance.
					</p>
					<div class="mt-3 flex items-center gap-2">
						<Button variant="secondary" size="sm" onclick={() => onboardingState.reopenChecklist()}>
							Reopen Checklist
						</Button>
						<Button variant="ghost" size="sm" onclick={() => onboardingState.reset()}>
							Reset Onboarding
						</Button>
					</div>
				</div>
			</section>

			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">
					Template Automation
				</h2>
				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 space-y-3"
				>
					<p class="text-xs text-ink-muted dark:text-tavern-muted">
						Template variables use this context: <code>{'{{date_iso}}'}</code>,
						<code>{'{{campaign_name}}'}</code>, <code>{'{{session_number}}'}</code>, and
						<code>{'{{character_names_csv}}'}</code>.
					</p>
					<div class="grid gap-3 sm:grid-cols-2">
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Campaign Name
							<input
								type="text"
								bind:value={templateCampaignName}
								placeholder="Storm King's Thunder"
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
							/>
						</label>
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Next Session Number
							<input
								type="number"
								min="1"
								step="1"
								bind:value={templateSessionNumber}
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
							/>
						</label>
					</div>
					<label class="text-xs text-ink-muted dark:text-tavern-muted block">
						Character Names (comma-separated)
						<input
							type="text"
							bind:value={templateCharacterNamesText}
							placeholder="Aelar, Mira, Toren"
							class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
						/>
					</label>
					<div class="flex items-center gap-2">
						<Button
							variant="secondary"
							size="sm"
							onclick={saveTemplateContextSettings}
							disabled={savingTemplateContext}
						>
							{savingTemplateContext ? 'Saving...' : 'Save Template Context'}
						</Button>
					</div>
				</div>
			</section>

			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">
					Keyboard Shortcuts
				</h2>
				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface overflow-hidden"
				>
					<table class="w-full text-sm">
						<thead>
							<tr
								class="border-b border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt"
							>
								<th
									class="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
									>Shortcut</th
								>
								<th
									class="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint"
									>Action</th
								>
							</tr>
						</thead>
						<tbody>
							{#each [['Ctrl+N', 'Create new note'], ['Ctrl+P', 'Quick switcher'], ['Ctrl+B', 'Toggle sidebar / Bold (in editor)'], ['Ctrl+Shift+F', 'Global search'], ['Ctrl+S', 'Save note (in editor)'], ['Ctrl+I', 'Italic (in editor)'], ['Ctrl+E', 'Inline code (in editor)'], ['Ctrl+K', 'Insert link (in editor)'], ['Ctrl+Z', 'Undo (in editor)'], ['Ctrl+Shift+Z', 'Redo (in editor)']] as [shortcut, action] (shortcut)}
								<tr class="border-b border-border dark:border-tavern-border last:border-0">
									<td class="px-4 py-2.5">
										<kbd
											class="font-mono text-xs px-1.5 py-0.5 rounded bg-surface-alt dark:bg-tavern-surface-alt border border-border dark:border-tavern-border text-accent dark:text-tavern-accent"
											>{shortcut}</kbd
										>
									</td>
									<td class="px-4 py-2.5 text-ink dark:text-tavern-text">{action}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>

			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">About</h2>
				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4"
				>
					<p class="text-sm text-ink dark:text-tavern-text font-medium">DND Tools v0.2.0</p>
					<p class="text-sm text-ink-muted dark:text-tavern-muted mt-1">
						Electron-first local vault editor with built-in MCP sidecar support.
					</p>
					<p class="text-xs text-ink-faint dark:text-tavern-faint mt-3">
						Data is stored in local markdown files in your selected vault folder.
					</p>
				</div>
			</section>
		</div>
	{:else if activeTab === 'vault'}
		<div
			role="tabpanel"
			id="settings-panel-vault"
			aria-labelledby="settings-tab-vault"
			class="space-y-8"
		>
			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Vault</h2>
				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4"
				>
					<div class="grid grid-cols-3 gap-4 text-center mb-4">
						<div>
							<div class="text-2xl font-bold text-accent dark:text-tavern-accent">
								{vaultState.noteCount}
							</div>
							<div class="text-xs text-ink-muted dark:text-tavern-muted">Notes</div>
						</div>
						<div>
							<div class="text-2xl font-bold text-accent dark:text-tavern-accent">
								{vaultState.tagCounts.length}
							</div>
							<div class="text-xs text-ink-muted dark:text-tavern-muted">Tags</div>
						</div>
						<div>
							<div class="text-2xl font-bold text-accent dark:text-tavern-accent">
								{notesState.deletedNotes.length}
							</div>
							<div class="text-xs text-ink-muted dark:text-tavern-muted">In Trash</div>
						</div>
					</div>

					{#if notesState.deletedNotes.length > 0}
						<div class="pt-3 border-t border-border dark:border-tavern-border">
							<Button variant="danger" size="sm" onclick={handleEmptyTrash}>
								Empty Trash ({notesState.deletedNotes.length})
							</Button>
						</div>
					{/if}

					<div class="pt-3 border-t border-border dark:border-tavern-border">
						<p class="text-xs text-ink-muted dark:text-tavern-muted">Desktop Vault Folder</p>
						<p class="text-xs font-mono text-ink-faint dark:text-tavern-faint break-all mt-1">
							{desktopVaultDir || (refreshingDesktopState ? 'Loading...' : 'Unavailable')}
						</p>
						<div class="mt-3 flex items-center gap-2">
							<Button variant="secondary" size="sm" onclick={handleChangeDesktopVault}>
								Change Vault Folder
							</Button>
							<Button variant="ghost" size="sm" onclick={refreshDesktopState}>
								Refresh Status
							</Button>
						</div>
					</div>

					<div class="pt-3 border-t border-border dark:border-tavern-border space-y-3">
						<div class="flex items-center justify-between gap-2">
							<div>
								<p class="text-xs text-ink-muted dark:text-tavern-muted">Metadata Integrity</p>
								<p class="text-xs text-ink-faint dark:text-tavern-faint mt-1">
									{integrityReport
										? integrityReport.healthy
											? 'All .vault metadata and note markers passed validation.'
											: `${integrityReport.issues.length + integrityReport.noteIssues.length} issue${integrityReport.issues.length + integrityReport.noteIssues.length === 1 ? '' : 's'} detected.`
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

						{#if integrityReport && integrityReport.issues.length > 0}
							<ul
								class="rounded border border-border dark:border-tavern-border divide-y divide-border dark:divide-tavern-border"
							>
								{#each integrityReport.issues as issue (issue.file)}
									<li class="px-3 py-2 text-xs">
										<p class="font-mono text-ink dark:text-tavern-text">{issue.file}</p>
										<p class="text-ink-muted dark:text-tavern-muted mt-1">
											{issue.status}{issue.repaired ? ' (repaired)' : ''}
										</p>
									</li>
								{/each}
							</ul>
						{/if}

						{#if integrityReport && integrityReport.noteIssues.length > 0}
							<ul
								class="rounded border border-border dark:border-tavern-border divide-y divide-border dark:divide-tavern-border"
							>
								{#each integrityReport.noteIssues as issue (issue.noteId + issue.filePath)}
									<li class="px-3 py-2 text-xs">
										<p class="font-mono text-ink dark:text-tavern-text">{issue.filePath}</p>
										<p class="text-ink-muted dark:text-tavern-muted mt-1">
											{issue.status}{issue.repaired ? ' (repaired)' : ''}
										</p>
									</li>
								{/each}
							</ul>
						{/if}

						<div class="flex items-center gap-2">
							<Button
								variant="secondary"
								size="sm"
								onclick={handleRepairIntegrity}
								disabled={repairingIntegrity}
							>
								{repairingIntegrity ? 'Repairing...' : 'Repair Metadata'}
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onclick={refreshDesktopState}
								disabled={refreshingDesktopState}
							>
								Rescan
							</Button>
						</div>
					</div>
				</div>
			</section>

			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Safety Snapshots</h2>
				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 space-y-4"
				>
					<div class="grid md:grid-cols-2 gap-4">
						<div>
							<label
								class="text-xs text-ink-muted dark:text-tavern-muted block mb-1"
								for="backup-cadence"
							>
								Auto backup cadence
							</label>
							<select
								id="backup-cadence"
								class="w-full rounded border border-border dark:border-tavern-border bg-white dark:bg-tavern-surface-alt px-2 py-1.5 text-sm"
								bind:value={backupCadence}
							>
								<option value="hourly">Hourly</option>
								<option value="daily">Daily</option>
								<option value="manual">Manual only</option>
							</select>
						</div>
						<div>
							<label
								class="text-xs text-ink-muted dark:text-tavern-muted block mb-1"
								for="backup-retention"
							>
								Retention count
							</label>
							<input
								id="backup-retention"
								type="number"
								min="1"
								step="1"
								class="w-full rounded border border-border dark:border-tavern-border bg-white dark:bg-tavern-surface-alt px-2 py-1.5 text-sm"
								bind:value={backupRetentionCount}
							/>
						</div>
					</div>

					<div class="flex items-center gap-2">
						<Button
							variant="secondary"
							size="sm"
							onclick={saveBackupSettings}
							disabled={savingBackupSettings}
						>
							{savingBackupSettings ? 'Saving...' : 'Save Backup Settings'}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={() => createSafetySnapshot('manual')}
							disabled={creatingSnapshot}
						>
							{creatingSnapshot ? 'Creating...' : 'Create Safety Snapshot'}
						</Button>
					</div>

					<div class="border-t border-border dark:border-tavern-border pt-4 space-y-2">
						<p class="text-sm font-medium text-ink dark:text-tavern-text">
							Restore deleted notes from snapshot
						</p>
						{#if safetySnapshots.length === 0}
							<p class="text-xs text-ink-muted dark:text-tavern-muted">
								No snapshots available yet.
							</p>
						{:else}
							<div class="flex flex-col md:flex-row gap-2 md:items-center">
								<select
									class="flex-1 rounded border border-border dark:border-tavern-border bg-white dark:bg-tavern-surface-alt px-2 py-1.5 text-sm"
									bind:value={selectedSnapshotId}
								>
									{#each safetySnapshots as snapshot (snapshot.id)}
										<option value={snapshot.id}>
											{new Date(snapshot.createdAt).toLocaleString()} - {snapshot.reason} ({snapshot.noteCount}
											notes)
										</option>
									{/each}
								</select>
								<Button
									variant="secondary"
									size="sm"
									onclick={handleRestoreDeletedFromSnapshot}
									disabled={!selectedSnapshotId || restoringSnapshot}
								>
									{restoringSnapshot ? 'Restoring...' : 'Restore Deleted Notes'}
								</Button>
							</div>
						{/if}
					</div>
				</div>
			</section>

			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Import and Export</h2>
				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 space-y-4"
				>
					<div class="flex items-start justify-between gap-4">
						<div>
							<p class="text-sm font-medium text-ink dark:text-tavern-text">Export Vault</p>
							<p class="text-xs text-ink-muted dark:text-tavern-muted mt-0.5">
								Download all notes as a JSON bundle
							</p>
						</div>
						<Button variant="secondary" size="sm" onclick={handleExportAll}>Export All</Button>
					</div>
					<div
						class="border-t border-border dark:border-tavern-border pt-4 flex items-start justify-between gap-4"
					>
						<div>
							<p class="text-sm font-medium text-ink dark:text-tavern-text">Import Notes</p>
							<p class="text-xs text-ink-muted dark:text-tavern-muted mt-0.5">
								Import .md files or a DND Tools export (.json)
							</p>
						</div>
						<Button variant="secondary" size="sm" onclick={handleImportFiles}>Import</Button>
					</div>
				</div>
			</section>
		</div>
	{:else if activeTab === 'mcp'}
		<div
			role="tabpanel"
			id="settings-panel-mcp"
			aria-labelledby="settings-tab-mcp"
			class="space-y-8"
		>
			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">MCP Sidecar</h2>
				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 space-y-3"
				>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-sm font-medium text-ink dark:text-tavern-text">State</p>
							<p class="text-xs text-ink-muted dark:text-tavern-muted mt-0.5">
								Runs the local MCP server against your selected vault for AI tooling.
							</p>
						</div>
						<span
							class="px-2 py-0.5 rounded-full text-xs font-medium"
							class:bg-emerald-100={mcpStateLabel === 'running'}
							class:text-emerald-800={mcpStateLabel === 'running'}
							class:bg-amber-100={mcpStateLabel === 'stopped'}
							class:text-amber-800={mcpStateLabel === 'stopped'}
							class:bg-rose-100={mcpStateLabel === 'error'}
							class:text-rose-800={mcpStateLabel === 'error'}
						>
							{mcpStateLabel}
						</span>
					</div>

					<div class="text-xs text-ink-faint dark:text-tavern-faint space-y-1">
						<p>{mcpStateMessage}</p>
						<p>PID: {mcpStatus?.pid ?? 'n/a'}</p>
						<p>Entry: {mcpStatus?.entry ?? 'not available'}</p>
						<p>Last Start: {mcpStatus?.lastStartedAt ?? 'n/a'}</p>
						<p>Last Stop: {mcpStatus?.lastStoppedAt ?? 'n/a'}</p>
						<p>Last Exit Reason: {mcpStatus?.lastExitReason ?? 'n/a'}</p>
						<p>Restarts: {mcpStatus?.restartCount ?? 0}</p>
						<p>Crashes: {mcpStatus?.crashCount ?? 0}</p>
						{#if mcpStatus?.error}
							<p class="text-rose-600">Last Error: {mcpStatus.error}</p>
						{/if}
					</div>

					<div
						class="pt-2 border-t border-border dark:border-tavern-border flex items-center gap-2"
					>
						<Button
							variant="secondary"
							size="sm"
							onclick={handleRestartMcpSidecar}
							disabled={restartingMcp}
						>
							{restartingMcp ? 'Restarting...' : 'Restart MCP Sidecar'}
						</Button>
						<Button variant="ghost" size="sm" onclick={refreshDesktopState}>Refresh</Button>
					</div>
				</div>
			</section>

			<section id="mcp-changes">
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">
					MCP Pending Changes
				</h2>

				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 space-y-3"
				>
					<p class="text-xs text-ink-muted dark:text-tavern-muted">
						Policy presets are tracked per agent. Read-only actions are always safe, and structural
						edits can require manual review.
					</p>
					<div class="grid md:grid-cols-2 gap-3">
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Default preset
							<select
								value={mcpPolicySettings.defaultPresetId}
								onchange={(event) =>
									(mcpPolicySettings = {
										...mcpPolicySettings,
										defaultPresetId: (event.currentTarget as HTMLSelectElement)
											.value as DesktopMcpPolicySettings['defaultPresetId'],
									})}
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
							>
								<option value="strict_review">Strict review</option>
								<option value="balanced">Balanced</option>
								<option value="trusted">Trusted</option>
							</select>
						</label>
						<div class="flex items-end">
							<Button
								variant="secondary"
								size="sm"
								onclick={saveMcpPolicySettings}
								disabled={savingMcpPolicySettings}
							>
								{savingMcpPolicySettings ? 'Saving...' : 'Save Policy'}
							</Button>
						</div>
					</div>
					{#if mcpKnownAgents.length > 0}
						<div class="grid md:grid-cols-2 gap-3">
							{#each mcpKnownAgents as agentId (agentId)}
								<label class="text-xs text-ink-muted dark:text-tavern-muted">
									Agent: {agentId}
									<select
										value={mcpPolicySettings.perAgent[agentId] ?? mcpPolicySettings.defaultPresetId}
										onchange={(event) =>
											updateAgentPreset(
												agentId,
												(event.currentTarget as HTMLSelectElement)
													.value as DesktopMcpPolicySettings['defaultPresetId'],
											)}
										class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
									>
										<option value="strict_review">Strict review</option>
										<option value="balanced">Balanced</option>
										<option value="trusted">Trusted</option>
									</select>
								</label>
							{/each}
						</div>
					{/if}
				</div>

				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 mt-4 space-y-3"
				>
					<div class="grid md:grid-cols-2 lg:grid-cols-5 gap-2">
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Type
							<select
								bind:value={mcpChangeFilterType}
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
							>
								<option value="all">All</option>
								<option value="create">Create</option>
								<option value="update">Update</option>
								<option value="soft_delete">Soft delete</option>
								<option value="restore">Restore</option>
								<option value="permanent_delete">Permanent delete</option>
							</select>
						</label>
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Risk
							<select
								bind:value={mcpChangeFilterRisk}
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
							>
								<option value="all">All</option>
								<option value="structural">Structural</option>
								<option value="safe">Safe content</option>
							</select>
						</label>
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Conflicts
							<select
								bind:value={mcpChangeFilterConflict}
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
							>
								<option value="all">All</option>
								<option value="conflicted">Conflicted</option>
								<option value="clean">Clean</option>
							</select>
						</label>
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Agent
							<select
								bind:value={mcpChangeFilterAgent}
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
							>
								<option value="all">All agents</option>
								{#each mcpKnownAgents as agentId (agentId)}
									<option value={agentId}>{agentId}</option>
								{/each}
							</select>
						</label>
						<label class="text-xs text-ink-muted dark:text-tavern-muted">
							Diff search
							<input
								type="text"
								bind:value={mcpDiffSearch}
								placeholder="Find text in summary or diff"
								class="mt-1 w-full rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt px-2 py-1 text-sm text-ink dark:text-tavern-text"
							/>
						</label>
					</div>

					<div class="flex flex-wrap items-center gap-2">
						<Button
							variant="secondary"
							size="sm"
							onclick={() =>
								handleApproveSelectedMcpChanges(filteredMcpChanges.map((change) => change.id))}
							disabled={applyingMcpChanges || filteredMcpChanges.length === 0}
						>
							Approve Filtered ({filteredMcpChanges.length})
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={() =>
								handleRejectSelectedMcpChanges(filteredMcpChanges.map((change) => change.id))}
							disabled={applyingMcpChanges || filteredMcpChanges.length === 0}
						>
							Reject Filtered ({filteredMcpChanges.length})
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onclick={() => selectAllVisibleMcpChanges(filteredMcpChanges)}
							disabled={filteredMcpChanges.length === 0}
						>
							Select Visible
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={clearMcpSelection}
							disabled={selectedMcpChangeIds.length === 0}
						>
							Clear Selection
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onclick={() =>
								handleApproveSelectedMcpChanges(
									selectedVisibleMcpChanges.map((change) => change.id),
								)}
							disabled={applyingMcpChanges || selectedVisibleMcpChanges.length === 0}
						>
							Approve Selected ({selectedVisibleMcpChanges.length})
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={() =>
								handleRejectSelectedMcpChanges(
									selectedVisibleMcpChanges.map((change) => change.id),
								)}
							disabled={applyingMcpChanges || selectedVisibleMcpChanges.length === 0}
						>
							Reject Selected ({selectedVisibleMcpChanges.length})
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onclick={handleApproveAllMcpChanges}
							disabled={applyingMcpChanges || mcpChangesState.count === 0}
						>
							Approve All
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={handleRejectAllMcpChanges}
							disabled={applyingMcpChanges || mcpChangesState.count === 0}
						>
							Reject All
						</Button>
					</div>
				</div>

				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface overflow-hidden mt-4"
				>
					{#if mcpChangesState.loading}
						<div class="p-4 text-sm text-ink-muted dark:text-tavern-muted">
							Loading pending changes...
						</div>
					{:else if filteredMcpChanges.length === 0}
						<div class="p-4 text-sm text-ink-muted dark:text-tavern-muted">
							No pending MCP changes match the active filters.
						</div>
					{:else}
						<ul class="divide-y divide-border dark:divide-tavern-border">
							{#each filteredMcpChanges as change (change.id)}
								<li class="p-4 flex items-start justify-between gap-4">
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<input
												type="checkbox"
												checked={selectedMcpChangeIds.includes(change.id)}
												onchange={(event) =>
													toggleMcpSelection(
														change.id,
														(event.currentTarget as HTMLInputElement).checked,
													)}
												aria-label={`Select change ${change.id}`}
											/>
											<p class="text-sm font-medium text-ink dark:text-tavern-text truncate">
												{change.summary}
											</p>
											<span
												class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-alt dark:bg-tavern-surface-alt text-ink-faint dark:text-tavern-faint"
											>
												{change.type}
											</span>
											<span
												class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-alt dark:bg-tavern-surface-alt text-ink-faint dark:text-tavern-faint"
											>
												agent:{change.agentId ?? 'default-agent'}
											</span>
											{#if change.preview?.semantic.structural}
												<span
													class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800"
												>
													structural
												</span>
											{:else}
												<span
													class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800"
												>
													safe
												</span>
											{/if}
											{#if change.conflict}
												<span
													class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800"
												>
													conflict
												</span>
											{/if}
										</div>
										<p class="text-xs text-ink-muted dark:text-tavern-muted mt-1">
											{change.noteId} - {change.after?.note.filePath ??
												change.before?.note.filePath ??
												'path pending'}
										</p>
										{#if change.policy}
											<p class="text-xs text-ink-muted dark:text-tavern-muted mt-1">
												Policy: {change.policy.presetId} - {change.policy.reason}
											</p>
										{/if}
										{#if change.conflict}
											<p class="text-xs text-rose-600 mt-1">
												Conflict detected: {change.conflict.details}
											</p>
										{/if}
										{#if change.preview}
											<p class="text-xs text-ink-muted dark:text-tavern-muted mt-2">
												{change.preview.summary}
											</p>
											<p class="text-xs text-ink-faint dark:text-tavern-faint mt-1">
												Link impact: +{change.preview.linkImpact.added} / -{change.preview
													.linkImpact.removed}
											</p>
											<pre
												class="mt-2 text-xs font-mono whitespace-pre-wrap break-words rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt p-2 text-ink-faint dark:text-tavern-faint">{change
													.preview.compactDiff}</pre>
											<details class="mt-2">
												<summary class="cursor-pointer text-xs text-accent dark:text-tavern-accent">
													Show full changes
												</summary>
												<pre
													class="mt-2 text-xs font-mono whitespace-pre-wrap break-words rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt p-2 text-ink-faint dark:text-tavern-faint">{change
														.preview.fullDiff}</pre>
											</details>
										{/if}
									</div>
									<div class="flex items-center gap-2 shrink-0">
										<Button
											variant="secondary"
											size="sm"
											onclick={() => handleApproveMcpChange(change.id)}
											disabled={applyingMcpChanges}
										>
											Approve
										</Button>
										<Button
											variant="ghost"
											size="sm"
											onclick={() => handleRejectMcpChange(change.id)}
											disabled={applyingMcpChanges}
										>
											Reject
										</Button>
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<div class="mt-6">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-base font-semibold text-ink dark:text-tavern-text">MCP Audit Trail</h3>
						<Button
							variant="ghost"
							size="sm"
							onclick={loadMcpAuditTrail}
							disabled={mcpAuditLoading}
						>
							{mcpAuditLoading ? 'Refreshing...' : 'Refresh Audit'}
						</Button>
					</div>
					<div
						class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface overflow-hidden"
					>
						{#if mcpAuditLoading}
							<div class="p-4 text-sm text-ink-muted dark:text-tavern-muted">
								Loading MCP audit trail...
							</div>
						{:else if mcpAuditTrail.length === 0}
							<div class="p-4 text-sm text-ink-muted dark:text-tavern-muted">
								No MCP audit history yet.
							</div>
						{:else}
							<ul class="divide-y divide-border dark:divide-tavern-border">
								{#each mcpAuditTrail as change (change.id + (change.resolvedAt ?? change.createdAt))}
									<li class="p-3 text-xs space-y-1">
										<p class="font-medium text-ink dark:text-tavern-text">
											{change.status} - {change.summary}
										</p>
										<p class="text-ink-muted dark:text-tavern-muted">
											When: {change.resolvedAt ?? change.createdAt} | Agent: {change.agentId ??
												'default-agent'} | Why: {change.policy?.reason ?? 'manual review'}
										</p>
										{#if change.audit && change.audit.length > 0}
											<p class="text-ink-faint dark:text-tavern-faint">
												Last event: {change.audit[change.audit.length - 1]?.action} by {change
													.audit[change.audit.length - 1]?.actor}
											</p>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</div>
			</section>
		</div>
	{:else if activeTab === 'health'}
		<div
			role="tabpanel"
			id="settings-panel-health"
			aria-labelledby="settings-tab-health"
			class="space-y-8"
		>
			<section>
				<div class="flex items-center justify-between gap-3 mb-4">
					<h2 class="text-lg font-semibold text-ink dark:text-tavern-text">System Health</h2>
					<div class="flex items-center gap-2">
						<Button
							variant="secondary"
							size="sm"
							onclick={handleExportDiagnostics}
							disabled={exportingDiagnostics}
						>
							{exportingDiagnostics ? 'Exporting...' : 'Export Diagnostics Bundle'}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={refreshDesktopState}
							disabled={refreshingDesktopState}
						>
							Refresh
						</Button>
					</div>
				</div>

				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 space-y-4"
				>
					<p class="text-xs text-ink-muted dark:text-tavern-muted">
						Latest refresh: {systemHealth?.generatedAt ?? 'n/a'}
					</p>

					<div class="grid gap-2 md:grid-cols-2">
						<div class="rounded border border-border dark:border-tavern-border p-3">
							<p class="text-xs text-ink-muted dark:text-tavern-muted">
								Last Successful Runtime Bootstrap
							</p>
							<p class="text-sm font-mono text-ink dark:text-tavern-text mt-1">
								{systemHealth?.lastSuccessful.runtime_bootstrap ?? 'n/a'}
							</p>
						</div>
						<div class="rounded border border-border dark:border-tavern-border p-3">
							<p class="text-xs text-ink-muted dark:text-tavern-muted">
								Last Successful Vault Sync
							</p>
							<p class="text-sm font-mono text-ink dark:text-tavern-text mt-1">
								{systemHealth?.lastSuccessful.vault_sync ?? 'n/a'}
							</p>
						</div>
						<div class="rounded border border-border dark:border-tavern-border p-3">
							<p class="text-xs text-ink-muted dark:text-tavern-muted">
								Last Successful Search Index Build
							</p>
							<p class="text-sm font-mono text-ink dark:text-tavern-text mt-1">
								{systemHealth?.lastSuccessful.search_index ?? 'n/a'}
							</p>
						</div>
						<div class="rounded border border-border dark:border-tavern-border p-3">
							<p class="text-xs text-ink-muted dark:text-tavern-muted">
								Last Successful Link Graph Build
							</p>
							<p class="text-sm font-mono text-ink dark:text-tavern-text mt-1">
								{systemHealth?.lastSuccessful.link_graph_build ?? 'n/a'}
							</p>
						</div>
					</div>
				</div>
			</section>

			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">
					MCP Lifecycle Telemetry
				</h2>
				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface overflow-hidden"
				>
					{#if !systemHealth || systemHealth.mcpLifecycle.length === 0}
						<div class="p-4 text-sm text-ink-muted dark:text-tavern-muted">
							No lifecycle events yet.
						</div>
					{:else}
						<ul class="divide-y divide-border dark:divide-tavern-border">
							{#each systemHealth.mcpLifecycle as lifecycle (lifecycle.at + lifecycle.event)}
								<li class="p-3 text-xs">
									<p class="text-ink dark:text-tavern-text font-medium">
										{lifecycle.event} at {lifecycle.at}
									</p>
									<p class="text-ink-muted dark:text-tavern-muted mt-1">
										PID: {lifecycle.pid ?? 'n/a'} - Reason: {lifecycle.reason ?? 'n/a'}
									</p>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</section>

			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">
					Structured Error Events
				</h2>
				<div
					class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface overflow-hidden"
				>
					{#if !systemHealth || systemHealth.recentErrors.length === 0}
						<div class="p-4 text-sm text-ink-muted dark:text-tavern-muted">
							No recent errors recorded.
						</div>
					{:else}
						<ul class="divide-y divide-border dark:divide-tavern-border">
							{#each systemHealth.recentErrors as error (error.id)}
								<li class="p-3 text-xs">
									<p class="text-ink dark:text-tavern-text font-medium">
										[{error.category}] {error.code}
									</p>
									<p class="text-ink-muted dark:text-tavern-muted mt-1">{error.message}</p>
									<p class="text-ink-faint dark:text-tavern-faint mt-1">{error.at}</p>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</section>
		</div>
	{/if}
</div>
