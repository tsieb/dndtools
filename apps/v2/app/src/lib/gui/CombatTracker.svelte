<script lang="ts">
	import { getCombatTrackerForActor, listEncountersForActor } from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	// SES-002: run combat. The DM rolls initiative, advances turns (wrapping to the next round), applies
	// per-combatant HP / conditions / death saves / concentration, and ends combat (persisting the
	// encounter log). Players/observers see the live tracker through the actor-filtered query: a hidden
	// combatant's identity + stat data never reach them (the core decides visibility before render). Every
	// change dispatches a durable command; the GUI renders the computed model and never writes state
	// directly (Contract 1). The core re-enforces session-active gating + DM/combat-participant authority.
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const sessionActive = $derived(runtime.state.session.workflow === 'active');

	const view = $derived(
		getCombatTrackerForActor(runtime.state.session.combat, runtime.state.permissions, runtime.activeActorId),
	);

	// The DM's encounters (to start combat from one by reference). Empty for non-DM.
	const encounters = $derived(
		listEncountersForActor(runtime.state.encounters, runtime.state.permissions, runtime.activeActorId),
	);

	let error = $state<string | null>(null);
	let startEncounterId = $state<string>('');
	let hpDelta = $state<Record<string, string>>({});
	let conditionName = $state<Record<string, string>>({});

	async function dispatch(command: Parameters<typeof runtime.dispatch>[0]): Promise<boolean> {
		error = null;
		const result = await runtime.dispatch(command);
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return false;
		}
		return true;
	}

	async function startFromEncounter(): Promise<void> {
		if (!startEncounterId) {
			error = 'Select an encounter to run.';
			return;
		}
		await dispatch({
			type: 'combat.start',
			actorId: runtime.activeActorId,
			payload: { encounterId: startEncounterId },
		});
	}

	async function advanceTurn(): Promise<void> {
		await dispatch({ type: 'combat.advance-turn', actorId: runtime.activeActorId, payload: {} });
	}

	async function endCombat(): Promise<void> {
		await dispatch({ type: 'combat.end', actorId: runtime.activeActorId, payload: {} });
	}

	async function applyHp(combatantId: string): Promise<void> {
		const delta = Math.trunc(Number(hpDelta[combatantId] ?? 0));
		if (!Number.isFinite(delta) || delta === 0) {
			error = 'Enter a non-zero HP change.';
			return;
		}
		const ok = await dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.activeActorId,
			payload: { combatantId, kind: 'hp', delta },
		});
		if (ok) hpDelta = { ...hpDelta, [combatantId]: '' };
	}

	async function addCondition(combatantId: string): Promise<void> {
		const condition = (conditionName[combatantId] ?? '').trim();
		if (!condition) {
			error = 'Enter a condition name.';
			return;
		}
		const ok = await dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.activeActorId,
			payload: { combatantId, kind: 'condition', condition, present: true },
		});
		if (ok) conditionName = { ...conditionName, [combatantId]: '' };
	}

	async function deathSave(combatantId: string, outcome: 'success' | 'failure'): Promise<void> {
		await dispatch({
			type: 'combat.apply-resource',
			actorId: runtime.activeActorId,
			payload: { combatantId, kind: 'death-save', outcome },
		});
	}
</script>

<section data-testid="combat-tracker" aria-label="Combat tracker">
	<h2>Combat</h2>

	{#if error}
		<p class="error" role="alert" data-testid="combat-error">{error}</p>
	{/if}

	{#if !sessionActive}
		<p class="meta" data-testid="combat-needs-active-session">
			Combat runs only while the session is active. Start the session from the Command Center first.
		</p>
	{/if}

	{#if isDm && view.status !== 'running'}
		<form
			class="start-combat"
			data-testid="start-combat-form"
			onsubmit={(event) => {
				event.preventDefault();
				void startFromEncounter();
			}}
		>
			<label for="start-encounter">Run encounter</label>
			<select id="start-encounter" data-testid="start-encounter-select" bind:value={startEncounterId}>
				<option value="">Select an encounter…</option>
				{#each encounters as encounter (encounter.id)}
					<option value={encounter.id}>{encounter.title} ({encounter.challenge.difficulty})</option>
				{/each}
			</select>
			<button type="submit" data-testid="start-combat" disabled={!sessionActive}>Roll initiative</button>
		</form>
	{/if}

	{#if view.status === 'running'}
		<div class="combat-meta" data-testid="combat-meta">
			<span data-testid="combat-round">Round {view.round}</span>
			{#if isDm && view.hiddenCount > 0}
				<span class="meta" data-testid="combat-hidden-count">{view.hiddenCount} hidden</span>
			{/if}
			{#if isDm}
				<button type="button" data-testid="advance-turn" onclick={() => void advanceTurn()}>
					Next turn
				</button>
				<button type="button" data-testid="end-combat" onclick={() => void endCombat()}>
					End combat
				</button>
			{/if}
		</div>

		<ol class="initiative-order" data-testid="initiative-order">
			{#each view.combatants as combatant (combatant.id)}
				<li
					data-testid="combatant-{combatant.id}"
					class:active={combatant.isActive}
					class:redacted={combatant.redacted}
				>
					<span class="name" data-testid="combatant-name">{combatant.name}</span>
					{#if combatant.isActive}<span class="badge" data-testid="active-badge">Active</span>{/if}
					{#if combatant.resources}
						<span class="hp" data-testid="combatant-hp">
							HP {combatant.resources.hp}/{combatant.resources.maxHp}
							{#if combatant.resources.tempHp > 0}(+{combatant.resources.tempHp}){/if}
						</span>
						{#if combatant.resources.conditions.length > 0}
							<span class="conditions" data-testid="combatant-conditions">
								{combatant.resources.conditions.join(', ')}
							</span>
						{/if}
						{#if combatant.statBlock.ac !== null}
							<span class="ac">AC {combatant.statBlock.ac}</span>
						{/if}

						{#if isDm || !combatant.redacted}
							<div class="combatant-controls">
								<input
									type="number"
									aria-label="HP change for {combatant.name}"
									data-testid="hp-input-{combatant.id}"
									bind:value={hpDelta[combatant.id]}
								/>
								<button
									type="button"
									data-testid="apply-hp-{combatant.id}"
									onclick={() => void applyHp(combatant.id)}
								>
									Apply HP
								</button>
								<input
									type="text"
									aria-label="Condition for {combatant.name}"
									placeholder="condition"
									data-testid="condition-input-{combatant.id}"
									bind:value={conditionName[combatant.id]}
								/>
								<button
									type="button"
									data-testid="add-condition-{combatant.id}"
									onclick={() => void addCondition(combatant.id)}
								>
									Add condition
								</button>
								<button
									type="button"
									data-testid="death-save-success-{combatant.id}"
									onclick={() => void deathSave(combatant.id, 'success')}
								>
									Save ✓
								</button>
								<button
									type="button"
									data-testid="death-save-failure-{combatant.id}"
									onclick={() => void deathSave(combatant.id, 'failure')}
								>
									Save ✗
								</button>
							</div>
						{/if}
					{:else}
						<span class="meta" data-testid="combatant-hidden">Hidden combatant</span>
					{/if}
				</li>
			{/each}
		</ol>

		<section class="encounter-log" data-testid="encounter-log" aria-label="Encounter log">
			<h3>Encounter log</h3>
			<ol>
				{#each view.log as entry (entry.id)}
					<li data-testid="log-entry">
						<span class="round">R{entry.round}</span> {entry.label}
					</li>
				{/each}
			</ol>
		</section>
	{:else if view.status === 'ended'}
		<p class="meta" data-testid="combat-ended">Combat has ended. The encounter log is preserved.</p>
		<section class="encounter-log" data-testid="encounter-log" aria-label="Encounter log">
			<h3>Encounter log</h3>
			<ol>
				{#each view.log as entry (entry.id)}
					<li data-testid="log-entry"><span class="round">R{entry.round}</span> {entry.label}</li>
				{/each}
			</ol>
		</section>
	{:else if !isDm}
		<p class="meta" data-testid="combat-idle">No combat is running.</p>
	{/if}
</section>

<style>
	.error {
		color: var(--color-danger, #b00020);
	}
	.meta {
		color: var(--color-text-muted, #666);
	}
	.combat-meta {
		display: flex;
		gap: var(--space-2, 0.5rem);
		align-items: center;
		flex-wrap: wrap;
	}
	.initiative-order {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
	}
	.initiative-order li {
		border: 1px solid var(--color-border, #ddd);
		border-radius: var(--radius-2, 0.5rem);
		padding: var(--space-2, 0.5rem);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		align-items: center;
	}
	.initiative-order li.active {
		border-color: var(--color-accent, #3b82f6);
		background: var(--color-surface-raised, #f5f8ff);
	}
	.badge {
		font-size: 0.75rem;
		background: var(--color-accent, #3b82f6);
		color: #fff;
		border-radius: var(--radius-1, 0.25rem);
		padding: 0 var(--space-1, 0.25rem);
	}
	.combatant-controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1, 0.25rem);
		width: 100%;
	}
	.combatant-controls input[type='number'] {
		width: 4rem;
	}
</style>
