<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { linksState } from '$lib/state/links.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { buildRelatedNoteJumps } from '$lib/domain/related-note-jumps.js';
	import { createNoteId, type NoteId } from '$lib/types/note.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';

	interface Props {
		noteId: NoteId;
	}

	let { noteId }: Props = $props();
	let note = $derived(notesState.getNoteById(noteId));
	let modeScopedNotes = $derived.by(() =>
		playerModeState.enabled
			? notesState.activeNotes.filter((entry) => isNoteVisibleInPlayerMode(entry))
			: notesState.activeNotes,
	);
	let jumpSet = $derived.by(() => {
		if (!note) {
			return { sameTags: [], backlinks: [], sameObjectReferences: [] };
		}
		if (playerModeState.enabled && !isNoteVisibleInPlayerMode(note)) {
			return { sameTags: [], backlinks: [], sameObjectReferences: [] };
		}
		return buildRelatedNoteJumps({
			note,
			notes: modeScopedNotes,
			backlinkIds: linksState
				.getBacklinkIds(noteId)
				.map((id) => createNoteId(id))
				.filter((id) => {
					if (!playerModeState.enabled) return true;
					const target = notesState.getActiveNoteById(id);
					return !!target && isNoteVisibleInPlayerMode(target);
				}),
			limitPerSection: 4,
		});
	});
	let hasAny = $derived(
		jumpSet.sameTags.length > 0 ||
			jumpSet.backlinks.length > 0 ||
			jumpSet.sameObjectReferences.length > 0,
	);

	function openNote(id: NoteId): void {
		goto(resolve(`/notes/${id}`));
	}
</script>

{#if hasAny}
	<section
		class="max-w-content mx-auto mt-4 mb-4 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-3"
		aria-label="Quick jump to related notes"
	>
		<h2 class="text-sm font-semibold text-ink dark:text-tavern-text mb-2">Quick Jumps</h2>

		{#if jumpSet.sameTags.length > 0}
			<div class="mb-2">
				<p class="text-[11px] uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1">
					Same Tags
				</p>
				<div class="flex flex-wrap gap-1.5">
					{#each jumpSet.sameTags as jump (jump.noteId)}
						<button
							class="px-2 py-1 rounded-md text-xs bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent hover:bg-accent/20 dark:hover:bg-tavern-accent/20 transition-colors"
							onclick={() => openNote(jump.noteId)}
							title={jump.reason}
						>
							{jump.title}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if jumpSet.backlinks.length > 0}
			<div class="mb-2">
				<p class="text-[11px] uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1">
					Backlinks
				</p>
				<div class="flex flex-wrap gap-1.5">
					{#each jumpSet.backlinks as jump (jump.noteId)}
						<button
							class="px-2 py-1 rounded-md text-xs bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted hover:text-ink dark:hover:text-tavern-text transition-colors"
							onclick={() => openNote(jump.noteId)}
							title={jump.reason}
						>
							{jump.title}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if jumpSet.sameObjectReferences.length > 0}
			<div>
				<p class="text-[11px] uppercase tracking-wider text-ink-faint dark:text-tavern-faint mb-1">
					Shared Object References
				</p>
				<div class="flex flex-wrap gap-1.5">
					{#each jumpSet.sameObjectReferences as jump (jump.noteId)}
						<button
							class="px-2 py-1 rounded-md text-xs bg-surface-alt dark:bg-tavern-surface-alt text-ink-muted dark:text-tavern-muted hover:text-ink dark:hover:text-tavern-text transition-colors"
							onclick={() => openNote(jump.noteId)}
							title={jump.reason}
						>
							{jump.title}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</section>
{/if}
