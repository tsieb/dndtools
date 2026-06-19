<script lang="ts">
	/**
	 * Scene-message template (the Handout widget). Renders a configured heading + body as a styled
	 * message card. Purely display + customization (config text); no data query.
	 */
	import type { WidgetDefinition, WidgetInstance } from '@dndtools/core';

	interface Props {
		definition: WidgetDefinition;
		widget?: WidgetInstance | null;
		config: Record<string, unknown>;
	}
	const { definition, config }: Props = $props();

	const heading = $derived(
		typeof config.heading === 'string' && config.heading.trim() !== ''
			? config.heading
			: definition.displayName,
	);
	const body = $derived(typeof config.body === 'string' ? config.body : '');
</script>

<div class="tpl-scene-message" data-widget-template="scene-message">
	<p class="tpl-heading" data-testid="widget-message-heading">{heading}</p>
	{#if body.trim() !== ''}
		<p class="tpl-body" data-testid="widget-message-body">{body}</p>
	{:else}
		<p class="tpl-empty">Add a message in the Customize panel.</p>
	{/if}
</div>

<style>
	.tpl-scene-message {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-2);
		border-left: 3px solid var(--widget-accent, var(--color-accent));
		background: color-mix(in srgb, var(--widget-accent, var(--color-accent)) 8%, transparent);
		border-radius: var(--radius-sm);
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
	}
	.tpl-empty {
		margin: 0;
		font-size: var(--text-xs);
		color: var(--color-text-secondary);
	}
</style>
