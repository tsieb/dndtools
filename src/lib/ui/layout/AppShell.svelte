<script lang="ts">
	import type { Snippet } from 'svelte';
	import { ui } from '$lib/state/ui.svelte.js';
	import TopBar from './TopBar.svelte';
	import Sidebar from './Sidebar.svelte';
	import LocationBar from '$lib/ui/navigation/LocationBar.svelte';

	interface Props {
		onnewnote: () => void;
		onsearch: () => void;
		ontemplate: (folderOverride?: string) => void;
		onrefresh: () => void;
		children: Snippet;
	}

	let { onnewnote, onsearch, ontemplate, onrefresh, children }: Props = $props();
</script>

<a href="#main-content" class="skip-nav">Skip to content</a>

<div class="flex flex-col h-screen">
	{#if !ui.focusReading}
		<TopBar {onnewnote} {onsearch} {ontemplate} {onrefresh} />
	{/if}

	<div class="flex flex-1 overflow-hidden">
		{#if ui.sidebarOpen && !ui.focusReading}
			{#if ui.isMobile}
				<!-- Mobile backdrop -->
				<button
					class="fixed inset-0 z-30 bg-black/30"
					onclick={() => (ui.sidebarOpen = false)}
					aria-label="Close sidebar"
				></button>
			{/if}
			<Sidebar {onnewnote} {ontemplate} />
		{/if}

		<main id="main-content" class="app-main flex-1 overflow-y-auto bg-parchment dark:bg-tavern-bg">
			{#if !ui.focusReading}
				<LocationBar />
			{/if}
			<div class="h-full min-h-0 animate-fade-in">
				{@render children()}
			</div>
		</main>
	</div>
</div>
