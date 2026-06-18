<script lang="ts">
	/**
	 * Sandboxed host for a `custom-html-js` widget. Composes the installed package's HTML/CSS/JS
	 * assets into an `srcdoc` and renders them in an isolated `sandbox="allow-scripts"` iframe — the
	 * same isolation the authoring preview uses (SEC-007). Custom code never reaches host APIs here;
	 * it only paints inside the frame.
	 */
	import { findPackageRecordForWidgetType, type WidgetDefinition } from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { composeCustomWidgetPreviewSrcdoc } from '../custom-widget-authoring';

	interface Props {
		definition: WidgetDefinition;
		config: Record<string, unknown>;
	}
	const { definition }: Props = $props();
	const runtime = useRuntime();

	const assets = $derived(
		findPackageRecordForWidgetType(runtime.state.widgets, definition.type)?.package.assets ?? [],
	);
	function assetContent(kind: 'html' | 'css' | 'javascript'): string {
		return assets.find((asset) => asset.kind === kind)?.content ?? '';
	}
	const html = $derived(assetContent('html'));
	const css = $derived(assetContent('css'));
	const javascript = $derived(assetContent('javascript'));
	// A package with no renderable asset content would paint a blank frame; show a fail-soft note instead.
	const hasContent = $derived(html.trim() !== '' || css.trim() !== '' || javascript.trim() !== '');
	const srcdoc = $derived(composeCustomWidgetPreviewSrcdoc({ html, css, javascript }));
</script>

{#if hasContent}
	<iframe
		class="custom-widget-frame"
		title={definition.displayName}
		data-testid="widget-custom-frame"
		sandbox="allow-scripts"
		{srcdoc}
	></iframe>
{:else}
	<p class="custom-widget-empty" data-testid="widget-custom-frame-empty">
		This custom widget has no content.
	</p>
{/if}

<style>
	.custom-widget-frame {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 4rem;
		border: 0;
		background: var(--widget-surface, var(--color-surface));
	}
	.custom-widget-empty {
		margin: 0;
		display: flex;
		align-items: center;
		min-height: 4rem;
		padding: var(--space-2);
		font-size: var(--text-sm);
		color: var(--color-text-secondary);
		background: var(--widget-surface, var(--color-surface));
		border-radius: var(--radius-sm);
	}
</style>
