<script lang="ts">
	import type { FeatureTier, OnboardingView } from '@dndtools/v2-core';

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
