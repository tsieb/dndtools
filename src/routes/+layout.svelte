<script lang="ts">
	import '../app.css';
	import AppShell from '$lib/components/layout/AppShell.svelte';
	import QuickSwitcher from '$lib/components/search/QuickSwitcher.svelte';
	import { getStorage } from '$lib/storage/index.js';
	import { notesState } from '$lib/stores/notes.svelte.js';
	import { ui } from '$lib/stores/ui.svelte.js';
	import { searchService } from '$lib/services/search.js';
	import { linksState } from '$lib/stores/links.svelte.js';
	import { createWelcomeNote } from '$lib/services/welcome-note.js';
	import { goto } from '$app/navigation';

	let { children } = $props();
	let quickSwitcherOpen = $state(false);
	let initialized = $state(false);

	$effect(() => {
		async function init(): Promise<void> {
			const storage = getStorage();
			await storage.initialize();
			await ui.loadFromStorage();
			ui.checkMobile();
			await notesState.loadAll();

			if (notesState.notes.length === 0) {
				await createWelcomeNote();
				await notesState.loadAll();
			}

			searchService.buildIndex(notesState.notes);
			await linksState.buildGraph();
			initialized = true;
		}
		init();
	});

	// Apply dark class to html
	$effect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.classList.toggle('dark', ui.resolvedTheme === 'dark');
	});

	// Responsive check
	$effect(() => {
		if (typeof window === 'undefined') return;
		const handler = (): void => ui.checkMobile();
		window.addEventListener('resize', handler);
		return () => window.removeEventListener('resize', handler);
	});

	async function handleNewNote(): Promise<void> {
		const note = await notesState.createNote();
		goto(`/notes/${note.id}/edit`);
	}

	function handleKeydown(event: KeyboardEvent): void {
		const mod = event.ctrlKey || event.metaKey;

		if (mod && event.key === 'p') {
			event.preventDefault();
			quickSwitcherOpen = true;
		} else if (mod && event.key === 'n') {
			event.preventDefault();
			handleNewNote();
		} else if (mod && event.key === 'b') {
			event.preventDefault();
			ui.toggleSidebar();
		}
	}
</script>

<svelte:head>
	<title>DND Tools</title>
	<meta name="description" content="D&D campaign note-taking app" />
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#if initialized}
	<AppShell onnewnote={handleNewNote} onsearch={() => (quickSwitcherOpen = true)}>
		{@render children()}
	</AppShell>
	<QuickSwitcher bind:open={quickSwitcherOpen} onclose={() => (quickSwitcherOpen = false)} />
{:else}
	<div class="flex h-screen items-center justify-center bg-parchment dark:bg-tavern-bg">
		<div class="text-center">
			<p class="text-lg font-medium text-ink dark:text-tavern-text">DND Tools</p>
			<p class="text-sm text-ink-muted dark:text-tavern-muted mt-1">Loading your vault...</p>
		</div>
	</div>
{/if}
