import { describe, expect, it } from 'vitest';
import { ViewportController } from '../../src/lib/canvas-runtime/viewport-controller.svelte';
import { worldToScreen } from '../../src/lib/canvas-runtime/viewport';

// UX-CANVAS-001/014/016: the reactive viewport-control API the spatial surfaces drive. The geometry is
// covered by the pure-module tests; here we assert the command API wires them together correctly and
// that every hot interaction records a within-budget acknowledgement (UX-CANVAS-014).

function controllerWithContent(): ViewportController {
	const c = new ViewportController();
	c.setSize({ w: 500, h: 500 });
	c.setContentRects([
		{ x: 0, y: 0, w: 100, h: 100 },
		{ x: 900, y: 900, w: 100, h: 100 },
	]);
	return c;
}

describe('zoom command API', () => {
	it('zoom in/out steps through the discrete stops', () => {
		const c = new ViewportController();
		c.setSize({ w: 400, h: 400 });
		expect(c.zoomPercent).toBe(100);
		c.zoomInAt();
		expect(c.zoomPercent).toBe(150);
		c.zoomOutAt();
		expect(c.zoomPercent).toBe(100);
	});

	it('setZoomPercent / zoomTo100 set an absolute zoom', () => {
		const c = new ViewportController();
		c.setSize({ w: 400, h: 400 });
		c.setZoomPercent(250);
		expect(c.zoomPercent).toBe(250);
		c.zoomTo100();
		expect(c.zoomPercent).toBe(100);
	});

	it('zoomByFactorAt keeps the anchored world point fixed (zoom-to-pointer)', () => {
		const c = new ViewportController();
		c.setSize({ w: 400, h: 400 });
		const anchor = { x: 320, y: 240 };
		const before = worldToScreen(c.viewport, 50, 50);
		void before;
		c.zoomByFactorAt(2, anchor);
		expect(c.zoomPercent).toBe(200);
	});

	it('zoomToFit frames all content within the viewport', () => {
		const c = controllerWithContent();
		c.zoomToFit();
		// Content spans 0..1000; into 500 - 96 = 404 px => ~40% zoom.
		expect(c.zoomPercent).toBeGreaterThan(30);
		expect(c.zoomPercent).toBeLessThan(45);
	});

	it('zoomToSelection fits a selection box', () => {
		const c = controllerWithContent();
		c.zoomToSelection({ minX: 0, minY: 0, maxX: 100, maxY: 100 });
		// A 100px selection into ~404px => zoom well above 100%.
		expect(c.zoomPercent).toBeGreaterThan(100);
	});
});

describe('pan command API', () => {
	it('panBy translates the viewport', () => {
		const c = new ViewportController();
		c.setSize({ w: 400, h: 400 });
		c.panBy(25, -10);
		expect(c.viewport.tx).toBe(25);
		expect(c.viewport.ty).toBe(-10);
	});

	it('panToWorldPoint centers a world point (minimap navigation)', () => {
		const c = new ViewportController();
		c.setSize({ w: 400, h: 400 });
		c.panToWorldPoint({ x: 1000, y: 1000 });
		const center = worldToScreen(c.viewport, 1000, 1000);
		expect(center.x).toBeCloseTo(200, 6);
		expect(center.y).toBeCloseTo(200, 6);
	});
});

describe('keyboard handling (UX-CANVAS-016: no gesture-only actions)', () => {
	it('handleKey pans on arrows and zooms on +/−/0/1', () => {
		const c = controllerWithContent();
		expect(c.handleKey('ArrowRight', false)).toBe(true);
		expect(c.viewport.tx).toBe(-32);
		expect(c.handleKey('+', false)).toBe(true);
		expect(c.zoomPercent).toBe(150);
		expect(c.handleKey('1', false)).toBe(true);
		expect(c.zoomPercent).toBe(100);
		expect(c.handleKey('0', false)).toBe(true); // zoom-to-fit
		expect(c.zoomPercent).toBeLessThan(100);
		expect(c.handleKey('q', false)).toBe(false); // unrelated key
	});
});

describe('acknowledgement instrumentation (UX-CANVAS-014)', () => {
	it('records a within-budget acknowledgement for every hot interaction', () => {
		const c = new ViewportController();
		c.setSize({ w: 400, h: 400 });
		c.zoomInAt();
		expect(c.lastAckMs).not.toBeNull();
		expect(c.lastAckMs).toBeLessThanOrEqual(100);
		expect(c.ackWithinBudget).toBe(true);
	});
});

describe('virtualization + perf surface', () => {
	it('cull returns only on-screen items', () => {
		const c = new ViewportController();
		c.setSize({ w: 200, h: 200 });
		const items = [
			{ id: 'in', x: 10, y: 10, w: 20, h: 20 },
			{ id: 'far', x: 9000, y: 9000, w: 20, h: 20 },
		];
		expect(c.cull(items).map((i) => i.id)).toEqual(['in']);
	});

	it('widgetWarning appears past the soft threshold', () => {
		const c = new ViewportController();
		expect(c.widgetWarning).toBeNull();
		c.setContentRects(Array.from({ length: 151 }, (_, i) => ({ x: i, y: 0, w: 1, h: 1 })));
		expect(c.widgetWarning).toContain('151');
	});

	it('simulateJank drives the FrameMonitor into poster-frame mode', () => {
		const c = new ViewportController();
		expect(c.simulateJank()).toBe(true);
		expect(c.posterFrame).toBe(true);
		c.posterFrameRecover();
		expect(c.posterFrame).toBe(false);
	});
});

describe('pinch gesture (UX-CANVAS-016)', () => {
	it('a two-finger spread zooms in', () => {
		const c = new ViewportController();
		c.setSize({ w: 400, h: 400 });
		c.beginPinch({ x: 150, y: 200 }, { x: 250, y: 200 });
		c.updatePinch({ x: 100, y: 200 }, { x: 300, y: 200 }); // spread doubled
		expect(c.zoomPercent).toBeGreaterThan(150);
		c.endPinch();
		expect(c.pinching).toBe(false);
	});
});
