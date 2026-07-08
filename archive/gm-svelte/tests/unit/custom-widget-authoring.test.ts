import { describe, expect, it } from 'vitest';
import {
	buildCustomWidgetAuthoringDraft,
	composeCustomWidgetPreviewSrcdoc,
	draftAssetContents,
} from '../../src/lib/gui/ux-canvas/custom-widget-authoring';

describe('custom widget authoring', () => {
	it('builds an unreviewed styled custom widget package draft with authored assets', () => {
		const draft = buildCustomWidgetAuthoringDraft({
			idSuffix: 'Boss Phase 01',
			displayName: 'Boss Phase',
			description: 'Track phase changes.',
			html: '<main class="boss">Boss</main>',
			css: '.boss { color: var(--widget-accent); }',
			javascript: 'export function render() { return true; }',
			accent: '#ef4444',
			hostPermissions: ['clipboard'],
		});

		expect(draft.state).toBe('unreviewed');
		expect(draft.package).toMatchObject({
			id: 'workspace.custom-widget.boss-phase-01',
			displayName: 'Boss Phase',
		});
		expect(draft.package.widgets[0]).toMatchObject({
			type: 'custom-widget-boss-phase-01',
			renderEntrypoint: {
				runtime: 'custom-html-js',
				sandbox: 'iframe',
				assetPath: 'widgets/custom-widget-boss-phase-01/index.html',
			},
			style: {
				isolation: 'iframe-document',
				stylesheetAssetPaths: ['widgets/custom-widget-boss-phase-01/styles.css'],
			},
			hostPermissions: ['clipboard'],
		});
		expect(draft.package.widgets[0]?.style?.tokens).toContainEqual({
			name: 'accent',
			value: '#ef4444',
		});
		expect(draft.review.requestedStyleCapabilities).toContain('custom-stylesheet');
		expect(draft.review.requestedHostPermissions).toEqual(['clipboard']);
		expect(draftAssetContents(draft)).toEqual({
			html: '<main class="boss">Boss</main>',
			css: '.boss { color: var(--widget-accent); }',
			javascript: 'export function render() { return true; }',
		});
	});

	it('composes a sandbox preview document with CSS and module JavaScript', () => {
		const srcdoc = composeCustomWidgetPreviewSrcdoc({
			html: '<main id="app"></main>',
			css: '#app { color: red; }',
			javascript: 'document.body.dataset.ready = "yes"; </script>',
		});
		expect(srcdoc).toContain('<style>#app { color: red; }</style>');
		expect(srcdoc).toContain('<script type="module">');
		expect(srcdoc).toContain('<\\/script>');
		expect(srcdoc).toContain('<main id="app"></main>');
	});

	it('injects a CSP, root variables, and config into the sandbox document (findings 6 + 11)', () => {
		const srcdoc = composeCustomWidgetPreviewSrcdoc({
			html: '<main id="app"></main>',
			css: ':root { --widget-accent: #000; }',
			javascript: 'render(window.__WIDGET_CONFIG__);',
			csp: "default-src 'none'; connect-src 'none'",
			rootVars: { '--widget-accent': 'rebeccapurple' },
			config: { formulas: 'd20', showHp: true },
		});
		// CSP meta is present and is the FIRST node inside <head> (it only governs what follows it).
		expect(srcdoc).toContain("content=\"default-src 'none'; connect-src 'none'\"");
		expect(srcdoc.indexOf('Content-Security-Policy')).toBeLessThan(srcdoc.indexOf('<style>'));
		// Host-resolved token is re-declared AFTER the author CSS so a customized value wins.
		const authorCssAt = srcdoc.indexOf('--widget-accent: #000;');
		const rootVarAt = srcdoc.indexOf('--widget-accent: rebeccapurple;');
		expect(rootVarAt).toBeGreaterThan(authorCssAt);
		// Config is exposed as a frozen global before the author module runs.
		expect(srcdoc).toContain('window.__WIDGET_CONFIG__=Object.freeze(');
		expect(srcdoc).toContain('"formulas":"d20"');
	});

	it('does not inject a CSP/config block when none are supplied (authoring preview is unchanged)', () => {
		const srcdoc = composeCustomWidgetPreviewSrcdoc({
			html: '<main></main>',
			css: '',
			javascript: '',
		});
		expect(srcdoc).not.toContain('Content-Security-Policy');
		expect(srcdoc).not.toContain('__WIDGET_CONFIG__');
	});
});
