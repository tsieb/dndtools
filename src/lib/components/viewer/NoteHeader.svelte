<script lang="ts">
	import type { Note, NoteId } from '$lib/types/note.js';
	import { formatRelativeDate } from '$lib/utils/date.js';
	import Button from '$lib/components/common/Button.svelte';

	interface Props {
		note: Note;
		onedit: () => void;
		ondelete: () => void;
	}

	let { note, onedit, ondelete }: Props = $props();
</script>

<div class="max-w-content mx-auto mb-6">
	<div class="flex items-start justify-between gap-4">
		<div class="min-w-0 flex-1">
			<h1 class="text-2xl font-bold text-ink dark:text-tavern-text break-words">
				{note.title}
			</h1>
			<div class="flex items-center gap-2 mt-1 text-sm text-ink-muted dark:text-tavern-muted">
				{#if note.folder !== '/'}
					<span>{note.folder}</span>
					<span>·</span>
				{/if}
				<span>Edited {formatRelativeDate(note.updatedAt)}</span>
			</div>
		</div>
		<div class="flex items-center gap-1 shrink-0">
			<Button variant="primary" size="sm" onclick={onedit}>Edit</Button>
			<Button variant="ghost" size="sm" onclick={ondelete} title="Delete note">
				<svg
					class="w-4 h-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
					/>
				</svg>
			</Button>
		</div>
	</div>

	{#if note.tags.length > 0}
		<div class="flex flex-wrap gap-1.5 mt-3">
			{#each note.tags as tag}
				<a
					href="/notes?tag={encodeURIComponent(tag)}"
					class="px-2 py-0.5 text-xs rounded-full bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent hover:bg-accent/20 transition-colors"
				>
					#{tag}
				</a>
			{/each}
		</div>
	{/if}
</div>
