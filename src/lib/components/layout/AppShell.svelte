<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ui } from '$lib/stores/ui.svelte.js';
	import TopBar from './TopBar.svelte';
	import Sidebar from './Sidebar.svelte';

	interface Props {
		onnewnote: () => void;
		onsearch: () => void;
		children: Snippet;
	}

	let { onnewnote, onsearch, children }: Props = $props();
</script>

<a href="#main-content" class="skip-nav">Skip to content</a>

<div class="flex flex-col h-screen">
	<TopBar {onnewnote} {onsearch} />

	<div class="flex flex-1 overflow-hidden">
		{#if ui.sidebarOpen}
			{#if ui.isMobile}
				<!-- Mobile backdrop -->
				<button
					class="fixed inset-0 z-30 bg-black/30"
					onclick={() => (ui.sidebarOpen = false)}
					aria-label="Close sidebar"
				></button>
			{/if}
			<Sidebar {onnewnote} />
		{/if}

		<main
			id="main-content"
			class="flex-1 overflow-y-auto bg-parchment dark:bg-tavern-bg"
		>
			{@render children()}
		</main>
	</div>
</div>
