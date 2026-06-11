<script lang="ts">
	import { getPartyOverviewForActor, listCharactersForActor } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import HpBar from '$lib/gui/ux-char/HpBar.svelte';
	import { isCriticalHp } from '$lib/gui/ux-char/hp-tone';

	// UX-CHAR-011 / CHAR-015 — the glanceable, actor-filtered PARTY OVERVIEW. It renders ENTIRELY from
	// the Processing Core's single actor-filtered party-view query, so a character hidden from the
	// viewer never appears (omitted, not redacted), DM-only fields are stripped, and an observer
	// receives an EMPTY overview. The DM additionally authors the marching order and party inventory;
	// those writes go through durable commands. The GUI never re-derives visibility (Contract 1).
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const isObserver = $derived(actor?.role !== 'dm' && actor?.role !== 'player');

	const overview = $derived(
		getPartyOverviewForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId),
	);

	// The DM's authoring helpers list every character (DM sees all) for the marching-order picker.
	const allCharacters = $derived(
		listCharactersForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId),
	);

	const MAX_CONDITION_PILLS = 2;

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

	async function move(characterId: string, delta: -1 | 1): Promise<void> {
		const order = overview.marchingOrder.slice();
		const index = order.indexOf(characterId);
		const target = index + delta;
		if (index < 0 || target < 0 || target >= order.length) return;
		[order[index], order[target]] = [order[target]!, order[index]!];
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
			payload: { name: itemName.trim(), detail: itemDetail.trim(), visibility: itemVisibility },
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

	const isEmpty = $derived(overview.members.length === 0 && overview.inventory.length === 0);
</script>

<section class="party" data-testid="party-overview" aria-labelledby="party-heading">
	<header class="party__head">
		<h2 id="party-heading">Party</h2>
		{#if overview.members.length > 0}
			<p class="party__sub">At-a-glance vitals and marching order.</p>
		{/if}
	</header>

	{#if error}
		<p class="party__error" role="alert" data-testid="party-error">{error}</p>
	{/if}

	{#if isEmpty}
		<p class="party__empty" data-testid="party-empty">
			{isObserver
				? 'No party information available.'
				: 'No party members are visible to you.'}
		</p>
	{/if}

	{#if overview.members.length > 0}
		<ol class="party__members" data-testid="party-members">
			{#each overview.members as member, index (member.characterId)}
				{@const critical = isCriticalHp(member.hp, member.maxHp)}
				<li
					class="member"
					class:member--critical={critical}
					data-critical={critical}
					data-testid={`party-member-${member.characterId}`}
				>
					<div class="member__ord" aria-hidden="true">{index + 1}</div>
					<div class="member__body">
						<div class="member__top">
							<strong class="member__name">{member.name}</strong>
							<span class="kind-badge">{member.kind}</span>
						</div>
						<div class="member__vitals" data-testid={`party-status-${member.characterId}`}>
							<HpBar
								hp={member.hp}
								maxHp={member.maxHp}
								tempHp={member.tempHp}
								label={member.name}
								testid={`party-hp-${member.characterId}`}
							/>
							<span class="ac-badge" title="Armour class">AC {member.ac}</span>
						</div>
						{#if member.availableSpellSlots > 0 || member.availableClassResources > 0}
							<div class="member__resources">
								{#if member.availableSpellSlots > 0}<span>{member.availableSpellSlots} slots</span>{/if}
								{#if member.availableClassResources > 0}<span>{member.availableClassResources} resources</span>{/if}
							</div>
						{/if}
						{#if member.conditions.length > 0}
							<ul class="conditions" data-testid={`party-conditions-${member.characterId}`} aria-label="Conditions">
								{#each member.conditions.slice(0, MAX_CONDITION_PILLS) as condition (condition)}
									<li class="condition-pill">{condition}</li>
								{/each}
								{#if member.conditions.length > MAX_CONDITION_PILLS}
									<li class="condition-pill condition-pill--more">
										+{member.conditions.length - MAX_CONDITION_PILLS} more
									</li>
								{/if}
							</ul>
						{/if}
					</div>
					{#if isDm}
						<div class="member__reorder">
							<button
								type="button"
								class="icon-btn"
								data-testid={`party-move-up-${member.characterId}`}
								disabled={index === 0}
								aria-label={`Move ${member.name} up`}
								onclick={() => move(member.characterId, -1)}
							>
								↑
							</button>
							<button
								type="button"
								class="icon-btn"
								data-testid={`party-move-down-${member.characterId}`}
								disabled={index === overview.members.length - 1}
								aria-label={`Move ${member.name} down`}
								onclick={() => move(member.characterId, 1)}
							>
								↓
							</button>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}

	{#if overview.inventory.length > 0}
		<section class="party__section" aria-label="Party inventory">
			<h3>Party inventory</h3>
			<ul class="inventory" data-testid="party-inventory">
				{#each overview.inventory as item (item.id)}
					<li class="inv-item" data-testid={`party-item-${item.id}`}>
						<div class="inv-item__body">
							<strong>{item.name}</strong>
							<span class="vis-badge" data-visibility={item.visibility}>{item.visibility}</span>
							{#if item.detail}<div class="inv-item__detail">{item.detail}</div>{/if}
						</div>
						{#if isDm}
							<button
								type="button"
								class="icon-btn"
								data-testid={`party-item-remove-${item.id}`}
								aria-label={`Remove ${item.name}`}
								onclick={() => removeItem(item.id)}
							>
								✕
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if isDm}
		<div class="party__hidden" data-testid="party-dm-hidden">
			{overview.hidden.members}
			{overview.hidden.members === 1 ? 'character' : 'characters'}
			and {overview.hidden.inventory}
			{overview.hidden.inventory === 1 ? 'item' : 'items'} hidden from players.
		</div>

		<form
			class="party__add"
			data-testid="party-add-item"
			onsubmit={(event) => {
				event.preventDefault();
				addItem();
			}}
		>
			<h3>Add inventory item</h3>
			<div class="party__add-grid">
				<label class="field">
					<span class="field__label">Name</span>
					<input data-testid="party-item-name" bind:value={itemName} />
				</label>
				<label class="field">
					<span class="field__label">Detail</span>
					<input data-testid="party-item-detail" bind:value={itemDetail} />
				</label>
				<label class="field">
					<span class="field__label">Visibility</span>
					<select data-testid="party-item-visibility" bind:value={itemVisibility}>
						<option value="dm-only">DM only</option>
						<option value="player-visible">Player visible</option>
						<option value="shared">Shared</option>
					</select>
				</label>
			</div>
			<button class="button secondary" type="submit" data-testid="party-item-add">Add item</button>
		</form>

		{#if allCharacters.length === 0}
			<p class="party__hint">Create characters to build a marching order.</p>
		{/if}
	{/if}
</section>

<style>
	.party {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.party__head h2 {
		margin: 0;
	}
	.party__sub,
	.party__hint {
		margin: var(--space-1) 0 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.party__empty {
		margin: 0;
		padding: var(--space-4);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.party__error {
		margin: 0;
		color: var(--color-status-error-text);
		font-size: var(--text-sm);
	}
	.party__members {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.member {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-border-strong);
		border-radius: var(--radius-md);
	}
	.member--critical {
		border-left-color: var(--color-status-error);
		background: var(--color-status-error-subtle);
	}
	.member__ord {
		flex: 0 0 auto;
		width: var(--space-5);
		text-align: center;
		font-variant-numeric: tabular-nums;
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.member__body {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.member__top {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}
	.member__name {
		color: var(--color-text-primary);
	}
	.kind-badge {
		font-size: var(--text-2xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		padding: 0 var(--space-1-5);
	}
	.member__vitals {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}
	.member__vitals :global(.hpbar) {
		flex: 1 1 auto;
		min-width: 0;
	}
	.ac-badge {
		flex: 0 0 auto;
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: var(--space-0-5) var(--space-2);
		white-space: nowrap;
	}
	.member__resources {
		display: flex;
		gap: var(--space-2);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.conditions {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.condition-pill {
		font-size: var(--text-2xs);
		color: var(--color-status-warning-text);
		background: var(--color-status-warning-subtle);
		border: 1px solid var(--color-status-warning);
		border-radius: var(--radius-full);
		padding: 0 var(--space-2);
	}
	.condition-pill--more {
		color: var(--color-text-secondary);
		background: transparent;
		border-color: var(--color-border);
	}
	.member__reorder {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.icon-btn {
		cursor: pointer;
		min-width: var(--touch-target-floor);
		min-height: var(--touch-target-floor);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
	}
	.icon-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.party__section h3,
	.party__add h3 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-md);
	}
	.inventory {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.inv-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.inv-item__body {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
		min-width: 0;
	}
	.inv-item__detail {
		flex-basis: 100%;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.vis-badge {
		font-size: var(--text-2xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		padding: 0 var(--space-1-5);
	}
	.vis-badge[data-visibility='dm-only'] {
		color: var(--color-dm-only-badge);
		border-color: var(--color-dm-only-badge);
		background: var(--color-dm-only-subtle);
	}
	.party__hidden {
		color: var(--color-text-secondary);
		font-size: var(--text-xs);
	}
	.party__add {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		align-items: flex-start;
	}
	.party__add-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: var(--space-2);
		width: 100%;
		max-width: 480px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.field__label {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.field :global(input),
	.field :global(select) {
		min-height: var(--touch-target-min);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font: inherit;
	}
</style>
