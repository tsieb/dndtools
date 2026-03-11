<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import HandoutLibraryPanel from '$lib/ui/handouts/HandoutLibraryPanel.svelte';
	import SyncSettingsPanel from '$lib/ui/settings/SyncSettingsPanel.svelte';
	import GeneralSettingsTab from '$lib/ui/settings/GeneralSettingsTab.svelte';
	import AppearanceSettingsTab from '$lib/ui/settings/AppearanceSettingsTab.svelte';
	import FeaturesSettingsTab from '$lib/ui/settings/FeaturesSettingsTab.svelte';
	import MapsSettingsTab from '$lib/ui/settings/MapsSettingsTab.svelte';
	import AboutTab from '$lib/ui/settings/AboutTab.svelte';
	import WorldCalendarTab from '$lib/ui/settings/WorldCalendarTab.svelte';
	import VaultSettingsTab from '$lib/ui/settings/VaultSettingsTab.svelte';
	import McpSettingsTab from '$lib/ui/settings/McpSettingsTab.svelte';
	import SystemHealthTab from '$lib/ui/settings/SystemHealthTab.svelte';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
	import { vaultHealthState } from '$lib/state/vaultHealth.svelte.js';
	import { featureSettingsState } from '$lib/state/feature-settings.svelte.js';
	import { vaultMaturityState } from '$lib/state/vault-maturity.svelte.js';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { searchService } from '$lib/domain/search.js';
	import { resolveSettingsTabFromUrl, type SettingsTabId } from '$lib/domain/settings-tabs.js';
	import {
		getDesktopBackendInfo,
		getDesktopSystemHealth,
		getDesktopMcpStatus,
		getDesktopUpdateStatus,
		exportDesktopDiagnosticsBundle,
		restartDesktopMcpSidecar,
		rebuildDesktopVaultIndex,
		type DesktopMcpStatus,
		type DesktopUpdateStatus,
		type DesktopSystemHealth,
	} from '$lib/platform/desktop/bridge.js';
	import { reportRuntimeError } from '$lib/runtime/diagnostics.js';

	type SettingsTab = {
		id: SettingsTabId;
		label: string;
		group: 'always' | 'features' | 'advanced' | 'about';
	};

	type BrowserModeGap = {
		feature: string;
		electronBehavior: string;
		browserBehavior: string;
	};

	let desktopVaultDir = $state<string>('');
	let mcpStatus = $state<DesktopMcpStatus | null>(null);
	let systemHealth = $state<DesktopSystemHealth | null>(null);
	let updateStatus = $state<DesktopUpdateStatus | null>(null);
	let refreshingDesktopState = $state(false);
	let restartingMcp = $state(false);
	let rebuildingIndex = $state(false);
	let exportingDiagnostics = $state(false);
	let activeTab = $state<SettingsTabId>('general');
	let advancedGroupExpanded = $state(false);

	const settingsTabs: readonly SettingsTab[] = [
		{ id: 'general', label: 'General', group: 'always' },
		{ id: 'appearance', label: 'Appearance', group: 'always' },
		{ id: 'vault', label: 'Vault', group: 'always' },
		{ id: 'features', label: 'Features', group: 'features' },
		{ id: 'world', label: 'World Calendar', group: 'features' },
		{ id: 'maps', label: 'Maps', group: 'features' },
		{ id: 'mcp', label: 'MCP', group: 'features' },
		{ id: 'health', label: 'System Health', group: 'advanced' },
		{ id: 'sync', label: 'Sync', group: 'advanced' },
		{ id: 'handouts', label: 'Handouts', group: 'advanced' },
		{ id: 'about', label: 'About', group: 'about' },
	] as const;

	const visibleTabs = $derived.by(() =>
		settingsTabs.filter((tab) => {
			if (tab.id === 'maps') {
				return vaultMaturityState.signals.mapCount === 0;
			}
			return true;
		}),
	);
	const alwaysTabs = $derived(visibleTabs.filter((tab) => tab.group === 'always'));
	const featureTabs = $derived(visibleTabs.filter((tab) => tab.group === 'features'));
	const advancedTabs = $derived(visibleTabs.filter((tab) => tab.group === 'advanced'));
	const aboutTab = $derived(visibleTabs.find((tab) => tab.group === 'about') ?? null);
	const isBrowserMode = $derived.by(() => !hasDesktopBridge());
	const webNotificationsSupported = $derived.by(
		() => typeof window !== 'undefined' && 'Notification' in window,
	);
	const browserModeGaps: readonly BrowserModeGap[] = [
		{
			feature: 'Filesystem vault selection',
			electronBehavior: 'Pick and switch local vault folders on disk.',
			browserBehavior: 'Use IndexedDB browser vault. Import/export uses browser file pickers.',
		},
		{
			feature: 'MCP sidecar',
			electronBehavior: 'Local MCP process with staged review workflows.',
			browserBehavior: 'MCP controls are disabled. Suggestions rely on client-side algorithms.',
		},
		{
			feature: 'Auto-update',
			electronBehavior: 'Built-in update channel with staged rollout support.',
			browserBehavior: 'Updates come from normal browser refresh and cache updates.',
		},
		{
			feature: 'Notifications',
			electronBehavior: 'Desktop native notification surface.',
			browserBehavior: 'Uses Web Notifications API when available and permitted.',
		},
	] as const;

	function hasDesktopBridge(): boolean {
		return typeof window !== 'undefined' && !!window.dndtoolsDesktop;
	}

	onMount(() => {
		if (hasDesktopBridge()) {
			void refreshDesktopState();
		}
		if (!featureSettingsState.loaded && !featureSettingsState.loading) {
			void featureSettingsState.loadFromStorage();
		}
		void mcpChangesState.refresh();
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
		const active = visibleTabs.find((tab) => tab.id === activeTab);
		if (active?.group === 'advanced' && !advancedGroupExpanded) {
			advancedGroupExpanded = true;
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

	function tabButtonClass(tabId: SettingsTabId): string {
		return activeTab === tabId
			? 'border-accent bg-accent-subtle text-accent'
			: 'border-border text-ink-muted hover:bg-surface-alt hover:text-ink';
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

	async function refreshRendererAfterSyncChange(): Promise<void> {
		try {
			await notesState.loadAll();
			await Promise.all([searchService.buildIndex(notesState.notes), vaultHealthState.refresh()]);
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_SYNC_REFRESH_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to refresh notes after sync: ${String(error)}`);
		}
	}

	async function refreshDesktopState(): Promise<void> {
		if (!hasDesktopBridge()) {
			desktopVaultDir = '';
			mcpStatus = null;
			systemHealth = null;
			updateStatus = null;
			return;
		}
		refreshingDesktopState = true;
		try {
			const [backendInfo, nextMcpStatus, nextHealth, nextUpdateStatus] = await Promise.all([
				getDesktopBackendInfo(),
				getDesktopMcpStatus(),
				getDesktopSystemHealth(),
				getDesktopUpdateStatus(),
			]);
			desktopVaultDir = backendInfo.vaultDir;
			mcpStatus = nextMcpStatus;
			systemHealth = nextHealth;
			updateStatus = nextUpdateStatus;
		} catch (error) {
			desktopVaultDir = '';
			mcpStatus = null;
			systemHealth = null;
			updateStatus = null;
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_REFRESH_DESKTOP_STATE_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to load desktop runtime info: ${String(error)}`);
		} finally {
			refreshingDesktopState = false;
		}
	}

	async function handleRebuildIndex(): Promise<void> {
		rebuildingIndex = true;
		try {
			const result = await rebuildDesktopVaultIndex();
			await refreshDesktopState();
			await vaultHealthState.refresh();
			toastState.success(`Rebuilt vault index (${result.rebuilt} entries)`);
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_REBUILD_INDEX_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to rebuild index: ${String(error)}`);
		} finally {
			rebuildingIndex = false;
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
				void reportRuntimeError({
					category: 'mcp_sidecar',
					code: 'SETTINGS_MCP_RESTART_NOT_RUNNING',
					error: mcpStatus.error ?? 'MCP sidecar is not running',
					context: { route: '/settings' },
				});
				toastState.error(mcpStatus.error ?? 'MCP sidecar is not running');
			}
		} catch (error) {
			void reportRuntimeError({
				category: 'mcp_sidecar',
				code: 'SETTINGS_MCP_RESTART_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to restart MCP sidecar: ${String(error)}`);
		} finally {
			restartingMcp = false;
		}
	}

	async function handleExportDiagnostics(): Promise<void> {
		exportingDiagnostics = true;
		try {
			const result = await exportDesktopDiagnosticsBundle();
			if (result.canceled) return;
			toastState.success(`Diagnostics bundle exported to ${result.path}`);
		} catch (error) {
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_EXPORT_DIAGNOSTICS_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to export diagnostics bundle: ${String(error)}`);
		} finally {
			exportingDiagnostics = false;
		}
	}
</script>

<div class="p-6 max-w-content mx-auto">
	<h1 class="text-2xl font-bold text-ink mb-6" style="font-family: var(--font-serif)">Settings</h1>

	<div class="grid gap-6 lg:grid-cols-[15rem,1fr]">
		<aside class="h-fit rounded-lg border border-border bg-surface">
			<div class="space-y-4 p-3">
				<section>
					<p class="mb-2 px-2 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
						Always visible
					</p>
					<div role="tablist" aria-label="Settings always visible tabs" class="space-y-1">
						{#each alwaysTabs as tab (tab.id)}
							<button
								type="button"
								role="tab"
								id={`settings-tab-${tab.id}`}
								aria-selected={activeTab === tab.id}
								aria-controls={`settings-panel-${tab.id}`}
								tabindex={activeTab === tab.id ? 0 : -1}
								onclick={() => activateTab(tab.id)}
								onkeydown={(event) => handleTabKeydown(event, tab.id)}
								class="w-full rounded-md border px-2.5 py-2 text-left text-sm font-medium transition-colors {tabButtonClass(
									tab.id,
								)}"
							>
								{tab.label}
							</button>
						{/each}
					</div>
				</section>

				<section>
					<p class="mb-2 px-2 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
						Features
					</p>
					<div role="tablist" aria-label="Settings feature tabs" class="space-y-1">
						{#each featureTabs as tab (tab.id)}
							<button
								type="button"
								role="tab"
								id={`settings-tab-${tab.id}`}
								aria-selected={activeTab === tab.id}
								aria-controls={`settings-panel-${tab.id}`}
								tabindex={activeTab === tab.id ? 0 : -1}
								onclick={() => activateTab(tab.id)}
								onkeydown={(event) => handleTabKeydown(event, tab.id)}
								class="w-full rounded-md border px-2.5 py-2 text-left text-sm font-medium transition-colors {tabButtonClass(
									tab.id,
								)}"
							>
								{tab.label}
							</button>
						{/each}
					</div>
				</section>

				<section>
					<button
						type="button"
						class="flex w-full items-center justify-between rounded-md border border-border px-2.5 py-2 text-left text-sm font-medium text-ink-muted hover:bg-surface-alt"
						onclick={() => (advancedGroupExpanded = !advancedGroupExpanded)}
						aria-expanded={advancedGroupExpanded}
						aria-controls="settings-advanced-group"
					>
						<span>Advanced</span>
						<span class="text-2xs">{advancedGroupExpanded ? 'Hide' : 'Show'}</span>
					</button>
					{#if advancedGroupExpanded}
						<div
							id="settings-advanced-group"
							role="tablist"
							aria-label="Settings advanced tabs"
							class="mt-2 space-y-1"
						>
							{#each advancedTabs as tab (tab.id)}
								<button
									type="button"
									role="tab"
									id={`settings-tab-${tab.id}`}
									aria-selected={activeTab === tab.id}
									aria-controls={`settings-panel-${tab.id}`}
									tabindex={activeTab === tab.id ? 0 : -1}
									onclick={() => activateTab(tab.id)}
									onkeydown={(event) => handleTabKeydown(event, tab.id)}
									class="w-full rounded-md border px-2.5 py-2 text-left text-sm font-medium transition-colors {tabButtonClass(
										tab.id,
									)}"
								>
									{tab.label}
								</button>
							{/each}
						</div>
					{/if}
				</section>
			</div>

			{#if aboutTab}
				<div class="border-t border-border p-3">
					<div role="tablist" aria-label="Settings about tabs">
						<button
							type="button"
							role="tab"
							id={`settings-tab-${aboutTab.id}`}
							aria-selected={activeTab === aboutTab.id}
							aria-controls={`settings-panel-${aboutTab.id}`}
							tabindex={activeTab === aboutTab.id ? 0 : -1}
							onclick={() => activateTab(aboutTab.id)}
							onkeydown={(event) => handleTabKeydown(event, aboutTab.id)}
							class="w-full rounded-md border px-2.5 py-2 text-left text-sm font-medium transition-colors {tabButtonClass(
								aboutTab.id,
							)}"
						>
							{aboutTab.label}
						</button>
					</div>
				</div>
			{/if}
		</aside>

		<div>
			{#if activeTab === 'general'}
				<GeneralSettingsTab />
			{:else if activeTab === 'appearance'}
				<AppearanceSettingsTab />
			{:else if activeTab === 'features'}
				<FeaturesSettingsTab />
			{:else if activeTab === 'about'}
				<AboutTab
					{updateStatus}
					{isBrowserMode}
					{browserModeGaps}
					{webNotificationsSupported}
					onupdatestatus={(status) => {
						updateStatus = status;
					}}
				/>
			{:else if activeTab === 'world'}
				<WorldCalendarTab />
			{:else if activeTab === 'maps'}
				<MapsSettingsTab />
			{:else if activeTab === 'vault'}
				<VaultSettingsTab
					{desktopVaultDir}
					{refreshingDesktopState}
					{rebuildingIndex}
					onrefreshdesktopstate={refreshDesktopState}
					onrebuildindex={handleRebuildIndex}
				/>
			{:else if activeTab === 'sync'}
				<div
					role="tabpanel"
					id="settings-panel-sync"
					aria-labelledby="settings-tab-sync"
					class="space-y-8"
				>
					<SyncSettingsPanel onrefreshlocal={refreshRendererAfterSyncChange} />
				</div>
			{:else if activeTab === 'handouts'}
				<div
					role="tabpanel"
					id="settings-panel-handouts"
					aria-labelledby="settings-tab-handouts"
					class="space-y-8"
				>
					<HandoutLibraryPanel />
				</div>
			{:else if activeTab === 'mcp'}
				<McpSettingsTab
					{mcpStatus}
					{restartingMcp}
					onrestartmcp={handleRestartMcpSidecar}
					onrefreshdesktopstate={refreshDesktopState}
				/>
			{:else if activeTab === 'health'}
				<SystemHealthTab
					{systemHealth}
					{refreshingDesktopState}
					{rebuildingIndex}
					{restartingMcp}
					{exportingDiagnostics}
					onrefreshdesktopstate={refreshDesktopState}
					onrebuildindex={handleRebuildIndex}
					onrestartmcp={handleRestartMcpSidecar}
					onexportdiagnostics={handleExportDiagnostics}
				/>
			{/if}
		</div>
	</div>
</div>
