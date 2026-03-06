<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/ui/common/Button.svelte';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { mcpChangesState } from '$lib/state/mcp-changes.svelte.js';
	import { reportRuntimeError } from '$lib/runtime/diagnostics.js';
	import { markSubsystemSuccess } from '$lib/runtime/diagnostics.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { searchService } from '$lib/domain/search.js';
	import {
		getDesktopMcpPolicySettings,
		setDesktopMcpPolicySettings,
		listDesktopMcpAuditTrail,
		clearDesktopMcpChangelog,
		type DesktopMcpStatus,
		type DesktopMcpChangeRecord,
		type DesktopMcpPolicySettings,
	} from '$lib/platform/desktop/bridge.js';

	interface Props {
		mcpStatus: DesktopMcpStatus | null;
		restartingMcp: boolean;
		onrestartmcp: () => Promise<void>;
		onrefreshdesktopstate: () => Promise<void>;
	}

	let { mcpStatus, restartingMcp, onrestartmcp, onrefreshdesktopstate }: Props = $props();

	type McpPendingFilterType = DesktopMcpChangeRecord['type'] | 'all';
	type McpPendingFilterRisk = 'all' | 'structural' | 'safe';
	type McpPendingFilterConflict = 'all' | 'conflicted' | 'clean';

	let mcpPolicySettings = $state<DesktopMcpPolicySettings>({
		defaultPresetId: 'strict_review',
		perAgent: {},
	});
	let savingMcpPolicySettings = $state(false);
	let mcpAuditTrail = $state<DesktopMcpChangeRecord[]>([]);
	let mcpAuditLoading = $state(false);
	let clearingChangelog = $state(false);
	let applyingMcpChanges = $state(false);
	let mcpChangeFilterType = $state<McpPendingFilterType>('all');
	let mcpChangeFilterRisk = $state<McpPendingFilterRisk>('all');
	let mcpChangeFilterConflict = $state<McpPendingFilterConflict>('all');
	let mcpChangeFilterAgent = $state('all');
	let mcpDiffSearch = $state('');
	let selectedMcpChangeIds = $state<string[]>([]);

	const mcpStateLabel = $derived(mcpStatus?.state ?? 'unknown');
	const mcpStateMessage = $derived.by(() => {
		if (!mcpStatus) return 'Status unavailable.';
		if (mcpStatus.state === 'running') return 'Sidecar is running.';
		if (mcpStatus.state === 'error')
			return 'Sidecar exited with an error. Fix the cause, then restart.';
		return mcpStatus.error
			? 'Sidecar stopped after an error. Restart to launch it again.'
			: 'Sidecar is stopped. Restart to launch it.';
	});

	const mcpKnownAgents = $derived.by(() => {
		const pendingAgents = mcpChangesState.pending
			.map((change) => change.agentId?.trim())
			.filter((agent): agent is string => !!agent);
		const configuredAgents = Object.keys(mcpPolicySettings.perAgent);
		return Array.from(new Set([...configuredAgents, ...pendingAgents])).sort((a, b) =>
			a.localeCompare(b),
		);
	});

	const filteredMcpChanges = $derived.by(() => {
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

	const selectedVisibleMcpChanges = $derived(
		filteredMcpChanges.filter((change) => selectedMcpChangeIds.includes(change.id)),
	);

	$effect(() => {
		const activeIds = new Set(mcpChangesState.pending.map((change) => change.id));
		const nextSelection = selectedMcpChangeIds.filter((id) => activeIds.has(id));
		if (nextSelection.length !== selectedMcpChangeIds.length) {
			selectedMcpChangeIds = nextSelection;
		}
	});

	onMount(() => {
		void loadMcpPolicySettings();
		void loadMcpAuditTrail();
	});

	async function loadMcpPolicySettings(): Promise<void> {
		if (typeof window === 'undefined' || !window.dndtoolsDesktop) return;
		try {
			mcpPolicySettings = await getDesktopMcpPolicySettings();
		} catch (error) {
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_LOAD_MCP_POLICY_SETTINGS_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to load MCP policy settings: ${String(error)}`);
		}
	}

	async function saveMcpPolicySettings(): Promise<void> {
		savingMcpPolicySettings = true;
		try {
			mcpPolicySettings = await setDesktopMcpPolicySettings(mcpPolicySettings);
			toastState.success('Saved MCP policy settings');
		} catch (error) {
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_SAVE_MCP_POLICY_SETTINGS_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to save MCP policy settings: ${String(error)}`);
		} finally {
			savingMcpPolicySettings = false;
		}
	}

	async function loadMcpAuditTrail(): Promise<void> {
		if (typeof window === 'undefined' || !window.dndtoolsDesktop) {
			mcpAuditTrail = [];
			return;
		}
		mcpAuditLoading = true;
		try {
			mcpAuditTrail = await listDesktopMcpAuditTrail(120);
		} catch (error) {
			mcpAuditTrail = [];
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_LOAD_MCP_AUDIT_TRAIL_FAILED',
				error,
				context: { route: '/settings' },
			});
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
		await Promise.all([notesState.loadAll(), onrefreshdesktopstate(), mcpChangesState.refresh()]);
		await searchService.buildIndex(notesState.notes);
		await Promise.all([
			markSubsystemSuccess('vault_sync'),
			markSubsystemSuccess('search_index'),
			markSubsystemSuccess('link_graph_build'),
		]);
		await loadMcpAuditTrail();
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
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_APPROVE_MCP_CHANGE_FAILED',
				error,
				context: { route: '/settings' },
			});
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
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_APPROVE_SELECTED_MCP_CHANGES_FAILED',
				error,
				context: { route: '/settings' },
			});
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
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_REJECT_MCP_CHANGE_FAILED',
				error,
				context: { route: '/settings' },
			});
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
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_REJECT_SELECTED_MCP_CHANGES_FAILED',
				error,
				context: { route: '/settings' },
			});
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
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_APPROVE_ALL_MCP_CHANGES_FAILED',
				error,
				context: { route: '/settings' },
			});
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
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_REJECT_ALL_MCP_CHANGES_FAILED',
				error,
				context: { route: '/settings' },
			});
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

	async function handleClearChangelog(): Promise<void> {
		clearingChangelog = true;
		try {
			const result = await clearDesktopMcpChangelog({ maxAgeMs: 7 * 24 * 60 * 60 * 1000 });
			await loadMcpAuditTrail();
			toastState.success(
				`Cleared ${result.removed} resolved change${result.removed === 1 ? '' : 's'} older than 7 days`,
			);
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_CLEAR_CHANGELOG_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to clear changelog: ${String(error)}`);
		} finally {
			clearingChangelog = false;
		}
	}
</script>

<div role="tabpanel" id="settings-panel-mcp" aria-labelledby="settings-tab-mcp" class="space-y-8">
	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">MCP Sidecar</h2>
		<div class="rounded-lg border border-border bg-surface p-4 space-y-3">
			<div class="flex items-center justify-between">
				<div>
					<p class="text-sm font-medium text-ink">State</p>
					<p class="text-xs text-ink-muted mt-0.5">
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

			<div class="text-xs text-ink-faint space-y-1">
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

			<div class="pt-2 border-t border-border flex items-center gap-2">
				<Button variant="secondary" size="sm" onclick={onrestartmcp} loading={restartingMcp}>
					{restartingMcp ? 'Restarting...' : 'Restart MCP Sidecar'}
				</Button>
				<Button variant="ghost" size="sm" onclick={onrefreshdesktopstate}>Refresh</Button>
			</div>
		</div>
	</section>

	<section id="mcp-changes">
		<h2 class="text-lg font-semibold text-ink mb-4">MCP Pending Changes</h2>

		<div class="rounded-lg border border-border bg-surface p-4 space-y-3">
			<p class="text-xs text-ink-muted">
				Policy presets are tracked per agent. Read-only actions are always safe, and structural
				edits can require manual review.
			</p>
			<div class="grid md:grid-cols-2 gap-3">
				<label class="text-xs text-ink-muted">
					Default preset
					<select
						value={mcpPolicySettings.defaultPresetId}
						onchange={(event) =>
							(mcpPolicySettings = {
								...mcpPolicySettings,
								defaultPresetId: (event.currentTarget as HTMLSelectElement)
									.value as DesktopMcpPolicySettings['defaultPresetId'],
							})}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
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
						loading={savingMcpPolicySettings}
					>
						{savingMcpPolicySettings ? 'Saving...' : 'Save Policy'}
					</Button>
				</div>
			</div>
			{#if mcpKnownAgents.length > 0}
				<div class="grid md:grid-cols-2 gap-3">
					{#each mcpKnownAgents as agentId (agentId)}
						<label class="text-xs text-ink-muted">
							Agent: {agentId}
							<select
								value={mcpPolicySettings.perAgent[agentId] ?? mcpPolicySettings.defaultPresetId}
								onchange={(event) =>
									updateAgentPreset(
										agentId,
										(event.currentTarget as HTMLSelectElement)
											.value as DesktopMcpPolicySettings['defaultPresetId'],
									)}
								class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
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

		<div class="rounded-lg border border-border bg-surface p-4 mt-4 space-y-3">
			<div class="grid md:grid-cols-2 lg:grid-cols-5 gap-2">
				<label class="text-xs text-ink-muted">
					Type
					<select
						bind:value={mcpChangeFilterType}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
					>
						<option value="all">All</option>
						<option value="create">Create</option>
						<option value="update">Update</option>
						<option value="soft_delete">Soft delete</option>
						<option value="restore">Restore</option>
						<option value="permanent_delete">Permanent delete</option>
					</select>
				</label>
				<label class="text-xs text-ink-muted">
					Risk
					<select
						bind:value={mcpChangeFilterRisk}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
					>
						<option value="all">All</option>
						<option value="structural">Structural</option>
						<option value="safe">Safe content</option>
					</select>
				</label>
				<label class="text-xs text-ink-muted">
					Conflicts
					<select
						bind:value={mcpChangeFilterConflict}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
					>
						<option value="all">All</option>
						<option value="conflicted">Conflicted</option>
						<option value="clean">Clean</option>
					</select>
				</label>
				<label class="text-xs text-ink-muted">
					Agent
					<select
						bind:value={mcpChangeFilterAgent}
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
					>
						<option value="all">All agents</option>
						{#each mcpKnownAgents as agentId (agentId)}
							<option value={agentId}>{agentId}</option>
						{/each}
					</select>
				</label>
				<label class="text-xs text-ink-muted">
					Diff search
					<input
						type="text"
						bind:value={mcpDiffSearch}
						placeholder="Find text in summary or diff"
						class="mt-1 w-full rounded border border-border bg-surface-alt px-2 py-1 text-sm text-ink"
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
						handleApproveSelectedMcpChanges(selectedVisibleMcpChanges.map((change) => change.id))}
					disabled={applyingMcpChanges || selectedVisibleMcpChanges.length === 0}
				>
					Approve Selected ({selectedVisibleMcpChanges.length})
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onclick={() =>
						handleRejectSelectedMcpChanges(selectedVisibleMcpChanges.map((change) => change.id))}
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

		<div class="rounded-lg border border-border bg-surface overflow-hidden mt-4">
			{#if mcpChangesState.loading}
				<div class="p-4 text-sm text-ink-muted">Loading pending changes...</div>
			{:else if filteredMcpChanges.length === 0}
				<div class="p-4 text-sm text-ink-muted">
					No pending MCP changes match the active filters.
				</div>
			{:else}
				<ul class="divide-y divide-border">
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
									<p class="text-sm font-medium text-ink truncate">
										{change.summary}
									</p>
									<span
										class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-alt text-ink-faint"
									>
										{change.type}
									</span>
									<span
										class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface-alt text-ink-faint"
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
								<p class="text-xs text-ink-muted mt-1">
									{change.noteId} - {change.after?.note.filePath ??
										change.before?.note.filePath ??
										'path pending'}
								</p>
								{#if change.policy}
									<p class="text-xs text-ink-muted mt-1">
										Policy: {change.policy.presetId} - {change.policy.reason}
									</p>
								{/if}
								{#if change.conflict}
									<p class="text-xs text-rose-600 mt-1">
										Conflict detected: {change.conflict.details}
									</p>
								{/if}
								{#if change.preview}
									<p class="text-xs text-ink-muted mt-2">
										{change.preview.summary}
									</p>
									<p class="text-xs text-ink-faint mt-1">
										Link impact: +{change.preview.linkImpact.added} / -{change.preview.linkImpact
											.removed}
									</p>
									<pre
										class="mt-2 text-xs font-mono whitespace-pre-wrap break-words rounded border border-border bg-surface-alt p-2 text-ink-faint">{change
											.preview.compactDiff}</pre>
									<details class="mt-2">
										<summary class="cursor-pointer text-xs text-accent">
											Show full changes
										</summary>
										<pre
											class="mt-2 text-xs font-mono whitespace-pre-wrap break-words rounded border border-border bg-surface-alt p-2 text-ink-faint">{change
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
				<h3 class="text-base font-semibold text-ink">MCP Audit Trail</h3>
				<div class="flex items-center gap-2">
					<Button variant="ghost" size="sm" onclick={loadMcpAuditTrail} loading={mcpAuditLoading}>
						{mcpAuditLoading ? 'Refreshing...' : 'Refresh Audit'}
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onclick={handleClearChangelog}
						loading={clearingChangelog}
					>
						{clearingChangelog ? 'Clearing...' : 'Clear Resolved (7d+)'}
					</Button>
				</div>
			</div>
			<div class="rounded-lg border border-border bg-surface overflow-hidden">
				{#if mcpAuditLoading}
					<div class="p-4 text-sm text-ink-muted">Loading MCP audit trail...</div>
				{:else if mcpAuditTrail.length === 0}
					<div class="p-4 text-sm text-ink-muted">No MCP audit history yet.</div>
				{:else}
					<ul class="divide-y divide-border">
						{#each mcpAuditTrail as change (change.id + (change.resolvedAt ?? change.createdAt))}
							<li class="p-3 text-xs space-y-1">
								<p class="font-medium text-ink">
									{change.status} - {change.summary}
								</p>
								<p class="text-ink-muted">
									When: {change.resolvedAt ?? change.createdAt} | Agent: {change.agentId ??
										'default-agent'} | Why: {change.policy?.reason ?? 'manual review'}
								</p>
								{#if change.audit && change.audit.length > 0}
									<p class="text-ink-faint">
										Last event: {change.audit[change.audit.length - 1]?.action} by {change.audit[
											change.audit.length - 1
										]?.actor}
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
