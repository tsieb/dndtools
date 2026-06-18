<script lang="ts">
	/**
	 * Form-panel template (the Note widget). Renders a configured heading + multi-line body as inline
	 * note content. Customization (heading/body text + style tokens) is done through the shared
	 * Customize panel, keeping a single editing surface for every widget.
	 */
	import type { WidgetDefinition, WidgetInstance } from '@dndtools/core';

	interface Props {
		definition: WidgetDefinition;
		widget?: WidgetInstance | null;
		config: Record<string, unknown>;
	}
	const { definition, config }: Props = $props();

	const heading = $derived(
		typeof config.heading === 'string' && config.heading.trim() !== '' ? config.heading : '',
	);
	const body = $derived(typeof config.body === 'string' ? config.body : '');
</script>

<div class="tpl-form-panel" data-widget-template="form-panel">
	{#if heading.trim() !== ''}
		<p class="tpl-heading" data-testid="widget-note-heading">{heading}</p>
	{/if}
	{#if body.trim() !== ''}
		<p class="tpl-body" data-testid="widget-note-body">{body}</p>
	{:else}
		<p class="tpl-empty">Empty {definition.displayName.toLowerCase()} — add text in Customize.</p>
	{/if}
</div>

<style>
	.tpl-form-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-height: 0;
		color: var(--widget-text, var(--color-text-primary));
	}
	.tpl-heading {
		margin: 0;
		font-weight: var(--font-weight-semibold);
		font-size: var(--text-sm);
	}
	.tpl-body {
		margin: 0;
		font-size: var(--text-sm);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.tpl-empty {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
</style>
