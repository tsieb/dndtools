<script lang="ts">
	import { editorState } from '$lib/state/editor.svelte.js';
	import { formatRelativeDate } from '$lib/utils/date.js';

	let wordCount = $derived(
		editorState.content
			.trim()
			.split(/\s+/)
			.filter((w) => w.length > 0).length,
	);

	let charCount = $derived(editorState.content.length);

	let readingTime = $derived(Math.max(1, Math.ceil(wordCount / 200)));

	let saveStatus = $derived.by(() => {
		if (editorState.saving) return 'Saving...';
		if (editorState.dirty) return 'Unsaved changes';
		if (editorState.lastSaved) return `Saved ${formatRelativeDate(editorState.lastSaved)}`;
		return 'Saved';
	});
</script>

<div
	class="flex items-center justify-between px-3 py-1.5 text-xs text-ink-muted dark:text-tavern-muted border border-t-0 border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt rounded-b-lg"
>
	<span
		class="flex items-center gap-1.5 {editorState.dirty
			? 'text-warning dark:text-tavern-warning'
			: 'text-success dark:text-tavern-success'}"
	>
		{#if editorState.saving}
			<span class="inline-block w-2 h-2 rounded-full bg-warning dark:bg-tavern-warning animate-pulse"></span>
		{:else if editorState.dirty}
			<span class="inline-block w-2 h-2 rounded-full bg-warning dark:bg-tavern-warning"></span>
		{:else}
			<span class="inline-block w-2 h-2 rounded-full bg-success dark:bg-tavern-success"></span>
		{/if}
		{saveStatus}
	</span>
	<span class="flex items-center gap-3">
		<span>{wordCount} words</span>
		<span>{charCount} chars</span>
		<span>{readingTime} min read</span>
	</span>
</div>
