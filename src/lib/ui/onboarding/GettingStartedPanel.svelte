<script lang="ts">
	import { ONBOARDING_MILESTONES } from '$lib/domain/onboarding.js';
	import { onboardingState } from '$lib/state/onboarding.svelte.js';
	import Button from '$lib/ui/common/Button.svelte';

	interface Props {
		onclose?: () => void;
	}

	let { onclose }: Props = $props();

	const totalMilestones = ONBOARDING_MILESTONES.length;
	const completedMilestones = $derived(onboardingState.completedCount);
	const progressPercent = $derived(Math.round((completedMilestones / totalMilestones) * 100));
</script>

<section class="mb-6 rounded-xl border border-border bg-surface p-4 md:p-5">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h2 class="text-lg font-semibold text-ink">Getting started</h2>
			<p class="mt-1 text-sm text-ink-muted">
				You've discovered {completedMilestones} of {totalMilestones} core workflows.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<p class="text-xs text-ink-faint">{progressPercent}%</p>
			{#if onclose}
				<Button variant="ghost" size="sm" onclick={onclose}>Hide</Button>
			{/if}
		</div>
	</div>

	<div class="mt-4 space-y-2">
		{#each ONBOARDING_MILESTONES as milestone (milestone.id)}
			<div
				class="rounded-lg border px-3 py-2.5 {onboardingState.hasMilestone(milestone.id)
					? 'border-emerald-300/60 bg-emerald-50/40'
					: 'border-border bg-surface-alt/40'}"
			>
				<p class="text-sm font-medium text-ink">
					{onboardingState.hasMilestone(milestone.id) ? '[Done]' : '[Next]'}
					{milestone.label}
				</p>
				<p class="mt-1 text-xs text-ink-muted">
					{onboardingState.hasMilestone(milestone.id)
						? milestone.description
						: milestone.firstActionHint}
				</p>
			</div>
		{/each}
	</div>
</section>
