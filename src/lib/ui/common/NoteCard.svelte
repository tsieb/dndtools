<script lang="ts">
	import { layoutState } from '$lib/state/layout.svelte.js';
	import type { Note, NoteId } from '$lib/types/note.js';
	import { formatRelativeDate } from '$lib/utils/date.js';

	interface Props {
		note: Note;
		onclick: (id: NoteId) => void;
		onpin?: (id: NoteId) => void;
		ondelete?: (id: NoteId) => void;
	}

	const SWIPE_ACTION_WIDTH = 112;
	const SWIPE_OPEN_THRESHOLD = 56;
	const LONG_PRESS_MS = 450;
	const LONG_PRESS_MOVE_CANCEL_PX = 12;

	let { note, onclick, onpin, ondelete }: Props = $props();

	let cardRoot = $state<HTMLElement | null>(null);
	let actionsOpen = $state(false);
	let actionMenuOpen = $state(false);
	let dragOffset = $state(0);
	let touchStartX = $state(0);
	let touchStartY = $state(0);
	let swipeTracking = $state(false);
	let swipeStartedOpen = $state(false);
	let suppressActivate = $state(false);
	let longPressHandle: ReturnType<typeof setTimeout> | null = null;

	let hasQuickActions = $derived(typeof onpin === 'function' || typeof ondelete === 'function');

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

	const cardTransformStyle = $derived.by(
		() => `transform: translateX(${Math.round(dragOffset)}px);`,
	);

	$effect(() => {
		if (!actionMenuOpen || typeof window === 'undefined') return;
		const handlePointerDown = (event: PointerEvent): void => {
			const target = event.target;
			if (!(target instanceof Node)) return;
			if (cardRoot?.contains(target)) return;
			actionMenuOpen = false;
		};
		window.addEventListener('pointerdown', handlePointerDown);
		return () => window.removeEventListener('pointerdown', handlePointerDown);
	});

	function clearLongPressTimer(): void {
		if (!longPressHandle) return;
		clearTimeout(longPressHandle);
		longPressHandle = null;
	}

	function handleTouchStart(event: TouchEvent): void {
		if (!layoutState.isCompact || !hasQuickActions) return;
		const touch = event.changedTouches[0];
		if (!touch) return;
		swipeTracking = true;
		swipeStartedOpen = actionsOpen;
		touchStartX = touch.clientX;
		touchStartY = touch.clientY;
		clearLongPressTimer();
		longPressHandle = setTimeout(() => {
			actionsOpen = false;
			dragOffset = 0;
			actionMenuOpen = true;
			suppressActivate = true;
			swipeTracking = false;
		}, LONG_PRESS_MS);
	}

	function handleTouchMove(event: TouchEvent): void {
		if (!swipeTracking || !layoutState.isCompact || !hasQuickActions) return;
		const touch = event.changedTouches[0];
		if (!touch) return;
		const deltaX = touch.clientX - touchStartX;
		const deltaY = touch.clientY - touchStartY;
		if (
			Math.abs(deltaX) >= LONG_PRESS_MOVE_CANCEL_PX ||
			Math.abs(deltaY) >= LONG_PRESS_MOVE_CANCEL_PX
		) {
			clearLongPressTimer();
		}
		if (Math.abs(deltaY) > Math.abs(deltaX) + 8) {
			return;
		}
		const baseOffset = swipeStartedOpen ? -SWIPE_ACTION_WIDTH : 0;
		dragOffset = Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, baseOffset + deltaX));
	}

	function handleTouchEnd(): void {
		clearLongPressTimer();
		if (!swipeTracking) return;
		swipeTracking = false;
		actionsOpen = dragOffset <= -SWIPE_OPEN_THRESHOLD;
		dragOffset = actionsOpen ? -SWIPE_ACTION_WIDTH : 0;
		if (actionsOpen) {
			suppressActivate = true;
		}
	}

	function handleTouchCancel(): void {
		clearLongPressTimer();
		if (!swipeTracking) return;
		swipeTracking = false;
		dragOffset = actionsOpen ? -SWIPE_ACTION_WIDTH : 0;
	}

	function activateCard(): void {
		if (suppressActivate) {
			suppressActivate = false;
			return;
		}
		if (actionsOpen) {
			actionsOpen = false;
			dragOffset = 0;
			return;
		}
		actionMenuOpen = false;
		onclick(note.id);
	}

	function handleCardKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		activateCard();
	}

	function invokePin(): void {
		actionMenuOpen = false;
		actionsOpen = false;
		dragOffset = 0;
		onpin?.(note.id);
	}

	function invokeDelete(): void {
		actionMenuOpen = false;
		actionsOpen = false;
		dragOffset = 0;
		ondelete?.(note.id);
	}
	function toggleActionMenu(): void {
		actionsOpen = false;
		dragOffset = 0;
		actionMenuOpen = !actionMenuOpen;
	}
</script>

<div class="relative overflow-visible" bind:this={cardRoot}>
	{#if hasQuickActions}
		<div class="pointer-events-none absolute inset-y-0 right-0 z-0 flex rounded-lg">
			{#if onpin}
				<button
					type="button"
					class="pointer-events-auto flex w-14 items-center justify-center rounded-l-lg bg-amber-500 text-[11px] font-semibold text-white"
					onclick={invokePin}
					aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
				>
					{note.pinned ? 'Unpin' : 'Pin'}
				</button>
			{/if}
			{#if ondelete}
				<button
					type="button"
					class="pointer-events-auto flex w-14 items-center justify-center rounded-r-lg bg-red-600 text-[11px] font-semibold text-white"
					onclick={invokeDelete}
					aria-label="Delete note"
				>
					Delete
				</button>
			{/if}
		</div>
	{/if}

	<button
		class="note-card-foreground group relative z-10 w-full rounded-lg border border-border bg-surface p-4 pr-11 text-left transition-[border,box-shadow,transform] hover:border-accent/40 hover:shadow-sm dark:border-tavern-border dark:bg-tavern-surface dark:hover:border-tavern-accent/40"
		style={cardTransformStyle}
		onclick={activateCard}
		onkeydown={handleCardKeydown}
		ontouchstart={handleTouchStart}
		ontouchmove={handleTouchMove}
		ontouchend={handleTouchEnd}
		ontouchcancel={handleTouchCancel}
	>
		<div class="flex items-start justify-between gap-2">
			<h3
				class="font-medium text-ink transition-colors group-hover:text-accent dark:text-tavern-text dark:group-hover:text-tavern-accent"
			>
				{#if note.pinned}
					<svg
						class="mr-1 inline-block h-3.5 w-3.5 -mt-0.5 text-accent dark:text-tavern-accent"
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
			<p class="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-muted dark:text-tavern-muted">
				{preview}
			</p>
		{/if}
		<div class="mt-2 flex items-center gap-2 text-xs text-ink-faint dark:text-tavern-faint">
			<span class="truncate font-mono">{filePath}</span>
			<span aria-hidden="true">&middot;</span>
			<span>{formatRelativeDate(note.updatedAt)}</span>
			<span aria-hidden="true">&middot;</span>
			<span>{wordCount} words</span>
		</div>
		{#if note.tags.length > 0}
			<div class="mt-2 flex flex-wrap gap-1">
				{#each note.tags.slice(0, 4) as tag (tag)}
					<span
						class="rounded-md bg-accent-subtle px-1.5 py-0.5 text-xs text-accent dark:bg-tavern-accent-subtle dark:text-tavern-accent"
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

	{#if hasQuickActions}
		<button
			type="button"
			class="absolute right-2 top-2 z-20 rounded-md p-1 text-ink-faint hover:bg-surface-alt hover:text-ink dark:text-tavern-faint dark:hover:bg-tavern-surface-alt dark:hover:text-tavern-text"
			onclick={toggleActionMenu}
			aria-label="Note quick actions"
			aria-haspopup="menu"
			aria-expanded={actionMenuOpen}
		>
			<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
				<path
					d="M4 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
				/>
			</svg>
		</button>
	{/if}

	{#if actionMenuOpen && hasQuickActions}
		<div
			class="absolute right-2 top-11 z-30 min-w-32 rounded-md border border-border bg-surface p-1.5 shadow-lg dark:border-tavern-border dark:bg-tavern-surface"
			role="menu"
			aria-label="Note card quick actions"
		>
			{#if onpin}
				<button
					type="button"
					class="block w-full rounded px-2 py-1.5 text-left text-xs text-ink-muted hover:bg-surface-alt dark:text-tavern-muted dark:hover:bg-tavern-surface-alt"
					role="menuitem"
					onclick={invokePin}
				>
					{note.pinned ? 'Unpin' : 'Pin'}
				</button>
			{/if}
			{#if ondelete}
				<button
					type="button"
					class="mt-1 block w-full rounded px-2 py-1.5 text-left text-xs text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-900/30"
					role="menuitem"
					onclick={invokeDelete}
				>
					Delete
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.note-card-foreground {
		will-change: transform;
	}

	.line-clamp-2 {
		line-clamp: 2;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
