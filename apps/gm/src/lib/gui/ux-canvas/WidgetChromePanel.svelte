<script lang="ts">
	import type { CanvasManipulationController, ManipWidget } from './manipulation-controller.svelte';
	import {
		bindingChrome,
		collapseToggle,
		visibilityBadge,
		visibilityToggle,
	} from './widget-chrome';

	/**
	 * Accessible widget chrome panel (UX-CANVAS-007 anatomy actions + UX-CANVAS-011 visibility change +
	 * UX-CANVAS-008 binding entry). The keyboard / screen-reader path to the chrome a widget shows
	 * visually on the canvas (collapse chevron, `⋯`, visibility badge, chain-link). It is a labelled
	 * `role="group"` ("[widget] actions") of discrete buttons, so every chrome action is reachable on
	 * every profile without a pointer — the `⋯` on the tile is only the pointer shortcut into here.
	 *
	 * NO-LEAK: the host renders this panel for the editing (DM) viewer only, over the viewer-filtered
	 * widget set, so a DM-only widget's chrome is never surfaced to a player.
	 */
	interface Props {
		controller: CanvasManipulationController;
		widget: ManipWidget | null;
		/** Open the binding inspector for the current widget (UX-CANVAS-008). */
		onbind: () => void;
	}

	let { controller, widget, onbind }: Props = $props();

	const badge = $derived(widget ? visibilityBadge(widget.visibility) : null);
	const visToggle = $derived(widget ? visibilityToggle(widget.visibility) : null);
	const collapse = $derived(widget ? collapseToggle(widget.collapsed) : null);
	const binding = $derived(widget ? bindingChrome(widget.bindingState) : null);
</script>

<section
	class="chrome-panel"
	role="group"
	aria-label={widget ? `${widget.label} actions` : 'Widget actions'}
	data-testid="widget-chrome-panel"
>
	{#if !widget}
		<p class="meta" data-testid="chrome-empty">Select a widget to manage its chrome, visibility, and bindings.</p>
	{:else}
		<div class="chrome-head">
			<p class="chrome-title">{widget.label}</p>
			{#if badge}
				<span class="chrome-badge" data-kind={badge.kind} data-testid="chrome-visibility-badge">
					{badge.label}
				</span>
			{/if}
		</div>

		<p class="chrome-binding" data-binding-state={binding?.state} data-testid="chrome-binding-status">
			<span aria-hidden="true">🔗</span> {binding?.label}
		</p>

		<div class="chrome-actions" role="group" aria-label="Widget chrome actions">
			<button
				type="button"
				class="button secondary"
				data-testid="chrome-visibility-toggle"
				aria-label={`${visToggle?.label} — ${widget.label}`}
				onclick={() => controller.toggleVisibility(widget.id)}
			>
				{visToggle?.label}
			</button>
			<button
				type="button"
				class="button secondary"
				data-testid="chrome-collapse-toggle"
				aria-pressed={widget.collapsed}
				aria-label={`${collapse?.label} — ${widget.label}`}
				onclick={() => controller.toggleCollapse(widget.id)}
			>
				{collapse?.label}
			</button>
			<button
				type="button"
				class="button secondary"
				data-testid="chrome-bind"
				aria-label={`Bind ${widget.label} to an entity`}
				onclick={onbind}
			>
				Bind to entity…
			</button>
		</div>
	{/if}
</section>

<style>
	.chrome-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-2);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
	}
	.chrome-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}
	.chrome-title {
		margin: 0;
		font-weight: var(--font-weight-semibold);
	}
	.chrome-badge {
		display: inline-flex;
		align-items: center;
		font-size: var(--text-2xs);
		font-weight: var(--font-weight-bold);
		padding: 0 var(--space-1-5);
		border-radius: var(--radius-full);
		border: 1px solid var(--color-border-strong);
	}
	.chrome-badge[data-kind='dm-only'] {
		border-color: var(--color-dm-only-badge);
		background: var(--color-dm-only-subtle);
	}
	.chrome-badge[data-kind='players'] {
		border-color: var(--color-status-success);
		background: var(--color-status-success-subtle);
	}
	.chrome-badge[data-kind='shared'] {
		border-color: var(--color-status-info);
		background: var(--color-status-info-subtle);
	}
	.chrome-binding {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
	}
	.chrome-binding[data-binding-state='missing'],
	.chrome-binding[data-binding-state='conflicted'] {
		color: var(--color-status-warning-text);
	}
	.chrome-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
	}
	.meta {
		margin: 0;
		color: var(--color-text-secondary);
	}
</style>
