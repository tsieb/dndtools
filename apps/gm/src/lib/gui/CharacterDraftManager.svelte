<script lang="ts">
	import { DRAFT_STEPS, listDraftsForActor, type CharacterDraftView } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import Dialog from '$lib/gui/a11y/Dialog.svelte';

	// UX-CHAR-013 — the DM-only draft ownership surface. The DM creates a PC draft assigned to exactly
	// one player, transfers it (atomically revoking the prior owner), or revokes it. Transfer and
	// revoke are SAFETY-CRITICAL (a wrong move loses a player's progress access), so both take a
	// confirmation that names the players involved. Every mutation dispatches a durable command; the
	// GUI never writes character state directly (Contract 1), and the "exactly one owner" invariant is
	// enforced in the Processing Core, not here.
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

	const TOTAL_STEPS = DRAFT_STEPS.length;

	let newOwnerId = $state('');
	let error = $state<string | null>(null);

	// Per-draft transfer target selections, keyed by draft id (so each card has its own picker).
	let transferTargets = $state<Record<string, string>>({});

	// Confirmation dialog state (mirrors the SessionPhaseControls pattern: an open flag + a payload).
	let transferConfirm = $state<{ draftId: string; toId: string } | null>(null);
	let transferOpen = $state(false);
	let revokeConfirm = $state<{ draftId: string } | null>(null);
	let revokeOpen = $state(false);

	function playerName(id: string): string {
		return runtime.state.permissions.actors[id]?.displayName ?? id;
	}

	function completedSteps(draft: CharacterDraftView): number {
		return draft.steps.filter((step) => step.completed).length;
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

	function requestTransfer(draftId: string): void {
		error = null;
		const toId = transferTargets[draftId] ?? '';
		if (!toId) {
			error = 'Choose a player to transfer the draft to.';
			return;
		}
		transferConfirm = { draftId, toId };
		transferOpen = true;
	}

	async function confirmTransfer(): Promise<void> {
		const pending = transferConfirm;
		transferOpen = false;
		transferConfirm = null;
		if (!pending) return;
		const result = await runtime.dispatch({
			type: 'character.transfer-draft',
			actorId: dmActorId,
			payload: { draftId: pending.draftId, toOwnerActorId: pending.toId },
		});
		if (result.status === 'rejected') error = result.rejection.message;
		else transferTargets[pending.draftId] = '';
	}

	function requestRevoke(draftId: string): void {
		error = null;
		revokeConfirm = { draftId };
		revokeOpen = true;
	}

	async function confirmRevoke(): Promise<void> {
		const pending = revokeConfirm;
		revokeOpen = false;
		revokeConfirm = null;
		if (!pending) return;
		const result = await runtime.dispatch({
			type: 'character.revoke-draft',
			actorId: dmActorId,
			payload: { draftId: pending.draftId },
		});
		if (result.status === 'rejected') error = result.rejection.message;
	}

	const transferOwnerName = $derived(
		transferConfirm
			? playerName(
					drafts.find((draft) => draft.id === transferConfirm!.draftId)?.ownerActorId ?? '',
				)
			: '',
	);
	const revokeOwnerName = $derived(
		revokeConfirm
			? playerName(
					drafts.find((draft) => draft.id === revokeConfirm!.draftId)?.ownerActorId ?? '',
				)
			: '',
	);
</script>

<section class="drafts" data-testid="draft-manager" aria-labelledby="drafts-heading">
	<header class="drafts__head">
		<h2 id="drafts-heading">Character drafts</h2>
		<p class="drafts__sub">
			Assign a PC draft to exactly one player. Transferring a draft atomically moves access to the
			new owner.
		</p>
	</header>

	{#if error}
		<p class="drafts__error" role="alert" data-testid="draft-error">{error}</p>
	{/if}

	{#if players.length === 0}
		<p class="drafts__empty" data-testid="draft-no-players">
			Add a player participant to assign a draft.
		</p>
	{:else}
		<form class="drafts__create" data-testid="draft-create-form" onsubmit={createDraft}>
			<label class="field">
				<span class="field__label">New draft owner</span>
				<select data-testid="draft-owner" bind:value={newOwnerId}>
					<option value="" disabled>Select a player…</option>
					{#each players as player (player.id)}
						<option value={player.id}>{player.displayName}</option>
					{/each}
				</select>
			</label>
			<button class="button" type="submit" data-testid="draft-create">Create draft</button>
		</form>
	{/if}

	<section aria-label="Active drafts">
		<h3 class="drafts__subhead">Active drafts</h3>
		{#if drafts.length === 0}
			<p class="drafts__empty" data-testid="draft-list-empty">No drafts yet.</p>
		{:else}
			<ul class="draft-list" data-testid="draft-list">
				{#each drafts as draft (draft.id)}
					<li class="draft-card" data-testid={`draft-item-${draft.id}`}>
						<div class="draft-card__main">
							<div class="draft-card__title">
								<strong>{draft.name || 'Unnamed draft'}</strong>
								{#if draft.finalized}
									<span class="status-badge status-badge--done">Finalized</span>
								{:else}
									<span class="status-badge">{completedSteps(draft)} of {TOTAL_STEPS} steps</span>
								{/if}
							</div>
							<div class="draft-card__owner" data-testid={`draft-owner-${draft.id}`}>
								Owner: {draft.ownerActorId ? playerName(draft.ownerActorId) : 'Unassigned'}
							</div>
						</div>

						{#if !draft.finalized}
							<div class="draft-card__actions">
								<label class="field field--inline">
									<span class="field__label sr-hint">Transfer {draft.name || 'draft'} to</span>
									<select
										data-testid={`draft-transfer-target-${draft.id}`}
										aria-label={`Transfer ${draft.name || 'draft'} to`}
										bind:value={transferTargets[draft.id]}
									>
										<option value="" disabled selected>Transfer to…</option>
										{#each players as player (player.id)}
											{#if player.id !== draft.ownerActorId}
												<option value={player.id}>{player.displayName}</option>
											{/if}
										{/each}
									</select>
								</label>
								<button
									type="button"
									class="button secondary"
									data-testid={`draft-transfer-${draft.id}`}
									onclick={() => requestTransfer(draft.id)}
								>
									Transfer
								</button>
								<button
									type="button"
									class="button danger"
									data-testid={`draft-revoke-${draft.id}`}
									onclick={() => requestRevoke(draft.id)}
								>
									Revoke
								</button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</section>

<Dialog
	bind:open={transferOpen}
	role="alertdialog"
	closeOnBackdrop={false}
	title="Transfer this draft?"
	testid="draft-transfer-dialog"
	onclose={() => (transferConfirm = null)}
>
	<p>
		Transfer this draft to <strong>{transferConfirm ? playerName(transferConfirm.toId) : ''}</strong>?
		{#if transferOwnerName}<strong>{transferOwnerName}</strong> will lose access immediately.{/if}
	</p>
	{#snippet footer()}
		<button type="button" class="button secondary" onclick={() => (transferOpen = false)}>
			Cancel
		</button>
		<button type="button" class="button" data-testid="draft-transfer-confirm" onclick={confirmTransfer}>
			Transfer draft
		</button>
	{/snippet}
</Dialog>

<Dialog
	bind:open={revokeOpen}
	role="alertdialog"
	closeOnBackdrop={false}
	title="Revoke draft access?"
	testid="draft-revoke-dialog"
	onclose={() => (revokeConfirm = null)}
>
	<p>
		Revoke <strong>{revokeOwnerName}</strong>'s access to this draft? The draft is kept, but the
		player can no longer open it.
	</p>
	{#snippet footer()}
		<button type="button" class="button secondary" onclick={() => (revokeOpen = false)}>
			Cancel
		</button>
		<button type="button" class="button danger" data-testid="draft-revoke-confirm" onclick={confirmRevoke}>
			Revoke access
		</button>
	{/snippet}
</Dialog>

<style>
	.drafts {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.drafts__head h2 {
		margin: 0;
	}
	.drafts__sub {
		margin: var(--space-1) 0 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
		line-height: var(--leading-snug);
	}
	.drafts__subhead {
		margin: 0 0 var(--space-2);
		font-size: var(--text-md);
	}
	.drafts__error {
		margin: 0;
		color: var(--color-status-error-text);
		font-size: var(--text-sm);
	}
	.drafts__empty {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.drafts__create {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.field--inline {
		flex: 1 1 auto;
	}
	.field__label {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.sr-hint {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.field :global(select) {
		min-height: var(--touch-target-min);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font: inherit;
	}
	.draft-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.draft-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding: var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.draft-card__main {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
	}
	.draft-card__title {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.draft-card__owner {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.status-badge {
		font-size: var(--text-2xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		padding: 0 var(--space-2);
	}
	.status-badge--done {
		color: var(--color-status-success-text);
		border-color: var(--color-status-success);
		background: var(--color-status-success-subtle);
	}
	.draft-card__actions {
		display: flex;
		align-items: flex-end;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
	.button.danger {
		background: transparent;
		color: var(--color-status-error-text);
		border: 1px solid var(--color-status-error);
	}
	:global(.dialog) .button.danger {
		background: var(--color-status-error);
		color: var(--color-text-inverse);
		border-color: var(--color-status-error);
	}
</style>
