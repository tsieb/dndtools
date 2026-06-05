<script lang="ts">
	import {
		getDmSyncLineage,
		getSyncFreshness,
		getSyncStatus,
		type DiagnosticsContextInput,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	const { context }: { context: DiagnosticsContextInput } = $props();
	const runtime = useRuntime();

	// SYNC-010: the computed SYNC STATUS model. The Processing Core derives pending outbound
	// operations, inbound revisions, conflicts, source health, and retry actions over the op-log
	// substrate + PLAT diagnostics. This surface renders the model and reads NOTHING from raw
	// storage. It fails closed: an unknown actor is denied by the core.
	const status = $derived(getSyncStatus(runtime.state.permissions, runtime.activeActorId, {
		context,
		operations: runtime.state.sync.operations,
	}));

	const role = $derived(runtime.state.permissions.actors[runtime.activeActorId]?.role ?? null);

	// SYNC-014: lineage is actor-filtered. A DM sees structural source version history + snapshot
	// lineage + recovery checkpoints; a player/observer sees only a non-leaking freshness summary.
	// Both come from the Processing Core; the GUI never derives lineage itself.
	const lineage = $derived(
		getDmSyncLineage(runtime.state.permissions, runtime.activeActorId, {
			operations: runtime.state.sync.operations,
		}),
	);
	const freshness = $derived(
		getSyncFreshness(runtime.state.permissions, runtime.activeActorId, {
			online: context.online,
			hasActiveSource: context.syncSources.length > 0,
			pendingOperations: runtime.state.sync.operations.length,
		}),
	);
</script>

{#if status.kind === 'sync-status'}
	<section data-testid="sync-status-panel" aria-label="Sync status">
		<h2>Sync status</h2>
		<p class="meta" data-testid="sync-status-health">
			Health: <strong data-testid="sync-status-health-level">{status.health}</strong> •
			{status.online ? 'online' : 'offline'} •
			<span data-testid="sync-pending-count">{status.pendingOutboundCount}</span> pending
		</p>

		<section aria-label="Source health">
			<h3>Sources</h3>
			<ul class="scene-list" data-testid="sync-sources">
				{#each status.sources as source (source.sourceId)}
					<li class="scene-card" data-testid={`sync-source-${source.sourceId}`}>
						<div>
							<strong>{source.displayName}</strong>
							<div class="meta">{source.kind} • {source.state} • {source.pendingOperations} pending</div>
							{#if source.remediation}
								<div class="meta" data-testid={`sync-source-remediation-${source.sourceId}`}>
									{source.remediation}
								</div>
							{/if}
						</div>
						<span class="meta" class:unavailable={source.state === 'error'}>{source.state}</span>
					</li>
				{/each}
			</ul>
		</section>

		<section aria-label="Pending outbound operations">
			<h3>Pending changes on this device</h3>
			{#if status.pendingOutbound.length === 0}
				<p class="meta" data-testid="sync-pending-empty">No changes are queued on this device.</p>
			{:else}
				<ul class="scene-list" data-testid="sync-pending-outbound">
					{#each status.pendingOutbound as group (group.sourceId)}
						<li class="scene-card" data-testid={`sync-pending-${group.sourceId}`}>
							<div>
								<strong>{group.sourceId}</strong>
								<div class="meta">
									{group.operations.length} operation{group.operations.length === 1 ? '' : 's'} •
									{group.affectedEntityCount} affected entit{group.affectedEntityCount === 1
										? 'y'
										: 'ies'}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if status.inboundRevisions.length > 0}
			<section aria-label="Inbound revisions">
				<h3>Inbound revisions</h3>
				<ul class="scene-list" data-testid="sync-inbound">
					{#each status.inboundRevisions as revision (revision.entityType + revision.entityId + revision.revision)}
						<li class="scene-card">
							<div class="meta">{revision.entityType} • rev {revision.revision}</div>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<section aria-label="Conflicts">
			<h3>Conflicts</h3>
			{#if status.conflicts.length === 0}
				<p class="meta" data-testid="sync-conflicts-empty">No conflicts need resolution.</p>
			{:else}
				<ul class="scene-list" data-testid="sync-conflicts">
					{#each status.conflicts as conflict (conflict.conflictId)}
						<li class="scene-card" data-testid={`sync-conflict-${conflict.conflictId}`}>
							<div>
								<strong>{conflict.entityType}</strong>
								<div class="meta">{conflict.reason}{conflict.path ? ` • ${conflict.path}` : ''}</div>
							</div>
							<span class="meta" class:unavailable={!conflict.resolved}>
								{conflict.resolved ? 'resolved' : 'unresolved'}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section aria-label="Retry actions">
			<h3>Recovery actions</h3>
			<ul class="scene-list" data-testid="sync-retry-actions">
				{#each status.retryActions as action (action.action)}
					<li class="scene-card" data-testid={`sync-retry-${action.action}`}>
						<div>
							<strong>{action.label}</strong>
							<div class="meta">{action.detail}</div>
						</div>
						<span class="meta" class:unavailable={!action.available}>
							{action.available ? 'available' : 'not needed'}
						</span>
					</li>
				{/each}
			</ul>
		</section>

		<!-- SYNC-014: lineage is actor-filtered. The DM sees structural version history + snapshot
		     lineage; players/observers see only the non-leaking freshness summary. -->
		{#if role === 'dm' && lineage.kind === 'sync-lineage'}
			<section aria-label="Source version history and lineage">
				<h3>Version history &amp; lineage</h3>
				<p class="meta">
					Structural source version history and compacted snapshot lineage for diagnosing lost
					updates. Shows version metadata only — never hidden content.
				</p>
				<ul class="scene-list" data-testid="sync-lineage-entities">
					{#each lineage.entityHistory as entity (entity.entityType + entity.entityId)}
						<li class="scene-card" data-testid={`sync-lineage-${entity.entityType}-${entity.entityId}`}>
							<div>
								<strong>{entity.entityType} {entity.entityId}</strong>
								<div class="meta">
									rev {entity.earliestRevision ?? '—'} → {entity.latestRevision ?? '—'} •
									{entity.retainedOperationCount} retained op{entity.retainedOperationCount === 1
										? ''
										: 's'}
								</div>
							</div>
						</li>
					{/each}
				</ul>
				{#if lineage.snapshotLineage.length > 0}
					<ul class="scene-list" data-testid="sync-lineage-snapshots">
						{#each lineage.snapshotLineage as checkpoint (checkpoint.snapshotId)}
							<li class="scene-card">
								<div class="meta">
									snapshot {checkpoint.snapshotId} • {checkpoint.phase} •
									{checkpoint.documentIds.length} document{checkpoint.documentIds.length === 1
										? ''
										: 's'}
								</div>
								{#if checkpoint.recoveryCheckpoint}
									<span class="meta">recovery checkpoint</span>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p class="meta" data-testid="sync-lineage-no-snapshots">
						No compacted snapshots yet. Recovery checkpoints appear after a migration runs.
					</p>
				{/if}
			</section>
		{:else if freshness.kind === 'sync-freshness'}
			<section aria-label="Your sync freshness">
				<h3>Freshness</h3>
				<p class="meta" data-testid="sync-freshness-message">{freshness.message}</p>
				<p class="meta">
					Status: <strong data-testid="sync-freshness-state">{freshness.freshness}</strong>
				</p>
			</section>
		{/if}
	</section>
{/if}
