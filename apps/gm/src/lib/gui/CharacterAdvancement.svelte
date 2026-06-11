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
	import Dialog from '$lib/gui/a11y/Dialog.svelte';

	// UX-CHAR-008 (CHAR-009) — level-up / ADVANCEMENT (XP or milestone) as a STAGED, VALIDATED modal.
	// The owner opens an advancement (the durable, resumable staged draft lives on the character), makes
	// the level-up choices one panel at a time, and the Processing Core blocks COMMIT until validation
	// passes (staged-then-commit, no partial mutation). The wizard is a modal dialog so the sheet is
	// preserved behind it; a staged draft that is closed without finalizing can be resumed. Every
	// mutation dispatches a durable command; the core re-enforces owner authority + validation (Contract 1).
	const runtime = useRuntime();

	const actor = $derived(runtime.state.permissions.actors[runtime.activeActorId] ?? null);
	const isDm = $derived(actor?.role === 'dm');

	const visibleCharacters = $derived(
		listCharactersForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId),
	);

	let error = $state<string | null>(null);
	let xpInput = $state<Record<string, number>>({});
	let className = $state<Record<string, string>>({});
	let hpGained = $state<Record<string, number>>({});
	let subclass = $state<Record<string, string>>({});
	let abilityOrFeat = $state<Record<string, string>>({});

	// The character whose advancement modal is open. The staged draft itself is durable; this is just
	// which one is being viewed, so closing the modal (Escape) leaves a resumable draft behind.
	let advancingId = $state<string | null>(null);
	const dialogOpen = $derived(advancingId != null);

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
		if (await dispatch({ type: 'character.open-advancement', actorId: runtime.activeActorId, payload: { characterId, mode } })) {
			advancingId = characterId;
		}
	}

	async function saveChoices(characterId: string): Promise<void> {
		const payload: Record<string, unknown> = { characterId };
		if ((className[characterId] ?? '').trim()) payload.className = className[characterId]!.trim();
		if (hpGained[characterId] != null && hpGained[characterId] !== ('' as unknown))
			payload.hitPointsGained = Math.trunc(Number(hpGained[characterId]));
		if ((subclass[characterId] ?? '').trim()) payload.subclass = subclass[characterId]!.trim();
		if ((abilityOrFeat[characterId] ?? '').trim()) payload.abilityOrFeat = abilityOrFeat[characterId]!.trim();
		await dispatch({ type: 'character.set-advancement-choices', actorId: runtime.activeActorId, payload });
	}

	async function commit(characterId: string): Promise<void> {
		if (await dispatch({ type: 'character.commit-advancement', actorId: runtime.activeActorId, payload: { characterId } })) {
			advancingId = null;
		}
	}
	async function cancel(characterId: string): Promise<void> {
		if (await dispatch({ type: 'character.cancel-advancement', actorId: runtime.activeActorId, payload: { characterId } })) {
			advancingId = null;
		}
	}

	const advancingChar = $derived(advancingId ? character(advancingId) : null);
	const advancingState = $derived(advancingChar ? advancementStateOf(advancingChar) : null);
	const advancingValidation = $derived(
		advancingState?.draft ? validateAdvancement(advancingState.draft) : null,
	);
</script>

<section class="adv" data-testid="advancement-view" aria-label="Character advancement">
	<header class="adv__head">
		<h2>Advancement</h2>
		<p class="adv__sub">Level up by XP or milestone. Choices are validated before the level-up is finalized.</p>
	</header>

	{#if error}
		<p class="adv__error" role="alert" data-testid="advancement-error">{error}</p>
	{/if}

	{#if visibleCharacters.length === 0}
		<p class="adv__empty" data-testid="advancement-empty">No characters are visible to you.</p>
	{:else}
		<ul class="adv-list" data-testid="advancement-list">
			{#each visibleCharacters as view (view.id)}
				{@const char = character(view.id)}
				{#if char}
					{@const advancement = advancementStateOf(char)}
					{@const xpEligible = checkAdvancementEligibility(char, 'xp')}
					<li class="adv-card" data-testid={`advancement-character-${view.id}`}>
						<div class="adv-card__main">
							<strong class="adv-card__name">{view.name}</strong>
							<span class="adv-card__level" data-testid={`advancement-level-${view.id}`}>
								Level {advancement.level} · XP {advancement.xp}{#if advancement.level < 20} · next at {xpForLevel(advancement.level + 1) ?? '—'} XP{/if}
							</span>
						</div>

						{#if canAdvance(view.id)}
							<div class="adv-card__actions">
								{#if advancement.draft}
									<button type="button" class="button" data-testid={`advancement-resume-${view.id}`} onclick={() => (advancingId = view.id)}>
										Resume level-up
									</button>
								{:else}
									<details class="adv-xp">
										<summary>Set XP</summary>
										<div class="control-row">
											<input class="num" type="number" data-testid={`advancement-xp-input-${view.id}`} bind:value={xpInput[view.id]} />
											<button type="button" class="button secondary" data-testid={`advancement-xp-set-${view.id}`} onclick={() => setXp(view.id)}>Set XP</button>
										</div>
									</details>
									<button type="button" class="button" data-testid={`advancement-open-xp-${view.id}`} disabled={!xpEligible.eligible} onclick={() => open(view.id, 'xp')}>
										Level up (XP)
									</button>
									<button type="button" class="button secondary" data-testid={`advancement-open-milestone-${view.id}`} onclick={() => open(view.id, 'milestone')}>
										Level up (milestone)
									</button>
								{/if}
							</div>
						{:else}
							<span class="adv-card__readonly">You do not own this character.</span>
						{/if}
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
</section>

<!-- Staged level-up modal (UX-CHAR-008): the sheet stays behind it; close leaves a resumable draft. -->
{#if advancingId && advancingChar && advancingState?.draft}
	<Dialog
		open={dialogOpen}
		role="dialog"
		closeOnBackdrop={false}
		title={`Level up ${advancingChar.name} to level ${advancingState.draft.toLevel}`}
		testid="advancement-dialog"
		onclose={() => (advancingId = null)}
	>
		<div class="draft" data-testid={`advancement-draft-${advancingId}`}>
			<p class="draft__mode">Advancing to level {advancingState.draft.toLevel} ({advancingState.draft.mode}). One choice at a time.</p>
			<div class="draft__grid">
				<label class="field"><span>Class gaining the level</span>
					<input data-testid={`advancement-class-${advancingId}`} bind:value={className[advancingId]} autocomplete="off" /></label>
				<label class="field"><span>Hit points gained</span>
					<input class="num" type="number" inputmode="numeric" data-testid={`advancement-hp-${advancingId}`} bind:value={hpGained[advancingId]} /></label>
				<label class="field"><span>Subclass (if required)</span>
					<input data-testid={`advancement-subclass-${advancingId}`} bind:value={subclass[advancingId]} autocomplete="off" /></label>
				<label class="field"><span>Ability score / feat (if required)</span>
					<input data-testid={`advancement-ability-${advancingId}`} bind:value={abilityOrFeat[advancingId]} autocomplete="off" /></label>
			</div>

			{#if advancingValidation && advancingValidation.issues.length > 0}
				<ul class="issue-list" data-testid={`advancement-issues-${advancingId}`}>
					{#each advancingValidation.issues as issue (issue.field)}
						<li data-testid={`advancement-issue-${advancingId}-${issue.field}`}>{issue.message}</li>
					{/each}
				</ul>
			{:else if advancingValidation?.complete}
				<p class="ready" data-testid={`advancement-ready-${advancingId}`}>All choices are valid — ready to finalize.</p>
			{/if}
		</div>
		{#snippet footer()}
			<button type="button" class="button secondary" data-testid={`advancement-save-${advancingId}`} onclick={() => saveChoices(advancingId!)}>Save choices</button>
			<button type="button" class="button ghost" data-testid={`advancement-cancel-${advancingId}`} onclick={() => cancel(advancingId!)}>Cancel level-up</button>
			<button type="button" class="button" data-testid={`advancement-commit-${advancingId}`} disabled={!advancingValidation?.complete} onclick={() => commit(advancingId!)}>Finalize level-up</button>
		{/snippet}
	</Dialog>
{/if}

<style>
	.adv {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.adv__head h2 { margin: 0; }
	.adv__sub, .adv__empty { margin: 0; color: var(--color-text-secondary); font-size: var(--text-sm); }
	.adv__error { margin: 0; color: var(--color-status-error-text); font-size: var(--text-sm); }
	.adv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
	.adv-card {
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
	.adv-card__main { display: flex; flex-direction: column; gap: var(--space-0-5); min-width: 0; }
	.adv-card__name { font-size: var(--text-md); }
	.adv-card__level { font-size: var(--text-sm); color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
	.adv-card__actions { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
	.adv-card__readonly { font-size: var(--text-sm); color: var(--color-text-secondary); }
	.adv-xp summary { cursor: pointer; font-size: var(--text-sm); color: var(--color-text-secondary); }
	.control-row { display: flex; align-items: flex-end; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-1); }
	.num { width: 6rem; min-height: var(--touch-target-min); padding: var(--space-2); background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; appearance: textfield; -moz-appearance: textfield; }
	.num::-webkit-outer-spin-button, .num::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
	.draft { display: flex; flex-direction: column; gap: var(--space-3); }
	.draft__mode { margin: 0; color: var(--color-text-secondary); font-size: var(--text-sm); }
	.draft__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-3); }
	.field { display: flex; flex-direction: column; gap: var(--space-1); }
	.field span { font-size: var(--text-sm); font-weight: var(--font-weight-semibold); color: var(--color-text-secondary); }
	.field :global(input) { min-height: var(--touch-target-min); padding: var(--space-2) var(--space-3); background: var(--color-surface-sunken); color: var(--color-text-primary); border: 1px solid var(--color-border); border-radius: var(--radius-sm); font: inherit; }
	.issue-list { list-style: none; margin: 0; padding-left: var(--space-5); color: var(--color-status-warning-text); font-size: var(--text-sm); }
	.issue-list li { list-style: disc; }
	.ready { margin: 0; color: var(--color-status-success-text); font-size: var(--text-sm); }
	.button.ghost { background: transparent; color: var(--color-text-secondary); border: 1px solid var(--color-border); }
</style>
