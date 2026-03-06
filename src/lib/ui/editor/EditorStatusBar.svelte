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
	let showSavingIndicator = $state(false);
	let savingIndicatorTimer = $state<ReturnType<typeof setTimeout> | null>(null);

	$effect(() => {
		if (editorState.saving) {
			if (showSavingIndicator || savingIndicatorTimer) return;
			savingIndicatorTimer = setTimeout(() => {
				showSavingIndicator = true;
				savingIndicatorTimer = null;
			}, 300);
			return;
		}
		if (savingIndicatorTimer) {
			clearTimeout(savingIndicatorTimer);
			savingIndicatorTimer = null;
		}
		showSavingIndicator = false;
	});

	$effect(() => {
		return () => {
			if (savingIndicatorTimer) clearTimeout(savingIndicatorTimer);
		};
	});

	let saveStatus = $derived.by(() => {
		if (editorState.saving && showSavingIndicator) return 'Saving...';
		if (editorState.dirty) return 'Unsaved changes';
		if (editorState.lastSaved) return `Saved ${formatRelativeDate(editorState.lastSaved)}`;
		return 'Saved';
	});
</script>

<div
	class="flex items-center justify-between px-3 py-1.5 text-xs text-ink-muted border border-t-0 border-border bg-surface-alt rounded-b-lg"
>
	<span class="flex items-center gap-1.5 {editorState.dirty ? 'text-warning' : 'text-success'}">
		{#if editorState.saving && showSavingIndicator}
			<span class="inline-block w-2 h-2 rounded-full bg-warning animate-pulse"></span>
		{:else if editorState.dirty}
			<span class="inline-block w-2 h-2 rounded-full bg-warning"></span>
		{:else}
			<span class="inline-block w-2 h-2 rounded-full bg-success"></span>
		{/if}
		{saveStatus}
	</span>
	<span class="flex items-center gap-3">
		<span>{wordCount} words</span>
		<span>{charCount} chars</span>
		<span>{readingTime} min read</span>
	</span>
</div>
