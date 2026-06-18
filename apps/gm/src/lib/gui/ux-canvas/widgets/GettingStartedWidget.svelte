<script lang="ts">
	/**
	 * Getting-started Command Center widget — the onboarding / feature-tier guidance. Self-contained:
	 * reads the onboarding view from the Processing Core and the active tier from the feature-tier
	 * context (PLAT-013), exactly as the route's first-run section did.
	 */
	import { resolveOnboarding } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { useFeatureTier } from '$lib/state/feature-tier.svelte';
	import FirstRun from '$lib/gui/FirstRun.svelte';

	const runtime = useRuntime();
	const featureTier = useFeatureTier();
	const onboarding = $derived(
		resolveOnboarding(runtime.state, runtime.defaultActorId, featureTier.tier),
	);
</script>

<FirstRun
	view={onboarding}
	tiers={featureTier.tiers}
	activeTier={featureTier.tier}
	onSelectTier={(tier) => featureTier.setTier(tier)}
/>
