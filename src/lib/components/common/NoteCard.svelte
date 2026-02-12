<script lang="ts">
	import type { Note, NoteId } from '$lib/types/note.js';
	import { formatRelativeDate } from '$lib/utils/date.js';

	interface Props {
		note: Note;
		onclick: (id: NoteId) => void;
	}

	let { note, onclick }: Props = $props();
</script>

<button
	class="w-full text-left p-3 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface hover:bg-surface-alt dark:hover:bg-tavern-surface-alt transition-colors group"
	onclick={() => onclick(note.id)}
>
	<h3
		class="font-medium text-ink dark:text-tavern-text truncate group-hover:text-accent dark:group-hover:text-tavern-accent"
	>
		{note.title}
	</h3>
	<div class="flex items-center gap-2 mt-1 text-xs text-ink-muted dark:text-tavern-muted">
		{#if note.folder !== '/'}
			<span class="truncate">{note.folder}</span>
			<span>·</span>
		{/if}
		<span>{formatRelativeDate(note.updatedAt)}</span>
	</div>
	{#if note.tags.length > 0}
		<div class="flex flex-wrap gap-1 mt-2">
			{#each note.tags.slice(0, 4) as tag}
				<span
					class="px-1.5 py-0.5 text-xs rounded bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent"
				>
					{tag}
				</span>
			{/each}
			{#if note.tags.length > 4}
				<span class="text-xs text-ink-faint dark:text-tavern-faint">+{note.tags.length - 4}</span>
			{/if}
		</div>
	{/if}
</button>
