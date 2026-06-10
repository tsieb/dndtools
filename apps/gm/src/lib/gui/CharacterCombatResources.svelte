<script lang="ts">
	import {
		hasGrantedCapability,
		listCharactersForActor,
		ensureCharacterResources,
		availableSlots,
		availableClassResource,
		type CharacterResources,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CHAR-007 / CHAR-008: the combat-resource + spell/resource surface. A character OWNER or COMBAT
	// PARTICIPANT updates HP / temp HP / conditions / death saves / concentration / spell slots / class
	// resources DURING A SESSION (gated on the active-session workflow in the Processing Core). The
	// OWNER additionally manages the spell/slot/resource structure and triggers deterministic rest
	// recovery. Every change dispatches a durable command; the GUI renders the computed resource model
	// and never writes state directly (Contract 1). The core re-enforces session-active gating and
	// owner-vs-combat-participant authority on dispatch regardless of these ergonomic hints.
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const sessionActive = $derived(runtime.state.session.workflow === 'active');

	// The characters the active actor may see (hidden ones omitted, not redacted).
	const visibleCharacters = $derived(
		listCharactersForActor(
			runtime.state.characters,
			runtime.state.permissions,
			runtime.activeActorId,
		),
	);

	let error = $state<string | null>(null);
	let hpDelta = $state<Record<string, number>>({});
	let tempHpValue = $state<Record<string, number>>({});
	let conditionName = $state<Record<string, string>>({});
	let concentrationEffect = $state<Record<string, string>>({});
	let slotLevel = $state<Record<string, number>>({});
	let slotMax = $state<Record<string, number>>({});
	let resourceName = $state<Record<string, string>>({});
	let resourceMax = $state<Record<string, number>>({});
	let resourceRecharge = $state<Record<string, 'short' | 'long' | 'none'>>({});

	function resources(characterId: string): CharacterResources {
		const character = runtime.state.characters.characters[characterId];
		return ensureCharacterResources(character?.resources);
	}

	function canUpdateCombat(characterId: string): boolean {
		if (!actor) return false;
		if (isDm) return true;
		return hasGrantedCapability(
			runtime.state.permissions,
			actor,
			'character',
			characterId,
			'combat-participant',
		);
	}

	function canManage(characterId: string): boolean {
		if (!actor) return false;
		if (isDm) return true;
		return hasGrantedCapability(runtime.state.permissions, actor, 'character', characterId, 'owner');
	}

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return false;
		}
		return true;
	}

	async function applyHp(characterId: string): Promise<void> {
		const delta = Number(hpDelta[characterId] ?? 0);
		if (!Number.isFinite(delta) || delta === 0) {
			error = 'Enter a non-zero HP change.';
			return;
		}
		await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'hp', delta: Math.trunc(delta) },
		});
	}

	async function applyTempHp(characterId: string): Promise<void> {
		await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'temp-hp', value: Math.max(0, Math.trunc(Number(tempHpValue[characterId] ?? 0))) },
		});
	}

	async function toggleCondition(characterId: string, present: boolean): Promise<void> {
		const condition = (conditionName[characterId] ?? '').trim();
		if (!condition) {
			error = 'Enter a condition name.';
			return;
		}
		const ok = await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'condition', condition, present },
		});
		if (ok && present) conditionName[characterId] = '';
	}

	async function deathSave(characterId: string, outcome: 'success' | 'failure' | 'reset'): Promise<void> {
		await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'death-save', outcome },
		});
	}

	async function concentrate(characterId: string, clear: boolean): Promise<void> {
		const effect = clear ? null : (concentrationEffect[characterId] ?? '').trim();
		if (!clear && !effect) {
			error = 'Enter a concentration effect.';
			return;
		}
		const ok = await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'concentration', effect },
		});
		if (ok && !clear) concentrationEffect[characterId] = '';
	}

	async function castSlot(characterId: string, level: number): Promise<void> {
		await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'spell-slot', level },
		});
	}

	async function spendResource(characterId: string, resourceId: string): Promise<void> {
		await dispatch({
			type: 'character.update-combat-resource',
			actorId: runtime.activeActorId,
			payload: { characterId, kind: 'class-resource', resourceId, amount: 1 },
		});
	}

	async function declareSlots(characterId: string): Promise<void> {
		await dispatch({
			type: 'character.set-spell-slots',
			actorId: runtime.activeActorId,
			payload: {
				characterId,
				level: Math.trunc(Number(slotLevel[characterId] ?? 1)),
				max: Math.max(0, Math.trunc(Number(slotMax[characterId] ?? 0))),
			},
		});
	}

	async function declareResource(characterId: string): Promise<void> {
		const name = (resourceName[characterId] ?? '').trim();
		if (!name) {
			error = 'Enter a resource name.';
			return;
		}
		const ok = await dispatch({
			type: 'character.set-class-resource',
			actorId: runtime.activeActorId,
			payload: {
				characterId,
				id: name.toLowerCase().replace(/\s+/g, '-'),
				name,
				max: Math.max(0, Math.trunc(Number(resourceMax[characterId] ?? 0))),
				recharge: resourceRecharge[characterId] ?? 'long',
			},
		});
		if (ok) resourceName[characterId] = '';
	}

	async function rest(characterId: string, restKind: 'short' | 'long'): Promise<void> {
		await dispatch({
			type: 'character.rest',
			actorId: runtime.activeActorId,
			payload: { characterId, rest: restKind },
		});
	}
</script>

<section data-testid="combat-resources-view" aria-label="Combat resources and spells">
	<h2>Combat &amp; resources</h2>
	<p class="meta">
		Owners and combat participants update HP, conditions, death saves, slots, and resources during a
		session. Owners manage spell/resource structure and rest recovery.
	</p>

	{#if error}
		<p class="meta" role="alert" data-testid="resources-error">{error}</p>
	{/if}

	{#if !sessionActive}
		<p class="meta" data-testid="resources-session-inactive">
			Session not active — combat-resource updates are disabled until the DM starts a session.
		</p>
	{/if}

	{#if visibleCharacters.length === 0}
		<p class="meta" data-testid="resources-empty">No characters are visible to you.</p>
	{:else}
		<ul class="scene-list" data-testid="resources-list">
			{#each visibleCharacters as character (character.id)}
				{@const r = resources(character.id)}
				<li class="scene-card" data-testid={`resources-character-${character.id}`}>
					<h3>{character.name}</h3>
					<p class="meta" data-testid={`resources-hp-${character.id}`}>
						HP {character.combat.hp}/{character.combat.maxHp} • Temp {character.combat.tempHp} • AC
						{character.combat.ac}
					</p>
					<p class="meta" data-testid={`resources-conditions-${character.id}`}>
						Conditions: {character.combat.conditions.join(', ') || 'none'}
					</p>
					<p class="meta" data-testid={`resources-deathsaves-${character.id}`}>
						Death saves: {r.deathSaves.successes}✓ / {r.deathSaves.failures}✗{r.deathSaves.stable
							? ' • stable'
							: ''}
					</p>
					<p class="meta" data-testid={`resources-concentration-${character.id}`}>
						Concentration: {r.concentration.effect ?? 'none'}
					</p>

					{#if canUpdateCombat(character.id)}
						<fieldset disabled={!sessionActive} data-testid={`resources-combat-controls-${character.id}`}>
							<legend class="visually-hidden">Combat updates</legend>
							<div class="control-row">
								<label>
									<span>HP change</span>
									<input
										type="number"
										data-testid={`resources-hp-delta-${character.id}`}
										bind:value={hpDelta[character.id]}
									/>
								</label>
								<button
									type="button"
									class="button secondary"
									data-testid={`resources-hp-apply-${character.id}`}
									onclick={() => applyHp(character.id)}>Apply HP</button
								>
							</div>
							<div class="control-row">
								<label>
									<span>Temp HP</span>
									<input
										type="number"
										data-testid={`resources-temp-hp-${character.id}`}
										bind:value={tempHpValue[character.id]}
									/>
								</label>
								<button
									type="button"
									class="button secondary"
									data-testid={`resources-temp-hp-apply-${character.id}`}
									onclick={() => applyTempHp(character.id)}>Set temp HP</button
								>
							</div>
							<div class="control-row">
								<label>
									<span>Condition</span>
									<input
										data-testid={`resources-condition-${character.id}`}
										bind:value={conditionName[character.id]}
										autocomplete="off"
									/>
								</label>
								<button
									type="button"
									data-testid={`resources-condition-add-${character.id}`}
									onclick={() => toggleCondition(character.id, true)}>Add</button
								>
								<button
									type="button"
									data-testid={`resources-condition-remove-${character.id}`}
									onclick={() => toggleCondition(character.id, false)}>Remove</button
								>
							</div>
							<div class="control-row">
								<span class="field-label">Death save</span>
								<button
									type="button"
									data-testid={`resources-death-success-${character.id}`}
									onclick={() => deathSave(character.id, 'success')}>Success</button
								>
								<button
									type="button"
									data-testid={`resources-death-failure-${character.id}`}
									onclick={() => deathSave(character.id, 'failure')}>Failure</button
								>
								<button
									type="button"
									data-testid={`resources-death-reset-${character.id}`}
									onclick={() => deathSave(character.id, 'reset')}>Reset</button
								>
							</div>
							<div class="control-row">
								<label>
									<span>Concentrate on</span>
									<input
										data-testid={`resources-concentration-input-${character.id}`}
										bind:value={concentrationEffect[character.id]}
										autocomplete="off"
									/>
								</label>
								<button
									type="button"
									data-testid={`resources-concentration-set-${character.id}`}
									onclick={() => concentrate(character.id, false)}>Concentrate</button
								>
								<button
									type="button"
									data-testid={`resources-concentration-clear-${character.id}`}
									onclick={() => concentrate(character.id, true)}>Drop</button
								>
							</div>
						</fieldset>
					{/if}

					<!-- Spell slots + class resources (expend during a session). -->
					{#if Object.keys(r.spellSlots).length > 0 || Object.keys(r.classResources).length > 0}
						<ul class="resource-list" data-testid={`resources-pools-${character.id}`}>
							{#each Object.values(r.spellSlots).sort((a, b) => a.level - b.level) as slot (slot.level)}
								<li data-testid={`resources-slot-${character.id}-${slot.level}`}>
									Level {slot.level} slots: {availableSlots(slot)}/{slot.max}
									{#if canUpdateCombat(character.id)}
										<button
											type="button"
											disabled={!sessionActive || availableSlots(slot) <= 0}
											data-testid={`resources-cast-${character.id}-${slot.level}`}
											onclick={() => castSlot(character.id, slot.level)}>Cast</button
										>
									{/if}
								</li>
							{/each}
							{#each Object.values(r.classResources) as resource (resource.id)}
								<li data-testid={`resources-class-${character.id}-${resource.id}`}>
									{resource.name}: {availableClassResource(resource)}/{resource.max} ({resource.recharge})
									{#if canUpdateCombat(character.id)}
										<button
											type="button"
											disabled={!sessionActive || availableClassResource(resource) <= 0}
											data-testid={`resources-spend-${character.id}-${resource.id}`}
											onclick={() => spendResource(character.id, resource.id)}>Spend</button
										>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					<!-- Owner-only structure management + rest recovery. -->
					{#if canManage(character.id)}
						<details data-testid={`resources-manage-${character.id}`}>
							<summary>Manage spells, slots &amp; resources</summary>
							<div class="control-row">
								<label>
									<span>Slot level</span>
									<input
										type="number"
										data-testid={`resources-slot-level-${character.id}`}
										bind:value={slotLevel[character.id]}
									/>
								</label>
								<label>
									<span>Max slots</span>
									<input
										type="number"
										data-testid={`resources-slot-max-${character.id}`}
										bind:value={slotMax[character.id]}
									/>
								</label>
								<button
									type="button"
									data-testid={`resources-slot-declare-${character.id}`}
									onclick={() => declareSlots(character.id)}>Set slots</button
								>
							</div>
							<div class="control-row">
								<label>
									<span>Resource name</span>
									<input
										data-testid={`resources-resource-name-${character.id}`}
										bind:value={resourceName[character.id]}
										autocomplete="off"
									/>
								</label>
								<label>
									<span>Max</span>
									<input
										type="number"
										data-testid={`resources-resource-max-${character.id}`}
										bind:value={resourceMax[character.id]}
									/>
								</label>
								<label>
									<span>Recharge</span>
									<select
										data-testid={`resources-resource-recharge-${character.id}`}
										bind:value={resourceRecharge[character.id]}
									>
										<option value="long">Long rest</option>
										<option value="short">Short rest</option>
										<option value="none">None</option>
									</select>
								</label>
								<button
									type="button"
									data-testid={`resources-resource-declare-${character.id}`}
									onclick={() => declareResource(character.id)}>Add resource</button
								>
							</div>
							<div class="control-row">
								<span class="field-label">Rest</span>
								<button
									type="button"
									data-testid={`resources-short-rest-${character.id}`}
									onclick={() => rest(character.id, 'short')}>Short rest</button
								>
								<button
									type="button"
									data-testid={`resources-long-rest-${character.id}`}
									onclick={() => rest(character.id, 'long')}>Long rest</button
								>
							</div>
						</details>
					{/if}

					<!-- Expenditure history (CHAR-008). -->
					{#if r.ledger.length > 0}
						<details data-testid={`resources-history-${character.id}`}>
							<summary>Expenditure history ({r.ledger.length})</summary>
							<ul class="history-list">
								{#each r.ledger as entry (entry.id)}
									<li class="meta">{entry.label}{entry.delta != null ? ` (${entry.delta})` : ''}</li>
								{/each}
							</ul>
						</details>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	/* The shared `.scene-card` is a row flex container; these cards stack many block children, so
	   render them as a column to avoid horizontal overflow/overlap on compact profiles. */
	.scene-list .scene-card {
		flex-direction: column;
		align-items: stretch;
	}
	fieldset {
		border: 1px solid var(--border, #d0c8b8);
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin: 0.5rem 0;
	}
	.control-row {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin: 0.25rem 0;
	}
	.control-row label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-weight: 600;
	}
	.control-row input {
		max-width: 8rem;
	}
	.field-label {
		font-weight: 600;
	}
	.resource-list,
	.history-list {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
</style>
