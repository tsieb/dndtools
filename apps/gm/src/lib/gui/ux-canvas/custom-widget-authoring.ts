import {
	scaffoldCustomWidgetPackageDraft,
	type WidgetHostPermission,
	type WidgetPackageAsset,
	type WidgetWizardDraft,
} from '@dndtools/core';

export const DEFAULT_CUSTOM_WIDGET_HTML = [
	'<main class="widget-root" data-widget-root>',
	'  <h1 data-title>Custom Widget</h1>',
	'  <section class="widget-panel">Edit the HTML, CSS, and JavaScript to build the widget.</section>',
	'  <button class="widget-button" type="button" data-status>Ready</button>',
	'</main>',
].join('\n');

export const DEFAULT_CUSTOM_WIDGET_CSS = [
	':root {',
	'  --widget-accent: #2563eb;',
	'  --widget-surface: #101827;',
	'  --widget-text: #f8fafc;',
	'}',
	'body { margin: 0; font: 14px system-ui, sans-serif; color: var(--widget-text); background: var(--widget-surface); }',
	'.widget-root { min-height: 100vh; box-sizing: border-box; padding: 12px; display: grid; gap: 10px; align-content: start; }',
	'h1 { margin: 0; font-size: 18px; }',
	'.widget-panel { border: 1px solid rgba(255,255,255,0.18); border-radius: 8px; padding: 10px; }',
	'.widget-button { border: 0; border-radius: 6px; padding: 8px 10px; color: white; background: var(--widget-accent); }',
].join('\n');

export const DEFAULT_CUSTOM_WIDGET_JS = [
	'const status = document.querySelector("[data-status]");',
	'if (status) {',
	'  status.addEventListener("click", () => {',
	'    status.textContent = "Clicked";',
	'  });',
	'}',
	'export function render(payload = {}) {',
	'  console.log("Widget payload", payload);',
	'}',
].join('\n');

export interface CustomWidgetAuthoringInput {
	idSuffix: string;
	displayName: string;
	description?: string;
	html?: string;
	css?: string;
	javascript?: string;
	accent?: string;
	surface?: string;
	text?: string;
	hostPermissions?: readonly WidgetHostPermission[];
}

function cleanId(input: string): string {
	const cleaned = input
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return cleaned || 'custom-widget';
}

function assetContent(
	assets: readonly WidgetPackageAsset[],
	kind: WidgetPackageAsset['kind'],
): string {
	return assets.find((asset) => asset.kind === kind)?.content ?? '';
}

export function buildCustomWidgetAuthoringDraft(
	input: CustomWidgetAuthoringInput,
): WidgetWizardDraft {
	const suffix = cleanId(input.idSuffix);
	const displayName = input.displayName.trim() || 'Custom Widget';
	const accent = input.accent ?? '#2563eb';
	const surface = input.surface ?? '#101827';
	const text = input.text ?? '#f8fafc';
	return scaffoldCustomWidgetPackageDraft({
		packageId: `workspace.custom-widget.${suffix}`,
		widgetType: `custom-widget-${suffix}`,
		displayName,
		description: input.description,
		hostPermissions: input.hostPermissions ?? [],
		styleCapabilities: ['css-variables', 'custom-stylesheet', 'responsive-layout', 'animation'],
		// scaffoldCustomWidgetPackageDraft derives `--widget-<name>` CSS variables from these tokens.
		styleTokens: [
			{ name: 'accent', value: accent },
			{ name: 'surface', value: surface },
			{ name: 'text', value: text },
		],
		html: input.html?.trim() || DEFAULT_CUSTOM_WIDGET_HTML,
		css: input.css?.trim() || DEFAULT_CUSTOM_WIDGET_CSS,
		javascript: input.javascript?.trim() || DEFAULT_CUSTOM_WIDGET_JS,
	});
}

function withInjectedStyle(html: string, css: string): string {
	const style = `<style>${css}</style>`;
	// Function replacers keep `$`-sequences in author CSS ($&, $$, $1, …) literal instead of
	// letting String.replace interpret them as replacement patterns and corrupt the preview.
	if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, () => `${style}</head>`);
	if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (match) => `${match}${style}`);
	return `${style}${html}`;
}

function withInjectedScript(html: string, javascript: string): string {
	const safeScript = javascript.replace(/<\/script/gi, '<\\/script');
	const script = `<script type="module">${safeScript}</script>`;
	// See withInjectedStyle: a function replacer avoids `$`-pattern interpretation in author JS.
	if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, () => `${script}</body>`);
	return `${html}${script}`;
}

/** Inject a `<meta http-equiv="Content-Security-Policy">` as the FIRST child of `<head>` — a meta
 * CSP only governs resources that FOLLOW it, so it must precede every injected style/script. */
function withInjectedCsp(html: string, csp: string): string {
	const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
	if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => `${match}${meta}`);
	if (/<html[^>]*>/i.test(html))
		return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${meta}</head>`);
	return `${meta}${html}`;
}

/** Expose the resolved widget config to author code as a frozen `window.__WIDGET_CONFIG__` global,
 * set in `<head>` so it is available before the author module runs. */
function withInjectedConfig(html: string, config: Record<string, unknown>): string {
	// `<` is escaped so a string value can never open a tag and break out of the script element.
	const json = JSON.stringify(config).replace(/</g, '\\u003c');
	const script = `<script>window.__WIDGET_CONFIG__=Object.freeze(${json});</script>`;
	if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => `${match}${script}`);
	return `${script}${html}`;
}

/** A `:root` rule carrying the host-resolved `--widget-*` variables. CSS custom properties do NOT
 * cross the iframe boundary, so the host's customized tokens must be re-declared inside the document. */
function rootVarsCss(rootVars: Record<string, string>): string {
	const decls = Object.entries(rootVars)
		.map(([name, value]) => `${name}: ${value};`)
		.join(' ');
	return `:root { ${decls} }`;
}

export function composeCustomWidgetPreviewSrcdoc(input: {
	html: string;
	css: string;
	javascript: string;
	/** Content-Security-Policy for the iframe document (egress control). */
	csp?: string;
	/** Host-resolved, pre-sanitized `--widget-*` variables to re-declare on the iframe's `:root`. */
	rootVars?: Record<string, string>;
	/** Resolved widget configuration exposed to author code as `window.__WIDGET_CONFIG__`. */
	config?: Record<string, unknown>;
}): string {
	const base = /<!doctype|<html/i.test(input.html)
		? input.html
		: `<!doctype html><html lang="en"><head><meta charset="utf-8" /></head><body>${input.html}</body></html>`;
	let doc = withInjectedScript(withInjectedStyle(base, input.css), input.javascript);
	// Re-declare the host-resolved tokens AFTER the author CSS so a customized value wins.
	if (input.rootVars && Object.keys(input.rootVars).length > 0) {
		doc = withInjectedStyle(doc, rootVarsCss(input.rootVars));
	}
	if (input.config) doc = withInjectedConfig(doc, input.config);
	// CSP is injected LAST so that, inserting right after `<head>`, it ends up as the first head node.
	if (input.csp) doc = withInjectedCsp(doc, input.csp);
	return doc;
}

export function draftAssetContents(draft: WidgetWizardDraft): {
	html: string;
	css: string;
	javascript: string;
} {
	return {
		html: assetContent(draft.package.assets, 'html'),
		css: assetContent(draft.package.assets, 'css'),
		javascript: assetContent(draft.package.assets, 'javascript'),
	};
}
