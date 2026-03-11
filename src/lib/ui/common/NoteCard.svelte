<script lang="ts">
	import { layoutState } from '$lib/state/layout.svelte.js';
	import type { Note, NoteId } from '$lib/types/note.js';
	import { formatRelativeDate } from '$lib/utils/date.js';
	import Icon from '$lib/ui/common/Icon.svelte';
	import type { IconName } from '$lib/ui/common/Icon.svelte';

	interface Props {
		note: Note;
		onclick: (id: NoteId) => void;
		onpin?: (id: NoteId) => void;
		ondelete?: (id: NoteId) => void;
		oncontextrequest?: (id: NoteId, event: MouseEvent) => void;
		listOptionId?: string;
		listTabIndex?: number;
		listSelected?: boolean;
		onlistfocus?: () => void;
		onlistkeydown?: (event: KeyboardEvent) => void;
	}

	const SWIPE_ACTION_WIDTH = 112;
	const SWIPE_OPEN_THRESHOLD = 56;
	const LONG_PRESS_MS = 450;
	const LONG_PRESS_MOVE_CANCEL_PX = 12;

	let {
		note,
		onclick,
		onpin,
		ondelete,
		oncontextrequest,
		listOptionId = undefined,
		listTabIndex = undefined,
		listSelected = undefined,
		onlistfocus = undefined,
		onlistkeydown = undefined,
	}: Props = $props();

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

	let wordCount = $derived(note.content.trim().split(/\s+/).filter(Boolean).length);
	let noteType = $derived.by(() => {
		const typed =
			typeof note.frontmatter.type === 'string' ? note.frontmatter.type.toLowerCase() : '';
		if (typed) return typed;
		if (note.tags.some((tag) => tag.toLowerCase() === 'character')) return 'character';
		if (note.tags.some((tag) => tag.toLowerCase() === 'location')) return 'location';
		if (note.tags.some((tag) => tag.toLowerCase() === 'session')) return 'session';
		if (note.tags.some((tag) => tag.toLowerCase() === 'combat')) return 'combat';
		return 'note';
	});
	let noteTypeIcon = $derived.by<IconName>(() => {
		if (noteType === 'character') return 'star';
		if (noteType === 'location') return 'map';
		if (noteType === 'session') return 'clock';
		if (noteType === 'combat') return 'triangle-alert';
		return 'file-text';
	});
	let noteTypeLabel = $derived.by(() => {
		if (noteType === 'character') return 'Character';
		if (noteType === 'location') return 'Location';
		if (noteType === 'session') return 'Session';
		if (noteType === 'combat') return 'Combat';
		return 'Note';
	});

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
		onlistkeydown?.(event);
		if (event.defaultPrevented) return;
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

	function handleContextMenu(event: MouseEvent): void {
		if (!oncontextrequest) return;
		event.preventDefault();
		actionsOpen = false;
		dragOffset = 0;
		actionMenuOpen = false;
		oncontextrequest(note.id, event);
	}
</script>

<div class="relative overflow-visible" bind:this={cardRoot}>
	{#if hasQuickActions}
		<div class="pointer-events-none absolute inset-y-0 right-0 z-0 flex rounded-lg">
			{#if onpin}
				<button
					type="button"
					class="pointer-events-auto flex w-14 items-center justify-center rounded-l-lg bg-amber-500 text-xs font-semibold text-white"
					onclick={invokePin}
					aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
				>
					{note.pinned ? 'Unpin' : 'Pin'}
				</button>
			{/if}
			{#if ondelete}
				<button
					type="button"
					class="pointer-events-auto flex w-14 items-center justify-center rounded-r-lg bg-red-600 text-xs font-semibold text-white"
					onclick={invokeDelete}
					aria-label="Delete note"
				>
					Delete
				</button>
			{/if}
		</div>
	{/if}

	<!-- Card face: uses Card surface tokens (bg-surface, border-border, rounded-lg, shadow) -->
	<button
		id={listOptionId}
		role={listOptionId ? 'option' : undefined}
		tabindex={listTabIndex}
		aria-selected={listSelected}
		class="note-card-foreground group relative z-10 w-full rounded-lg border density-card pr-11 text-left shadow-sm transition-[border,box-shadow,transform] hover:border-accent/40 hover:shadow-md {listSelected
			? 'border-accent bg-accent-subtle/45 shadow-md'
			: 'border-border bg-surface'}"
		style={cardTransformStyle}
		onclick={activateCard}
		onkeydown={handleCardKeydown}
		onfocus={() => onlistfocus?.()}
		oncontextmenu={handleContextMenu}
		ontouchstart={handleTouchStart}
		ontouchmove={handleTouchMove}
		ontouchend={handleTouchEnd}
		ontouchcancel={handleTouchCancel}
	>
		<div class="flex items-center gap-2 text-xs text-ink-muted">
			<Icon name={noteTypeIcon} size="xs" />
			<span>{noteTypeLabel}</span>
		</div>
		<div class="mt-1.5 flex items-start justify-between gap-2">
			<p class="text-base font-semibold text-ink transition-colors group-hover:text-accent">
				{#if note.pinned}
					<span class="mr-1 inline-block -mt-0.5 text-accent">
						<Icon name="pin" size="xs" />
					</span>
				{/if}
				{note.title}
			</p>
		</div>
		<p class="mt-1 text-xs text-ink-muted">
			{note.folder === '/' ? 'Root' : note.folder.replace(/^\//, '').replace(/\//g, ' / ')}
		</p>
		{#if preview}
			<p class="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
				{preview}
			</p>
		{/if}
		<div class="mt-2 flex items-center gap-2 text-xs text-ink-faint">
			<span>{formatRelativeDate(note.updatedAt)}</span>
			<span aria-hidden="true">&middot;</span>
			<span>{wordCount} words</span>
		</div>
		{#if note.tags.length > 0}
			<div class="mt-2 flex flex-wrap gap-1">
				{#each note.tags.slice(0, 2) as tag (tag)}
					<span
						class="sidebar-tag-pill inline-flex items-center rounded-md bg-accent-subtle px-1.5 py-0.5 text-xs text-accent"
					>
						{tag}
					</span>
				{/each}
				{#if note.tags.length > 2}
					<span class="text-xs text-ink-faint">+{note.tags.length - 2}</span>
				{/if}
			</div>
		{/if}
	</button>

	{#if hasQuickActions}
		<button
			type="button"
			class="absolute right-2 top-2 z-20 rounded-md p-1 text-ink-faint hover:bg-surface-alt hover:text-ink"
			onclick={toggleActionMenu}
			aria-label="Note quick actions"
			aria-haspopup="menu"
			aria-expanded={actionMenuOpen}
		>
			<Icon name="ellipsis" size="xs" />
		</button>
	{/if}

	{#if actionMenuOpen && hasQuickActions}
		<div
			class="absolute right-2 top-11 z-30 min-w-32 rounded-md border border-border bg-surface-elevated p-1.5 shadow-lg"
			role="menu"
			aria-label="Note card quick actions"
		>
			{#if onpin}
				<button
					type="button"
					class="block w-full rounded px-2 py-1.5 text-left text-xs text-ink-muted hover:bg-surface-alt"
					role="menuitem"
					onclick={invokePin}
				>
					{note.pinned ? 'Unpin' : 'Pin'}
				</button>
			{/if}
			{#if ondelete}
				<button
					type="button"
					class="mt-1 block w-full rounded px-2 py-1.5 text-left text-xs text-error hover:bg-error/10"
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
