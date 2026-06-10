<script lang="ts">
	import {
		DRAFT_STEPS,
		computeDraftCompleteness,
		getDraftForActor,
		type CharacterDraftView,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// CHAR-002: the player's GUIDED, STRUCTURED PC-creation flow. The step definitions, options, and
	// validation are all computed by the Processing Core; this surface renders them and dispatches the
	// durable `character.update-draft-step` / `character.finalize-draft` commands. Progress is
	// RESUMABLE: the saved step values and the unresolved validation issues are read back from the
	// persisted draft, so closing and reopening restores exactly where the player left off (AC2).
	// Only the single draft owner may edit (the core rejects a non-owner fail closed).
	interface Props {
		draftId: string;
	}
	const { draftId }: Props = $props();
	const runtime = useRuntime();

	const draft = $derived(
		getDraftForActor(
			runtime.state.characters,
			runtime.state.permissions,
			runtime.activeActorId,
			draftId,
		),
	);

	// The completeness/validation report, derived purely from the persisted draft (resume-safe).
	const completeness = $derived.by(() => {
		const raw = runtime.state.characters.drafts[draftId];
		return raw ? computeDraftCompleteness(raw) : null;
	});

	// Which step the player is editing; defaults ONCE to the next incomplete/invalid step on resume,
	// then follows the player's manual step navigation (the effect must not fight clicks/saves).
	let activeStepId = $state<string>('identity');
	let resumeApplied = false;
	$effect(() => {
		if (resumeApplied) return;
		const next = completeness?.nextStepId;
		if (next) {
			activeStepId = next;
			resumeApplied = true;
		}
	});

	// Working values for the active step, seeded from the saved draft step (resume).
	let working = $state<Record<string, string>>({});
	let lastSeededStep = '';
	$effect(() => {
		if (!draft || activeStepId === lastSeededStep) return;
		lastSeededStep = activeStepId;
		const saved = draft.steps.find((step) => step.stepId === activeStepId);
		const next: Record<string, string> = {};
		const definition = DRAFT_STEPS.find((step) => step.id === activeStepId);
		for (const field of definition?.fields ?? []) {
			const value = saved?.values?.[field.id];
			next[field.id] = value === undefined || value === null ? '' : String(value);
		}
		working = next;
	});

	const activeDefinition = $derived(DRAFT_STEPS.find((step) => step.id === activeStepId));
	const activeValidation = $derived(
		completeness?.steps.find((step) => step.stepId === activeStepId) ?? null,
	);

	let error = $state<string | null>(null);

	function stepCompleted(view: CharacterDraftView | null, stepId: string): boolean {
		return Boolean(view?.steps.find((step) => step.stepId === stepId)?.completed);
	}

	function coerce(stepId: string, values: Record<string, string>): Record<string, unknown> {
		const definition = DRAFT_STEPS.find((step) => step.id === stepId);
		const out: Record<string, unknown> = {};
		for (const field of definition?.fields ?? []) {
			const raw = values[field.id] ?? '';
			out[field.id] = field.kind === 'number' && raw !== '' ? Number(raw) : raw;
		}
		return out;
	}

	async function saveStep(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		if (!draft) return;
		const result = await runtime.dispatch({
			type: 'character.update-draft-step',
			actorId: runtime.activeActorId,
			payload: {
				draftId,
				stepId: activeStepId,
				values: coerce(activeStepId, working),
				expectedRevision: draft.revision,
			},
		});
		if (result.status === 'rejected') error = result.rejection.message;
	}

	async function finalize() {
		error = null;
		const result = await runtime.dispatch({
			type: 'character.finalize-draft',
			actorId: runtime.activeActorId,
			payload: { draftId },
		});
		if (result.status === 'rejected') error = result.rejection.message;
	}
</script>

{#if !draft}
	<section data-testid="draft-flow-unavailable" aria-label="Draft unavailable">
		<p role="status">This draft is not available to you.</p>
	</section>
{:else if draft.finalized}
	<section data-testid="draft-flow-finalized" aria-label="Draft finalized">
		<p role="status">This draft has been finalized into a character.</p>
	</section>
{:else}
	<section data-testid="draft-flow" aria-label="Create your character" data-draft-id={draftId}>
		<h2>Create your character</h2>
		<p class="meta">
			Work through each step. Your progress is saved as you go, so you can leave and resume later.
		</p>

		<!-- Step navigation with resume indicators. -->
		<nav class="steps" aria-label="Creation steps">
			{#each DRAFT_STEPS as step (step.id)}
				{@const valid = completeness?.steps.find((s) => s.stepId === step.id)?.valid}
				<button
					type="button"
					class="step-tab"
					class:active={step.id === activeStepId}
					data-testid={`step-tab-${step.id}`}
					data-completed={stepCompleted(draft, step.id)}
					data-valid={valid}
					aria-current={step.id === activeStepId ? 'step' : undefined}
					onclick={() => (activeStepId = step.id)}
				>
					{step.title}
					{#if stepCompleted(draft, step.id)}
						<span class="badge" data-testid={`step-done-${step.id}`}>{valid ? '✓' : '!'}</span>
					{/if}
				</button>
			{/each}
		</nav>

		{#if activeDefinition}
			<form class="form" data-testid={`step-form-${activeStepId}`} onsubmit={saveStep}>
				<p class="meta">{activeDefinition.description}</p>
				{#each activeDefinition.fields as field (field.id)}
					<label>
						<span>{field.label}</span>
						{#if field.kind === 'choice'}
							<select data-testid={`field-${field.id}`} bind:value={working[field.id]}>
								<option value="">Select…</option>
								{#each field.options ?? [] as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						{:else if field.kind === 'number'}
							<input
								type="number"
								data-testid={`field-${field.id}`}
								bind:value={working[field.id]}
							/>
						{:else}
							<input
								type="text"
								data-testid={`field-${field.id}`}
								bind:value={working[field.id]}
								autocomplete="off"
							/>
						{/if}
					</label>
				{/each}
				<button type="submit" data-testid="step-save">Save step</button>
			</form>
		{/if}

		<!-- Unresolved validation issues for the active step (restored on resume). -->
		{#if activeValidation && !activeValidation.valid && stepCompleted(draft, activeStepId)}
			<ul class="issues" data-testid="step-issues" role="alert">
				{#each activeValidation.issues as issue (issue.fieldId ?? issue.message)}
					<li>{issue.message}</li>
				{/each}
			</ul>
		{/if}

		<!-- Overall completeness + finalize. -->
		<section aria-label="Draft status" class="status">
			<p class="meta" data-testid="draft-ready" data-ready={completeness?.readyToFinalize}>
				{#if completeness?.readyToFinalize}
					All steps are valid. You can finalize your character.
				{:else}
					{completeness?.issues.length ?? 0} issue(s) remaining across the flow.
				{/if}
			</p>
			<button
				type="button"
				data-testid="draft-finalize"
				disabled={!completeness?.readyToFinalize}
				onclick={finalize}
			>
				Finalize character
			</button>
		</section>

		{#if error}
			<p class="meta" role="alert" data-testid="draft-flow-error">{error}</p>
		{/if}
	</section>
{/if}

<style>
	.steps {
		display: flex;
		gap: 0.25rem;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
	}
	.step-tab {
		display: inline-flex;
		gap: 0.35rem;
		align-items: center;
	}
	.step-tab.active {
		font-weight: 700;
		text-decoration: underline;
	}
	.form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 28rem;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-weight: 600;
	}
	.issues {
		color: var(--error, #b00020);
	}
	.status {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-start;
	}
</style>
