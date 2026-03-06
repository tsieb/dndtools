<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { handoutsState } from '$lib/state/handouts.svelte.js';
	import type { SessionBoardHandoutTile } from '$lib/types/session-board.js';

	interface Props {
		tile: SessionBoardHandoutTile;
		selected?: boolean;
		editable?: boolean;
		onselect: () => void;
		ondragstart: (event: PointerEvent) => void;
	}

	let { tile, selected = false, editable = false, onselect, ondragstart }: Props = $props();

	let recentHandouts = $derived(handoutsState.sortedHandouts.slice(0, 3));
	let totalCount = $derived(handoutsState.sortedHandouts.length);
	let deliveredCount = $derived(handoutsState.deliveredHandouts.length);
	let pendingCount = $derived(handoutsState.pendingHandouts.length);
	let connectedPlayers = $derived(handoutsState.connectedPlayerCount);

	$effect(() => {
		void handoutsState.ensureLoaded();
	});

	function openLibrary(): void {
		void goto(`${resolve('/settings')}?tab=handouts`);
	}
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
	aria-label="Handout library tile"
	aria-pressed={selected}
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
		if (editable) ondragstart(event);
	}}
>
	<header class="px-3 py-2 border-b border-border flex items-center gap-2">
		<div class="font-medium text-sm text-ink flex-1">Handouts</div>
		<span class="text-2xs px-1.5 py-0.5 rounded border border-border/70 text-ink-faint">
			{connectedPlayers > 0
				? `${connectedPlayers} player${connectedPlayers === 1 ? '' : 's'}`
				: 'Offline'}
		</span>
	</header>
	<div class="flex-1 min-h-0 p-3 space-y-2">
		<div class="grid grid-cols-3 gap-2 text-xs">
			<div class="rounded border border-border/70 p-1.5">
				<p class="text-ink-faint">Total</p>
				<p class="text-sm font-semibold text-ink">{totalCount}</p>
			</div>
			<div class="rounded border border-border/70 p-1.5">
				<p class="text-ink-faint">Delivered</p>
				<p class="text-sm font-semibold text-ink">{deliveredCount}</p>
			</div>
			<div class="rounded border border-border/70 p-1.5">
				<p class="text-ink-faint">Pending</p>
				<p class="text-sm font-semibold text-ink">{pendingCount}</p>
			</div>
		</div>

		<div class="rounded border border-border/70 p-2 min-h-[5.25rem]">
			<p class="text-xs font-semibold uppercase tracking-wider text-ink-faint mb-1">Recent</p>
			{#if recentHandouts.length === 0}
				<p class="text-xs text-ink-muted">No handouts yet.</p>
			{:else}
				<ul class="space-y-1">
					{#each recentHandouts as handout (handout.id)}
						<li class="text-xs truncate text-ink">
							{handout.data.title || handout.name}
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<button
			type="button"
			class="w-full rounded border border-border px-2 py-1.5 text-xs text-ink hover:bg-surface-alt transition-colors"
			onclick={openLibrary}
		>
			Open Handout Library
		</button>
	</div>
</div>
