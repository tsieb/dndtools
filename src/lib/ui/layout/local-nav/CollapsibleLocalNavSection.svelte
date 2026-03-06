<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { PrimarySection } from '$lib/state/navigation.svelte.js';
	import { localNavigationPanelsState } from '$lib/state/local-navigation-panels.svelte.js';

	interface Props {
		section: PrimarySection;
		sectionId: string;
		title: string;
		defaultCollapsed?: boolean;
		children: Snippet;
	}

	let { section, sectionId, title, defaultCollapsed = false, children }: Props = $props();

	const contentId = $derived(`local-nav-${section}-${sectionId}`);
	const collapsed = $derived(
		localNavigationPanelsState.isCollapsed(section, sectionId, defaultCollapsed),
	);

	$effect(() => {
		localNavigationPanelsState.ensureHydrated();
	});

	function toggle(): void {
		localNavigationPanelsState.toggle(section, sectionId, defaultCollapsed);
	}
</script>

<section class="px-3 pb-2">
	<button
		type="button"
		class="mb-1.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-semibold uppercase tracking-wider text-ink-faint transition-[transform,colors] active:scale-[0.97] active:brightness-95 hover:bg-surface-alt hover:text-ink-muted"
		onclick={toggle}
		aria-expanded={!collapsed}
		aria-controls={contentId}
	>
		<span class="text-2xs leading-none">{collapsed ? '\u25B6' : '\u25BC'}</span>
		<span>{title}</span>
	</button>
	{#if !collapsed}
		<div id={contentId}>
			{@render children()}
		</div>
	{/if}
</section>
