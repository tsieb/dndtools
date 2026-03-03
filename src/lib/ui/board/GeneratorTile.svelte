<script lang="ts">
	import GeneratorPanel from '$lib/ui/generator/GeneratorPanel.svelte';
	import type { SessionBoardTile } from '$lib/types/session-board.js';

	interface Props {
		tile: SessionBoardTile;
		selected?: boolean;
		editable?: boolean;
		onselect: () => void;
		ondragstart: (event: PointerEvent) => void;
	}

	let { tile, selected = false, editable = false, onselect, ondragstart }: Props = $props();
</script>

<div
	class="relative rounded-lg border bg-surface/95 dark:bg-tavern-surface/95 shadow-sm backdrop-blur-sm flex flex-col h-full transition-[box-shadow,transform] duration-150 cursor-pointer hover:shadow-md {selected
		? 'border-border dark:border-tavern-border ring-2 ring-accent/45 dark:ring-tavern-accent/45 shadow-[0_0_0_1px_rgba(255,255,255,0.65)_inset,0_12px_24px_-16px_rgba(0,0,0,0.65)]'
		: 'border-border dark:border-tavern-border'}"
	style="background-color: {tile.style?.backgroundColor ?? ''}; border-color: {tile.style
		?.borderColor ?? ''}; border-width: {tile.style?.borderWidth !== undefined
		? `${tile.style.borderWidth}px`
		: ''}; border-radius: {tile.style?.borderRadius !== undefined
		? `${tile.style.borderRadius}px`
		: ''}; opacity: {tile.style?.opacity ?? 1}; transform-origin: top left; transform: scale({tile
		.style?.scale ?? 1});"
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
		class="px-3 py-2 border-b border-border dark:border-tavern-border flex items-center gap-2"
	>
		<div class="font-medium text-sm text-ink dark:text-tavern-text flex-1">Generator</div>
		<span
			class="text-[10px] px-1.5 py-0.5 rounded border border-border/70 dark:border-tavern-border/70 text-ink-faint dark:text-tavern-faint"
		>
			Ctrl+G
		</span>
	</header>
	<div class="flex-1 min-h-0 overflow-hidden">
		<GeneratorPanel compact showHeader={false} />
	</div>
</div>
