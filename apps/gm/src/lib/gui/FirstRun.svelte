<script lang="ts">
	import type { FeatureTier, OnboardingView } from '@dndtools/core';

	/**
	 * PLAT-013: the first-run onboarding surface. Renders the core-computed {@link OnboardingView}
	 * — never deriving onboarding state itself (Contract 1). It shows the first-run welcome, the
	 * setup steps and their done-state, the help surfaces, the feature-tier control (progressive
	 * disclosure), and the capabilities visible at the active tier. Onboarding SETUP is DM-only:
	 * when `view.canSetup` is false the surface is read-only guidance with no setup affordance.
	 */
	const {
		view,
		tiers,
		activeTier,
		onSelectTier,
	}: {
		view: OnboardingView;
		tiers: readonly FeatureTier[];
		activeTier: FeatureTier;
		onSelectTier: (tier: FeatureTier) => void;
	} = $props();
</script>

<section
	class="first-run"
	aria-label="Onboarding"
	data-testid="onboarding"
	data-status={view.status}
	data-fresh={view.isFresh}
>
	{#if view.status !== 'complete'}
		<div class="onboarding-banner" data-testid="onboarding-banner" role="status">
			<h2>
				{#if view.status === 'first-run'}
					Welcome — let's set up your vault
				{:else}
					Finish setting up your vault
				{/if}
			</h2>
			{#if !view.canSetup}
				<p class="meta" data-testid="onboarding-readonly">
					Vault setup is performed by the DM. This is a read-only overview.
				</p>
			{/if}
			<ol class="onboarding-steps" data-testid="onboarding-steps">
				{#each view.steps as step (step.id)}
					<li data-testid={`onboarding-step-${step.id}`} data-done={step.done}>
						<span class="step-mark" aria-hidden="true">{step.done ? '✓' : '○'}</span>
						<span>{step.label}</span>
						<span class="visually-hidden">{step.done ? '(done)' : '(not done)'}</span>
					</li>
				{/each}
			</ol>
		</div>
	{/if}

	<div class="feature-tier" data-testid="feature-tier">
		<fieldset>
			<legend>Feature tier</legend>
			<p class="meta">Reveal more capabilities as you grow comfortable (progressive disclosure).</p>
			<div class="tier-options" role="radiogroup" aria-label="Feature tier">
				{#each tiers as tier (tier)}
					<label class="tier-option">
						<input
							type="radio"
							name="feature-tier"
							value={tier}
							checked={activeTier === tier}
							data-testid={`feature-tier-${tier}`}
							onchange={() => onSelectTier(tier)}
						/>
						<span>{tier}</span>
					</label>
				{/each}
			</div>
		</fieldset>
		<ul class="visible-features" data-testid="visible-features" aria-label="Visible capabilities">
			{#each view.visibleFeatures as feature (feature.id)}
				<li data-testid={`feature-${feature.id}`}>{feature.label}</li>
			{/each}
		</ul>
	</div>

	<details class="help-surfaces" data-testid="help-surfaces">
		<summary>Help &amp; tips</summary>
		<ul>
			{#each view.helpSurfaces as help (help.id)}
				<li data-testid={`help-${help.id}`}>
					<a href={help.surface}><strong>{help.title}</strong></a>
					<span class="meta"> {help.body}</span>
				</li>
			{/each}
		</ul>
	</details>
</section>

<style>
	.first-run {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
	.first-run :global(.meta) {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}
	.first-run :global(.visually-hidden) {
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
	/* Welcome banner — the first impression. */
	.onboarding-banner {
		padding: var(--space-5);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-accent-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.onboarding-banner h2 {
		margin: 0 0 var(--space-2);
		font-family: var(--font-display);
		font-size: var(--text-xl);
		letter-spacing: var(--tracking-tight);
	}
	.onboarding-steps {
		list-style: none;
		margin: var(--space-3) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1-5);
	}
	.onboarding-steps li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.onboarding-steps li[data-done='true'] {
		color: var(--color-text-secondary);
	}
	.step-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: var(--space-5);
		height: var(--space-5);
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border-strong);
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
		flex: 0 0 auto;
	}
	.onboarding-steps li[data-done='true'] .step-mark {
		background: var(--color-status-success);
		border-color: var(--color-status-success);
		color: var(--color-text-inverse);
	}
	/* Feature tier (progressive disclosure). */
	.feature-tier {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-sm);
	}
	.feature-tier fieldset {
		border: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}
	.feature-tier legend {
		font-weight: var(--font-weight-semibold);
		padding: 0;
	}
	.tier-options {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
		margin-top: var(--space-1);
	}
	.tier-option {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch-target-min);
		padding: 0 var(--space-3);
		text-transform: capitalize;
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		cursor: pointer;
	}
	.tier-option:has(input:checked) {
		border-color: var(--color-accent);
		background: var(--color-interactive-selected);
		font-weight: var(--font-weight-semibold);
	}
	.visible-features {
		list-style: none;
		margin: var(--space-1) 0 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.visible-features li {
		font-size: var(--text-sm);
		padding: var(--space-0-5) var(--space-2);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-full);
		color: var(--color-text-secondary);
	}
	/* Help & tips disclosure. */
	.help-surfaces {
		padding: var(--space-2) var(--space-4);
		background: var(--color-surface-sunken);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.help-surfaces summary {
		cursor: pointer;
		min-height: var(--touch-target-min);
		display: flex;
		align-items: center;
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.help-surfaces ul {
		list-style: none;
		margin: var(--space-2) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1-5);
	}
	.help-surfaces a {
		color: var(--color-text-link);
		min-height: var(--touch-target-floor);
		display: inline-flex;
		align-items: center;
	}
</style>
