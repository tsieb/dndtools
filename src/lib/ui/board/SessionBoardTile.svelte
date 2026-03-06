<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { renderMarkdown } from '$lib/markdown/pipeline.js';
	import { normalizePreviewDepth, normalizePreviewLineCount } from '$lib/domain/session-board.js';
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
	let depth = $derived.by(() => normalizePreviewDepth(tile.previewDepth));
	let previewLines = $derived.by(() => normalizePreviewLineCount(tile.previewLineCount));

	function buildPreviewContent(noteContent: string): string {
		if (depth === 'title') return '';
		if (depth === 'full') return noteContent;
		const lines = noteContent.split(/\r?\n/).slice(0, previewLines);
		return lines.join('\n').trim();
	}

	$effect(() => {
		const previewContent = buildPreviewContent(note.content);
		if (!previewContent) {
			html = '';
			return;
		}
		let stale = false;
		void renderMarkdown(previewContent, {
			resolveLink: (title) => {
				const targetId = notesState.resolveTitle(title);
				return targetId
					? { href: `/knowledge/notes/${targetId}`, exists: true }
					: { href: `/knowledge/notes?create=${encodeURIComponent(title)}`, exists: false };
			},
		}).then((result) => {
			if (!stale) html = result;
		});
		return () => {
			stale = true;
		};
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

	function handleViewInKnowledge(): void {
		void goto(resolve(`/knowledge/notes/${note.id}`), {
			state: { label: note.title },
		});
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
	class="relative rounded-lg border bg-surface/95 shadow-sm backdrop-blur-sm flex flex-col h-full transition-[box-shadow,transform] duration-fast cursor-pointer hover:shadow-md {selected
		? 'border-border ring-2 ring-accent/45 shadow-[0_0_0_1px_rgba(255,255,255,0.65)_inset,0_12px_24px_-16px_rgba(0,0,0,0.65)]'
		: 'border-border'}"
	style="background-color: {tile.style?.backgroundColor ?? ''}; border-color: {tile.style
		?.borderColor ?? ''}; border-width: {tile.style?.borderWidth !== undefined
		? `${tile.style.borderWidth}px`
		: ''}; border-radius: {tile.style?.borderRadius !== undefined
		? `${tile.style.borderRadius}px`
		: ''}; opacity: {tile.style?.opacity ?? 1}; transform-origin: top left; transform: scale({tile
		.style?.scale ?? 1});"
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
	<header class="px-3 py-2 border-b border-border flex items-center gap-2">
		<button
			type="button"
			class="text-left truncate flex-1 font-medium text-sm text-ink hover:text-accent transition-colors"
			onclick={onopen}
			title="Open enlarged view"
			aria-label={`Open enlarged view for ${note.title}`}
		>
			{note.title}
		</button>
		<button
			type="button"
			class="rounded px-1.5 py-0.5 text-xs text-accent underline underline-offset-2 hover:text-accent-hover"
			onclick={handleViewInKnowledge}
			title="View this source note in Knowledge"
			aria-label={`View ${note.title} in Knowledge`}
		>
			View in Knowledge
		</button>
		{#if editable}
			<span class="text-xs px-2 py-0.5 rounded border border-border text-ink-faint">
				Drag to move
			</span>
		{/if}
		<span class="text-2xs px-1.5 py-0.5 rounded border border-border/70 text-ink-faint">
			{depth === 'title' ? 'Title' : depth === 'summary' ? `${previewLines} lines` : 'Full'}
		</span>
	</header>
	<div class="relative p-3 flex-1 min-h-0 {scrollable ? 'overflow-y-auto' : 'overflow-hidden'}">
		{#if depth === 'title'}
			<div class="h-full flex items-center justify-center text-xs text-ink-muted">
				Title-only preview enabled
			</div>
		{:else}
			<div class="markdown-content text-sm leading-relaxed" role="document" bind:this={contentEl}>
				<!-- Content is sanitized by renderMarkdown before injecting HTML. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html html}
			</div>
		{/if}
		{#if editable && !scrollable}
			<div
				class="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface/95 to-transparent"
			></div>
			<div
				class="pointer-events-none absolute bottom-2 right-2 text-2xs px-1.5 py-0.5 rounded border border-border/60 bg-surface/90 text-ink-faint"
			>
				Select to scroll
			</div>
		{/if}
	</div>
</div>
