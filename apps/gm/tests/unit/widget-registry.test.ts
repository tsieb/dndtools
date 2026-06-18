import { describe, expect, it } from 'vitest';
import { createSystemWidgetPackages, findWidgetDefinition, type WidgetDefinition } from '@dndtools/core';
import { resolveWidgetRenderer } from '$lib/gui/ux-canvas/widgets/widget-registry';

const SYSTEM = createSystemWidgetPackages();
function def(type: string): WidgetDefinition {
	const d = findWidgetDefinition(SYSTEM, type);
	if (!d) throw new Error(`missing ${type}`);
	return d;
}

describe('widget render registry', () => {
	it('resolves a template widget to its template component', () => {
		expect(resolveWidgetRenderer(def('quick-reference')).kind).toBe('template'); // data-table
		expect(resolveWidgetRenderer(def('note')).kind).toBe('template'); // form-panel
		expect(resolveWidgetRenderer(def('timer')).kind).toBe('template'); // tracker
	});

	it('resolves a builtin widget (system + command-center) to its app component', () => {
		expect(resolveWidgetRenderer(def('map')).kind).toBe('builtin');
		expect(resolveWidgetRenderer(def('data-hub')).kind).toBe('builtin');
		expect(resolveWidgetRenderer(def('session')).kind).toBe('builtin');
	});

	it('falls back to a placeholder for an unknown renderer', () => {
		const broken: WidgetDefinition = {
			...def('note'),
			renderEntrypoint: { runtime: 'template', template: undefined, hostApiVersion: 1 },
		};
		const resolved = resolveWidgetRenderer(broken);
		expect(resolved.kind).toBe('placeholder');
	});

	it('reports a custom-html-js widget as custom (sandboxed frame)', () => {
		const custom: WidgetDefinition = {
			...def('note'),
			renderEntrypoint: {
				runtime: 'custom-html-js',
				sandbox: 'iframe',
				assetPath: 'widgets/x/index.html',
				hostApiVersion: 1,
			},
		};
		expect(resolveWidgetRenderer(custom).kind).toBe('custom');
	});
});
