<script lang="ts">
	import type { Note } from '$lib/types/note.js';
	import { renderMarkdown } from '$lib/markdown/pipeline.js';
	import { notesState } from '$lib/stores/notes.svelte.js';
	import { goto } from '$app/navigation';

	interface Props {
		note: Note;
	}

	let { note }: Props = $props();
	let html = $state('');

	$effect(() => {
		renderMarkdown(note.content, {
			resolveLink: (title) => {
				const targetId = notesState.resolveTitle(title);
				return targetId
					? { href: `/notes/${targetId}`, exists: true }
					: { href: `/notes?create=${encodeURIComponent(title)}`, exists: false };
			},
		}).then((result) => {
			html = result;
		});
	});

	function handleClick(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		const link = target.closest('a');
		if (!link) return;

		const href = link.getAttribute('href');
		if (href && href.startsWith('/')) {
			event.preventDefault();
			goto(href);
		}
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
<div class="markdown-content max-w-content mx-auto" role="document" onclick={handleClick}>
	{@html html}
</div>
