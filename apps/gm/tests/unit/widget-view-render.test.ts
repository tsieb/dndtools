// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import {
	createSystemWidgetPackages,
	findWidgetDefinition,
	type WidgetDefinition,
	type WidgetInstance,
} from '@dndtools/core';
import { resetCoreStorage } from '../../src/lib/platform/storage/scene-store';
import { SceneRuntime, defaultEnvironment } from '../../src/lib/canvas-runtime/runtime.svelte';
import RuntimeWidgetFixture from './fixtures/RuntimeWidgetFixture.svelte';

/**
 * Renders widgets through the UNIFIED WidgetView (the single render path for every surface) over a
 * real, seeded SceneRuntime provided via context. Covers the MapWidget bound/unbound/no-leak states,
 * the cross-surface invariant (a definition renders consistently on scene vs command-center), the
 * fail-soft placeholder, and a data-template's context-specific empty label.
 */

const SYSTEM = createSystemWidgetPackages();
function def(type: string): WidgetDefinition {
	const d = findWidgetDefinition(SYSTEM, type);
	if (!d) throw new Error(`missing widget definition ${type}`);
	return d;
}

function mapWidget(boundMapId: string | null): WidgetInstance {
	return {
		id: 'w-map',
		type: 'map',
		version: '1.0.0',
		layout: { x: 0, y: 0, w: 360, h: 280, z: 1 },
		configuration: {},
		binding: boundMapId
			? {
					source: { entityType: 'map', entityId: boundMapId },
					mode: 'read',
					requiredCapability: 'viewer',
				}
			: null,
	} as unknown as WidgetInstance;
}

let runtime: SceneRuntime;
beforeEach(async () => {
	await resetCoreStorage();
	runtime = new SceneRuntime({ env: defaultEnvironment(), defaultActorId: 'local-dm' });
	await runtime.load();
});

function renderWidget(props: {
	definition: WidgetDefinition;
	widget?: WidgetInstance | null;
	config?: Record<string, unknown>;
	surface?: 'scene' | 'command-center';
}): string {
	return render(RuntimeWidgetFixture, { props: { runtime, ...props } }).body;
}

describe('MapWidget — bound vs unbound (UX-CANVAS-007/008)', () => {
	it('renders the explicit "No map bound" state (never an arbitrary first map) when unbound', () => {
		const body = renderWidget({ definition: def('map'), widget: mapWidget(null) });
		expect(body).toContain('No map bound');
		// The launch link deep-links to the Atlas index, NOT a specific map.
		expect(body).toContain('href="/atlas/"');
		expect(body).not.toContain('?map=');
		// No demo map name leaks into the unbound state (it must not fall back to maps[0]).
		expect(body).not.toContain('Western Reaches');
	});

	it('renders the bound map, its regions, and a deep link to /atlas/?map=<id>', () => {
		const body = renderWidget({ definition: def('map'), widget: mapWidget('map-western-reaches') });
		expect(body).toContain('Western Reaches');
		expect(body).toContain('North Road'); // a region of the bound map
		expect(body).toContain('href="/atlas/?map=map-western-reaches"');
	});

	it('falls back to "No map bound" when the bound map id does not resolve', () => {
		const body = renderWidget({ definition: def('map'), widget: mapWidget('map-does-not-exist') });
		expect(body).toContain('No map bound');
		expect(body).toContain('href="/atlas/"');
	});

	it('NO-LEAK: a player never sees a DM-only bound map — renders unbound, no name/region leak', () => {
		runtime.setActiveActor('actor-player');
		const body = renderWidget({ definition: def('map'), widget: mapWidget('map-hidden-outpost') });
		expect(body).toContain('No map bound');
		expect(body).not.toContain('Hidden Outpost'); // the dm-only map name
		expect(body).not.toContain('Outpost Yard'); // a dm-only map region name
	});
});

describe('WidgetView — cross-surface invariant + fail-soft placeholder', () => {
	// A definition whose template renderer cannot be resolved (template kind missing).
	const broken = {
		...def('note'),
		renderEntrypoint: { runtime: 'template', template: undefined, hostApiVersion: 1 },
	} as unknown as WidgetDefinition;

	const wrapperStyle = (body: string) =>
		/<div class="widget-view[^"]*"[^>]*\sstyle="([^"]*)"/.exec(body)?.[1];

	it('renders the SAME definition identically on scene vs command-center (token vars + placeholder)', () => {
		const scene = renderWidget({ definition: broken, surface: 'scene' });
		const cc = renderWidget({ definition: broken, surface: 'command-center' });
		// Fail-soft: a definition with no resolvable renderer renders the placeholder on BOTH surfaces.
		expect(scene).toContain('data-testid="widget-view-placeholder"');
		expect(cc).toContain('data-testid="widget-view-placeholder"');
		// The token CSS variables are applied identically regardless of surface.
		expect(wrapperStyle(scene)).toBe(wrapperStyle(cc));
		expect(wrapperStyle(scene)).toContain('--widget-accent: var(--color-accent)');
		expect(wrapperStyle(scene)).toContain('--widget-text: var(--color-text-primary)');
	});

	it('applies a per-instance style-token override into the wrapper CSS variables', () => {
		const body = renderWidget({
			definition: broken,
			config: { styleTokens: { accent: '#ff0000' } },
		});
		expect(wrapperStyle(body)).toContain('--widget-accent: #ff0000');
	});

	it('a builtin renderer (map, unbound) renders the same body on scene and command-center', () => {
		const scene = renderWidget({ definition: def('map'), widget: mapWidget(null), surface: 'scene' });
		const cc = renderWidget({
			definition: def('map'),
			widget: mapWidget(null),
			surface: 'command-center',
		});
		expect(scene).toContain('No map bound');
		expect(cc).toContain('No map bound');
	});
});

describe('TemplateDataTable (via WidgetView) — context-specific empty label (gap 3)', () => {
	it('shows the resolver\'s "no data yet" label, not a generic one, when the model is empty', () => {
		// quick-reference reads the content-objects model, which is empty in a fresh runtime.
		const body = renderWidget({ definition: def('quick-reference') });
		expect(body).toContain('data-widget-template="data-table"');
		expect(body).toContain('data-testid="widget-table-filter"');
		expect(body).toContain('No notes yet.');
		// It is NOT the catch-all fallback string.
		expect(body).not.toContain('Nothing here yet.');
	});
});
