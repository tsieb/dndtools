<script lang="ts">
	import {
		appliedIdsBeforeCursor,
		catchUpPhase,
		computeReconnectCatchUp,
		deriveCatchUpFailureState,
		orderCatchUpByDependency,
		type ReconnectReplayContextSource,
		type SyncOperation,
	} from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	// COLLAB-002 / COLLAB-013: the PARTICIPANT-facing RECONNECT + CATCH-UP surface. When a participant
	// reconnects (or a mobile device wakes from sleep/backgrounding), the Processing Core re-evaluates their
	// CURRENT role/visibility/grants and computes the catch-up they may receive — NOT the cached one. This
	// surface lets the participant simulate "reconnect from a sync cursor": it renders the dependency-ordered
	// catch-up, whether catch-up is live/syncing/stale-reconnecting, and DISABLES durable commands until they
	// are provably caught up against current grants. The GUI renders the computed view models only; all
	// filtering, ordering, and revalidation happen in the core (fail closed). DM-only content never enters
	// the participant's catch-up stream — it is filtered at the source, not hidden here.
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isParticipant = $derived(actor?.role === 'player' || actor?.role === 'observer');

	// The participant's "sync cursor": the op id they have applied up to. The DEFAULT is caught-up (the
	// latest op), so a freshly-loaded participant is up to date; moving the cursor back simulates having
	// missed operations while disconnected (sleep / backgrounding / intermittent connectivity).
	const operations = $derived(runtime.state.sync.operations as SyncOperation[]);
	// `undefined` ⇒ "use the latest op" (caught up). An explicit value (incl. '' for fresh join) overrides.
	let cursorChoice = $state<string | undefined>(undefined);
	const latestOpId = $derived(operations.at(-1)?.id ?? null);
	const cursorOpId = $derived<string | null>(
		cursorChoice === undefined ? latestOpId : cursorChoice === '' ? null : cursorChoice,
	);

	// Every durable op is treated as `player-visible` for this simulation EXCEPT where the entity is recorded
	// elsewhere as hidden; the core's catch-up filter fails closed to dm-only for any op with no recorded
	// metadata, so this surface only ever shows ops the participant may actually see. We supply a permissive
	// per-op replay context (viewer capability) so a player's own visible ops revalidate; the core still
	// rejects anything beyond the participant's current grants.
	const replayContextFor: ReconnectReplayContextSource = (op: SyncOperation) => ({
		visibilityMetadata: {
			entityType: op.entityType,
			entityId: op.entityId,
			entity: { level: 'player-visible' },
		},
		targetEntityIds: { [op.entityType]: new Set([op.entityId]) },
		requiredCapability: 'viewer',
	});

	const catchUp = $derived.by(() => {
		if (!actor || !isParticipant) return null;
		const applied = appliedIdsBeforeCursor(operations, cursorOpId);
		return computeReconnectCatchUp(
			{
				recipient: actor,
				operations,
				alreadyDeliveredOperationIds: applied,
				permission: runtime.state.permissions,
				resolveVisibility: (op) => ({
					entityType: op.entityType,
					entityId: op.entityId,
					entity: { level: 'player-visible' },
				}),
			},
			runtime.state,
			replayContextFor,
		);
	});

	const ordering = $derived(catchUp ? orderCatchUpByDependency(catchUp.delivered) : null);

	const phase = $derived(
		catchUp && ordering ? catchUpPhase(catchUp.controlState, ordering.held.length) : 'complete',
	);
	const failureState = $derived(deriveCatchUpFailureState(phase));
</script>

{#if isParticipant && actor}
	<section data-testid="reconnect-status" aria-label="Reconnect and catch-up">
		<h2>Reconnect &amp; catch-up</h2>
		<p class="meta">
			On reconnect the app re-checks your current role, visibility, and grants and delivers only the
			catch-up you are allowed to receive — in order. Durable actions stay disabled until you are caught
			up.
		</p>

		<label for="reconnect-cursor">Simulate reconnecting from operation</label>
		<select
			id="reconnect-cursor"
			data-testid="reconnect-cursor"
			value={cursorOpId ?? ''}
			onchange={(event) => {
				cursorChoice = (event.currentTarget as HTMLSelectElement).value;
			}}
		>
			<option value="">Fresh join (no prior state)</option>
			{#each operations as op (op.id)}
				<option value={op.id}>Applied up to {op.opType} ({op.id})</option>
			{/each}
		</select>

		<div class="status-card" data-testid="reconnect-ui-status">
			<strong>Status</strong>
			<span class="meta" data-testid="reconnect-ui-status-value">{failureState.uiStatus}</span>
			<div class="meta" data-testid="reconnect-ui-message">{failureState.message}</div>
		</div>

		<div class="status-card" data-testid="reconnect-controls">
			<strong>Durable actions</strong>
			<span
				class="meta"
				data-testid="reconnect-controls-state"
				class:disabled={failureState.durableCommandsDisabled}
			>
				{failureState.durableCommandsDisabled ? 'disabled' : 'enabled'}
			</span>
			<button
				type="button"
				data-testid="reconnect-durable-action"
				disabled={failureState.durableCommandsDisabled}
			>
				Submit a durable action
			</button>
		</div>

		{#if catchUp && ordering}
			<section aria-label="Catch-up operations">
				<h3>Catch-up ({catchUp.delivered.length})</h3>
				{#if catchUp.delivered.length === 0}
					<p class="meta" data-testid="reconnect-catchup-empty">You are fully caught up.</p>
				{:else}
					<ol class="op-list" data-testid="reconnect-catchup-list">
						{#each ordering.ordered as op (op.id)}
							<li data-testid={`reconnect-op-${op.id}`}>{op.opType}</li>
						{/each}
					</ol>
				{/if}
				{#if ordering.held.length > 0}
					<p class="error" role="alert" data-testid="reconnect-held">
						{ordering.held.length} operation(s) are waiting on dependencies and cannot be applied yet.
					</p>
				{/if}
				{#if catchUp.rejectedOperationIds.length > 0}
					<p class="error" role="alert" data-testid="reconnect-rejected">
						{catchUp.rejectedOperationIds.length} operation(s) are no longer permitted under your current
						grants and were not applied.
					</p>
				{/if}
			</section>
		{/if}
	</section>
{/if}

<style>
	.meta {
		color: var(--color-text-muted, #666);
	}
	.error {
		color: var(--color-danger, #b00020);
	}
	.status-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-1, 0.25rem);
		border: 1px solid var(--color-border, #ddd);
		border-radius: var(--radius-1, 0.25rem);
		padding: var(--space-2, 0.5rem);
		margin: var(--space-1, 0.25rem) 0;
	}
	.disabled {
		color: var(--color-danger, #b00020);
	}
	.op-list {
		margin: 0;
		padding-left: var(--space-3, 1rem);
	}
</style>
