<script lang="ts">
	import { notesState } from '$lib/stores/notes.svelte.js';
	import NoteCard from '$lib/components/common/NoteCard.svelte';
	import Button from '$lib/components/common/Button.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let sortField = $state<'updatedAt' | 'title' | 'createdAt'>('updatedAt');
	let sortDir = $state<'asc' | 'desc'>('desc');

	let tagFilter = $derived(page.url.searchParams.get('tag'));
	let createTitle = $derived(page.url.searchParams.get('create'));

	let filteredNotes = $derived.by(() => {
		let notes = notesState.activeNotes;

		if (tagFilter) {
			notes = notes.filter((n) => n.tags.includes(tagFilter!));
		}

		return notes.sort((a, b) => {
			const aVal = a[sortField];
			const bVal = b[sortField];
			const cmp = String(aVal).localeCompare(String(bVal));
			return sortDir === 'asc' ? cmp : -cmp;
		});
	});

	async function handleNewNote(): Promise<void> {
		const title = createTitle ?? undefined;
		const note = await notesState.createNote(title ? { title } : undefined);
		goto(`/notes/${note.id}/edit`);
	}

	$effect(() => {
		if (createTitle) {
			handleNewNote();
		}
	});
</script>

<div class="p-6 max-w-content mx-auto">
	<div class="flex items-center justify-between mb-6">
		<div>
			<h1 class="text-2xl font-bold text-ink dark:text-tavern-text">
				{#if tagFilter}
					Notes tagged "{tagFilter}"
				{:else}
					All Notes
				{/if}
			</h1>
			<p class="text-sm text-ink-muted dark:text-tavern-muted mt-1">
				{filteredNotes.length} notes
			</p>
		</div>
		<Button variant="primary" onclick={handleNewNote}>New Note</Button>
	</div>

	<div class="flex items-center gap-2 mb-4 text-sm">
		<span class="text-ink-muted dark:text-tavern-muted">Sort:</span>
		<select
			bind:value={sortField}
			class="bg-surface dark:bg-tavern-surface border border-border dark:border-tavern-border rounded px-2 py-1 text-sm text-ink dark:text-tavern-text"
		>
			<option value="updatedAt">Last modified</option>
			<option value="createdAt">Created</option>
			<option value="title">Title</option>
		</select>
		<button
			class="px-2 py-1 rounded border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface text-ink-muted dark:text-tavern-muted hover:bg-surface-alt dark:hover:bg-tavern-surface-alt"
			onclick={() => (sortDir = sortDir === 'asc' ? 'desc' : 'asc')}
			title="Toggle sort direction"
		>
			{sortDir === 'asc' ? '\u2191' : '\u2193'}
		</button>
		{#if tagFilter}
			<a
				href="/notes"
				class="ml-2 px-2 py-1 rounded bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent text-xs"
			>
				Clear filter
			</a>
		{/if}
	</div>

	{#if filteredNotes.length > 0}
		<div class="grid gap-3">
			{#each filteredNotes as note (note.id)}
				<NoteCard {note} onclick={(id) => goto(`/notes/${id}`)} />
			{/each}
		</div>
	{:else}
		<div class="text-center py-12 text-ink-muted dark:text-tavern-muted">
			<p class="mb-4">No notes yet.</p>
			<Button variant="primary" onclick={handleNewNote}>Create your first note</Button>
		</div>
	{/if}
</div>
