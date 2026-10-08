import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	boardWidgetsOf,
	fitWidgetSize,
	widgetSizePresets,
	isWidgetResizable,
	type BoardWidget,
} from './board-helpers';

describe('one predicate decides whether a widget can be resized', () => {
	it.each(['system', 'template', 'custom', 'ai'])('ignores the %s tier', (tier) => {
		const widget = {
			minSize: undefined,
			get tier() {
				throw new Error(tier);
			},
		};
		expect(isWidgetResizable(widget)).toBe(true);
	});
	it('honours an explicit fixed resize policy', () => {
		expect(isWidgetResizable({ resizePolicy: 'fixed' })).toBe(false);
	});
	it('locks only when both declared dimensions are fixed', () => {
		expect(
			isWidgetResizable({
				minSize: { width: 100, height: 80 },
				maxSize: { width: 100, height: 80 },
			}),
		).toBe(false);
		expect(
			isWidgetResizable({
				minSize: { width: 100, height: 80 },
				maxSize: { width: 100, height: 160 },
			}),
		).toBe(true);
	});
});

describe('both size affordances ask the same predicate', () => {
	// A structural scan, because the two surfaces are far apart and the failure mode is precisely
	// that one of them stops asking. `import.meta.url` resolves against the DOCUMENT url under
	// vitest's jsdom environment, so build the path from process.cwd() (the app project runs from
	// the repo root).
	const read = (rel: string) =>
		readFileSync(join(process.cwd(), 'apps/gm-react/src', rel), 'utf8')
			.split('\n')
			.filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
			.join('\n');

	it('the canvas derives `resizable` from it', () => {
		const src = read('app/SceneBoardCanvas.tsx');
		expect(src).toMatch(/isWidgetResizable\(w\)/);
		// And the old inline duplicate is gone, so the rule cannot drift in one place only.
		expect(src).not.toMatch(/w\.tier !== 'system'/);
	});

	it('the Inspector gates its Size buttons on it', () => {
		// RC-POL-1.3 moved the Size buttons into the Transform tab's own file; the Inspector still
		// derives the flag and hands it down.
		const src = read('screens/sceneEditor/Inspector.tsx');
		expect(src).toMatch(/const resizable = isWidgetResizable\(widget\)/);
		expect(src).toMatch(/resizable=\{resizable\}/);
		expect(read('screens/sceneEditor/InspectorTransform.tsx')).toMatch(/\{resizable \?/);
	});
});

import { BUILTIN_SIZE_BOUNDS, BUILTIN_WIDGET_TYPES } from './widgets/builtin';
describe('every builtin declares host bounds without changing stored layout', () => {
	it.each(BUILTIN_WIDGET_TYPES)('%s stays resizable from a grid cell to the board', (type) => {
		const bounds = BUILTIN_SIZE_BOUNDS[type];
		expect(bounds.minSize).toEqual({ width: 20, height: 20 });
		expect(bounds.maxSize).toEqual({ width: Infinity, height: Infinity });
		expect(isWidgetResizable(bounds)).toBe(true);
		const widget = { ...bounds, x: 24 } as BoardWidget;
		expect(fitWidgetSize(widget, 1, 1, true)).toEqual({ w: 20, h: 20 });
		expect(fitWidgetSize(widget, 10000, 10000, true)).toEqual({ w: 768, h: 10000 });
		const instance = {
			id: type,
			type,
			configuration: {},
			layout: { x: 24, y: 24, w: 240, h: 160 },
		};
		const [mapped] = boardWidgetsOf([instance as never], new Map(), () => null, {
			includeUndelivered: true,
		});
		expect(mapped).toMatchObject({ ...bounds, w: 240, h: 160 });
		expect(instance.layout).toEqual({ x: 24, y: 24, w: 240, h: 160 });
	});
	it('clamps a declared finite maximum on both axes', () => {
		const widget = {
			x: 0,
			minSize: { width: 20, height: 20 },
			maxSize: { width: 300, height: 200 },
		} as BoardWidget;
		expect(fitWidgetSize(widget, 900, 900, false)).toEqual({ w: 300, h: 200 });
	});
});

it('keeps labelled S/M/L entries when Small and Medium coincide', () => {
	const widget = {
		x: 0,
		minSize: { width: 100, height: 100 },
		defaultSize: { width: 100, height: 100 },
	} as BoardWidget;
	expect(widgetSizePresets(widget, false, false)).toEqual([
		{ w: 100, h: 100 },
		{ w: 100, h: 100 },
		{ w: 150, h: 150 },
	]);
	expect(widgetSizePresets(widget)).toHaveLength(2);
});
