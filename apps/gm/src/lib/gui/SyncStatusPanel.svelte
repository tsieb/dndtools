<script lang="ts">
	import {
		getConflictLifecycle,
		getDmSyncLineage,
		getSyncFreshness,
		getSyncStatus,
		shouldAnnounceSyncChange,
		syncStatusAnnouncement,
		syncStatusKey,
		type DiagnosticsContextInput,
	} from '@dndtools/core';
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

	// SYNC-006 / SYNC-013: the actor-filtered conflict LIFECYCLE. The DM sees full records (diverging
	// values + revisions + resolution audit) and may RESOLVE each via the DM-authorized
	// `conflict.resolve` administrative command; a player/observer sees only structural entries and
	// never the conflicting values. The Processing Core derives the records from the op-log substrate
	// and enforces the actor filter + fail-closed resolution; this surface renders the computed model.
	const conflictLifecycle = $derived(
		getConflictLifecycle(runtime.state.permissions, runtime.activeActorId, {
			operations: runtime.state.sync.operations,
		}),
	);

	// A11Y-006 AC2 — debounced sync-state live announcement. Rapid-fire sync events (e.g. bursts
	// of operation acknowledgements) produce the same health/online/pending summary; the debounce
	// logic in the core collapses these so the live region is updated at most once per distinct
	// state change within the debounce window. We track the last announced key and timestamp so
	// the shouldAnnounceSyncChange policy can suppress duplicates.
	let syncAnnouncement = $state('');
	let _lastSyncKey = $state<string | null>(null);
	let _lastSyncMs = $state(0);
	$effect(() => {
		if (status.kind !== 'sync-status') return;
		const nextKey = syncStatusKey(status.health, status.online, status.pendingOutboundCount);
		const nowMs = Date.now();
		if (!shouldAnnounceSyncChange(_lastSyncKey, nextKey, _lastSyncMs, nowMs)) return;
		_lastSyncKey = nextKey;
		_lastSyncMs = nowMs;
		syncAnnouncement = syncStatusAnnouncement(status.health, status.online, status.pendingOutboundCount);
	});

	let conflictNotes = $state<Record<string, string>>({});
	let conflictError = $state<string | null>(null);

	async function resolveVaultConflict(
		entityType: string,
		entityId: string,
		conflictId: string,
		selectedValue: unknown,
		sourceLocalRevision: number,
		sourceRemoteRevision: number,
	): Promise<void> {
		conflictError = null;
		const notes = conflictNotes[conflictId];
		const result = await runtime.dispatch({
			type: 'conflict.resolve',
			actorId: runtime.activeActorId,
			payload: {
				entityType,
				entityId,
				conflictId,
				selectedValue,
				sourceLocalRevision,
				sourceRemoteRevision,
				...(notes && notes.length > 0 ? { notes } : {}),
			},
		});
		if (result.status === 'rejected') {
			conflictError = result.rejection.message;
			return;
		}
		delete conflictNotes[conflictId];
	}
</script>

<!-- A11Y-006 AC2 — debounced sync-state live announcement. Always present so AT registers it;
     content is set only when shouldAnnounceSyncChange approves the transition (dedup + window). -->
<div class="visually-hidden" aria-live="polite" aria-atomic="true" data-testid="sync-announcement">{syncAnnouncement}</div>

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

		<!-- SYNC-006 / SYNC-013: the conflict LIFECYCLE surface. Every role sees the structural entries +
		     per-entity publication status; the DM additionally sees the diverging values and resolves each
		     conflict with an explicit selected value + optional notes, producing a non-conflicted revision.
		     Per-entity isolation: each entry names exactly one entity, so resolving one never affects
		     another. Resolution is the DM-authorized `conflict.resolve` command (fail-closed for non-DM). -->
		{#if conflictLifecycle.kind === 'conflict-lifecycle'}
			<section aria-label="Conflict lifecycle" data-testid="conflict-lifecycle">
				<h3>Conflict lifecycle</h3>
				{#if conflictError}
					<p class="meta" role="alert" data-testid="conflict-error">{conflictError}</p>
				{/if}
				{#if conflictLifecycle.entries.length === 0}
					<p class="meta" data-testid="conflict-lifecycle-empty">
						No conflicts. Unrelated entities edit and publish freely.
					</p>
				{:else}
					<p class="meta" data-testid="conflict-lifecycle-summary">
						<span data-testid="conflict-unresolved-count">{conflictLifecycle.unresolvedCount}</span>
						unresolved • {conflictLifecycle.conflictedEntityKeys.length} entit{conflictLifecycle
							.conflictedEntityKeys.length === 1
							? 'y'
							: 'ies'} affected
					</p>
					{#if conflictLifecycle.role === 'dm'}
						<!-- DM detail: diverging values + DM-authorized resolution. -->
						<ul class="scene-list" data-testid="conflict-lifecycle-dm">
							{#each conflictLifecycle.dmDetail as detail (detail.conflictId)}
								<li class="scene-card" data-testid={`conflict-dm-${detail.conflictId}`}>
									<div>
										<strong>{detail.entityType}</strong>
										<div class="meta">
											{detail.reason}{detail.path ? ` • ${detail.path}` : ''} • {detail.publication}
										</div>
										{#if detail.resolved}
											<div class="meta" data-testid={`conflict-resolved-${detail.conflictId}`}>
												resolved by {detail.resolution?.resolverActorId} • selected “{String(
													detail.resolution?.selectedValue,
												)}”{detail.resolution?.notes ? ` • ${detail.resolution.notes}` : ''}
											</div>
										{:else}
											<label class="conflict-notes">
												Resolution note (optional)
												<input
													type="text"
													data-testid={`conflict-notes-${detail.conflictId}`}
													bind:value={conflictNotes[detail.conflictId]}
												/>
											</label>
											<div class="conflict-choices">
												<button
													type="button"
													class="button secondary"
													data-testid={`conflict-resolve-local-${detail.conflictId}`}
													onclick={() =>
														resolveVaultConflict(
															detail.entityType,
															detail.entityId,
															detail.conflictId,
															detail.local.value,
															detail.local.revision,
															detail.remote.revision,
														)}>Keep “{String(detail.local.value)}”</button
												>
												<button
													type="button"
													class="button secondary"
													data-testid={`conflict-resolve-remote-${detail.conflictId}`}
													onclick={() =>
														resolveVaultConflict(
															detail.entityType,
															detail.entityId,
															detail.conflictId,
															detail.remote.value,
															detail.local.revision,
															detail.remote.revision,
														)}>Use “{String(detail.remote.value)}”</button
												>
											</div>
										{/if}
									</div>
									<span class="meta" class:unavailable={!detail.resolved}>
										{detail.resolved ? 'resolved' : 'unresolved'}
									</span>
								</li>
							{/each}
						</ul>
					{:else}
						<!-- Non-DM: structural entries only (no conflicting values), awaiting DM resolution. -->
						<ul class="scene-list" data-testid="conflict-lifecycle-structural">
							{#each conflictLifecycle.entries as entry (entry.conflictId)}
								<li class="scene-card" data-testid={`conflict-structural-${entry.conflictId}`}>
									<div>
										<strong>{entry.entityType}</strong>
										<div class="meta">
											{entry.reason}{entry.path ? ` • ${entry.path}` : ''} • {entry.publication}
										</div>
										{#if !entry.resolved}
											<div class="meta">awaiting DM resolution</div>
										{/if}
									</div>
									<span class="meta" class:unavailable={!entry.resolved}>
										{entry.resolved ? 'resolved' : 'unresolved'}
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				{/if}
			</section>
		{/if}

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

<style>
	.conflict-notes {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0.5rem 0;
		font-weight: 600;
	}
	.conflict-choices {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
</style>
