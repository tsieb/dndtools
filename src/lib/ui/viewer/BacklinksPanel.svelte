<script lang="ts">
	import { resolve } from '$app/paths';
	import type { NoteId } from '$lib/types/note.js';
	import { linksState } from '$lib/state/links.svelte.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { findBacklinkContextSnippet } from '$lib/domain/backlink-context.js';

	interface Props {
		noteId: NoteId;
	}

	let { noteId }: Props = $props();
	let expanded = $state(false);
	let notesById = $derived(notesState.noteById);

	let backlinks = $derived.by(() => {
		const sourceIds = linksState.getBacklinkIds(noteId);
		return sourceIds
			.map((id) => {
				const note = notesById.get(id as NoteId);
				if (!note) return null;
				return {
					id: note.id,
					title: note.title,
					contextSnippet:
						findBacklinkContextSnippet({
							sourceContent: note.content,
							targetId: noteId,
							resolveTitle: (title) => notesState.resolveTitle(title),
						}) ?? 'Linked reference in this note.',
				};
			})
			.filter((b): b is { id: NoteId; title: string; contextSnippet: string } => b !== null);
	});
</script>

{#if backlinks.length > 0}
	<div class="max-w-content mx-auto mt-8 pt-4 border-t border-border dark:border-tavern-border">
		<button
			class="flex items-center gap-2 text-sm font-medium text-ink-muted dark:text-tavern-muted hover:text-ink dark:hover:text-tavern-text transition-colors"
			onclick={() => (expanded = !expanded)}
		>
			<span class="text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
			Backlinks ({backlinks.length})
		</button>

		{#if expanded}
			<ul class="mt-3 space-y-2">
				{#each backlinks as backlink (backlink.id)}
					<li>
						<a
							href={resolve(`/notes/${backlink.id}`)}
							class="text-sm font-medium text-accent dark:text-tavern-accent hover:text-accent-hover dark:hover:text-tavern-accent-hover underline underline-offset-2"
						>
							{backlink.title}
						</a>
						<p class="mt-1 text-xs text-ink-muted dark:text-tavern-muted">
							{backlink.contextSnippet}
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
