<script lang="ts">
	import { resolve } from '$app/paths';
	import { getStorage } from '$lib/platform/storage/index.js';
	import type { NoteId } from '$lib/types/note.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { playerModeState } from '$lib/state/player-mode.svelte.js';
	import { isNoteVisibleInPlayerMode } from '$lib/domain/visibility.js';

	interface Props {
		noteId: NoteId;
	}

	interface BacklinkOccurrence {
		key: string;
		sourceId: NoteId;
		sourceTitle: string;
		contextSnippet: string;
		position: number;
	}

	let { noteId }: Props = $props();
	let expanded = $state(false);
	let backlinks = $state<BacklinkOccurrence[]>([]);
	let loading = $state(false);

	$effect(() => {
		let cancelled = false;
		const currentNoteId = noteId;

		const loadBacklinks = async (): Promise<void> => {
			loading = true;
			try {
				const storage = getStorage();
				const links = await storage.getLinksTo(currentNoteId);
				const occurrences = links
					.map((link) => {
						const source = notesState.getNoteById(link.sourceId);
						if (!source) return null;
						if (playerModeState.enabled && !isNoteVisibleInPlayerMode(source)) return null;
						return {
							key: `${source.id}:${link.position}:${link.displayText}`,
							sourceId: source.id,
							sourceTitle: source.title,
							contextSnippet: link.contextSnippet ?? 'Linked reference in this note.',
							position: link.position,
						} satisfies BacklinkOccurrence;
					})
					.filter((entry): entry is BacklinkOccurrence => !!entry)
					.sort((a, b) => {
						const title = a.sourceTitle.localeCompare(b.sourceTitle, undefined, {
							sensitivity: 'base',
						});
						if (title !== 0) return title;
						return a.position - b.position;
					});
				if (!cancelled) {
					backlinks = occurrences;
				}
			} finally {
				if (!cancelled) {
					loading = false;
				}
			}
		};

		void loadBacklinks();
		return () => {
			cancelled = true;
		};
	});
</script>

{#if loading || backlinks.length > 0}
	<div class="max-w-content mx-auto mt-8 pt-4 border-t border-border dark:border-tavern-border">
		<button
			class="flex items-center gap-2 text-sm font-medium text-ink-muted dark:text-tavern-muted hover:text-ink dark:hover:text-tavern-text transition-colors"
			onclick={() => (expanded = !expanded)}
		>
			<span class="text-xs">{expanded ? '\u25BC' : '\u25B6'}</span>
			Backlinks ({backlinks.length})
		</button>

		{#if expanded}
			{#if loading}
				<p class="mt-2 text-xs text-ink-muted dark:text-tavern-muted">Loading backlinks...</p>
			{:else if backlinks.length === 0}
				<p class="mt-2 text-xs text-ink-muted dark:text-tavern-muted">No backlinks found.</p>
			{:else}
				<ul class="mt-3 space-y-2">
					{#each backlinks as backlink (backlink.key)}
						<li>
							<a
								href={resolve(`/notes/${backlink.sourceId}`)}
								class="text-sm font-medium text-accent dark:text-tavern-accent hover:text-accent-hover dark:hover:text-tavern-accent-hover underline underline-offset-2"
							>
								{backlink.sourceTitle}
							</a>
							<p class="mt-1 text-xs text-ink-muted dark:text-tavern-muted">
								{backlink.contextSnippet}
							</p>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
{/if}
