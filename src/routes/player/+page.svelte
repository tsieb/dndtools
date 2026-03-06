<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import NoteCard from '$lib/ui/common/NoteCard.svelte';
	import PlayerHandoutInbox from '$lib/ui/player/PlayerHandoutInbox.svelte';

	let query = $state('');
	let normalizedQuery = $derived(query.trim().toLowerCase());

	let visibleNotes = $derived.by(() =>
		notesState.activeNotes.filter((note) => isNoteVisibleInPlayerMode(note)),
	);

	let filteredNotes = $derived.by(() => {
		if (!normalizedQuery) {
			return [...visibleNotes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
		}
		return visibleNotes
			.filter((note) => {
				const haystack = [note.title, note.content, note.tags.join(' '), String(note.folder)]
					.join(' ')
					.toLowerCase();
				return haystack.includes(normalizedQuery);
			})
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	});

	$effect(() => {
		if (!playerModeState.enabled) {
			void playerModeState.setEnabled(true);
		}
	});

	async function exitPlayerMode(): Promise<void> {
		await playerModeState.setEnabled(false);
		goto(resolve('/knowledge/notes'));
	}
</script>

<div class="p-6 max-w-content mx-auto">
	<div class="mb-5 flex items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold text-ink" style="font-family: var(--font-serif)">
				Player Screen
			</h1>
			<p class="text-sm text-ink-muted mt-1">Showing shared and public notes only.</p>
		</div>
		<button
			type="button"
			class="rounded-md border border-border px-3 py-1.5 text-sm text-ink-muted hover:bg-surface-alt"
			onclick={() => void exitPlayerMode()}
		>
			Exit Player Mode
		</button>
	</div>

	<div class="mb-4">
		<PlayerHandoutInbox />
	</div>

	<div class="mb-4">
		<input
			type="text"
			bind:value={query}
			placeholder="Search visible notes"
			class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
		/>
	</div>

	{#if filteredNotes.length === 0}
		<div class="rounded-lg border border-border bg-surface p-5 text-center">
			<p class="text-sm text-ink-muted">
				{normalizedQuery
					? 'No player-visible notes match your search.'
					: 'No shared or public notes are available.'}
			</p>
		</div>
	{:else}
		<div class="grid gap-3 sm:grid-cols-2">
			{#each filteredNotes as note (note.id)}
				<NoteCard {note} onclick={(id) => goto(resolve(`/knowledge/notes/${id}`))} />
			{/each}
		</div>
	{/if}
</div>
