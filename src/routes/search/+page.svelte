<script lang="ts">
	import { resolve } from '$app/paths';
	import { searchService, type SearchResult } from '$lib/domain/search.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import NoteCard from '$lib/ui/common/NoteCard.svelte';
	import { goto } from '$app/navigation';

	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	let inputRef: HTMLInputElement | undefined = $state();

	function handleInput(event: Event): void {
		query = (event.target as HTMLInputElement).value;
		if (searchTimeout) {
			clearTimeout(searchTimeout);
			searchTimeout = null;
		}
		const normalized = query.trim();
		if (!normalized) {
			results = [];
			return;
		}
		searchTimeout = setTimeout(() => {
			results = searchService.search(normalized);
			searchTimeout = null;
		}, 200);
	}

	let notesById = $derived(notesState.noteById);

	$effect(() => {
		inputRef?.focus();
	});

	$effect(() => {
		return () => {
			if (searchTimeout) clearTimeout(searchTimeout);
		};
	});
</script>

<div class="p-6 max-w-content mx-auto">
	<h1 class="text-2xl font-bold text-ink dark:text-tavern-text mb-4" style="font-family: var(--font-serif)">Search</h1>

	<div class="relative">
		<svg class="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-ink-faint dark:text-tavern-faint pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
		</svg>
		<input
			bind:this={inputRef}
			type="text"
			value={query}
			oninput={handleInput}
			placeholder="Search notes..."
			class="w-full pl-11 pr-4 py-3 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-ink dark:text-tavern-text placeholder:text-ink-faint dark:placeholder:text-tavern-faint outline-none focus:border-accent dark:focus:border-tavern-accent text-base transition-colors"
		/>
	</div>

	{#if results.length > 0}
		<p class="text-sm text-ink-muted dark:text-tavern-muted mt-4 mb-3">
			{results.length} {results.length === 1 ? 'result' : 'results'} for "{query}"
		</p>
		<div class="grid gap-3 sm:grid-cols-2">
			{#each results as result (result.id)}
				{@const note = notesById.get(result.id)}
				{#if note}
					<NoteCard {note} onclick={(id) => goto(resolve(`/notes/${id}`))} />
				{/if}
			{/each}
		</div>
	{:else if query.trim()}
		<div class="mt-12 text-center">
			<div class="text-3xl mb-3" aria-hidden="true">🔍</div>
			<p class="text-ink-muted dark:text-tavern-muted">No results for "{query}"</p>
			<p class="text-sm text-ink-faint dark:text-tavern-faint mt-1">Try different keywords or check spelling</p>
		</div>
	{:else}
		<div class="mt-12 text-center">
			<p class="text-ink-muted dark:text-tavern-muted">Type to search across all your notes</p>
			<p class="text-sm text-ink-faint dark:text-tavern-faint mt-1">
				Searches titles, content, and tags
			</p>
		</div>
	{/if}
</div>
