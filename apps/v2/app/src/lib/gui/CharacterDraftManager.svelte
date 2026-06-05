<script lang="ts">
	import { listDraftsForActor } from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CHAR-013: the DM-only draft ownership surface. The DM creates a PC draft assigned to exactly
	// one player, transfers it (atomically revoking the prior owner), or revokes it. Every mutation
	// dispatches a durable command; the GUI never writes character state directly (Contract 1). The
	// "exactly one owner" invariant is enforced in the Processing Core, not here.
	const runtime = useRuntime();

	const dmActorId = $derived(
		Object.values(runtime.state.permissions.actors).find((actor) => actor.role === 'dm')?.id ?? '',
	);

	const players = $derived(
		Object.values(runtime.state.permissions.actors)
			.filter((actor) => actor.role === 'player')
			.sort((a, b) => a.displayName.localeCompare(b.displayName)),
	);

	// The DM sees every draft (actor-filtered query; for the DM that is all of them).
	const drafts = $derived(
		listDraftsForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId),
	);

	let newOwnerId = $state('');
	let transferTargetId = $state('');
	let error = $state<string | null>(null);

	function playerName(id: string): string {
		return runtime.state.permissions.actors[id]?.displayName ?? id;
	}

	async function createDraft(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		if (!newOwnerId) {
			error = 'Choose a player to own the draft.';
			return;
		}
		const result = await runtime.dispatch({
			type: 'character.create-draft',
			actorId: dmActorId,
			payload: { ownerActorId: newOwnerId },
		});
		if (result.status === 'rejected') error = result.rejection.message;
		else newOwnerId = '';
	}

	async function transfer(draftId: string) {
		error = null;
		if (!transferTargetId) {
			error = 'Choose a player to transfer the draft to.';
			return;
		}
		const result = await runtime.dispatch({
			type: 'character.transfer-draft',
			actorId: dmActorId,
			payload: { draftId, toOwnerActorId: transferTargetId },
		});
		if (result.status === 'rejected') error = result.rejection.message;
	}

	async function revoke(draftId: string) {
		error = null;
		const result = await runtime.dispatch({
			type: 'character.revoke-draft',
			actorId: dmActorId,
			payload: { draftId },
		});
		if (result.status === 'rejected') error = result.rejection.message;
	}
</script>

<section data-testid="draft-manager" aria-label="Character draft ownership">
	<h2>Character drafts</h2>
	<p class="meta">
		Assign a PC draft to exactly one player. A draft always has one owner; transferring it
		atomically revokes the previous owner.
	</p>

	{#if players.length === 0}
		<p class="meta" data-testid="draft-no-players">Add a player participant to assign a draft.</p>
	{:else}
		<form class="form" data-testid="draft-create-form" onsubmit={createDraft}>
			<label>
				Owner
				<select data-testid="draft-owner" bind:value={newOwnerId}>
					<option value="" disabled>Select a player…</option>
					{#each players as player (player.id)}
						<option value={player.id}>{player.displayName}</option>
					{/each}
				</select>
			</label>
			<button type="submit" data-testid="draft-create">Create draft</button>
		</form>

		<label class="transfer-target">
			Transfer to
			<select data-testid="draft-transfer-target" bind:value={transferTargetId}>
				<option value="" disabled>Select a player…</option>
				{#each players as player (player.id)}
					<option value={player.id}>{player.displayName}</option>
				{/each}
			</select>
		</label>
	{/if}

	{#if error}
		<p class="meta" role="alert" data-testid="draft-error">{error}</p>
	{/if}

	<section aria-label="Active drafts">
		<h3>Active drafts</h3>
		{#if drafts.length === 0}
			<p class="meta" data-testid="draft-list-empty">No drafts yet.</p>
		{:else}
			<ul class="scene-list" data-testid="draft-list">
				{#each drafts as draft (draft.id)}
					<li class="scene-card" data-testid={`draft-item-${draft.id}`}>
						<div>
							<strong>{draft.name || 'Unnamed draft'}</strong>
							<div class="meta" data-testid={`draft-owner-${draft.id}`}>
								owner: {playerName(draft.ownerActorId)}{draft.finalized ? ' • finalized' : ''}
							</div>
						</div>
						<div class="row-actions">
							<button
								type="button"
								data-testid={`draft-transfer-${draft.id}`}
								disabled={draft.finalized}
								onclick={() => transfer(draft.id)}>Transfer</button
							>
							<button
								type="button"
								data-testid={`draft-revoke-${draft.id}`}
								onclick={() => revoke(draft.id)}>Revoke</button
							>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</section>

<style>
	.form,
	.transfer-target {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-width: 24rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}
	.row-actions {
		display: flex;
		gap: 0.5rem;
	}
</style>
