<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { PrimarySection } from '$lib/state/navigation.svelte.js';
	import { localNavigationPanelsState } from '$lib/state/local-navigation-panels.svelte.js';
	import NavSection from '$lib/ui/nav/NavSection.svelte';

	interface Props {
		section: PrimarySection;
		sectionId: string;
		title: string;
		defaultCollapsed?: boolean;
		children: Snippet;
	}

	let { section, sectionId, title, defaultCollapsed = false, children }: Props = $props();

	const id = $derived(`local-nav-${section}-${sectionId}`);
	const collapsed = $derived(
		localNavigationPanelsState.isCollapsed(section, sectionId, defaultCollapsed),
	);

	$effect(() => {
		localNavigationPanelsState.ensureHydrated();
	});
</script>

<NavSection
	label={title}
	{id}
	{collapsed}
	ontoggle={() => localNavigationPanelsState.toggle(section, sectionId, defaultCollapsed)}
>
	{@render children()}
</NavSection>
