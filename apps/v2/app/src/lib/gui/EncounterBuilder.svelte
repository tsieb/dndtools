<script lang="ts">
	import { computeEncounterChallenge, listEncountersForActor } from '@dndtools/v2-core';
	import { useRuntime } from '$lib/state/runtime-context';

	// SES-006: build encounters. The DM selects combatants and gets DETERMINISTIC challenge guidance
	// (CR/difficulty from the selection + party — a pure core function, recomputed live as the draft
	// changes), plus terrain notes, legendary/lair actions, loot, and session-log links. The encounter is
	// durable; building dispatches a command and the GUI renders the computed guidance. Encounter prep is
	// DM-only — a non-DM never sees this surface (the core's actor-filtered list returns nothing).
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');

	const encounters = $derived(
		listEncountersForActor(runtime.state.encounters, runtime.state.permissions, runtime.activeActorId),
	);

	let error = $state<string | null>(null);
	let title = $state('');
	let terrainNotes = $state('');
	let partySize = $state(4);
	let partyLevel = $state(3);

	interface DraftCombatant {
		name: string;
		challengeRating: number;
		quantity: number;
		maxHp: number;
		ac: number;
		initiative: number;
	}
	let draftCombatants = $state<DraftCombatant[]>([]);
	let newName = $state('');
	let newCr = $state(0.25);
	let newQuantity = $state(1);
	let newMaxHp = $state(7);

	// SES-006: the DETERMINISTIC challenge guidance for the current draft, computed live by the pure core
	// function (so the DM sees the difficulty band update as they add combatants).
	const guidance = $derived(
		computeEncounterChallenge(
			draftCombatants.map((c, index) => ({
				id: `draft-${index}`,
				kind: 'monster' as const,
				name: c.name,
				characterId: null,
				challengeRating: c.challengeRating,
				quantity: c.quantity,
				maxHp: c.maxHp,
				ac: c.ac,
				initiative: c.initiative,
				hidden: false,
			})),
			{ size: Math.max(1, Math.trunc(partySize)), averageLevel: Math.min(20, Math.max(1, Math.trunc(partyLevel))) },
		),
	);

	function addDraftCombatant(): void {
		const name = newName.trim();
		if (!name) {
			error = 'Enter a combatant name.';
			return;
		}
		error = null;
		draftCombatants = [
			...draftCombatants,
			{
				name,
				challengeRating: Math.max(0, Number(newCr) || 0),
				quantity: Math.max(1, Math.trunc(Number(newQuantity) || 1)),
				maxHp: Math.max(0, Math.trunc(Number(newMaxHp) || 0)),
				ac: 13,
				initiative: 0,
			},
		];
		newName = '';
	}

	function removeDraftCombatant(index: number): void {
		draftCombatants = draftCombatants.filter((_unused, i) => i !== index);
	}

	async function buildEncounter(): Promise<void> {
		error = null;
		if (!title.trim()) {
			error = 'Enter an encounter title.';
			return;
		}
		const result = await runtime.dispatch({
			type: 'encounter.build',
			actorId: runtime.activeActorId,
			payload: {
				title: title.trim(),
				combatants: draftCombatants.map((c) => ({
					kind: 'monster',
					name: c.name,
					challengeRating: c.challengeRating,
					quantity: c.quantity,
					maxHp: c.maxHp,
					ac: c.ac,
					initiative: c.initiative,
				})),
				party: {
					size: Math.max(1, Math.trunc(partySize)),
					averageLevel: Math.min(20, Math.max(1, Math.trunc(partyLevel))),
				},
				terrainNotes: terrainNotes.trim(),
			},
		});
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return;
		}
		// Reset the draft on success.
		title = '';
		terrainNotes = '';
		draftCombatants = [];
	}
</script>

{#if isDm}
	<section data-testid="encounter-builder" aria-label="Encounter builder">
		<h2>Build encounter</h2>

		{#if error}
			<p class="error" role="alert" data-testid="encounter-error">{error}</p>
		{/if}

		<form
			data-testid="encounter-build-form"
			onsubmit={(event) => {
				event.preventDefault();
				void buildEncounter();
			}}
		>
			<label for="encounter-title">Title</label>
			<input id="encounter-title" data-testid="encounter-title" bind:value={title} />

			<fieldset>
				<legend>Party</legend>
				<label for="party-size">Size</label>
				<input id="party-size" type="number" min="1" data-testid="party-size" bind:value={partySize} />
				<label for="party-level">Average level</label>
				<input id="party-level" type="number" min="1" max="20" data-testid="party-level" bind:value={partyLevel} />
			</fieldset>

			<fieldset>
				<legend>Combatants</legend>
				<ul data-testid="draft-combatants">
					{#each draftCombatants as combatant, index (index)}
						<li data-testid="draft-combatant">
							{combatant.quantity}× {combatant.name} (CR {combatant.challengeRating})
							<button type="button" data-testid="remove-combatant-{index}" onclick={() => removeDraftCombatant(index)}>
								Remove
							</button>
						</li>
					{/each}
				</ul>
				<div class="add-row">
					<input placeholder="name" aria-label="Combatant name" data-testid="combatant-name-input" bind:value={newName} />
					<input type="number" step="0.25" min="0" aria-label="Challenge rating" data-testid="combatant-cr-input" bind:value={newCr} />
					<input type="number" min="1" aria-label="Quantity" data-testid="combatant-qty-input" bind:value={newQuantity} />
					<input type="number" min="0" aria-label="Max HP" data-testid="combatant-hp-input" bind:value={newMaxHp} />
					<button type="button" data-testid="add-combatant" onclick={() => addDraftCombatant()}>Add combatant</button>
				</div>
			</fieldset>

			<label for="terrain-notes">Terrain notes</label>
			<textarea id="terrain-notes" data-testid="terrain-notes" bind:value={terrainNotes}></textarea>

			<div class="guidance" data-testid="challenge-guidance">
				<strong>Challenge:</strong>
				<span data-testid="guidance-difficulty">{guidance.difficulty}</span>
				<span class="meta" data-testid="guidance-points">({guidance.encounterPoints} pts)</span>
			</div>

			<button type="submit" data-testid="build-encounter">Build encounter</button>
		</form>

		<section data-testid="encounter-list" aria-label="Encounters">
			<h3>Encounters</h3>
			{#if encounters.length === 0}
				<p class="meta" data-testid="no-encounters">No encounters built yet.</p>
			{:else}
				<ul>
					{#each encounters as encounter (encounter.id)}
						<li data-testid="encounter-{encounter.id}">
							<span class="name">{encounter.title}</span>
							<span class="badge" data-testid="encounter-difficulty">{encounter.challenge.difficulty}</span>
							<span class="meta">{encounter.combatants.length} group(s)</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</section>
{/if}

<style>
	.error {
		color: var(--color-danger, #b00020);
	}
	.meta {
		color: var(--color-text-muted, #666);
	}
	.add-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1, 0.25rem);
	}
	.add-row input[type='number'] {
		width: 5rem;
	}
	.guidance {
		margin: var(--space-2, 0.5rem) 0;
	}
	.badge {
		font-size: 0.75rem;
		background: var(--color-accent, #3b82f6);
		color: #fff;
		border-radius: var(--radius-1, 0.25rem);
		padding: 0 var(--space-1, 0.25rem);
	}
</style>
