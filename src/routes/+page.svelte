<script lang="ts">
	import { notesState } from '$lib/state/notes.svelte.js';
	import { vaultState } from '$lib/state/vault.svelte.js';
	import { linksState } from '$lib/state/links.svelte.js';
	import FirstRunChecklist from '$lib/ui/onboarding/FirstRunChecklist.svelte';
	import NoteCard from '$lib/ui/common/NoteCard.svelte';
	import Button from '$lib/ui/common/Button.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let recentNotes = $derived(
		[...notesState.activeNotes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
	);

	let pinnedNotes = $derived(notesState.pinnedNotes);

	let linkCount = $derived.by(() => {
		let count = 0;
		for (const note of notesState.activeNotes) {
			count += linksState.getForwardLinkCount(note.id);
		}
		return count;
	});

	async function handleNewNote(): Promise<void> {
		const note = await notesState.createNote();
		goto(resolve(`/notes/${note.id}/edit`));
	}
</script>

<div class="p-6 max-w-content mx-auto">
	<FirstRunChecklist />

	{#if notesState.activeNotes.length === 0}
		<div class="text-center py-16">
			<div class="text-5xl mb-4" aria-hidden="true">🎲</div>
			<h1
				class="text-3xl font-bold text-ink dark:text-tavern-text mb-3"
				style="font-family: var(--font-serif)"
			>
				Welcome, Dungeon Master
			</h1>
			<p class="text-ink-muted dark:text-tavern-muted mb-8 max-w-md mx-auto leading-relaxed">
				Start building your campaign knowledge base. Create notes for NPCs, locations, quests, and
				more — then connect them with [[wikilinks]].
			</p>
			<div class="flex items-center justify-center gap-3">
				<Button variant="primary" size="lg" onclick={handleNewNote}>Create Your First Note</Button>
				<a
					href={resolve('/settings')}
					class="text-sm text-ink-muted dark:text-tavern-muted hover:text-accent dark:hover:text-tavern-accent transition-colors"
				>
					or explore settings
				</a>
			</div>
		</div>
	{:else}
		<!-- Header with vault stats -->
		<div class="mb-8">
			<h1
				class="text-2xl font-bold text-ink dark:text-tavern-text"
				style="font-family: var(--font-serif)"
			>
				Your Vault
			</h1>
			<div class="grid grid-cols-3 gap-3 mt-4">
				<a
					href={resolve('/notes')}
					class="p-3 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface hover:border-accent/40 dark:hover:border-tavern-accent/40 transition-all group"
				>
					<div class="text-2xl font-bold text-accent dark:text-tavern-accent">
						{vaultState.noteCount}
					</div>
					<div
						class="text-xs text-ink-muted dark:text-tavern-muted group-hover:text-ink dark:group-hover:text-tavern-text transition-colors"
					>
						Notes
					</div>
				</a>
				<div
					class="p-3 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
				>
					<div class="text-2xl font-bold text-accent dark:text-tavern-accent">
						{vaultState.tagCounts.length}
					</div>
					<div class="text-xs text-ink-muted dark:text-tavern-muted">Tags</div>
				</div>
				<div
					class="p-3 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
				>
					<div class="text-2xl font-bold text-accent dark:text-tavern-accent">{linkCount}</div>
					<div class="text-xs text-ink-muted dark:text-tavern-muted">Links</div>
				</div>
			</div>
		</div>

		<!-- Pinned Notes -->
		{#if pinnedNotes.length > 0}
			<section class="mb-8">
				<div class="flex items-center gap-2 mb-4">
					<svg
						class="w-4 h-4 text-accent dark:text-tavern-accent"
						fill="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
						/>
					</svg>
					<h2 class="text-lg font-semibold text-ink dark:text-tavern-text">Pinned</h2>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each pinnedNotes as note (note.id)}
						<NoteCard {note} onclick={(id) => goto(resolve(`/notes/${id}`))} />
					{/each}
				</div>
			</section>
		{/if}

		<!-- Recent Notes -->
		<section>
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text">Recent Notes</h2>
				<a
					href={resolve('/notes')}
					class="text-sm text-accent dark:text-tavern-accent hover:text-accent-hover dark:hover:text-tavern-accent-hover transition-colors"
				>
					View all &rarr;
				</a>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each recentNotes as note (note.id)}
					<NoteCard {note} onclick={(id) => goto(resolve(`/notes/${id}`))} />
				{/each}
			</div>
		</section>
	{/if}
</div>
