import { describe, expect, it } from 'vitest';
import { createSystemWidgetPackages, findWidgetDefinition, type WidgetDefinition } from '@dndtools/core';
import { resolveWidgetRenderer } from '$lib/gui/ux-canvas/widgets/widget-registry';
import { WIDGET_LIBRARY } from '$lib/gui/ux-canvas/widget-library';

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

describe('widget library catalogue stays in sync with core definitions', () => {
	// The GUI WIDGET_LIBRARY is a parallel catalogue; its `type` values MUST each resolve to a real
	// core widget definition or a placed widget renders nothing (this drift has broken once before:
	// initiative/ambience/reference → initiative-tracker/audio/quick-reference). This guards the type
	// mapping without asserting the intentionally-divergent profile/size details.
	it('every library entry type resolves to a core definition and a real renderer', () => {
		for (const entry of WIDGET_LIBRARY) {
			const definition = findWidgetDefinition(SYSTEM, entry.type);
			expect(definition, `library type "${entry.type}" has no core definition`).toBeDefined();
			expect(
				resolveWidgetRenderer(definition!).kind,
				`library type "${entry.type}" resolves to a placeholder`,
			).not.toBe('placeholder');
		}
	});
});
