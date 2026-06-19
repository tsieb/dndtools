<script lang="ts">
	/**
	 * Widget-block frame for the spatial dashboard (Command Center redesign §2/§4).
	 *
	 * View mode: the block is a live region of the board — its body is fully interactive (tables
	 * scroll, rows navigate) and the whole block is marked `data-canvas-no-pan` so pointer drags and
	 * wheel events inside it behave natively (panning belongs to empty canvas only).
	 *
	 * Edit mode: the block becomes a layout object. The body goes `inert` (no clicks, no tab stops —
	 * "widgets cease to be functionally interactive"), and the title bar turns into the accessible
	 * grab handle: Tab reaches it, Enter selects the block (opening the Properties Panel), arrow keys
	 * move it, Shift+arrows resize it, and Escape exits Edit Mode — the keyboard parity for the
	 * pointer drag/resize grips that CanvasViewport renders on the selected tile.
	 */
	import type { Snippet } from 'svelte';
	import type { CanvasMode } from './canvas-mode.svelte';

	interface Props {
		id: string;
		title: string;
		mode: CanvasMode;
		selected: boolean;
		/** Optional short status shown next to the title (e.g. live counts). */
		meta?: string;
		/** Select this block in edit mode (opens the Properties Panel). */
		onSelect: (id: string) => void;
		/** Keyboard move (dx/dy world units). */
		onMove: (id: string, dx: number, dy: number) => void;
		/** Keyboard resize (dw/dh world units). */
		onResize: (id: string, dw: number, dh: number) => void;
		/** Escape from a block header exits Edit Mode. */
		onExitEdit: () => void;
		children: Snippet;
	}

	const { id, title, mode, selected, meta, onSelect, onMove, onResize, onExitEdit, children }: Props =
		$props();

	const STEP = 16;
	const STEP_LARGE = 64;

	function onHandleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			onExitEdit();
			return;
		}
		const arrows: Record<string, [number, number]> = {
			ArrowLeft: [-1, 0],
			ArrowRight: [1, 0],
			ArrowUp: [0, -1],
			ArrowDown: [0, 1],
		};
		const vector = arrows[event.key];
		if (!vector) return;
		event.preventDefault();
		event.stopPropagation();
		const step = event.altKey ? STEP_LARGE : STEP;
		if (event.shiftKey) onResize(id, vector[0] * step, vector[1] * step);
		else onMove(id, vector[0] * step, vector[1] * step);
	}
</script>

<article
	class="dash-block"
	data-mode={mode}
	data-selected={selected ? 'true' : undefined}
	data-canvas-no-pan={mode === 'view' ? 'true' : undefined}
	data-testid={`dash-block-${id}`}
	aria-label={title}
>
	<header class="dash-block-head">
		{#if mode === 'edit'}
			<!-- No data-canvas-no-pan here: a pointer DRAG from the title bar must reach the canvas
			     tile-move interaction; a plain click (no movement) still fires this button's select. -->
			<button
				type="button"
				class="dash-block-grab"
				aria-pressed={selected}
				aria-label={`${title} — select to edit; arrow keys move, Shift+arrows resize, Escape exits edit mode`}
				data-testid={`dash-block-grab-${id}`}
				onclick={() => onSelect(id)}
				onkeydown={onHandleKeydown}
			>
				<span class="dash-block-title">{title}</span>
				<span class="dash-block-grip" aria-hidden="true">⣿</span>
			</button>
		{:else}
			<h2 class="dash-block-title">{title}</h2>
			{#if meta}
				<span class="dash-block-meta">{meta}</span>
			{/if}
		{/if}
	</header>
	<div class="dash-block-body" inert={mode === 'edit'}>
		{@render children()}
	</div>
</article>

<style>
	.dash-block {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		min-height: 0;
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		overflow: hidden;
	}
	.dash-block[data-mode='edit'] {
		border-style: dashed;
		border-color: var(--color-border-strong);
		cursor: grab;
	}
	/* Selected widget reads as the one focus: a 2px accent ring + raised elevation (package edit
	   mode shows the selected frame ringed, not just bordered). */
	.dash-block[data-selected='true'] {
		border-color: var(--color-accent);
		box-shadow:
			0 0 0 2px var(--color-accent),
			var(--shadow-md);
	}

	/* Inline header (package widget anatomy): the title sits inside the card with no divider bar —
	   a display-serif, bold, primary-ink name, not a grey uppercase eyebrow on a separate surface. */
	.dash-block-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		flex: 0 0 auto;
		padding: var(--space-2) var(--space-3);
	}

	.dash-block-title {
		margin: 0;
		min-width: 0;
		font-family: var(--font-display);
		font-size: var(--text-base);
		font-weight: var(--font-weight-bold);
		letter-spacing: var(--tracking-normal);
		color: var(--color-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dash-block-meta {
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}

	/* Edit-mode grab handle: the keyboard path to select/move/resize. Fills the title bar. */
	.dash-block-grab {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		flex: 1 1 auto;
		min-height: var(--touch-target-min);
		margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-3));
		padding: var(--space-2) var(--space-3);
		background: transparent;
		border: none;
		cursor: grab;
		color: inherit;
		text-align: left;
	}
	.dash-block-grab:focus-visible {
		outline: 2px solid var(--color-interactive-focus-ring);
		outline-offset: -2px;
	}
	.dash-block-grip {
		color: var(--color-text-secondary);
		font-size: var(--text-sm);
	}

	.dash-block-body {
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
		padding: var(--space-2) var(--space-3);
	}
	/* Layout-object treatment: the body dims and goes inert while editing (§4). */
	.dash-block[data-mode='edit'] .dash-block-body {
		opacity: 0.6;
		pointer-events: none;
		user-select: none;
	}
</style>
