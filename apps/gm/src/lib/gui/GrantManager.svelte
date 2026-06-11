<script lang="ts">
	import {
		CAPABILITY_SET_SCHEMA,
		listGrantableCapabilitySets,
		previewGrantEffect,
		singularOwnershipCapabilityFor,
		type CapabilitySet,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// PERM-004 / PERM-005 / PERM-008 / PERM-013: the DM grant UI. It is a VISIBLE SURFACE that
	// presents NAMED capability sets with human explanations and an EFFECTIVE PERMISSION PREVIEW
	// (never raw field checkboxes or hidden policy). Every model rendered here is computed by the
	// Processing Core (listGrantableCapabilitySets / previewGrantEffect); the GUI never authors
	// permission policy. All mutations dispatch durable core commands — the GUI never writes
	// permission state directly (Contract 1).
	const runtime = useRuntime();

	// Only the DM may author grants (Contract 3 Axis 2 rule 2). This surface is rendered only for the
	// DM by the parent; we still resolve the DM actor id to use as the command author.
	const dmActorId = $derived(
		Object.values(runtime.state.permissions.actors).find((actor) => actor.role === 'dm')?.id ?? '',
	);

	// Players (and only players) can receive grants. Observers/DM are excluded.
	const grantablePlayers = $derived(
		Object.values(runtime.state.permissions.actors)
			.filter((actor) => actor.role === 'player')
			.sort((a, b) => a.displayName.localeCompare(b.displayName)),
	);

	// The entity types that have a system-defined capability schema (PERM-005). The DM picks a type
	// from this fixed list, never an arbitrary field list.
	const entityTypes = Object.keys(CAPABILITY_SET_SCHEMA);

	let entityType = $state<string>('character');
	let entityId = $state<string>('');
	let playerActorId = $state<string>('');
	let capabilitySet = $state<CapabilitySet>('viewer');
	let expiresAt = $state<string>('');
	let error = $state<string | null>(null);

	// The named, schema-defined capability sets grantable for the chosen entity type, each with a
	// human explanation (PERM-005 / PERM-008). Recomputed from the core when the type changes.
	const grantableSets = $derived(listGrantableCapabilitySets(entityType));

	// Keep the selected capability set valid for the chosen entity type.
	$effect(() => {
		if (!grantableSets.some((set) => set.capabilitySet === capabilitySet)) {
			capabilitySet = grantableSets[0]?.capabilitySet ?? 'viewer';
		}
	});

	// The effective-permission PREVIEW for the candidate grant, computed in the core (PERM-008).
	const preview = $derived(previewGrantEffect(entityType, capabilitySet));

	// Whether the chosen entity type supports a singular ownership transfer (e.g. character owner).
	const singularCapability = $derived(singularOwnershipCapabilityFor(entityType));

	// Existing grants, newest first, for the revoke list. Read-only projection of durable state.
	const grants = $derived(
		[...runtime.state.permissions.grants].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
	);

	function playerName(id: string): string {
		return runtime.state.permissions.actors[id]?.displayName ?? id;
	}

	async function grant(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		if (!playerActorId || !entityId.trim()) {
			error = 'Choose a player and enter the entity id.';
			return;
		}
		const result = await runtime.dispatch({
			type: 'permission.grant-capability-set',
			actorId: dmActorId,
			payload: {
				entityType,
				entityId: entityId.trim(),
				playerActorId,
				capabilitySet,
				expiresAt: expiresAt.trim() ? new Date(expiresAt).toISOString() : null,
			},
		});
		if (result.status === 'rejected') {
			error = result.rejection.message;
		} else {
			entityId = '';
			expiresAt = '';
		}
	}

	async function transfer() {
		error = null;
		if (!playerActorId || !entityId.trim() || !singularCapability) {
			error = 'Choose a player and entity to transfer ownership to.';
			return;
		}
		const result = await runtime.dispatch({
			type: 'permission.transfer-ownership',
			actorId: dmActorId,
			payload: {
				entityType,
				entityId: entityId.trim(),
				toPlayerActorId: playerActorId,
				capabilitySet: singularCapability,
			},
		});
		if (result.status === 'rejected') error = result.rejection.message;
	}

	async function revoke(grantId: string) {
		error = null;
		const result = await runtime.dispatch({
			type: 'permission.revoke-grant',
			actorId: dmActorId,
			payload: { grantId },
		});
		if (result.status === 'rejected') error = result.rejection.message;
	}
</script>

<section class="cwrap" data-testid="grant-manager" aria-label="Grant capability sets">
	<h2>Grant capability sets</h2>
	<p class="meta">
		Grant a named capability set to a player on one entity. The preview shows exactly what the grant
		allows; no raw fields are exposed.
	</p>

	{#if grantablePlayers.length === 0}
		<p class="meta" data-testid="grant-no-players">
			No players are available to grant to. Add a player participant first.
		</p>
	{:else}
		<form data-testid="grant-form" onsubmit={grant}>
			<label>
				Player
				<select data-testid="grant-player" bind:value={playerActorId}>
					<option value="" disabled>Select a player…</option>
					{#each grantablePlayers as player (player.id)}
						<option value={player.id}>{player.displayName}</option>
					{/each}
				</select>
			</label>

			<label>
				Entity type
				<select data-testid="grant-entity-type" bind:value={entityType}>
					{#each entityTypes as type (type)}
						<option value={type}>{type}</option>
					{/each}
				</select>
			</label>

			<label>
				Entity id
				<input
					data-testid="grant-entity-id"
					type="text"
					bind:value={entityId}
					placeholder="e.g. char-1"
				/>
			</label>

			<label>
				Capability set
				<select data-testid="grant-capability-set" bind:value={capabilitySet}>
					{#each grantableSets as set (set.capabilitySet)}
						<option value={set.capabilitySet}>{set.label}</option>
					{/each}
				</select>
			</label>

			<label>
				Expires (optional)
				<input data-testid="grant-expires" type="datetime-local" bind:value={expiresAt} />
			</label>

			<!-- PERM-008: the effective-permission preview, computed in the core. Named sets +
			     explanations + allowed operations + what is excluded. Never raw field checkboxes. -->
			<div class="scene-card" data-testid="grant-preview" aria-label="Effective permission preview">
				<div>
					<strong data-testid="grant-preview-label">{preview.label}</strong>
					<div class="meta" data-testid="grant-preview-explanation">{preview.explanation}</div>
					<div class="meta">
						{preview.writeCapable ? 'Includes write/operate access.' : 'Read-only.'}
					</div>
					{#if preview.allowedOperations.length > 0}
						<ul class="meta" data-testid="grant-preview-allows">
							{#each preview.allowedOperations as op (op)}
								<li>{op}</li>
							{/each}
						</ul>
					{/if}
					{#if preview.effectiveCapabilitySets.length > 1}
						<div class="meta" data-testid="grant-preview-inherits">
							Includes: {preview.effectiveCapabilitySets.join(', ')}
						</div>
					{/if}
					{#if preview.excludedCapabilitySets.length > 0}
						<div class="meta" data-testid="grant-preview-excludes">
							Excludes: {preview.excludedCapabilitySets.join(', ')}
						</div>
					{/if}
				</div>
			</div>

			<div class="grant-actions">
				<button type="submit" data-testid="grant-submit">Grant</button>
				{#if singularCapability}
					<button
						type="button"
						data-testid="grant-transfer"
						onclick={transfer}
						title={`Transfer ${singularCapability} to the selected player, atomically revoking the previous holder.`}
					>
						Transfer {singularCapability}
					</button>
				{/if}
			</div>
		</form>
	{/if}

	{#if error}
		<p class="meta" role="alert" data-testid="grant-error" class:unavailable={true}>{error}</p>
	{/if}

	<section aria-label="Active grants">
		<h3>Active grants</h3>
		{#if grants.length === 0}
			<p class="meta" data-testid="grant-list-empty">No grants have been issued.</p>
		{:else}
			<ul class="scene-list" data-testid="grant-list">
				{#each grants as g (g.id)}
					<li class="scene-card" data-testid={`grant-item-${g.id}`}>
						<div>
							<strong>{g.capabilitySet}</strong> on <code>{g.entityType}:{g.entityId}</code>
							<div class="meta">
								to {playerName(g.playerActorId)}{g.expiresAt ? ` • expires ${g.expiresAt}` : ''}
							</div>
						</div>
						<button
							type="button"
							data-testid={`grant-revoke-${g.id}`}
							onclick={() => revoke(g.id)}>Revoke</button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</section>

<style>
	.cwrap {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.cwrap :global(h2),
	.cwrap :global(h3) {
		margin: 0;
	}
	.cwrap :global(h3) {
		font-size: var(--text-md);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		max-width: 32rem;
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.cwrap :global(input),
	.cwrap :global(select),
	form :global(textarea) {
		min-height: var(--touch-target-min);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font: inherit;
		font-weight: var(--font-weight-regular);
	}
	.cwrap :global(.scene-list) {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1-5);
	}
	.cwrap :global(.scene-card),
	.cwrap :global(.scene-list li) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.cwrap :global(.meta) {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.cwrap :global(button) {
		min-height: var(--touch-target-min);
		padding: 0 var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
	}
	.cwrap :global(button[type='submit']) {
		background: var(--color-accent);
		color: var(--color-accent-foreground);
		border-color: var(--color-accent);
		font-weight: var(--font-weight-semibold);
	}
	.cwrap :global([role='alert']) {
		color: var(--color-status-error-text);
	}
	.grant-actions {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
</style>
