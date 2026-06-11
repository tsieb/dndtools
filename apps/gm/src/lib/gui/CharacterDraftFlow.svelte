<script lang="ts">
	import {
		ABILITY_IDS,
		ABILITY_POINT_BUDGET,
		DRAFT_STEPS,
		computeDraftCompleteness,
		getDraftForActor,
		pointBuyCost,
		type CharacterDraftView,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';

	// UX-CHAR-002 — the player's GUIDED, RESUMABLE PC-creation wizard: a step rail with per-step
	// completion state, one decision per step, a live "what you get" preview, autosave feedback, and a
	// finalize gate that explains what is still missing. The step definitions, options, and validation
	// all come from the Processing Core; this surface renders them and dispatches the durable
	// `character.update-draft-step` / `character.finalize-draft` commands. Progress is resumable: the
	// saved step values and unresolved validation issues are read back from the persisted draft, so
	// closing and reopening restores exactly where the player left off (AC3). Only the single draft
	// owner may edit (the core rejects a non-owner fail closed).
	interface Props {
		draftId: string;
	}
	const { draftId }: Props = $props();
	const runtime = useRuntime();

	const draft = $derived(
		getDraftForActor(runtime.state.characters, runtime.state.permissions, runtime.activeActorId, draftId),
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

	const activeIndex = $derived(DRAFT_STEPS.findIndex((step) => step.id === activeStepId));
	// DRAFT_STEPS is a non-empty frozen array; the fallback keeps the type non-undefined for the panel.
	const activeDefinition = $derived(DRAFT_STEPS[activeIndex] ?? DRAFT_STEPS[0]!);
	const activeValidation = $derived(
		completeness?.steps.find((step) => step.stepId === activeStepId) ?? null,
	);

	let error = $state<string | null>(null);
	let justSavedStepId = $state<string | null>(null);
	let savedTimer: ReturnType<typeof setTimeout> | undefined;

	// The wizard panel's first input gets focus once on mount, landing the player on the step they
	// need to act on (AC1). Subsequent navigation manages its own focus via the rail buttons.
	let panelEl = $state<HTMLElement | null>(null);
	let focusedOnce = false;
	$effect(() => {
		if (focusedOnce || !panelEl) return;
		focusedOnce = true;
		const firstInput = panelEl.querySelector<HTMLElement>('input, select, textarea');
		firstInput?.focus({ preventScroll: true });
	});

	type StepStatus = 'empty' | 'valid' | 'invalid';
	function stepStatus(view: CharacterDraftView | null, stepId: string): StepStatus {
		const completed = Boolean(view?.steps.find((step) => step.stepId === stepId)?.completed);
		if (!completed) return 'empty';
		const valid = completeness?.steps.find((step) => step.stepId === stepId)?.valid;
		return valid ? 'valid' : 'invalid';
	}
	function isCompleted(view: CharacterDraftView | null, stepId: string): boolean {
		return Boolean(view?.steps.find((step) => step.stepId === stepId)?.completed);
	}

	const STATUS_WORD: Record<StepStatus, string> = {
		empty: 'not started',
		valid: 'complete',
		invalid: 'has issues',
	};
	const STATUS_GLYPH: Record<StepStatus, string> = { empty: '○', valid: '✓', invalid: '!' };

	function coerce(stepId: string, values: Record<string, string>): Record<string, unknown> {
		const definition = DRAFT_STEPS.find((step) => step.id === stepId);
		const out: Record<string, unknown> = {};
		for (const field of definition?.fields ?? []) {
			const raw = values[field.id] ?? '';
			out[field.id] = field.kind === 'number' && raw !== '' ? Number(raw) : raw;
		}
		return out;
	}

	function goTo(stepId: string): void {
		activeStepId = stepId;
	}

	async function saveStep(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		if (!draft) return;
		const wasCompleted = isCompleted(draft, activeStepId);
		const savedStepId = activeStepId;
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
		if (result.status === 'rejected') {
			error = result.rejection.message;
			return;
		}
		// "Saved just now" appears for 3 seconds, then folds back into the step status icon (AC2).
		justSavedStepId = savedStepId;
		if (savedTimer) clearTimeout(savedTimer);
		if (typeof setTimeout !== 'undefined') {
			savedTimer = setTimeout(() => {
				if (justSavedStepId === savedStepId) justSavedStepId = null;
			}, 3000);
		}
		// First-time completion of a valid step advances to the next step (Continue). Revising an
		// already-completed step, or saving an invalid one, keeps the player on the step.
		const savedRaw = runtime.state.characters.drafts[draftId];
		const nowValid = savedRaw
			? computeDraftCompleteness(savedRaw).steps.find((step) => step.stepId === savedStepId)?.valid
			: false;
		const nextStep = DRAFT_STEPS[activeIndex + 1];
		if (!wasCompleted && nowValid && nextStep) {
			activeStepId = nextStep.id;
		}
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

	// --- "What you get" preview helpers ---------------------------------------------------------
	function optionLabel(stepId: string, fieldId: string, value: string): string {
		const field = DRAFT_STEPS.find((step) => step.id === stepId)?.fields.find((f) => f.id === fieldId);
		return field?.options?.find((option) => option.value === value)?.label ?? '—';
	}
	function abilityModifier(raw: string): string {
		const score = Number(raw);
		if (!Number.isFinite(score) || raw === '') return '—';
		const mod = Math.floor((score - 10) / 2);
		return mod >= 0 ? `+${mod}` : `${mod}`;
	}
	const pointsUsed = $derived(
		ABILITY_IDS.reduce((sum, ability) => {
			const score = Number(working[ability]);
			const cost = Number.isFinite(score) ? pointBuyCost(score) : null;
			return sum + (cost ?? 0);
		}, 0),
	);

	const announceText = $derived(
		`Step ${activeIndex + 1} of ${DRAFT_STEPS.length} — ${activeDefinition.title}`,
	);
	const remainingIssues = $derived(completeness?.issues ?? []);
</script>

{#if !draft}
	<section data-testid="draft-flow-unavailable" aria-label="Draft unavailable" class="wizard-msg">
		<p role="status">This draft is not available to you.</p>
	</section>
{:else if draft.finalized}
	<section data-testid="draft-flow-finalized" aria-label="Draft finalized" class="wizard-msg">
		<p role="status">This draft has been finalized into a character.</p>
	</section>
{:else}
	<section class="wizard" data-testid="draft-flow" aria-label="Create your character" data-draft-id={draftId}>
		<header class="wizard__head">
			<h2>Create your character</h2>
			<p class="wizard__sub">
				One decision per step. Your progress saves as you go, so you can leave and resume anytime.
			</p>
		</header>

		<div class="sr-only" aria-live="polite" data-testid="wizard-step-announce">{announceText}</div>

		<div class="wizard__layout">
			<!-- Step rail (UX-CHAR-002 §spec / §6.2). -->
			<div
				class="rail"
				role="tablist"
				aria-label="Creation steps"
				aria-orientation="vertical"
			>
				{#each DRAFT_STEPS as step, index (step.id)}
					{@const status = stepStatus(draft, step.id)}
					<button
						type="button"
						role="tab"
						id={`step-tab-id-${step.id}`}
						class="rail__step"
						class:rail__step--active={step.id === activeStepId}
						data-testid={`step-tab-${step.id}`}
						data-status={status}
						data-completed={isCompleted(draft, step.id)}
						data-valid={completeness?.steps.find((s) => s.stepId === step.id)?.valid}
						aria-selected={step.id === activeStepId}
						aria-current={step.id === activeStepId ? 'step' : undefined}
						aria-controls="wizard-panel"
						aria-label={`Step ${index + 1}: ${step.title}, ${STATUS_WORD[status]}`}
						onclick={() => goTo(step.id)}
					>
						<span class="rail__marker" data-status={status} aria-hidden="true">
							{#if justSavedStepId === step.id}●{:else}{STATUS_GLYPH[status]}{/if}
						</span>
						<span class="rail__label">
							<span class="rail__index">Step {index + 1}</span>
							<span class="rail__title">{step.title}</span>
						</span>
						{#if isCompleted(draft, step.id)}
							<span class="rail__badge" data-testid={`step-done-${step.id}`} data-valid={status === 'valid'}>
								{status === 'valid' ? '✓' : '!'}
							</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Active step content. -->
			<div class="panel" id="wizard-panel" role="tabpanel" aria-labelledby={`step-tab-id-${activeStepId}`} bind:this={panelEl}>
				<div class="panel__counter">Step {activeIndex + 1} of {DRAFT_STEPS.length}</div>
				<h3 class="panel__title">{activeDefinition.title}</h3>
				<p class="panel__desc">{activeDefinition.description}</p>

				<form class="panel__form" data-testid={`step-form-${activeStepId}`} onsubmit={saveStep}>
					<div class="fields" class:fields--grid={activeStepId === 'abilities'}>
						{#each activeDefinition.fields as field (field.id)}
							<label class="field">
								<span class="field__label">{field.label}</span>
								{#if field.kind === 'choice'}
									<select data-testid={`field-${field.id}`} bind:value={working[field.id]}>
										<option value="">Select…</option>
										{#each field.options ?? [] as option (option.value)}
											<option value={option.value}>{option.label}</option>
										{/each}
									</select>
								{:else if field.kind === 'number'}
									<input class="num" type="number" inputmode="numeric" data-testid={`field-${field.id}`} bind:value={working[field.id]} />
								{:else}
									<input type="text" data-testid={`field-${field.id}`} bind:value={working[field.id]} autocomplete="off" />
								{/if}
							</label>
						{/each}
					</div>

					{#if justSavedStepId === activeStepId}
						<p class="panel__saved" role="status">
							<span class="dot" aria-hidden="true"></span> Saved just now
						</p>
					{/if}

					<div class="panel__nav">
						{#if activeIndex > 0}
							<button type="button" class="button secondary" onclick={() => goTo(DRAFT_STEPS[activeIndex - 1]!.id)}>
								Back
							</button>
						{/if}
						<button class="button" type="submit" data-testid="step-save">
							{activeIndex < DRAFT_STEPS.length - 1 && !isCompleted(draft, activeStepId)
								? 'Save & continue'
								: 'Save changes'}
						</button>
					</div>
				</form>

				<!-- Unresolved validation issues for the active step (restored on resume). -->
				{#if activeValidation && !activeValidation.valid && isCompleted(draft, activeStepId)}
					<ul class="issues" data-testid="step-issues" role="alert">
						{#each activeValidation.issues as issue (issue.fieldId ?? issue.message)}
							<li>{issue.message}</li>
						{/each}
					</ul>
				{/if}
			</div>

			<!-- "What you get" live preview. -->
			<aside class="preview" aria-label="What you get">
				<h3 class="preview__title">What you get</h3>
				{#if activeStepId === 'identity'}
					<dl class="preview__list">
						<div><dt>Background</dt><dd>{optionLabel('identity', 'background', working.background ?? '')}</dd></div>
					</dl>
				{:else if activeStepId === 'abilities'}
					<p class="preview__budget" data-over={pointsUsed > ABILITY_POINT_BUDGET}>
						Points used: <strong>{pointsUsed}</strong> / {ABILITY_POINT_BUDGET}
					</p>
					<dl class="preview__abilities">
						{#each ABILITY_IDS as ability (ability)}
							<div>
								<dt>{ability.toUpperCase()}</dt>
								<dd>{working[ability] || '—'} <span class="mod">({abilityModifier(working[ability] ?? '')})</span></dd>
							</div>
						{/each}
					</dl>
				{:else if activeStepId === 'class'}
					<dl class="preview__list">
						<div><dt>Class</dt><dd>{optionLabel('class', 'class', working.class ?? '')}</dd></div>
					</dl>
				{/if}
			</aside>
		</div>

		<!-- Overall completeness + finalize. -->
		<footer class="wizard__foot" aria-label="Draft status">
			<div class="status-line">
				<p class="status-line__text" data-testid="draft-ready" data-ready={completeness?.readyToFinalize}>
					{#if completeness?.readyToFinalize}
						All steps are valid — you're ready to create your character.
					{:else}
						{remainingIssues.length} issue{remainingIssues.length === 1 ? '' : 's'} remaining before you can finalize.
					{/if}
				</p>
				{#if !completeness?.readyToFinalize && remainingIssues.length > 0}
					<ul class="status-line__issues">
						{#each remainingIssues.slice(0, 4) as issue (issue.fieldId ? `${issue.stepId}.${issue.fieldId}` : issue.message)}
							<li>{issue.message}</li>
						{/each}
					</ul>
				{/if}
			</div>
			<button
				class="button finalize"
				type="button"
				data-testid="draft-finalize"
				disabled={!completeness?.readyToFinalize}
				onclick={finalize}
			>
				Create character
			</button>
		</footer>

		{#if error}
			<p class="wizard__error" role="alert" data-testid="draft-flow-error">{error}</p>
		{/if}
	</section>
{/if}

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
	.wizard-msg {
		padding: var(--space-4);
		color: var(--color-text-secondary);
	}
	.wizard {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.wizard__head h2 {
		margin: 0;
	}
	.wizard__sub {
		margin: var(--space-1) 0 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.wizard__layout {
		display: grid;
		grid-template-columns: 200px minmax(0, 1fr) 220px;
		gap: var(--space-4);
		align-items: start;
	}
	/* Step rail */
	.rail {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.rail__step {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		text-align: left;
		padding: var(--space-2) var(--space-3);
		min-height: var(--touch-target-min);
		background: transparent;
		color: var(--color-text-primary);
		border: 1px solid transparent;
		border-radius: var(--radius-md);
		cursor: pointer;
	}
	.rail__step:hover {
		background: var(--color-interactive-hover);
	}
	.rail__step--active {
		background: var(--color-interactive-selected);
		border-color: var(--color-accent-border);
	}
	.rail__marker {
		flex: 0 0 auto;
		width: var(--space-5);
		height: var(--space-5);
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border-strong);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.rail__marker[data-status='valid'] {
		color: var(--color-status-success-text);
		border-color: var(--color-status-success);
	}
	.rail__marker[data-status='invalid'] {
		color: var(--color-status-warning-text);
		border-color: var(--color-status-warning);
	}
	.rail__label {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: var(--leading-tight);
	}
	.rail__index {
		font-size: var(--text-2xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
	}
	.rail__title {
		font-weight: var(--font-weight-medium);
	}
	.rail__badge {
		margin-left: auto;
		font-size: var(--text-sm);
		color: var(--color-status-warning-text);
	}
	.rail__badge[data-valid='true'] {
		color: var(--color-status-success-text);
	}
	/* Panel */
	.panel {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	.panel__counter {
		font-size: var(--text-2xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
	}
	.panel__title {
		margin: 0;
	}
	.panel__desc {
		margin: 0;
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.panel__form {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		margin-top: var(--space-2);
	}
	.fields {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
	.fields--grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-2);
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 0;
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
	.num {
		appearance: textfield;
		-moz-appearance: textfield;
	}
	.num::-webkit-outer-spin-button,
	.num::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
	.panel__saved {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-status-success-text);
	}
	.panel__saved .dot {
		width: var(--space-2);
		height: var(--space-2);
		border-radius: var(--radius-full);
		background: var(--color-status-success);
	}
	.panel__nav {
		display: flex;
		gap: var(--space-2);
	}
	.issues {
		margin: var(--space-2) 0 0;
		padding-left: var(--space-5);
		color: var(--color-status-warning-text);
		font-size: var(--text-sm);
	}
	/* Preview */
	.preview {
		padding: var(--space-3);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.preview__title {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
	}
	.preview__list,
	.preview__abilities {
		margin: 0;
		display: grid;
		gap: var(--space-1);
	}
	.preview__abilities {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
	.preview dt {
		font-size: var(--text-2xs);
		text-transform: uppercase;
		letter-spacing: var(--tracking-wide);
		color: var(--color-text-secondary);
	}
	.preview dd {
		margin: 0;
		font-weight: var(--font-weight-medium);
	}
	.preview .mod {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.preview__budget {
		margin: 0 0 var(--space-2);
		font-size: var(--text-sm);
	}
	.preview__budget[data-over='true'] {
		color: var(--color-status-error-text);
	}
	/* Footer */
	.wizard__foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding-top: var(--space-3);
		border-top: 1px solid var(--color-border);
	}
	.status-line {
		min-width: 0;
	}
	.status-line__text {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.status-line__text[data-ready='true'] {
		color: var(--color-status-success-text);
	}
	.status-line__issues {
		margin: var(--space-1) 0 0;
		padding-left: var(--space-5);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
	.finalize {
		flex: 0 0 auto;
		min-height: var(--touch-target-min);
		font-weight: var(--font-weight-semibold);
	}
	.finalize:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.wizard__error {
		margin: 0;
		color: var(--color-status-error-text);
		font-size: var(--text-sm);
	}
	@media (max-width: 860px) {
		.wizard__layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.rail {
			flex-direction: row;
			overflow-x: auto;
			gap: var(--space-2);
		}
		.rail__step {
			flex: 0 0 auto;
			width: auto;
		}
		.preview {
			order: 3;
		}
	}
</style>
