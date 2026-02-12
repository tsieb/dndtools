<script lang="ts">
	import { searchService, type SearchResult } from '$lib/services/search.js';
	import { notesState } from '$lib/stores/notes.svelte.js';
	import NoteCard from '$lib/components/common/NoteCard.svelte';
	import { goto } from '$app/navigation';
	import type { NoteId } from '$lib/types/note.js';

	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	function handleInput(event: Event): void {
		query = (event.target as HTMLInputElement).value;
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			results = query.trim() ? searchService.search(query) : [];
		}, 200);
	}

	function getNote(id: NoteId) {
		return notesState.notes.find((n) => n.id === id);
	}
</script>

<div class="p-6 max-w-content mx-auto">
	<h1 class="text-2xl font-bold text-ink dark:text-tavern-text mb-4">Search</h1>

	<input
		type="text"
		value={query}
		oninput={handleInput}
		placeholder="Search notes..."
		class="w-full px-4 py-3 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-ink dark:text-tavern-text placeholder:text-ink-faint dark:placeholder:text-tavern-faint outline-none focus:border-accent dark:focus:border-tavern-accent text-base"
	/>

	{#if results.length > 0}
		<div class="mt-6 grid gap-3">
			{#each results as result}
				{@const note = getNote(result.id)}
				{#if note}
					<NoteCard {note} onclick={(id) => goto(`/notes/${id}`)} />
				{/if}
			{/each}
		</div>
	{:else if query.trim()}
		<div class="mt-8 text-center text-ink-muted dark:text-tavern-muted">
			<p>No results for "{query}"</p>
		</div>
	{:else}
		<div class="mt-8 text-center text-ink-muted dark:text-tavern-muted">
			<p>Type to search across all your notes</p>
			<p class="text-sm mt-1">Tip: Use Ctrl+P for quick switcher</p>
		</div>
	{/if}
</div>
