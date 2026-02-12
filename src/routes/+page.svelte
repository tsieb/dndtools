<script lang="ts">
	import { notesState } from '$lib/stores/notes.svelte.js';
	import { vaultState } from '$lib/stores/vault.svelte.js';
	import NoteCard from '$lib/components/common/NoteCard.svelte';
	import Button from '$lib/components/common/Button.svelte';
	import { goto } from '$app/navigation';

	let recentNotes = $derived(
		notesState.activeNotes
			.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
			.slice(0, 6),
	);

	async function handleNewNote(): Promise<void> {
		const note = await notesState.createNote();
		goto(`/notes/${note.id}/edit`);
	}
</script>

<div class="p-6 max-w-content mx-auto">
	{#if notesState.activeNotes.length === 0}
		<div class="text-center py-16">
			<h1 class="text-2xl font-bold text-ink dark:text-tavern-text mb-2">
				Welcome, Dungeon Master
			</h1>
			<p class="text-ink-muted dark:text-tavern-muted mb-6 max-w-md mx-auto">
				Start building your campaign knowledge base. Create notes for NPCs, locations, quests, and
				more — then connect them with wikilinks.
			</p>
			<Button variant="primary" size="lg" onclick={handleNewNote}>
				Create Your First Note
			</Button>
		</div>
	{:else}
		<div class="mb-8">
			<h1 class="text-2xl font-bold text-ink dark:text-tavern-text">Your Vault</h1>
			<div class="flex gap-4 mt-3 text-sm text-ink-muted dark:text-tavern-muted">
				<span>{vaultState.noteCount} notes</span>
				<span>{vaultState.tagCounts.length} tags</span>
			</div>
		</div>

		<section>
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text">Recent Notes</h2>
				<a
					href="/notes"
					class="text-sm text-accent dark:text-tavern-accent hover:text-accent-hover dark:hover:text-tavern-accent-hover"
				>
					View all
				</a>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each recentNotes as note (note.id)}
					<NoteCard {note} onclick={(id) => goto(`/notes/${id}`)} />
				{/each}
			</div>
		</section>
	{/if}
</div>
