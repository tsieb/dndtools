// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import type { WidgetDefinition } from '@dndtools/core';
import CanvasPropertiesPanel from '../../src/lib/gui/ux-canvas/CanvasPropertiesPanel.svelte';
import WidgetCustomizePanel from '../../src/lib/gui/ux-canvas/widgets/WidgetCustomizePanel.svelte';
import type { DashboardBlock } from '../../src/lib/gui/ux-canvas/dashboard/dashboard-layout.svelte';

// A definition exercising every customization surface: content + display fields (so the CC panel
// shows >1 tab group) plus two style tokens. Cast minimally — the panels read only configFields,
// style.tokens, displayName/description, minSize/resizePolicy.
const definition = {
	displayName: 'Sample Widget',
	description: 'A sample widget for testing.',
	resizePolicy: 'free',
	minSize: { width: 100, height: 100 },
	configFields: [
		{
			key: 'mode',
			label: 'Mode',
			control: 'select',
			group: 'content',
			options: [
				{ value: 'a', label: 'Alpha' },
				{ value: 'b', label: 'Beta' },
			],
			default: 'a',
			help: 'Pick a mode.',
		},
		{ key: 'showVitals', label: 'Vitals', control: 'toggle', group: 'display', default: true },
	],
	style: {
		tokens: [
			{ name: 'accent', value: 'var(--color-accent)', description: 'Accent color.' },
			{ name: 'text', value: 'var(--color-text-primary)', description: 'Text color.' },
		],
	},
} as unknown as WidgetDefinition;

const noop = () => {};

describe('CanvasPropertiesPanel — tablist/tabpanel ARIA wiring (B1, UX-A11Y-012)', () => {
	const block = {
		id: 'b1',
		type: 'note',
		rect: { x: 0, y: 0, w: 200, h: 200 },
		z: 1,
		config: {},
	} as unknown as DashboardBlock;

	const body = render(CanvasPropertiesPanel, {
		props: {
			block,
			locked: false,
			definition,
			onRect: noop,
			onConfigure: noop,
			onBringToFront: noop,
			onClose: noop,
		},
	}).body;

	it('wires tablist/tab/tabpanel with aria-selected, aria-controls, aria-labelledby, roving tabindex', () => {
		expect(body).toContain('role="tablist"');
		expect(body).toContain('aria-label="Property groups"');
		expect(body).toContain('role="tab"');
		expect(body).toContain('role="tabpanel"');
		expect(body).toContain('aria-selected="true"');
		expect(body).toContain('aria-selected="false"');
		// Roving tabindex: the selected tab is in the Tab order, the rest are out of it.
		expect(body).toContain('tabindex="0"');
		expect(body).toContain('tabindex="-1"');
		// Each tab points at a panel, and the visible panel is labelled by the active tab.
		expect(body).toMatch(/aria-controls="props-group-\d+-panel-layout"/);
		expect(body).toMatch(/role="tabpanel"[^>]*id="props-group-\d+-panel-layout"/);
		expect(body).toMatch(/aria-labelledby="props-group-\d+-tab-layout"/);
	});

	it('preserves the panel data-testids and renders every group tab', () => {
		for (const id of ['canvas-properties-panel', 'props-panel-title', 'props-panel-close']) {
			expect(body).toContain(`data-testid="${id}"`);
		}
		for (const tab of ['layout', 'content', 'display', 'style']) {
			expect(body).toContain(`data-testid="props-tab-${tab}"`);
		}
	});

	it('surfaces the definition description as a subtitle (B9)', () => {
		expect(body).toContain('data-testid="props-panel-description"');
		expect(body).toContain('A sample widget for testing.');
	});
});

describe('WidgetCustomizePanel — field-behaviour consistency (B2/B5/B7/B9)', () => {
	const body = render(WidgetCustomizePanel, {
		props: {
			definition,
			config: {},
			styleTokens: { accent: '#ff0000' },
			size: null,
			onConfig: noop,
			onStyleToken: noop,
		},
	}).body;

	it('renders the description subtitle (B9)', () => {
		expect(body).toContain('data-testid="customize-description"');
		expect(body).toContain('A sample widget for testing.');
	});

	it('renders field help linked via aria-describedby, outside the label (B5)', () => {
		expect(body).toContain('Pick a mode.');
		const helpId = /id="(customize-\d+-help-mode)"/.exec(body)?.[1];
		expect(helpId).toBeTruthy();
		expect(body).toContain(`aria-describedby="${helpId}"`);
		// The help span is a sibling AFTER the field label, not nested inside it (accessible name hygiene).
		const labelClose = body.indexOf('</label>', body.indexOf('customize-field-mode'));
		const helpPos = body.indexOf(`id="${helpId}"`);
		expect(helpPos).toBeGreaterThan(labelClose);
	});

	it('labels style-token state honestly instead of a lying gray swatch (B2)', () => {
		// accent is overridden → "Custom"; text is un-overridden → "Theme default" (not a misleading swatch).
		expect(body).toContain('data-testid="customize-token-state-accent"');
		expect(body).toContain('data-testid="customize-token-state-text"');
		expect(body).toContain('Custom');
		expect(body).toContain('Theme default');
	});

	it('relabels the token reset control as a clear revert (B7)', () => {
		expect(body).toContain('aria-label="Reset accent to theme default"');
		expect(body).toContain('aria-label="Reset text to theme default"');
		// The un-overridden token's reset is disabled; the overridden one is enabled.
		expect(body).toMatch(/data-testid="customize-token-reset-text"[^>]*disabled/);
	});

	it('preserves the customize data-testids', () => {
		for (const id of [
			'widget-customize-panel',
			'customize-field-mode',
			'customize-field-showVitals',
			'customize-token-accent',
			'customize-token-text',
		]) {
			expect(body).toContain(`data-testid="${id}"`);
		}
	});
});

describe('CanvasPropertiesPanel — single-group degenerates to no tablist (B1 edge)', () => {
	// A widget with NO config fields and NO style tokens has only the Layout group, so there is no
	// tablist to render (a lone "Layout" tab would be a meaningless control). isTabbed must be false.
	const bareDefinition = {
		displayName: 'Bare Widget',
		resizePolicy: 'free',
		minSize: { width: 100, height: 100 },
		configFields: [],
		style: { tokens: [] },
	} as unknown as WidgetDefinition;

	const block = {
		id: 'b2',
		type: 'note',
		rect: { x: 5, y: 6, w: 220, h: 160 },
		z: 1,
		config: {},
	} as unknown as DashboardBlock;

	const body = render(CanvasPropertiesPanel, {
		props: {
			block,
			locked: false,
			definition: bareDefinition,
			onRect: noop,
			onConfigure: noop,
			onBringToFront: noop,
			onClose: noop,
		},
	}).body;

	it('renders no tablist / tab / tabpanel and no plain-region tabpanel role', () => {
		expect(body).not.toContain('role="tablist"');
		expect(body).not.toContain('role="tab"');
		expect(body).not.toContain('role="tabpanel"');
		// No tab data-testids are emitted either.
		for (const tab of ['layout', 'content', 'display', 'style']) {
			expect(body).not.toContain(`data-testid="props-tab-${tab}"`);
		}
	});

	it('still renders the Layout group with min-constrained width/height rect inputs', () => {
		expect(body).toContain('data-testid="props-rect-w"');
		expect(body).toContain('data-testid="props-rect-h"');
		// The width/height inputs carry a non-zero minimum (the size floor); x/y are min 0.
		expect(body).toMatch(/min="(1[0-9]{2,}|[2-9][0-9]+)"[^>]*data-testid="props-rect-w"/);
		expect(body).toMatch(/min="\d+"[^>]*data-testid="props-rect-h"/);
		// The current rect values are reflected.
		expect(body).toMatch(/value="5"[^>]*data-testid="props-rect-x"/);
	});
});

describe('WidgetCustomizePanel — numeric field bounds are wired onto the control (B8 structural)', () => {
	// The interaction-driven clamp-on-commit is covered by the scene e2e; here we assert the static
	// min/max/step contract the native control + commitNumber both rely on is actually emitted.
	const numberDefinition = {
		displayName: 'Counter',
		resizePolicy: 'free',
		minSize: { width: 100, height: 100 },
		configFields: [
			{ key: 'count', label: 'Rows shown', control: 'number', group: 'content', default: 8, min: 1, max: 50, step: 1 },
		],
		style: { tokens: [] },
	} as unknown as WidgetDefinition;

	const body = render(WidgetCustomizePanel, {
		props: {
			definition: numberDefinition,
			config: {},
			styleTokens: {},
			size: null,
			onConfig: noop,
			onStyleToken: noop,
		},
	}).body;

	it('emits min/max/step and the resolved default value on the number input', () => {
		const field = /<label class="customize-field[^"]*" data-testid="customize-field-count">[\s\S]*?<\/label>/.exec(body)?.[0] ?? '';
		expect(field).toContain('type="number"');
		expect(field).toContain('min="1"');
		expect(field).toContain('max="50"');
		expect(field).toContain('step="1"');
		expect(field).toContain('value="8"'); // the config-field default, resolved into the control
	});
});
