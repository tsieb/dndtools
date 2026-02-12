<script lang="ts">
	import { editorState } from '$lib/stores/editor.svelte.js';
	import { formatRelativeDate } from '$lib/utils/date.js';

	let wordCount = $derived(
		editorState.content
			.trim()
			.split(/\s+/)
			.filter((w) => w.length > 0).length,
	);

	let charCount = $derived(editorState.content.length);

	let saveStatus = $derived.by(() => {
		if (editorState.saving) return 'Saving...';
		if (editorState.dirty) return 'Unsaved changes';
		if (editorState.lastSaved) return `Saved ${formatRelativeDate(editorState.lastSaved)}`;
		return 'Saved';
	});
</script>

<div
	class="flex items-center justify-between px-3 py-1.5 text-xs text-ink-muted dark:text-tavern-muted border-t border-border dark:border-tavern-border bg-surface-alt dark:bg-tavern-surface-alt rounded-b-lg"
>
	<span
		class={editorState.dirty
			? 'text-warning dark:text-tavern-warning'
			: 'text-success dark:text-tavern-success'}
	>
		{saveStatus}
	</span>
	<span>
		{wordCount} words · {charCount} chars
	</span>
</div>
