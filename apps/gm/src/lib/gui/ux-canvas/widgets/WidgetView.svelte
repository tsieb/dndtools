<script lang="ts">
	/**
	 * The unified widget view — the single render path for EVERY widget on every surface (scene canvas
	 * + Command Center board). Given a widget definition (and, on a scene, its instance), it:
	 *   1. resolves the renderer from the definition's entrypoint (template / builtin / custom),
	 *   2. merges the definition's config-field defaults under the instance configuration,
	 *   3. applies the resolved style tokens as `--widget-*` CSS variables (adaptive visuals),
	 * then renders the chosen component, the sandboxed custom frame, or a fail-soft placeholder.
	 */
	import {
		resolveWidgetConfig,
		resolveWidgetStyleVariables,
		type WidgetDefinition,
		type WidgetInstance,
		type WidgetSurface,
	} from '@dndtools/core';
	import CustomWidgetFrame from './CustomWidgetFrame.svelte';
	import { resolveWidgetRenderer } from './widget-registry';
	import type { WidgetCommandDispatcher } from './widget-render-types';

	interface Props {
		definition: WidgetDefinition;
		/** The scene widget instance (carries configuration + binding). Null on the CC board. */
		widget?: WidgetInstance | null;
		/** Explicit configuration when there is no scene instance (the CC board's block config). */
		config?: Record<string, unknown>;
		surface: WidgetSurface;
		onCommand?: WidgetCommandDispatcher;
	}
	const { definition, widget = null, config, surface, onCommand }: Props = $props();

	const rawConfig = $derived(widget ? widget.configuration : (config ?? {}));
	const resolvedConfig = $derived(resolveWidgetConfig(definition, rawConfig));
	const styleVars = $derived(resolveWidgetStyleVariables(definition, rawConfig));
	const styleAttr = $derived(
		Object.entries(styleVars)
			.map(([name, value]) => `${name}: ${value}`)
			.join('; '),
	);
	const resolved = $derived(resolveWidgetRenderer(definition));
</script>

<div
	class="widget-view"
	data-widget-type={definition.type}
	data-widget-runtime={definition.renderEntrypoint?.runtime ?? 'none'}
	style={styleAttr}
>
	{#if resolved.kind === 'custom'}
		<CustomWidgetFrame {definition} config={resolvedConfig} />
	{:else if resolved.kind === 'placeholder'}
		<div
			class="widget-view-placeholder"
			data-testid="widget-view-placeholder"
			data-placeholder-reason={resolved.reason}
		>
			<span class="widget-view-icon" aria-hidden="true">{definition.icon ?? '◻'}</span>
			<span class="widget-view-name">{definition.displayName}</span>
			<span class="widget-view-reason">This widget can’t be shown here yet.</span>
		</div>
	{:else}
		{@const Renderer = resolved.component}
		<Renderer {definition} {widget} config={resolvedConfig} {surface} {onCommand} />
	{/if}
</div>

<style>
	.widget-view {
		display: block;
		height: 100%;
		min-height: 0;
		color: var(--widget-text, var(--color-text-primary));
	}
	.widget-view-placeholder {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		align-items: flex-start;
		padding: var(--space-2);
		color: var(--color-text-secondary);
	}
	.widget-view-icon {
		font-size: var(--text-lg);
	}
	.widget-view-name {
		font-weight: var(--font-weight-semibold);
		color: var(--color-text-primary);
	}
	.widget-view-reason {
		font-size: var(--text-xs);
	}
</style>
