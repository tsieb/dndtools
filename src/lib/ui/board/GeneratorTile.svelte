<script lang="ts">
	import GeneratorPanel from '$lib/ui/generator/GeneratorPanel.svelte';
	import Icon from '$lib/ui/common/Icon.svelte';
	import { TILE_TYPE_METADATA } from '$lib/domain/session-board.js';
	import type { SessionBoardTile } from '$lib/types/session-board.js';

	interface Props {
		tile: SessionBoardTile;
		selected?: boolean;
		editable?: boolean;
		onselect: () => void;
		ondragstart: (event: PointerEvent) => void;
	}

	let { tile, selected = false, editable = false, onselect, ondragstart }: Props = $props();
	const tileMeta = TILE_TYPE_METADATA.generator;
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
	aria-label="Session generator tile"
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
	<header
		class="h-8 border-b border-border border-l-4 px-2.5 pr-3 flex items-center gap-2"
		style="border-left-color: var(--tile-accent);"
	>
		<Icon name={tileMeta.iconName} size="sm" color="var(--tile-accent)" />
		<div class="font-semibold text-sm text-ink flex-1">{tileMeta.label}</div>
		<span class="text-2xs px-1.5 py-0.5 rounded border border-border/70 text-ink-faint">
			Ctrl+G
		</span>
	</header>
	<div class="flex-1 min-h-0 overflow-hidden">
		<GeneratorPanel compact showHeader={false} />
	</div>
</div>
