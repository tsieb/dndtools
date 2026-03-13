<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Icon from '$lib/ui/common/Icon.svelte';
	import { TILE_TYPE_METADATA } from '$lib/domain/session-board.js';
	import { renderMarkdown } from '$lib/markdown/pipeline.js';
	import { shouldVirtualizeFullDepthNote } from '$lib/ui/board/session-board-note-virtualization.js';
	import { normalizePreviewDepth } from '$lib/domain/session-board.js';
	import { notesState } from '$lib/state/notes.svelte.js';
	import type { Note } from '$lib/types/note.js';
	import type { SessionBoardTile } from '$lib/types/session-board.js';

	interface Props {
		note: Note;
		tile: SessionBoardTile;
		selected?: boolean;
		editable?: boolean;
		scrollable?: boolean;
		showDepthBadge?: boolean;
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
		showDepthBadge = false,
		tintColor = '#7c3aed',
		tintOpacity = 0,
		onopen,
		onselect,
		ondragstart,
	}: Props = $props();
	let html = $state('');
	let contentEl = $state<HTMLDivElement | null>(null);
	let scrollEl = $state<HTMLDivElement | null>(null);
	let topSentinelEl = $state<HTMLDivElement | null>(null);
	let bottomSentinelEl = $state<HTMLDivElement | null>(null);
	let tileEl = $state<HTMLDivElement | null>(null);
	let virtualStartLine = $state(0);
	let lastVirtualKey = $state('');
	let largeNoteInitialResolved = $state(false);
	let largeNoteLoading = $state(false);
	let markdownVisible = $state(true);
	let depth = $derived.by(() => normalizePreviewDepth(tile.previewDepth));
	const tileMeta = TILE_TYPE_METADATA.note;
	const VIRTUAL_WINDOW_LINES = 140;
	const VIRTUAL_STEP_LINES = 60;
	const APPROX_LINE_HEIGHT_PX = 24;
	let fullDepthLines = $derived.by(() => note.content.split(/\r?\n/));
	let fullDepthIsLarge = $derived.by(() =>
		shouldVirtualizeFullDepthNote(depth, fullDepthLines.length),
	);
	let virtualEndLine = $derived.by(() =>
		Math.min(fullDepthLines.length, virtualStartLine + VIRTUAL_WINDOW_LINES),
	);
	let virtualContent = $derived.by(() =>
		fullDepthLines.slice(virtualStartLine, virtualEndLine).join('\n').trim(),
	);
	let virtualTopSpacerPx = $derived.by(() => virtualStartLine * APPROX_LINE_HEIGHT_PX);
	let virtualBottomSpacerPx = $derived.by(
		() => Math.max(0, fullDepthLines.length - virtualEndLine) * APPROX_LINE_HEIGHT_PX,
	);

	function buildPreviewContent(noteContent: string): string {
		if (depth === 'title') return '';
		if (depth === 'full') return noteContent;
		const lines = noteContent.split(/\r?\n/).slice(0, 5);
		return lines.join('\n').trim();
	}

	$effect(() => {
		const nextKey = `${note.id}:${depth}`;
		if (nextKey !== lastVirtualKey) {
			lastVirtualKey = nextKey;
			virtualStartLine = 0;
			largeNoteInitialResolved = false;
		}
	});

	$effect(() => {
		const previewContent = fullDepthIsLarge ? virtualContent : buildPreviewContent(note.content);
		if (!previewContent) {
			html = '';
			largeNoteLoading = false;
			markdownVisible = true;
			return;
		}
		const showInitialShimmer = fullDepthIsLarge && !largeNoteInitialResolved;
		largeNoteLoading = showInitialShimmer;
		if (showInitialShimmer) {
			markdownVisible = false;
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
			if (stale) return;
			html = result;
			largeNoteLoading = false;
			largeNoteInitialResolved = true;
			requestAnimationFrame(() => {
				if (!stale) markdownVisible = true;
			});
		});
		return () => {
			stale = true;
		};
	});

	$effect(() => {
		if (!fullDepthIsLarge || !scrollEl || !topSentinelEl || !bottomSentinelEl) return;
		if (typeof IntersectionObserver === 'undefined') return;
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					if (entry.target === topSentinelEl && virtualStartLine > 0) {
						virtualStartLine = Math.max(0, virtualStartLine - VIRTUAL_STEP_LINES);
						continue;
					}
					if (entry.target !== bottomSentinelEl) continue;
					if (virtualEndLine >= fullDepthLines.length) continue;
					const maxStart = Math.max(0, fullDepthLines.length - VIRTUAL_WINDOW_LINES);
					virtualStartLine = Math.min(maxStart, virtualStartLine + VIRTUAL_STEP_LINES);
				}
			},
			{
				root: scrollEl,
				rootMargin: '160px 0px 160px 0px',
				threshold: 0,
			},
		);
		observer.observe(topSentinelEl);
		observer.observe(bottomSentinelEl);
		return () => observer.disconnect();
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

	function focusFirstInteractiveElement(): void {
		const root = tileEl;
		if (!root) return;
		const firstTarget = root.querySelector<HTMLElement>(
			'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
		);
		if (!firstTarget) return;
		if (firstTarget === root) return;
		firstTarget.focus();
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
		.style?.scale ?? 1}); --tile-accent: var({tileMeta.colorToken});"
	role="button"
	tabindex="0"
	aria-label={`Session board tile: ${note.title}`}
	aria-pressed={selected}
	data-board-tile="true"
	bind:this={tileEl}
	onclick={(event) => {
		const target = event.target as HTMLElement;
		if (target.closest('a,button,input,textarea,select,label')) return;
		onselect();
	}}
	onkeydown={(event) => {
		if (event.key === ' ' || event.key === 'Space') {
			event.preventDefault();
			onselect();
			return;
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			onselect();
			requestAnimationFrame(() => {
				focusFirstInteractiveElement();
			});
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
	<header
		class="h-8 border-b border-border border-l-4 px-2.5 pr-3 flex items-center gap-2"
		style="border-left-color: var(--tile-accent);"
	>
		<Icon name={tileMeta.iconName} size="sm" class="shrink-0" color="var(--tile-accent)" />
		<span class="text-sm font-semibold text-ink truncate">{tileMeta.label}</span>
		<button
			type="button"
			class="text-left truncate flex-1 text-sm text-ink hover:text-accent transition-colors"
			onclick={onopen}
			aria-label={`Open enlarged view for ${note.title}`}
		>
			{note.title}
		</button>
		<button
			type="button"
			class="rounded px-1.5 py-0.5 text-xs text-accent underline underline-offset-2 hover:text-accent-hover"
			onclick={handleViewInKnowledge}
			aria-label={`View ${note.title} in Knowledge`}
		>
			View in Knowledge
		</button>
		{#if editable}
			<span class="text-xs px-2 py-0.5 rounded border border-border text-ink-faint">
				Drag to move
			</span>
		{/if}
		{#if showDepthBadge}
			<span class="text-2xs px-1.5 py-0.5 rounded border border-border/70 text-ink-faint">
				{depth === 'title' ? 'T' : depth === 'summary' ? 'S' : 'F'}
			</span>
		{/if}
	</header>
	<div
		class="relative p-3 flex-1 min-h-0 {scrollable ? 'overflow-y-auto' : 'overflow-hidden'}"
		bind:this={scrollEl}
	>
		{#if depth === 'title'}
			<div class="h-full flex items-center justify-center text-xs text-ink-muted">
				Title-only preview enabled
			</div>
		{:else}
			{#if fullDepthIsLarge}
				<div
					class="pointer-events-none absolute inset-3 rounded-md bg-surface-alt/70 animate-pulse {largeNoteLoading
						? 'opacity-100'
						: 'opacity-0'} transition-opacity duration-150"
					aria-hidden="true"
				></div>
				<div bind:this={topSentinelEl} class="h-px w-full" aria-hidden="true"></div>
				<div style={`height:${virtualTopSpacerPx}px;`} aria-hidden="true"></div>
			{/if}
			<div
				class="markdown-content text-sm leading-relaxed transition-opacity duration-150 {markdownVisible
					? 'opacity-100'
					: 'opacity-0'}"
				role="document"
				bind:this={contentEl}
			>
				<!-- Content is sanitized by renderMarkdown before injecting HTML. -->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html html}
			</div>
			{#if fullDepthIsLarge}
				<div style={`height:${virtualBottomSpacerPx}px;`} aria-hidden="true"></div>
				<div bind:this={bottomSentinelEl} class="h-px w-full" aria-hidden="true"></div>
			{/if}
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
