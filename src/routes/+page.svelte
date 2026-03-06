<script lang="ts">
	import { notesState } from '$lib/state/notes.svelte.js';
	import { vaultState } from '$lib/state/vault.svelte.js';
	import { linksState } from '$lib/state/links.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';
	import FirstRunChecklist from '$lib/ui/onboarding/FirstRunChecklist.svelte';
	import NoteCard from '$lib/ui/common/NoteCard.svelte';
	import Button from '$lib/ui/common/Button.svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	let modeScopedActiveNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.activeNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.activeNotes,
	);
	let modeScopedPinnedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.pinnedNotes.filter((note) => isNoteVisibleInPlayerMode(note))
			: notesState.pinnedNotes,
	);

	let recentNotes = $derived(
		[...modeScopedActiveNotes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6),
	);

	let pinnedNotes = $derived(modeScopedPinnedNotes);
	let noteCount = $derived(modeScopedActiveNotes.length);
	let tagCount = $derived.by(() => {
		if (!playerModeState.enabled) return vaultState.tagCounts.length;
		const tags: Record<string, true> = {};
		for (const note of modeScopedActiveNotes) {
			for (const tag of note.tags) tags[tag] = true;
		}
		return Object.keys(tags).length;
	});

	let linkCount = $derived.by(() => {
		let count = 0;
		for (const note of modeScopedActiveNotes) {
			count += linksState.getForwardLinkCount(note.id);
		}
		return count;
	});

	async function handleNewNote(): Promise<void> {
		const note = await notesState.createNote();
		goto(resolve(`/knowledge/notes/${note.id}/edit`));
	}
</script>

<div class="p-6 max-w-content mx-auto">
	<FirstRunChecklist />

	{#if modeScopedActiveNotes.length === 0}
		<div class="text-center py-16">
			<h1
				class="text-3xl font-bold text-ink dark:text-tavern-text mb-3"
				style="font-family: var(--font-serif)"
			>
				{playerModeState.enabled ? 'Player Screen' : 'Welcome, Dungeon Master'}
			</h1>
			<p class="text-ink-muted dark:text-tavern-muted mb-8 max-w-md mx-auto leading-relaxed">
				{playerModeState.enabled
					? 'No shared or public notes are available yet.'
					: 'Start building your campaign knowledge base. Create notes for NPCs, locations, quests, and more, then connect them with [[wikilinks]].'}
			</p>
			{#if !playerModeState.enabled}
				<div class="flex items-center justify-center gap-3">
					<Button variant="primary" size="lg" onclick={handleNewNote}>Create Your First Note</Button
					>
					<a
						href={resolve('/settings')}
						class="text-sm text-ink-muted dark:text-tavern-muted hover:text-accent dark:hover:text-tavern-accent transition-colors"
					>
						or explore settings
					</a>
				</div>
			{/if}
		</div>
	{:else}
		<div class="mb-8">
			<h1
				class="text-2xl font-bold text-ink dark:text-tavern-text"
				style="font-family: var(--font-serif)"
			>
				{playerModeState.enabled ? 'Player Screen' : 'Your Vault'}
			</h1>
			<div class="grid grid-cols-3 gap-3 mt-4">
				<a
					href={resolve('/knowledge/notes')}
					class="p-3 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface hover:border-accent/40 dark:hover:border-tavern-accent/40 transition-all group"
				>
					<div class="text-2xl font-bold text-accent dark:text-tavern-accent">{noteCount}</div>
					<div
						class="text-xs text-ink-muted dark:text-tavern-muted group-hover:text-ink dark:group-hover:text-tavern-text transition-colors"
					>
						Notes
					</div>
				</a>
				<div
					class="p-3 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface"
				>
					<div class="text-2xl font-bold text-accent dark:text-tavern-accent">{tagCount}</div>
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

		{#if pinnedNotes.length > 0}
			<section class="mb-8">
				<div class="flex items-center gap-2 mb-4">
					<h2 class="text-lg font-semibold text-ink dark:text-tavern-text">Pinned</h2>
				</div>
				<div class="grid gap-3 sm:grid-cols-2">
					{#each pinnedNotes as note (note.id)}
						<NoteCard {note} onclick={(id) => goto(resolve(`/knowledge/notes/${id}`))} />
					{/each}
				</div>
			</section>
		{/if}

		<section>
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold text-ink dark:text-tavern-text">Recent Notes</h2>
				<a
					href={resolve('/knowledge/notes')}
					class="text-sm text-accent dark:text-tavern-accent hover:text-accent-hover dark:hover:text-tavern-accent-hover transition-colors"
				>
					View all &rarr;
				</a>
			</div>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each recentNotes as note (note.id)}
					<NoteCard {note} onclick={(id) => goto(resolve(`/knowledge/notes/${id}`))} />
				{/each}
			</div>
		</section>
	{/if}
</div>
