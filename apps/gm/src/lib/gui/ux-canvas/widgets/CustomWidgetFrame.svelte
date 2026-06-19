<script lang="ts">
	/**
	 * Sandboxed host for a `custom-html-js` widget. Composes the installed package's HTML/CSS/JS
	 * assets into an `srcdoc` and renders them in an isolated `sandbox="allow-scripts"` iframe — the
	 * same isolation the authoring preview uses (SEC-007). Custom code never reaches host APIs here;
	 * it only paints inside the frame.
	 *
	 * The iframe also carries a Content-Security-Policy derived from the package's GRANTED host
	 * permissions: `allow-scripts` blocks parent-DOM access but NOT outbound network, so without a CSP
	 * a widget could `fetch()`/beacon freely and exfiltrate state. We default-deny egress and only
	 * widen `connect-src`/`img-src`/etc. when the package was granted the `network` permission. The
	 * host-resolved (sanitized) `--widget-*` tokens and the resolved config are injected too, since
	 * neither CSS custom properties nor the host config object cross the iframe boundary on their own.
	 */
	import {
		findPackageRecordForWidgetType,
		resolveWidgetStyleVariables,
		type WidgetDefinition,
	} from '@dndtools/core';
	import { useRuntime } from '$lib/state/runtime-context';
	import { composeCustomWidgetPreviewSrcdoc } from '../custom-widget-authoring';

	interface Props {
		definition: WidgetDefinition;
		config: Record<string, unknown>;
	}
	const { definition, config }: Props = $props();
	const runtime = useRuntime();

	const record = $derived(findPackageRecordForWidgetType(runtime.state.widgets, definition.type));
	const assets = $derived(record?.package.assets ?? []);
	function assetContent(kind: 'html' | 'css' | 'javascript'): string {
		return assets.find((asset) => asset.kind === kind)?.content ?? '';
	}
	const html = $derived(assetContent('html'));
	const css = $derived(assetContent('css'));
	const javascript = $derived(assetContent('javascript'));
	// A package with no renderable asset content would paint a blank frame; show a fail-soft note instead.
	const hasContent = $derived(html.trim() !== '' || css.trim() !== '' || javascript.trim() !== '');

	const networkGranted = $derived(record?.trust.hostPermissions.network === 'approved');
	const csp = $derived(buildCsp(networkGranted));
	// Reuse the core resolver so the iframe gets the same sanitized, override-applied tokens the
	// host-scoped renderers get (the resolver drops CSS-injection-unsafe values — SEC).
	const rootVars = $derived(resolveWidgetStyleVariables(definition, config));
	const srcdoc = $derived(composeCustomWidgetPreviewSrcdoc({ html, css, javascript, csp, rootVars, config }));

	function buildCsp(network: boolean): string {
		return [
			"default-src 'none'",
			"script-src 'unsafe-inline'",
			"style-src 'unsafe-inline'",
			network ? 'img-src data: https:' : 'img-src data:',
			network ? 'media-src https:' : "media-src 'none'",
			network ? 'font-src data: https:' : 'font-src data:',
			network ? 'connect-src https:' : "connect-src 'none'",
			"base-uri 'none'",
			"form-action 'none'",
		].join('; ');
	}
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
