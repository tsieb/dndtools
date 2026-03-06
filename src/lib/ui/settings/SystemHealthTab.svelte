<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/ui/common/Button.svelte';
	import { toastState } from '$lib/state/toast.svelte.js';
	import { reportRuntimeError } from '$lib/runtime/diagnostics.js';
	import {
		listDesktopMigrationCheckpoints,
		restoreDesktopMigrationCheckpoint,
		type DesktopSystemHealth,
		type DesktopMigrationCheckpoint,
	} from '$lib/platform/desktop/bridge.js';

	interface Props {
		systemHealth: DesktopSystemHealth | null;
		refreshingDesktopState: boolean;
		rebuildingIndex: boolean;
		restartingMcp: boolean;
		exportingDiagnostics: boolean;
		onrefreshdesktopstate: () => Promise<void>;
		onrebuildindex: () => Promise<void>;
		onrestartmcp: () => Promise<void>;
		onexportdiagnostics: () => Promise<void>;
	}

	let {
		systemHealth,
		refreshingDesktopState,
		rebuildingIndex,
		restartingMcp,
		exportingDiagnostics,
		onrefreshdesktopstate,
		onrebuildindex,
		onrestartmcp,
		onexportdiagnostics,
	}: Props = $props();

	type SubsystemStatus = 'ok' | 'stale' | 'never' | 'error';

	let migrationCheckpoints = $state<DesktopMigrationCheckpoint[]>([]);
	let loadingCheckpoints = $state(false);
	let restoringCheckpoint = $state(false);
	let selectedCheckpointName = $state('');

	function getTimestampStatus(ts: string | null): Exclude<SubsystemStatus, 'error'> {
		if (!ts) return 'never';
		const ageMs = Date.now() - new Date(ts).getTime();
		return ageMs < 2 * 60 * 60 * 1000 ? 'ok' : 'stale';
	}

	function hasRecentErrors(
		category: 'storage' | 'parsing' | 'ipc' | 'mcp_sidecar' | 'ui_runtime',
	): boolean {
		return (
			systemHealth?.recentErrors.some((e) => e.category === category && e.severity === 'error') ??
			false
		);
	}

	const subsystemStatuses = $derived.by(
		(): Record<
			'runtime_bootstrap' | 'vault_sync' | 'search_index' | 'link_graph_build' | 'mcp_sidecar',
			SubsystemStatus
		> => {
			if (!systemHealth) {
				return {
					runtime_bootstrap: 'never',
					vault_sync: 'never',
					search_index: 'never',
					link_graph_build: 'never',
					mcp_sidecar: 'never',
				};
			}
			const ls = systemHealth.lastSuccessful;
			const mcpState = systemHealth.mcpStatus.state;
			return {
				runtime_bootstrap: hasRecentErrors('ui_runtime')
					? 'error'
					: getTimestampStatus(ls.runtime_bootstrap),
				vault_sync: hasRecentErrors('storage') ? 'error' : getTimestampStatus(ls.vault_sync),
				search_index: getTimestampStatus(ls.search_index),
				link_graph_build: getTimestampStatus(ls.link_graph_build),
				mcp_sidecar: mcpState === 'error' ? 'error' : mcpState === 'running' ? 'ok' : 'never',
			};
		},
	);

	const performanceOperationOrder = [
		'cold_start',
		'vault_open',
		'note_open',
		'search_response',
		'note_save',
		'graph_rebuild_incremental',
		'mcp_bundle_call',
	] as const;

	const performanceSummaries = $derived.by(() => {
		const summaries = systemHealth?.performance.summaries ?? [];
		return [...summaries].sort(
			(a, b) =>
				performanceOperationOrder.indexOf(a.operation) -
				performanceOperationOrder.indexOf(b.operation),
		);
	});

	const slowPerformanceGroups = $derived.by(() => {
		const timeline = systemHealth?.performance.timeline ?? [];
		const grouped: Record<
			string,
			Array<{
				operation: string;
				durationMs: number;
				at: string;
				exceededBudget: boolean;
				source: 'renderer' | 'main' | 'mcp';
			}>
		> = {};
		for (const sample of timeline) {
			const key = sample.operation;
			if (!grouped[key]) grouped[key] = [];
			grouped[key]!.push({
				operation: sample.operation,
				durationMs: sample.durationMs,
				at: sample.at,
				exceededBudget: sample.exceededBudget,
				source: sample.source,
			});
		}
		return Object.entries(grouped)
			.map(([operation, samples]) => ({
				operation,
				samples: [...samples].sort((a, b) => b.durationMs - a.durationMs).slice(0, 4),
			}))
			.sort((a, b) => a.operation.localeCompare(b.operation));
	});

	function formatDuration(value: number | null): string {
		return value === null ? '-' : `${value.toFixed(1)}ms`;
	}

	onMount(() => {
		void loadMigrationCheckpoints();
	});

	async function loadMigrationCheckpoints(): Promise<void> {
		if (typeof window === 'undefined' || !window.dndtoolsDesktop) return;
		loadingCheckpoints = true;
		try {
			migrationCheckpoints = await listDesktopMigrationCheckpoints();
			if (migrationCheckpoints.length > 0 && !selectedCheckpointName) {
				selectedCheckpointName = migrationCheckpoints[0]?.name ?? '';
			}
		} catch (error) {
			void reportRuntimeError({
				category: 'ipc',
				code: 'SETTINGS_LIST_CHECKPOINTS_FAILED',
				error,
				context: { route: '/settings' },
			});
		} finally {
			loadingCheckpoints = false;
		}
	}

	async function handleRestoreCheckpoint(): Promise<void> {
		if (!selectedCheckpointName) return;
		restoringCheckpoint = true;
		try {
			const result = await restoreDesktopMigrationCheckpoint(selectedCheckpointName);
			toastState.success(
				`Vault restored from checkpoint (${result.restored} file${result.restored === 1 ? '' : 's'} recovered). Please restart the application.`,
			);
		} catch (error) {
			void reportRuntimeError({
				category: 'storage',
				code: 'SETTINGS_RESTORE_CHECKPOINT_FAILED',
				error,
				context: { route: '/settings' },
			});
			toastState.error(`Failed to restore checkpoint: ${String(error)}`);
		} finally {
			restoringCheckpoint = false;
		}
	}

	type SubsystemKey =
		| 'runtime_bootstrap'
		| 'vault_sync'
		| 'search_index'
		| 'link_graph_build'
		| 'mcp_sidecar';

	function subsystemCardClass(status: SubsystemStatus): string {
		if (status === 'ok')
			return 'border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30';
		if (status === 'error')
			return 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30';
		if (status === 'stale')
			return 'border-yellow-200 dark:border-yellow-900 bg-yellow-50 dark:bg-yellow-950/30';
		return 'border-border bg-surface';
	}

	function subsystemDotClass(status: SubsystemStatus): string {
		if (status === 'ok') return 'bg-green-500';
		if (status === 'error') return 'bg-red-500';
		if (status === 'stale') return 'bg-yellow-500';
		return 'bg-gray-400';
	}
</script>

<div
	role="tabpanel"
	id="settings-panel-health"
	aria-labelledby="settings-tab-health"
	class="space-y-8"
>
	<!-- Subsystem Status Grid -->
	<section>
		<div class="flex items-center justify-between gap-3 mb-4">
			<h2 class="text-lg font-semibold text-ink">System Health</h2>
			<div class="flex items-center gap-2">
				<Button
					variant="secondary"
					size="sm"
					onclick={onexportdiagnostics}
					loading={exportingDiagnostics}
				>
					{exportingDiagnostics ? 'Exporting...' : 'Export Diagnostics Bundle'}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					onclick={onrefreshdesktopstate}
					loading={refreshingDesktopState}
				>
					{refreshingDesktopState ? 'Refreshing...' : 'Refresh'}
				</Button>
			</div>
		</div>

		{#if systemHealth}
			<p class="text-xs text-ink-muted mb-3">
				Last refreshed: {systemHealth.generatedAt}
			</p>
		{/if}

		<div class="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
			{#each ['runtime_bootstrap', 'vault_sync', 'search_index', 'link_graph_build', 'mcp_sidecar'] as SubsystemKey[] as key (key)}
				{@const status = subsystemStatuses[key]}
				<div class="rounded-lg border p-3 space-y-2 {subsystemCardClass(status)}">
					<div class="flex items-center gap-2">
						<span
							class="inline-block h-2 w-2 rounded-full flex-shrink-0 {subsystemDotClass(status)}"
							aria-label="Status: {status}"
						></span>
						<p class="text-xs font-medium text-ink capitalize">
							{key.replace(/_/g, ' ')}
						</p>
					</div>
					<p class="text-xs text-ink-muted font-mono">
						{#if key === 'mcp_sidecar'}
							{systemHealth?.mcpStatus.state ?? 'Unknown'}
							{#if systemHealth?.mcpStatus.pid}
								· PID {systemHealth.mcpStatus.pid}
							{/if}
						{:else}
							{systemHealth?.lastSuccessful[key] ?? 'Never'}
						{/if}
					</p>
					{#if key === 'runtime_bootstrap' && (status === 'error' || status === 'stale')}
						<button
							class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
							onclick={() => window.location.reload()}
						>
							Reload Application
						</button>
					{:else if key === 'vault_sync' && (status === 'error' || status === 'stale' || status === 'never')}
						<button
							class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
							onclick={onrefreshdesktopstate}
						>
							Refresh Vault
						</button>
					{:else if (key === 'search_index' || key === 'link_graph_build') && (status === 'error' || status === 'stale' || status === 'never')}
						<button
							class="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
							onclick={onrebuildindex}
							disabled={rebuildingIndex}
						>
							{rebuildingIndex ? 'Rebuilding…' : 'Rebuild Index'}
						</button>
					{:else if key === 'mcp_sidecar' && status !== 'ok'}
						<button
							class="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
							onclick={onrestartmcp}
							disabled={restartingMcp}
						>
							{restartingMcp ? 'Restarting…' : 'Restart Sidecar'}
						</button>
					{/if}
				</div>
			{/each}
		</div>
	</section>

	<!-- Performance -->
	<section>
		<div class="flex items-center justify-between gap-3 mb-4">
			<h2 class="text-lg font-semibold text-ink">Performance</h2>
			{#if systemHealth?.performance}
				<p class="text-xs text-ink-muted">
					Timeline samples: {systemHealth.performance.timeline.length}
				</p>
			{/if}
		</div>
		<div class="rounded-lg border border-border bg-surface overflow-hidden">
			{#if !systemHealth || performanceSummaries.length === 0}
				<div class="p-4 text-sm text-ink-muted">No performance telemetry yet.</div>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-xs">
						<thead class="bg-surface-alt text-ink-muted">
							<tr>
								<th class="text-left px-3 py-2 font-medium">Operation</th>
								<th class="text-right px-3 py-2 font-medium">Budget</th>
								<th class="text-right px-3 py-2 font-medium">P50</th>
								<th class="text-right px-3 py-2 font-medium">P95</th>
								<th class="text-right px-3 py-2 font-medium">P99</th>
								<th class="text-right px-3 py-2 font-medium">Samples</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-border">
							{#each performanceSummaries as summary (summary.operation)}
								<tr>
									<td class="px-3 py-2">
										<p class="font-medium text-ink">
											{summary.label}
										</p>
										<p class="text-xs text-ink-faint">
											{summary.description}
										</p>
									</td>
									<td class="px-3 py-2 text-right font-mono text-ink">
										{summary.targetMs}ms
									</td>
									<td class="px-3 py-2 text-right font-mono text-ink-muted">
										{formatDuration(summary.p50Ms)}
									</td>
									<td
										class="px-3 py-2 text-right font-mono {summary.p95Ms !== null &&
										summary.p95Ms > summary.targetMs
											? 'text-rose-600 dark:text-rose-400'
											: 'text-ink-muted'}"
									>
										{formatDuration(summary.p95Ms)}
									</td>
									<td
										class="px-3 py-2 text-right font-mono {summary.p99Ms !== null &&
										summary.p99Ms > summary.targetMs
											? 'text-rose-600 dark:text-rose-400'
											: 'text-ink-muted'}"
									>
										{formatDuration(summary.p99Ms)}
									</td>
									<td class="px-3 py-2 text-right text-ink-muted">
										{summary.sampleCount}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<div class="mt-4">
			<h3 class="text-sm font-semibold text-ink mb-2">Slowest Recent Operations</h3>
			<div class="rounded-lg border border-border bg-surface overflow-hidden">
				{#if !systemHealth || slowPerformanceGroups.length === 0}
					<div class="p-4 text-sm text-ink-muted">No recent samples.</div>
				{:else}
					<div class="max-h-72 overflow-y-auto divide-y divide-border">
						{#each slowPerformanceGroups as group (group.operation)}
							<div class="p-3">
								<p class="text-xs font-semibold uppercase tracking-wide text-ink-faint mb-2">
									{group.operation}
								</p>
								<ul class="space-y-1">
									{#each group.samples as sample (sample.at + sample.durationMs)}
										<li class="flex items-center justify-between text-xs">
											<span class="text-ink-muted">
												{sample.at} · {sample.source}
											</span>
											<span
												class="font-mono {sample.exceededBudget
													? 'text-rose-600 dark:text-rose-400'
													: 'text-ink'}"
											>
												{sample.durationMs.toFixed(1)}ms
											</span>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</section>

	<!-- MCP Sidecar Log -->
	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">MCP Sidecar Log</h2>
		<div class="rounded-lg border border-border bg-surface overflow-hidden">
			{#if !systemHealth || systemHealth.mcpLifecycle.length === 0}
				<div class="p-4 text-sm text-ink-muted">No lifecycle events recorded yet.</div>
			{:else}
				<ul class="divide-y divide-border max-h-64 overflow-y-auto">
					{#each systemHealth.mcpLifecycle as lifecycle (lifecycle.at + lifecycle.event)}
						<li class="p-3 text-xs flex items-start gap-2">
							<span
								class="mt-0.5 inline-block h-2 w-2 rounded-full flex-shrink-0
									{lifecycle.event === 'crash'
									? 'bg-red-500'
									: lifecycle.event === 'start'
										? 'bg-green-500'
										: lifecycle.event === 'restart'
											? 'bg-yellow-500'
											: 'bg-gray-400'}"
								aria-hidden="true"
							></span>
							<div>
								<p class="text-ink font-medium capitalize">
									{lifecycle.event}
									<span class="font-normal text-ink-muted">· {lifecycle.at}</span>
								</p>
								{#if lifecycle.reason || lifecycle.pid}
									<p class="text-ink-muted mt-0.5">
										{#if lifecycle.pid}PID {lifecycle.pid}{/if}{#if lifecycle.pid && lifecycle.reason}
											·
										{/if}{#if lifecycle.reason}{lifecycle.reason}{/if}
									</p>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>

	<!-- Recent Error Events -->
	<section>
		<h2 class="text-lg font-semibold text-ink mb-4">Recent Error Events</h2>
		<div class="rounded-lg border border-border bg-surface overflow-hidden">
			{#if !systemHealth || systemHealth.recentErrors.length === 0}
				<div class="p-4 text-sm text-ink-muted">No recent errors recorded.</div>
			{:else}
				<ul class="divide-y divide-border max-h-80 overflow-y-auto">
					{#each systemHealth.recentErrors as error (error.id)}
						<li class="p-3 text-xs space-y-1">
							<div class="flex items-center gap-2">
								<span
									class="inline-block h-2 w-2 rounded-full flex-shrink-0
										{error.severity === 'error'
										? 'bg-red-500'
										: error.severity === 'warning'
											? 'bg-yellow-500'
											: 'bg-blue-400'}"
									aria-label="Severity: {error.severity}"
								></span>
								<p class="text-ink font-medium font-mono">
									{error.code}
								</p>
								<span class="ml-auto text-ink-faint text-2xs uppercase tracking-wide"
									>{error.category}</span
								>
							</div>
							<p class="text-ink-muted">{error.message}</p>
							{#if error.recoveryHint}
								<p
									class="text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded px-2 py-1"
								>
									Hint: {error.recoveryHint}
								</p>
							{/if}
							<p class="text-ink-faint">{error.at}</p>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</section>

	<!-- Schema Migration Checkpoints -->
	<section>
		<div class="flex items-center justify-between gap-3 mb-4">
			<h2 class="text-lg font-semibold text-ink">Schema Migration Checkpoints</h2>
			<Button
				variant="ghost"
				size="sm"
				onclick={loadMigrationCheckpoints}
				loading={loadingCheckpoints}
			>
				{loadingCheckpoints ? 'Loading…' : 'Refresh'}
			</Button>
		</div>
		<div class="rounded-lg border border-border bg-surface p-4">
			<p class="text-xs text-ink-muted mb-3">
				Checkpoint backups are created automatically before each schema migration. Use these to
				restore your vault to a pre-migration state if needed.
			</p>
			{#if !window.dndtoolsDesktop}
				<p class="text-xs text-ink-muted italic">Only available in desktop mode.</p>
			{:else if loadingCheckpoints}
				<p class="text-xs text-ink-muted">Loading checkpoints…</p>
			{:else if migrationCheckpoints.length === 0}
				<p class="text-xs text-ink-muted">No schema migration checkpoints found.</p>
			{:else}
				<div class="space-y-3">
					<div>
						<label for="checkpoint-select" class="block text-xs font-medium text-ink mb-1.5">
							Select checkpoint to restore
						</label>
						<select
							id="checkpoint-select"
							bind:value={selectedCheckpointName}
							class="w-full rounded-md border border-border bg-surface text-sm text-ink px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
						>
							{#each migrationCheckpoints as checkpoint (checkpoint.name)}
								<option value={checkpoint.name}>
									{checkpoint.name} — {checkpoint.fileCount} file{checkpoint.fileCount === 1
										? ''
										: 's'} — {checkpoint.createdAt}
								</option>
							{/each}
						</select>
					</div>
					<div
						class="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2"
					>
						<p class="text-xs text-amber-700 dark:text-amber-300">
							Restoring a checkpoint overwrites the current vault files with the backed-up versions.
							The application will need to be restarted after the restore completes.
						</p>
					</div>
					<Button
						variant="danger"
						size="sm"
						onclick={handleRestoreCheckpoint}
						disabled={restoringCheckpoint || !selectedCheckpointName}
					>
						{restoringCheckpoint ? 'Restoring…' : 'Restore Selected Checkpoint'}
					</Button>
				</div>
			{/if}
		</div>
	</section>
</div>
