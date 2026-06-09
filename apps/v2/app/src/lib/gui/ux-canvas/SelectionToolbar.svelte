<script lang="ts">
	import type { CanvasManipulationController } from './manipulation-controller.svelte';

	/**
	 * Selection context toolbar (UX-CANVAS-005 §Selection count badge, UX-CANVAS-006 z-order,
	 * UX-CANVAS-009 align toolbar). A `role="toolbar"` of discrete, keyboard-operable buttons that act on
	 * the current selection — the non-gesture path to align, distribute, group, z-order and delete. It is
	 * always rendered (so the operations are reachable on every profile), and reports the live selection
	 * count. Every button maps to a processing-core command through the controller; nothing here is
	 * pointer- or gesture-only.
	 */
	interface Props {
		controller: CanvasManipulationController;
		/** Group the current selection (≥2). Delegated to the host's existing group command. */
		ongroup?: () => void;
		/** Delete the primary selected widget (opens the host's confirm dialog). */
		ondelete?: () => void;
	}

	let { controller, ongroup, ondelete }: Props = $props();

	const count = $derived(controller.selectionCount);
	const multi = $derived(count >= 2);
</script>

<div
	class="selection-toolbar"
	role="toolbar"
	aria-label="Selection actions"
	data-testid="selection-toolbar"
	data-count={count}
>
	<span class="selection-badge" role="status" data-testid="selection-count">
		{count === 0 ? 'No selection' : `${count} selected`}
	</span>

	<div class="toolbar-group" role="group" aria-label="Align">
		<button type="button" disabled={!multi} aria-label="Align selected widgets left" data-testid="align-left" onclick={() => controller.align('left')}>⊢</button>
		<button type="button" disabled={!multi} aria-label="Align selected widgets horizontal center" data-testid="align-center-h" onclick={() => controller.align('center-horizontal')}>↔</button>
		<button type="button" disabled={!multi} aria-label="Align selected widgets right" data-testid="align-right" onclick={() => controller.align('right')}>⊣</button>
		<button type="button" disabled={!multi} aria-label="Align selected widgets top" data-testid="align-top" onclick={() => controller.align('top')}>⊤</button>
		<button type="button" disabled={!multi} aria-label="Align selected widgets vertical center" data-testid="align-center-v" onclick={() => controller.align('center-vertical')}>↕</button>
		<button type="button" disabled={!multi} aria-label="Align selected widgets bottom" data-testid="align-bottom" onclick={() => controller.align('bottom')}>⊥</button>
	</div>

	<div class="toolbar-group" role="group" aria-label="Distribute">
		<button type="button" disabled={count < 3} aria-label="Distribute selected widgets horizontally" data-testid="distribute-h" onclick={() => controller.distribute('horizontal')}>⇿</button>
		<button type="button" disabled={count < 3} aria-label="Distribute selected widgets vertically" data-testid="distribute-v" onclick={() => controller.distribute('vertical')}>⇳</button>
	</div>

	<div class="toolbar-group" role="group" aria-label="Order">
		<button type="button" disabled={count === 0} aria-label="Bring to front" data-testid="z-front" onclick={() => controller.zOrder('front')}>⤒</button>
		<button type="button" disabled={count === 0} aria-label="Bring forward" data-testid="z-forward" onclick={() => controller.zOrder('forward')}>↑</button>
		<button type="button" disabled={count === 0} aria-label="Send backward" data-testid="z-backward" onclick={() => controller.zOrder('backward')}>↓</button>
		<button type="button" disabled={count === 0} aria-label="Send to back" data-testid="z-back" onclick={() => controller.zOrder('back')}>⤓</button>
	</div>

	<div class="toolbar-group" role="group" aria-label="Edit">
		<button type="button" disabled={!multi} aria-label="Group selected widgets" data-testid="toolbar-group" onclick={() => ongroup?.()}>Group</button>
		<button type="button" disabled={count === 0} aria-label="Delete selected widget" data-testid="toolbar-delete" onclick={() => ondelete?.()}>Delete</button>
	</div>
</div>

<style>
	.selection-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) var(--space-2);
		background: var(--color-surface-raised);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}
	.selection-badge {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-secondary);
	}
	.toolbar-group {
		display: inline-flex;
		gap: var(--space-0-5);
	}
	.selection-toolbar button {
		min-width: var(--touch-target-min);
		min-height: var(--touch-target-min);
		padding: 0 var(--space-2);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-primary);
		font-size: var(--text-sm);
		cursor: pointer;
	}
	.selection-toolbar button:hover:not(:disabled) {
		background: var(--color-interactive-hover);
	}
	.selection-toolbar button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
