<script lang="ts">
	import { goto } from '$app/navigation';
	import { renderMarkdown } from '$lib/markdown/pipeline.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import type { Note } from '$lib/types/note.js';
	import type { SessionBoardTile } from '$lib/types/session-board.js';

	interface Props {
		note: Note;
		tile: SessionBoardTile;
		selected?: boolean;
		editable?: boolean;
		scrollable?: boolean;
		tintColor?: string;
		tintOpacity?: number;
		onopen: () => void;
		onselect: () => void;
		ondragstart: (event: PointerEvent) => void;
	}

	let {
		note,
		tile,
		selected = false,
		editable = false,
		scrollable = false,
		tintColor = '#7c3aed',
		tintOpacity = 0,
		onopen,
		onselect,
		ondragstart,
	}: Props = $props();
	let html = $state('');
	let contentEl = $state<HTMLDivElement | null>(null);

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

	function handleMarkdownClick(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		const link = target.closest('a');
		if (!link) return;
		const href = link.getAttribute('href');
		if (href?.startsWith('/')) {
			event.preventDefault();
			void goto(href);
		}
	}

	$effect(() => {
		if (!contentEl) return;
		const element = contentEl;
		element.addEventListener('click', handleMarkdownClick);
		return () => {
			element.removeEventListener('click', handleMarkdownClick);
		};
	});
</script>

<div
	class="relative rounded-lg border bg-surface/95 dark:bg-tavern-surface/95 shadow-sm backdrop-blur-sm flex flex-col h-full transition-[border-color,box-shadow] duration-150 cursor-pointer hover:shadow-md {selected
		? 'border-accent dark:border-tavern-accent ring-2 ring-accent/30 dark:ring-tavern-accent/30'
		: 'border-border dark:border-tavern-border'}"
	style="background-color: {tile.style?.backgroundColor ?? ''}; border-color: {tile.style?.borderColor ?? ''}; border-width: {tile.style?.borderWidth ? `${tile.style.borderWidth}px` : ''}; border-radius: {tile.style?.borderRadius ? `${tile.style.borderRadius}px` : ''}; opacity: {tile.style?.opacity ?? 1}; transform-origin: top left; transform: scale({tile.style?.scale ?? 1});"
	role="button"
	tabindex="0"
	aria-label={`Session board tile: ${note.title}`}
	aria-pressed={selected}
	title={selected ? `Selected tile: ${note.title}` : `Select tile: ${note.title}`}
	data-board-tile="true"
	onclick={(event) => {
		const target = event.target as HTMLElement;
		if (target.closest('a,button,input,textarea,select,label')) return;
		onselect();
	}}
	onkeydown={(event) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onselect();
		}
	}}
	onpointerdown={(event) => {
		if (event.button !== 0) return;
		const target = event.target as HTMLElement;
		if (target.closest('a,button,input,textarea,select,label')) return;
		onselect();
		if (editable) {
			ondragstart(event);
		}
	}}
>
	{#if tintOpacity > 0}
		<div
			class="pointer-events-none absolute inset-0 rounded-[inherit]"
			style="background-color: {tintColor}; opacity: {Math.max(0, Math.min(0.75, tintOpacity))};"
		></div>
	{/if}
	<header class="px-3 py-2 border-b border-border dark:border-tavern-border flex items-center gap-2">
		<button
			type="button"
			class="text-left truncate flex-1 font-medium text-sm text-ink dark:text-tavern-text hover:text-accent dark:hover:text-tavern-accent transition-colors"
			onclick={onopen}
			title="Open enlarged view"
			aria-label={`Open enlarged view for ${note.title}`}
		>
			{note.title}
		</button>
		{#if editable}
			<span class="text-[11px] px-2 py-0.5 rounded border border-border dark:border-tavern-border text-ink-faint dark:text-tavern-faint">
				Drag to move
			</span>
		{/if}
	</header>
	<div class="relative p-3 flex-1 min-h-0 {scrollable ? 'overflow-y-auto' : 'overflow-hidden'}">
		<div
			class="markdown-content text-sm leading-relaxed"
			role="document"
			bind:this={contentEl}
		>
			<!-- Content is sanitized by renderMarkdown before injecting HTML. -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html html}
		</div>
		{#if editable && !scrollable}
			<div class="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface/95 dark:from-tavern-surface/95 to-transparent"></div>
			<div class="pointer-events-none absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded border border-border/60 bg-surface/90 dark:bg-tavern-surface/90 text-ink-faint dark:text-tavern-faint">
				Select to scroll
			</div>
		{/if}
	</div>
</div>
