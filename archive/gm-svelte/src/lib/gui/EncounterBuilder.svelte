<script lang="ts">
	import { computeEncounterChallenge, listEncountersForActor } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// SES-006: build encounters. The DM selects combatants and gets DETERMINISTIC challenge guidance
	// (CR/difficulty from the selection + party — a pure core function, recomputed live as the draft
	// changes), plus terrain notes, legendary/lair actions, loot, and session-log links. The encounter is
	// durable; building dispatches a command and the GUI renders the computed guidance. Encounter prep is
	// DM-only — a non-DM never sees this surface (the core's actor-filtered list returns nothing).
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');
	const sessionActive = $derived(runtime.state.session.workflow === 'active');

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

	// UX-SES-009 AC3 — with a blank title the Build button is INACTIVE (aria-disabled, no dispatch)
	// but still focusable/clickable so activating it surfaces the inline requirement message.
	const buildBlocked = $derived(title.trim() === '');

	async function buildEncounter(): Promise<void> {
		error = null;
		if (buildBlocked) {
			error = 'Enter an encounter title to build the encounter.';
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

	// UX-SES-009 AC2 — start combat from a SAVED encounter with one action: the command flows the
	// stored combatant groups into the initiative tracker (auto-rolling blank initiatives in the
	// core) and the tracker on this route renders the running combat.
	async function startCombatFromEncounter(encounterId: string): Promise<void> {
		error = null;
		const result = await runtime.dispatch({
			type: 'combat.start',
			actorId: runtime.activeActorId,
			payload: { encounterId },
		});
		if (result.status === 'rejected') {
			error = result.rejection.message;
		}
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
			<input id="encounter-title" data-testid="encounter-title" maxlength="64" bind:value={title} />

			<fieldset>
				<legend>Party</legend>
				<label for="party-size">Size</label>
				<input id="party-size" type="number" min="1" max="20" data-testid="party-size" bind:value={partySize} />
				<label for="party-level">Average level</label>
				<input id="party-level" type="number" min="1" max="20" data-testid="party-level" bind:value={partyLevel} />
				<span class="meta" data-testid="party-summary">Party: {partySize} × Lvl {partyLevel}</span>
			</fieldset>

			<fieldset>
				<legend>Combatants</legend>
				<ul data-testid="draft-combatants">
					{#each draftCombatants as combatant, index (index)}
						<li data-testid="draft-combatant">
							{combatant.quantity}× {combatant.name} (CR {combatant.challengeRating}, HP {combatant.maxHp}, AC {combatant.ac})
							<button
								type="button"
								class="button ghost sm"
								data-testid="remove-combatant-{index}"
								aria-label={`Remove ${combatant.name} from encounter draft`}
								onclick={() => removeDraftCombatant(index)}
							>
								Remove
							</button>
						</li>
					{/each}
				</ul>
				<div class="add-row">
					<input placeholder="name" aria-label="Combatant name" data-testid="combatant-name-input" bind:value={newName} />
					<input type="number" step="0.25" min="0" max="30" aria-label="Challenge rating" data-testid="combatant-cr-input" bind:value={newCr} />
					<input type="number" min="1" max="20" aria-label="Quantity" data-testid="combatant-qty-input" bind:value={newQuantity} />
					<input type="number" min="0" aria-label="Max HP" data-testid="combatant-hp-input" bind:value={newMaxHp} />
					<button type="button" class="button secondary sm" data-testid="add-combatant" onclick={() => addDraftCombatant()}>Add combatant</button>
				</div>
			</fieldset>

			<label for="terrain-notes">Terrain notes</label>
			<textarea id="terrain-notes" data-testid="terrain-notes" maxlength="500" bind:value={terrainNotes}></textarea>

			<!-- UX-SES-009 AC1 — the PERSISTENT live challenge banner: a polite status region whose
			     difficulty band pill recomputes synchronously as the draft changes (no button). -->
			<div
				class="guidance"
				data-testid="challenge-guidance"
				role="status"
				aria-live="polite"
				aria-label={`Encounter difficulty: ${guidance.difficulty}, ${guidance.encounterPoints} points`}
			>
				<strong>Challenge:</strong>
				<span class="difficulty-pill" data-difficulty={guidance.difficulty} data-testid="guidance-difficulty">
					{guidance.difficulty}
				</span>
				<span class="meta" data-testid="guidance-points">({guidance.encounterPoints} pts)</span>
			</div>

			<button
				type="submit"
				class="button"
				data-testid="build-encounter"
				class:inactive={buildBlocked}
				aria-disabled={buildBlocked}
				aria-describedby={buildBlocked ? 'build-encounter-requirement' : undefined}
			>
				Build encounter
			</button>
			{#if buildBlocked}
				<span id="build-encounter-requirement" class="visually-hidden">Enter a title to build</span>
			{/if}
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
							<!-- UX-SES-009 AC2 — one-action start: flows the saved groups into the tracker. -->
							<button
								type="button"
								class="button secondary sm"
								data-testid="start-combat-encounter-{encounter.id}"
								disabled={!sessionActive}
								title={sessionActive
									? `Start combat from ${encounter.title}`
									: 'Available when the session is active'}
								onclick={() => void startCombatFromEncounter(encounter.id)}
							>
								Start combat
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</section>
{/if}

<style>
	/* Secondary "tool" card — calmer than the combat hero: surface-raised fill, hairline border,
	   resting elevation. Display-serif title gives the panel a clear heading (package Panel anatomy). */
	[data-testid='encounter-builder'] {
		display: block;
		padding: var(--space-5);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	[data-testid='encounter-builder'] > h2 {
		margin: 0 0 var(--space-4);
		font-family: var(--font-display);
		font-size: var(--text-md);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-tight);
		color: var(--color-text-primary);
	}
	[data-testid='encounter-list'] h3 {
		margin: var(--space-5) 0 var(--space-2);
		font-family: var(--font-display);
		font-size: var(--text-base);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
	}
	[data-testid='encounter-builder'] fieldset {
		margin: var(--space-3) 0;
		padding: var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	[data-testid='encounter-builder'] legend {
		padding: 0 var(--space-1);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	[data-testid='encounter-list'] ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	[data-testid='encounter-list'] li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	[data-testid='encounter-list'] li .name {
		font-weight: var(--font-weight-semibold);
		margin-right: auto;
	}

	.error {
		color: var(--color-status-error);
	}
	.meta {
		color: var(--color-text-secondary);
	}
	.add-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.add-row input[type='number'] {
		width: 5rem;
	}
	.guidance {
		margin: var(--space-2) 0;
	}
	/* UX-SES-009 — the difficulty band pill: semantic status tokens per band, text label carries the
	   meaning (never color alone). Deadly uses the saturated error treatment. */
	.difficulty-pill {
		border-radius: var(--radius-sm);
		padding: 0 var(--space-2);
		background: var(--color-surface-sunken);
		text-transform: capitalize;
	}
	.difficulty-pill[data-difficulty='trivial'],
	.difficulty-pill[data-difficulty='easy'] {
		background: var(--color-status-success-subtle);
		color: var(--color-status-success-text);
	}
	.difficulty-pill[data-difficulty='medium'] {
		background: var(--color-status-warning-subtle);
		color: var(--color-status-warning-text);
	}
	.difficulty-pill[data-difficulty='hard'] {
		background: var(--color-status-error-subtle);
		color: var(--color-status-error-text);
	}
	.difficulty-pill[data-difficulty='deadly'] {
		background: var(--color-status-error);
		color: var(--color-text-inverse);
	}
	/* UX-SES-009 AC3 — the inactive (blank-title) Build button look; it stays focusable so its
	   activation explains the requirement inline. */
	button.inactive {
		opacity: 0.6;
	}
	.badge {
		font-size: var(--text-xs);
		background: var(--color-accent);
		color: var(--color-accent-foreground);
		border-radius: var(--radius-sm);
		padding: 0 var(--space-1);
	}
</style>
