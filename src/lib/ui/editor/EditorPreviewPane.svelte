<script lang="ts">
	import { goto } from '$app/navigation';
	import { notesState } from '$lib/state/notes.svelte.js';
	import { renderMarkdown } from '$lib/markdown/pipeline.js';

	interface Props {
		content: string;
		oncontainerready?: (container: HTMLDivElement) => void;
	}

	let { content, oncontainerready }: Props = $props();
	let html = $state('');
	let container = $state<HTMLDivElement | null>(null);

	$effect(() => {
		let cancelled = false;
		void renderMarkdown(content, {
			resolveLink: (title) => {
				const targetId = notesState.resolveTitleStrict(title);
				return targetId
					? { href: `/notes/${targetId}`, exists: true }
					: { href: `/notes?create=${encodeURIComponent(title)}`, exists: false };
			},
			currentNoteId: '',
		})
			.then((result) => {
				if (!cancelled) {
					html = result;
				}
			})
			.catch(() => {
				if (!cancelled) {
					html = '<p>Unable to render preview.</p>';
				}
			});
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		if (!container) return;
		oncontainerready?.(container);
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

	$effect(() => {
		if (!container) return;
		const element = container;
		element.addEventListener('click', handleClick);
		return () => {
			element.removeEventListener('click', handleClick);
		};
	});
</script>

<div
	bind:this={container}
	class="h-full overflow-auto rounded-lg border border-border dark:border-tavern-border bg-surface dark:bg-tavern-surface p-4"
	aria-label="Markdown preview"
>
	<div class="markdown-content max-w-none" role="document">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html html}
	</div>
</div>
