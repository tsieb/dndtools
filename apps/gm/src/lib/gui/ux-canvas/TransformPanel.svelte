<script lang="ts">
	import type { CanvasManipulationController, ManipWidget } from './manipulation-controller.svelte';

	/**
	 * Widget transform panel (UX-CANVAS-003 §Move/Resize via properties panel, UX-CANVAS-004 §Rotation
	 * properties panel). The discrete, numeric, keyboard-first path to move/resize/rotate the selected
	 * widget — this is the WCAG 2.5.7 alternative to the drag handles AND the primary manipulation surface
	 * on Mobile (where on-canvas drag is suppressed). Every field commits on change/Enter through the
	 * controller, which dispatches the same processing-core command a drag would and records undo.
	 */
	interface Props {
		controller: CanvasManipulationController;
		widget: ManipWidget | null;
	}

	let { controller, widget }: Props = $props();

	let aspectLock = $state(false);

	// Local editable mirrors, reseeded whenever the selected widget changes.
	let x = $state(0);
	let y = $state(0);
	let w = $state(0);
	let h = $state(0);
	let rotation = $state(0);
	let seededId = $state<string | null>(null);

	$effect(() => {
		if (widget && widget.id !== seededId) {
			x = Math.round(widget.x);
			y = Math.round(widget.y);
			w = Math.round(widget.w);
			h = Math.round(widget.h);
			rotation = Math.round(widget.rotation);
			seededId = widget.id;
		} else if (!widget) {
			seededId = null;
		}
	});

	function commitPosition() {
		if (widget) controller.moveTo(widget.id, x, y);
	}
	function commitSize() {
		if (!widget) return;
		if (aspectLock && widget.h > 0) {
			const ratio = widget.w / widget.h;
			// Drive from whichever dimension the user just changed more.
			h = Math.round(w / ratio);
		}
		controller.resizeTo(widget.id, w, h);
	}
	function commitRotation() {
		if (widget) controller.rotateTo(widget.id, rotation);
	}
	function reset() {
		if (widget) controller.resetRotation(widget.id);
	}
</script>

<section class="transform-panel" aria-label="Widget transform" data-testid="transform-panel">
	{#if !widget}
		<p class="meta" data-testid="transform-empty">Select a widget to edit its position, size, and rotation.</p>
	{:else}
		<p class="transform-title">{widget.label}</p>
		<div class="transform-grid">
			<label>
				<span>X</span>
				<input type="number" bind:value={x} data-testid="transform-x" onchange={commitPosition} />
			</label>
			<label>
				<span>Y</span>
				<input type="number" bind:value={y} data-testid="transform-y" onchange={commitPosition} />
			</label>
			<label>
				<span>W</span>
				<input type="number" min="120" bind:value={w} data-testid="transform-w" onchange={commitSize} />
			</label>
			<label>
				<span>H</span>
				<input type="number" min="80" bind:value={h} data-testid="transform-h" onchange={commitSize} />
			</label>
			<label>
				<span>Rotation°</span>
				<input
					type="number"
					min="0"
					max="359"
					bind:value={rotation}
					data-testid="transform-rotation"
					onchange={commitRotation}
				/>
			</label>
			<label class="transform-lock">
				<input type="checkbox" bind:checked={aspectLock} data-testid="transform-aspect-lock" />
				<span>Lock aspect ratio</span>
			</label>
		</div>
		<div class="transform-actions">
			<button type="button" class="button secondary" data-testid="transform-reset-rotation" onclick={reset}>
				Reset rotation
			</button>
		</div>
	{/if}
</section>

<style>
	.transform-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
	}
	.transform-title {
		margin: 0;
		font-weight: var(--font-weight-semibold);
	}
	.transform-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--space-2);
	}
	.transform-grid label {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.transform-grid input[type='number'] {
		min-height: var(--touch-target-min);
		padding: 0 var(--space-1);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface-sunken);
		color: var(--color-text-primary);
	}
	.transform-lock {
		flex-direction: row !important;
		align-items: center;
		grid-column: span 2;
	}
	.meta {
		margin: 0;
		color: var(--color-text-secondary);
	}
</style>
