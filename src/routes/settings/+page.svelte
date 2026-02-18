<script lang="ts">
	import { onMount } from 'svelte';
	import ThemeToggle from '$lib/components/common/ThemeToggle.svelte';
	import Button from '$lib/components/common/Button.svelte';
	import { vaultState } from '$lib/stores/vault.svelte.js';
	import { notesState } from '$lib/stores/notes.svelte.js';
	import { mcpChangesState } from '$lib/stores/mcp-changes.svelte.js';
	import { toastState } from '$lib/stores/toast.svelte.js';
	import {
		exportAllNotes,
		parseMarkdownFile,
		parseJsonBundle,
	} from '$lib/services/export.js';
	import { searchService } from '$lib/services/search.js';
	import { getStorage } from '$lib/storage/index.js';
	import { linksState } from '$lib/stores/links.svelte.js';
	import type { Note } from '$lib/types/note.js';
	import { createFolderId } from '$lib/types/note.js';
	import { createNewNote } from '$lib/utils/note-factory.js';
	import {
		getDesktopBackendInfo,
		getDesktopIntegrityReport,
		pickDesktopVaultDirectory,
		getDesktopMcpStatus,
		repairDesktopIntegrity,
		restartDesktopMcpSidecar,
		type DesktopIntegrityReport,
		type DesktopMcpStatus,
	} from '$lib/desktop/bridge.js';

	type SettingsTabId = 'general' | 'vault' | 'mcp';
	type SettingsTab = {
		id: SettingsTabId;
		label: string;
	};

	let desktopVaultDir = $state<string>('');
	let mcpStatus = $state<DesktopMcpStatus | null>(null);
	let integrityReport = $state<DesktopIntegrityReport | null>(null);
	let refreshingDesktopState = $state(false);
	let repairingIntegrity = $state(false);
	let restartingMcp = $state(false);
	let applyingMcpChanges = $state(false);
	let activeTab = $state<SettingsTabId>('general');

	const settingsTabs: readonly SettingsTab[] = [
		{ id: 'general', label: 'General' },
		{ id: 'vault', label: 'Vault' },
		{ id: 'mcp', label: 'MCP' },
	] as const;

	const visibleTabs = $derived(settingsTabs);

	onMount(() => {
		void refreshDesktopState();
		void mcpChangesState.refresh();
	});

	$effect(() => {
		if (!visibleTabs.some((tab) => tab.id === activeTab)) {
			activeTab = visibleTabs[0]?.id ?? 'general';
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

	async function refreshDesktopState(): Promise<void> {
		refreshingDesktopState = true;
		try {
			const [backendInfo, nextMcpStatus, nextIntegrity] = await Promise.all([
				getDesktopBackendInfo(),
				getDesktopMcpStatus(),
				getDesktopIntegrityReport(),
			]);
			desktopVaultDir = backendInfo.vaultDir;
			mcpStatus = nextMcpStatus;
			integrityReport = nextIntegrity;
		} catch (error) {
			desktopVaultDir = '';
			mcpStatus = null;
			integrityReport = null;
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
				linksState.buildGraph(),
				mcpChangesState.refresh(),
			]);
			if (repaired.issues.length === 0) {
				toastState.success('Metadata integrity is healthy');
				return;
			}
			const repairedCount = repaired.issues.filter((issue) => issue.repaired).length;
			toastState.success(`Repaired ${repairedCount} metadata file${repairedCount === 1 ? '' : 's'}`);
		} catch (error) {
			toastState.error(`Failed to repair metadata integrity: ${String(error)}`);
		} finally {
			repairingIntegrity = false;
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
			const result = await storage.importNotes(parsedNotes);
			await notesState.loadAll();
			await Promise.all([searchService.buildIndex(notesState.notes), linksState.buildGraph()]);
			if (result.errors.length > 0) {
				importErrors.push(...result.errors);
			}
			if (result.imported > 0) {
				toastState.success(
					`Imported ${result.imported} ${result.imported === 1 ? 'note' : 'notes'}`,
				);
			}
		} catch (error) {
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
				linksState.buildGraph(),
				refreshDesktopState(),
				mcpChangesState.refresh(),
			]);
			toastState.success('Switched vault folder');
		} catch (error) {
			toastState.error(`Failed to switch vault folder: ${String(error)}`);
		}
	}

	async function handleRestartMcpSidecar(): Promise<void> {
		restartingMcp = true;
		try {
			mcpStatus = await restartDesktopMcpSidecar();
			if (mcpStatus.state === 'running') {
				toastState.success('MCP sidecar restarted');
			} else {
				toastState.error(mcpStatus.error ?? 'MCP sidecar is not running');
			}
		} catch (error) {
			toastState.error(`Failed to restart MCP sidecar: ${String(error)}`);
		} finally {
			restartingMcp = false;
		}
	}

	async function refreshAfterVaultMutation(): Promise<void> {
		await Promise.all([
			notesState.loadAll(),
			refreshDesktopState(),
			mcpChangesState.refresh(),
		]);
		await Promise.all([searchService.buildIndex(notesState.notes), linksState.buildGraph()]);
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
			toastState.error(`Failed to approve change: ${String(error)}`);
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
			toastState.success('Rejected MCP change');
		} catch (error) {
			toastState.error(`Failed to reject change: ${String(error)}`);
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
			toastState.error(`Failed to approve all changes: ${String(error)}`);
		} finally {
			applyingMcpChanges = false;
		}
	}

	async function handleRejectAllMcpChanges(): Promise<void> {
		applyingMcpChanges = true;
		try {
			const count = await mcpChangesState.rejectAll();
			toastState.success(`Rejected ${count} ${count === 1 ? 'change' : 'changes'}`);
		} catch (error) {
			toastState.error(`Failed to reject all changes: ${String(error)}`);
		} finally {
			applyingMcpChanges = false;
		}
	}

	let mcpStateLabel = $derived(mcpStatus?.state ?? 'unknown');
	let mcpStateMessage = $derived.by(() => {
		if (!mcpStatus) return 'Status unavailable.';
		if (mcpStatus.state === 'running') return 'Sidecar is running.';
		if (mcpStatus.state === 'error') return 'Sidecar exited with an error. Fix the cause, then restart.';
		return mcpStatus.error
			? 'Sidecar stopped after an error. Restart to launch it again.'
			: 'Sidecar is stopped. Restart to launch it.';
	});
</script>

<div class="p-6 max-w-content mx-auto">
	<h1 class="text-2xl font-bold text-ink dark:text-tavern-text mb-6" style="font-family: var(--font-serif)">
		Settings
	</h1>

	<div class="mb-6 border-b border-border dark:border-tavern-border">
		<div class="flex flex-wrap gap-2 -mb-px" role="tablist" aria-label="Settings sections" aria-orientation="horizontal">
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
		<div role="tabpanel" id="settings-panel-general" aria-labelledby="settings-tab-general" class="space-y-8">
			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Appearance</h2>
				<div class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface divide-y divide-border dark:divide-tavern-border">
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
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Keyboard Shortcuts</h2>
				<div class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface overflow-hidden">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt">
								<th class="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint">Shortcut</th>
								<th class="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-tavern-faint">Action</th>
							</tr>
						</thead>
						<tbody>
							{#each [
								['Ctrl+N', 'Create new note'],
								['Ctrl+P', 'Quick switcher'],
								['Ctrl+B', 'Toggle sidebar / Bold (in editor)'],
								['Ctrl+Shift+F', 'Global search'],
								['Ctrl+S', 'Save note (in editor)'],
								['Ctrl+I', 'Italic (in editor)'],
								['Ctrl+E', 'Inline code (in editor)'],
								['Ctrl+K', 'Insert link (in editor)'],
								['Ctrl+Z', 'Undo (in editor)'],
								['Ctrl+Shift+Z', 'Redo (in editor)'],
							] as [shortcut, action] (shortcut)}
								<tr class="border-b border-border dark:border-tavern-border last:border-0">
									<td class="px-4 py-2.5">
										<kbd class="font-mono text-xs px-1.5 py-0.5 rounded bg-surface-alt dark:bg-tavern-surface-alt border border-border dark:border-tavern-border text-accent dark:text-tavern-accent">{shortcut}</kbd>
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
				<div class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4">
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
		<div role="tabpanel" id="settings-panel-vault" aria-labelledby="settings-tab-vault" class="space-y-8">
			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Vault</h2>
				<div class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4">
					<div class="grid grid-cols-3 gap-4 text-center mb-4">
						<div>
							<div class="text-2xl font-bold text-accent dark:text-tavern-accent">{vaultState.noteCount}</div>
							<div class="text-xs text-ink-muted dark:text-tavern-muted">Notes</div>
						</div>
						<div>
							<div class="text-2xl font-bold text-accent dark:text-tavern-accent">{vaultState.tagCounts.length}</div>
							<div class="text-xs text-ink-muted dark:text-tavern-muted">Tags</div>
						</div>
						<div>
							<div class="text-2xl font-bold text-accent dark:text-tavern-accent">{notesState.deletedNotes.length}</div>
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
											? 'All .vault metadata files passed validation.'
											: `${integrityReport.issues.length} issue${integrityReport.issues.length === 1 ? '' : 's'} detected in .vault metadata files.`
										: refreshingDesktopState
											? 'Scanning...'
											: 'Status unavailable'}
								</p>
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
							<ul class="rounded border border-border dark:border-tavern-border divide-y divide-border dark:divide-tavern-border">
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

						<div class="flex items-center gap-2">
							<Button variant="secondary" size="sm" onclick={handleRepairIntegrity} disabled={repairingIntegrity}>
								{repairingIntegrity ? 'Repairing...' : 'Repair Metadata'}
							</Button>
							<Button variant="ghost" size="sm" onclick={refreshDesktopState} disabled={refreshingDesktopState}>
								Rescan
							</Button>
						</div>
					</div>
				</div>
			</section>

			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">Import and Export</h2>
				<div class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 space-y-4">
					<div class="flex items-start justify-between gap-4">
						<div>
							<p class="text-sm font-medium text-ink dark:text-tavern-text">Export Vault</p>
							<p class="text-xs text-ink-muted dark:text-tavern-muted mt-0.5">Download all notes as a JSON bundle</p>
						</div>
						<Button variant="secondary" size="sm" onclick={handleExportAll}>Export All</Button>
					</div>
					<div class="border-t border-border dark:border-tavern-border pt-4 flex items-start justify-between gap-4">
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
		<div role="tabpanel" id="settings-panel-mcp" aria-labelledby="settings-tab-mcp" class="space-y-8">
			<section>
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text mb-4">MCP Sidecar</h2>
				<div class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4 space-y-3">
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
						{#if mcpStatus?.error}
							<p class="text-rose-600">Last Error: {mcpStatus.error}</p>
						{/if}
					</div>

					<div class="pt-2 border-t border-border dark:border-tavern-border flex items-center gap-2">
						<Button
							variant="secondary"
							size="sm"
							onclick={handleRestartMcpSidecar}
							disabled={restartingMcp}
						>
							{restartingMcp ? 'Restarting...' : 'Restart MCP Sidecar'}
						</Button>
						<Button variant="ghost" size="sm" onclick={refreshDesktopState}>
							Refresh
						</Button>
					</div>
				</div>
			</section>

			<section id="mcp-changes">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-lg font-semibold text-ink dark:text-tavern-text">MCP Pending Changes</h2>
					<div class="flex items-center gap-2">
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

				<div class="rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface overflow-hidden">
					{#if mcpChangesState.loading}
						<div class="p-4 text-sm text-ink-muted dark:text-tavern-muted">Loading pending changes...</div>
					{:else if mcpChangesState.count === 0}
						<div class="p-4 text-sm text-ink-muted dark:text-tavern-muted">
							No pending MCP changes.
						</div>
					{:else}
						<ul class="divide-y divide-border dark:divide-tavern-border">
							{#each mcpChangesState.pending as change (change.id)}
								<li class="p-4 flex items-start justify-between gap-4">
									<div class="min-w-0">
										<p class="text-sm font-medium text-ink dark:text-tavern-text truncate">
											{change.summary}
										</p>
										<p class="text-xs text-ink-muted dark:text-tavern-muted mt-1">
											{change.type} - {change.noteId}
										</p>
										<p class="text-xs font-mono text-ink-faint dark:text-tavern-faint truncate mt-1">
											{change.after?.note.filePath ?? change.before?.note.filePath ?? 'path pending'}
										</p>
										{#if change.preview}
											<p class="text-xs text-ink-muted dark:text-tavern-muted mt-2">
												{change.preview.summary}
											</p>
											<pre class="mt-2 text-xs font-mono whitespace-pre-wrap break-words rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt p-2 text-ink-faint dark:text-tavern-faint">{change.preview.compactDiff}</pre>
											<details class="mt-2">
												<summary class="cursor-pointer text-xs text-accent dark:text-tavern-accent">
													Show full changes
												</summary>
												<pre class="mt-2 text-xs font-mono whitespace-pre-wrap break-words rounded border border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt p-2 text-ink-faint dark:text-tavern-faint">{change.preview.fullDiff}</pre>
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
			</section>
		</div>
	{/if}
</div>
