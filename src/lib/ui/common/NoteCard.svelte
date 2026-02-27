<script lang="ts">
	import type { Note, NoteId } from '$lib/types/note.js';
	import { formatRelativeDate } from '$lib/utils/date.js';

	interface Props {
		note: Note;
		onclick: (id: NoteId) => void;
	}

	let { note, onclick }: Props = $props();

	let preview = $derived(
		note.content
			.replace(/^---[\s\S]*?---\n?/, '')
			.replace(/^#{1,6}\s+.+$/m, '')
			.replace(/[#*_`~>!|]/g, '')
			.replaceAll('[', '')
			.replaceAll(']', '')
			.trim()
			.slice(0, 120)
			.trim(),
	);

	let filePath = $derived(
		note.filePath ??
			(note.folder === '/'
				? `${note.title}.md`
				: `${note.folder.replace(/^\//, '')}/${note.title}.md`),
	);

	let wordCount = $derived(note.content.trim().split(/\s+/).filter(Boolean).length);
</script>

<button
	class="w-full text-left p-4 rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface hover:border-accent/40 dark:hover:border-tavern-accent/40 hover:shadow-sm transition-all group"
	onclick={() => onclick(note.id)}
>
	<div class="flex items-start justify-between gap-2">
		<h3
			class="font-medium text-ink dark:text-tavern-text truncate group-hover:text-accent dark:group-hover:text-tavern-accent transition-colors"
		>
			{#if note.pinned}
				<svg
					class="w-3.5 h-3.5 inline-block mr-1 -mt-0.5 text-accent dark:text-tavern-accent"
					fill="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
					/>
				</svg>
			{/if}
			{note.title}
		</h3>
	</div>
	{#if preview}
		<p class="text-xs text-ink-muted dark:text-tavern-muted mt-1.5 line-clamp-2 leading-relaxed">
			{preview}
		</p>
	{/if}
	<div class="flex items-center gap-2 mt-2 text-xs text-ink-faint dark:text-tavern-faint">
		<span class="truncate font-mono">{filePath}</span>
		<span aria-hidden="true">&middot;</span>
		<span>{formatRelativeDate(note.updatedAt)}</span>
		<span aria-hidden="true">&middot;</span>
		<span>{wordCount} words</span>
	</div>
	{#if note.tags.length > 0}
		<div class="flex flex-wrap gap-1 mt-2">
			{#each note.tags.slice(0, 4) as tag (tag)}
				<span
					class="px-1.5 py-0.5 text-xs rounded-md bg-accent-subtle dark:bg-tavern-accent-subtle text-accent dark:text-tavern-accent"
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

<style>
	.line-clamp-2 {
		line-clamp: 2;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
