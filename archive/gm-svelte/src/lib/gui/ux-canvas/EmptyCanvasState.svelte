<script lang="ts">
	import { emptyCanvasContent } from './empty-canvas';

	/**
	 * Empty-canvas teaching state (UX-CANVAS-013). An atmospheric, instructive overlay shown only while
	 * the canvas has no widgets: a centred headline + a real CTA button that opens the widget library,
	 * decorative secondary hints (dropped on compact), and a keyboard hint bar. Everything except the CTA
	 * is `aria-hidden`; a polite SR announcement names the empty state. It vanishes the moment the first
	 * widget exists (the parent stops rendering it).
	 */
	interface Props {
		compact?: boolean;
		onAdd: () => void;
	}

	let { compact = false, onAdd }: Props = $props();
	const content = $derived(emptyCanvasContent({ compact }));
</script>

<div class="empty" data-testid="empty-canvas">
	<span class="sr-only" role="status" data-testid="empty-canvas-announcement">{content.announcement}</span>
	<div class="empty-illustration" aria-hidden="true">✦</div>
	<p class="empty-headline" aria-hidden="true">{content.headline}</p>
	<button type="button" class="button empty-cta" data-testid="empty-canvas-cta" onclick={onAdd}>
		{content.ctaLabel}
	</button>
	{#if content.hints.length > 0}
		<ul class="empty-hints" aria-hidden="true">
			{#each content.hints as hint (hint.id)}
				<li data-testid={`empty-canvas-hint-${hint.id}`}>{hint.text}</li>
			{/each}
		</ul>
	{/if}
	<div class="empty-keyboard" aria-hidden="true" data-testid="empty-canvas-keyboard">
		{#each content.keyboardHints as hint (hint)}
			<span>{hint}</span>
		{/each}
	</div>
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		max-width: 32rem;
		padding: var(--space-4);
		text-align: center;
		background: color-mix(in srgb, var(--color-surface-overlay) 88%, transparent);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}
	.empty-illustration {
		font-size: var(--text-2xl);
		color: var(--color-text-tertiary);
	}
	.empty-headline {
		margin: 0;
		font-size: var(--text-lg);
		color: var(--color-text-secondary);
	}
	.empty-cta {
		min-height: var(--touch-target-min);
	}
	.empty-hints {
		display: flex;
		flex-direction: column;
		gap: var(--space-0-5);
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--text-sm);
		color: var(--color-text-tertiary);
	}
	.empty-keyboard {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--space-1) var(--space-3);
		font-size: var(--text-xs);
		color: var(--color-text-tertiary);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>
