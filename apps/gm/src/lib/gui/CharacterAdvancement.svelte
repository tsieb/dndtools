<script lang="ts">
	import {
		advancementStateOf,
		checkAdvancementEligibility,
		hasGrantedCapability,
		listCharactersForActor,
		validateAdvancement,
		xpForLevel,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CHAR-009: level-up / ADVANCEMENT (XP or milestone) with VALIDATION before the revision is
	// FINALIZED. The owner OPENs a staged advancement, sets the level-up choices, and the Processing
	// Core blocks COMMIT until validation passes (staged-then-commit, no partial mutation). The staged
	// draft lives on the durable character, so reopening the app restores progress + validation state.
	// Every mutation dispatches a durable command; the GUI renders the computed advancement model and
	// the core re-enforces owner authority and validation on dispatch (Contract 1).
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');

	const visibleCharacters = $derived(
		listCharactersForActor(
			runtime.state.characters,
			runtime.state.permissions,
			runtime.activeActorId,
		),
	);

	let error = $state<string | null>(null);
	let xpInput = $state<Record<string, number>>({});
	let className = $state<Record<string, string>>({});
	let hpGained = $state<Record<string, number>>({});
	let subclass = $state<Record<string, string>>({});
	let abilityOrFeat = $state<Record<string, string>>({});

	function canAdvance(characterId: string): boolean {
		if (!actor) return false;
		if (isDm) return true;
		return hasGrantedCapability(runtime.state.permissions, actor, 'character', characterId, 'owner');
	}

	function character(characterId: string) {
		return runtime.state.characters.characters[characterId] ?? null;
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

	async function setXp(characterId: string): Promise<void> {
		await dispatch({
			type: 'character.set-xp',
			actorId: runtime.activeActorId,
			payload: { characterId, xp: Math.max(0, Math.trunc(Number(xpInput[characterId] ?? 0))) },
		});
	}

	async function open(characterId: string, mode: 'xp' | 'milestone'): Promise<void> {
		await dispatch({
			type: 'character.open-advancement',
			actorId: runtime.activeActorId,
			payload: { characterId, mode },
		});
	}

	async function saveChoices(characterId: string): Promise<void> {
		const payload: Record<string, unknown> = { characterId };
		if ((className[characterId] ?? '').trim()) payload.className = className[characterId]!.trim();
		if (hpGained[characterId] != null && hpGained[characterId] !== ('' as unknown))
			payload.hitPointsGained = Math.trunc(Number(hpGained[characterId]));
		if ((subclass[characterId] ?? '').trim()) payload.subclass = subclass[characterId]!.trim();
		if ((abilityOrFeat[characterId] ?? '').trim())
			payload.abilityOrFeat = abilityOrFeat[characterId]!.trim();
		await dispatch({
			type: 'character.set-advancement-choices',
			actorId: runtime.activeActorId,
			payload,
		});
	}

	async function commit(characterId: string): Promise<void> {
		await dispatch({
			type: 'character.commit-advancement',
			actorId: runtime.activeActorId,
			payload: { characterId },
		});
	}

	async function cancel(characterId: string): Promise<void> {
		await dispatch({
			type: 'character.cancel-advancement',
			actorId: runtime.activeActorId,
			payload: { characterId },
		});
	}
</script>

<section data-testid="advancement-view" aria-label="Character advancement">
	<h2>Advancement</h2>
	<p class="meta">
		Level up via XP or milestone. Choices are validated before the level-up is finalized; an
		incomplete advancement cannot be committed.
	</p>

	{#if error}
		<p class="meta" role="alert" data-testid="advancement-error">{error}</p>
	{/if}

	{#if visibleCharacters.length === 0}
		<p class="meta" data-testid="advancement-empty">No characters are visible to you.</p>
	{:else}
		<ul class="scene-list" data-testid="advancement-list">
			{#each visibleCharacters as view (view.id)}
				{@const char = character(view.id)}
				{#if char}
					{@const advancement = advancementStateOf(char)}
					{@const validation = advancement.draft ? validateAdvancement(advancement.draft) : null}
					{@const xpEligible = checkAdvancementEligibility(char, 'xp')}
					<li class="scene-card" data-testid={`advancement-character-${view.id}`}>
						<h3>{view.name}</h3>
						<p class="meta" data-testid={`advancement-level-${view.id}`}>
							Level {advancement.level} • XP {advancement.xp}
							{#if advancement.level < 20}
								• next at {xpForLevel(advancement.level + 1) ?? '—'} XP
							{/if}
						</p>

						{#if canAdvance(view.id)}
							{#if !advancement.draft}
								<div class="control-row">
									<label>
										<span>Set XP</span>
										<input
											type="number"
											data-testid={`advancement-xp-input-${view.id}`}
											bind:value={xpInput[view.id]}
										/>
									</label>
									<button
										type="button"
										data-testid={`advancement-xp-set-${view.id}`}
										onclick={() => setXp(view.id)}>Set XP</button
									>
								</div>
								<div class="control-row">
									<button
										type="button"
										class="button"
										data-testid={`advancement-open-xp-${view.id}`}
										disabled={!xpEligible.eligible}
										onclick={() => open(view.id, 'xp')}>Level up (XP)</button
									>
									<button
										type="button"
										class="button secondary"
										data-testid={`advancement-open-milestone-${view.id}`}
										onclick={() => open(view.id, 'milestone')}>Level up (milestone)</button
									>
								</div>
							{:else}
								<div class="advancement-draft" data-testid={`advancement-draft-${view.id}`}>
									<p class="meta">
										Advancing to level {advancement.draft.toLevel} ({advancement.draft.mode})
									</p>
									<div class="control-row">
										<label>
											<span>Class</span>
											<input
												data-testid={`advancement-class-${view.id}`}
												bind:value={className[view.id]}
												autocomplete="off"
											/>
										</label>
										<label>
											<span>HP gained</span>
											<input
												type="number"
												data-testid={`advancement-hp-${view.id}`}
												bind:value={hpGained[view.id]}
											/>
										</label>
									</div>
									<div class="control-row">
										<label>
											<span>Subclass (if required)</span>
											<input
												data-testid={`advancement-subclass-${view.id}`}
												bind:value={subclass[view.id]}
												autocomplete="off"
											/>
										</label>
										<label>
											<span>Ability/feat (if required)</span>
											<input
												data-testid={`advancement-ability-${view.id}`}
												bind:value={abilityOrFeat[view.id]}
												autocomplete="off"
											/>
										</label>
									</div>
									<div class="control-row">
										<button
											type="button"
											data-testid={`advancement-save-${view.id}`}
											onclick={() => saveChoices(view.id)}>Save choices</button
										>
										<button
											type="button"
											class="button"
											data-testid={`advancement-commit-${view.id}`}
											disabled={!validation?.complete}
											onclick={() => commit(view.id)}>Finalize level-up</button
										>
										<button
											type="button"
											class="button secondary"
											data-testid={`advancement-cancel-${view.id}`}
											onclick={() => cancel(view.id)}>Cancel</button
										>
									</div>
									{#if validation && validation.issues.length > 0}
										<ul class="issue-list" data-testid={`advancement-issues-${view.id}`}>
											{#each validation.issues as issue (issue.field)}
												<li class="meta" data-testid={`advancement-issue-${view.id}-${issue.field}`}>
													{issue.message}
												</li>
											{/each}
										</ul>
									{:else if validation?.complete}
										<p class="meta" data-testid={`advancement-ready-${view.id}`}>
											Ready to finalize.
										</p>
									{/if}
								</div>
							{/if}
						{:else}
							<p class="meta">You do not own this character.</p>
						{/if}
					</li>
				{/if}
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
		max-width: 10rem;
	}
	.advancement-draft {
		border: 1px solid var(--border, #d0c8b8);
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin: 0.5rem 0;
	}
	.issue-list {
		list-style: none;
		padding: 0;
		margin: 0.5rem 0;
	}
</style>
