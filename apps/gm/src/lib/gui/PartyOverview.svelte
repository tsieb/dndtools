<script lang="ts">
	import { getPartyOverviewForActor, listCharactersForActor } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CHAR-011 / CHAR-015: the actor-filtered PARTY OVERVIEW. It renders ENTIRELY from the Processing
	// Core's single actor-filtered party-view query, so a character hidden from the viewer never appears
	// (omitted, not redacted), DM-only fields are stripped, and an observer receives an EMPTY overview.
	// The DM additionally authors the marching order and party inventory; those writes go through durable
	// commands. The GUI never re-derives visibility (Contract 1).
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');

	const overview = $derived(
		getPartyOverviewForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId),
	);

	// The DM's authoring helpers list every character (DM sees all) for the marching-order picker.
	const allCharacters = $derived(
		listCharactersForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId),
	);

	let error = $state<string | null>(null);
	let itemName = $state('');
	let itemDetail = $state('');
	let itemVisibility = $state<'dm-only' | 'player-visible' | 'shared'>('player-visible');

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return false;
		}
		return true;
	}

	async function moveUp(characterId: string): Promise<void> {
		const order = overview.marchingOrder.slice();
		const index = order.indexOf(characterId);
		if (index <= 0) return;
		[order[index - 1], order[index]] = [order[index]!, order[index - 1]!];
		await dispatch({
			type: 'character.set-marching-order',
			actorId: runtime.activeActorId,
			payload: { order },
		});
	}

	async function addItem(): Promise<void> {
		if (itemName.trim() === '') {
			error = 'Enter an item name.';
			return;
		}
		const ok = await dispatch({
			type: 'character.upsert-party-inventory-item',
			actorId: runtime.activeActorId,
			payload: {
				name: itemName.trim(),
				detail: itemDetail.trim(),
				visibility: itemVisibility,
			},
		});
		if (ok) {
			itemName = '';
			itemDetail = '';
		}
	}

	async function removeItem(itemId: string): Promise<void> {
		await dispatch({
			type: 'character.remove-party-inventory-item',
			actorId: runtime.activeActorId,
			payload: { itemId },
		});
	}
</script>

<section data-testid="party-overview" aria-label="Party overview">
	<h2>Party overview</h2>

	{#if error}
		<p class="meta" role="alert" data-testid="party-error">{error}</p>
	{/if}

	{#if overview.members.length === 0 && overview.inventory.length === 0}
		<p class="meta" data-testid="party-empty">No party records are visible to you.</p>
	{/if}

	{#if overview.members.length > 0}
		<h3>Marching order</h3>
		<ol class="scene-list" data-testid="party-members">
			{#each overview.members as member, index (member.characterId)}
				<li class="scene-card" data-testid={`party-member-${member.characterId}`}>
					<div>
						<strong>{member.name}</strong>
						<span class="meta"> • {member.kind} • {member.visibility}</span>
						<div class="meta" data-testid={`party-status-${member.characterId}`}>
							HP {member.hp}/{member.maxHp}{#if member.tempHp > 0}<span> (+{member.tempHp} temp)</span>{/if}
							• AC {member.ac}
							{#if member.availableSpellSlots > 0}• {member.availableSpellSlots} slots{/if}
							{#if member.availableClassResources > 0}• {member.availableClassResources} resources{/if}
						</div>
						{#if member.conditions.length > 0}
							<div class="meta" data-testid={`party-conditions-${member.characterId}`}>
								Conditions: {member.conditions.join(', ')}
							</div>
						{/if}
					</div>
					{#if isDm && index > 0}
						<button
							type="button"
							data-testid={`party-move-up-${member.characterId}`}
							onclick={() => moveUp(member.characterId)}
						>
							Move up
						</button>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}

	{#if overview.inventory.length > 0}
		<h3>Party inventory</h3>
		<ul class="scene-list" data-testid="party-inventory">
			{#each overview.inventory as item (item.id)}
				<li class="scene-card" data-testid={`party-item-${item.id}`}>
					<div>
						<strong>{item.name}</strong>
						<span class="meta"> • {item.visibility}</span>
						{#if item.detail}<div class="meta">{item.detail}</div>{/if}
					</div>
					{#if isDm}
						<button
							type="button"
							data-testid={`party-item-remove-${item.id}`}
							onclick={() => removeItem(item.id)}
						>
							Remove
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if isDm}
		<div data-testid="party-dm-hidden" class="meta">
			Hidden from players: {overview.hidden.members} character(s), {overview.hidden.inventory} item(s).
		</div>

		<form
			data-testid="party-add-item"
			onsubmit={(event) => {
				event.preventDefault();
				addItem();
			}}
		>
			<h3>Add inventory item</h3>
			<label>
				Name
				<input data-testid="party-item-name" bind:value={itemName} />
			</label>
			<label>
				Detail
				<input data-testid="party-item-detail" bind:value={itemDetail} />
			</label>
			<label>
				Visibility
				<select data-testid="party-item-visibility" bind:value={itemVisibility}>
					<option value="dm-only">DM only</option>
					<option value="player-visible">Player visible</option>
					<option value="shared">Shared</option>
				</select>
			</label>
			<button type="submit" data-testid="party-item-add">Add item</button>
		</form>

		{#if allCharacters.length === 0}
			<p class="meta">Create characters to build a marching order.</p>
		{/if}
	{/if}
</section>
