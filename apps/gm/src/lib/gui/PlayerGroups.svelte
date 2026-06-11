<script lang="ts">
	import { useRuntime } from '$lib/state/runtime-context';

	// COLLAB-012: the DM manages PLAYER GROUPS used as PROJECTION + HANDOUT DELIVERY TARGETS. CRITICAL:
	// group membership is DELIVERY-ONLY. Adding a player to a group grants NO visibility or write
	// permission — the group only expands the recipient list a delivery resolves to; each recipient's
	// access is still governed solely by their role/grants/visibility (enforced in the Processing Core).
	// This surface is DM-only; the GUI dispatches command intents and renders the durable group state.
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const candidates = $derived(runtime.actors.filter((a) => a.role !== 'dm'));
	const groups = $derived(Object.values(runtime.state.session.playerGroups));

	let error = $state<string | null>(null);
	let groupName = $state('The Front Line');
	let selectedMembers = $state<string[]>([]);

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return false;
		}
		return true;
	}

	function toggleMember(id: string): void {
		selectedMembers = selectedMembers.includes(id)
			? selectedMembers.filter((m) => m !== id)
			: [...selectedMembers, id];
	}

	async function createGroup(): Promise<void> {
		if (!groupName.trim()) {
			error = 'Enter a group name.';
			return;
		}
		const ok = await dispatch({
			type: 'session.create-player-group',
			actorId: runtime.activeActorId,
			payload: { name: groupName.trim(), memberActorIds: selectedMembers },
		});
		if (ok) selectedMembers = [];
	}

	async function deleteGroup(groupId: string): Promise<void> {
		await dispatch({
			type: 'session.delete-player-group',
			actorId: runtime.activeActorId,
			payload: { groupId },
		});
	}

	async function toggleGroupMember(groupId: string, memberId: string): Promise<void> {
		const group = runtime.state.session.playerGroups[groupId];
		if (!group) return;
		const members = group.memberActorIds.includes(memberId)
			? group.memberActorIds.filter((m) => m !== memberId)
			: [...group.memberActorIds, memberId];
		await dispatch({
			type: 'session.update-player-group',
			actorId: runtime.activeActorId,
			payload: { groupId, memberActorIds: members },
		});
	}
</script>

{#if isDm}
	<section class="cwrap" data-testid="player-groups" aria-label="Player groups">
		<h2>Player groups</h2>
		<p class="meta">
			Groups are delivery targets only. Membership does not grant any visibility or write permission.
		</p>

		{#if error}
			<p class="error" role="alert" data-testid="player-group-error">{error}</p>
		{/if}

		<form
			class="create-form"
			data-testid="player-group-create-form"
			onsubmit={(event) => {
				event.preventDefault();
				void createGroup();
			}}
		>
			<label for="player-group-name">Group name</label>
			<input id="player-group-name" data-testid="player-group-name" bind:value={groupName} />

			<fieldset data-testid="player-group-members">
				<legend>Members</legend>
				{#each candidates as candidate (candidate.id)}
					<label class="member">
						<input
							type="checkbox"
							data-testid={`player-group-member-${candidate.id}`}
							checked={selectedMembers.includes(candidate.id)}
							onchange={() => toggleMember(candidate.id)}
						/>
						{candidate.displayName}
					</label>
				{/each}
			</fieldset>

			<button type="submit" data-testid="create-player-group">Create group</button>
		</form>

		<ul class="group-list" data-testid="player-group-list">
			{#each groups as group (group.id)}
				<li data-testid={`player-group-${group.id}`}>
					<strong data-testid="player-group-name-label">{group.name}</strong>
					<span class="meta">({group.memberActorIds.length} member(s))</span>
					<div class="group-members">
						{#each candidates as candidate (candidate.id)}
							<label class="member">
								<input
									type="checkbox"
									data-testid={`player-group-${group.id}-member-${candidate.id}`}
									checked={group.memberActorIds.includes(candidate.id)}
									onchange={() => void toggleGroupMember(group.id, candidate.id)}
								/>
								{candidate.displayName}
							</label>
						{/each}
					</div>
					<button
						type="button"
						data-testid={`delete-player-group-${group.id}`}
						onclick={() => void deleteGroup(group.id)}
					>
						Delete group
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.error {
		color: var(--color-status-error-text);
	}
	.meta {
		color: var(--color-text-secondary);
	}
	.create-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
	}
	.member {
		display: flex;
		gap: var(--space-1);
		align-items: center;
	}
	.group-list {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.group-list li {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--space-2);
	}
	.group-members {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: var(--space-1) 0;
	}
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
	.cwrap :global(form) {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.cwrap :global(label) {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.cwrap :global(input),
	.cwrap :global(select) {
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
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
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
</style>
