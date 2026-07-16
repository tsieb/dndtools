import { describe, expect, it } from 'vitest';
import {
	QUICK_MAP_TOOL_IDS,
	isQuickMapTool,
	normalizeQuickMapTool,
	viewportForPinch,
} from './quickMap';

describe('Android quick map tools', () => {
	it('keeps the supported live-session tools and hides precision authoring tools', () => {
		expect(QUICK_MAP_TOOL_IDS).toEqual(['pan', 'select', 'token', 'poi', 'fog', 'generate']);
		expect(isQuickMapTool('fog')).toBe(true);
		expect(isQuickMapTool('wall')).toBe(false);
		expect(isQuickMapTool('brush')).toBe(false);
	});

	it('fails safe to navigation when a desktop-only tool reaches Android', () => {
		expect(normalizeQuickMapTool('room')).toBe('pan');
		expect(normalizeQuickMapTool('token')).toBe('token');
	});
});

describe('quick map pinch viewport', () => {
	it('zooms around the gesture centroid', () => {
		const viewport = viewportForPinch({
			startZoom: 1,
			startCenter: { x: 0.5, y: 0.5 },
			startCentroid: { x: 300, y: 200 },
			centroid: { x: 300, y: 200 },
			startDistance: 100,
			distance: 200,
			width: 400,
			height: 400,
		});
		expect(viewport.zoom).toBe(2);
		// The map point under x=75% remains under x=75% after the pinch.
		expect(viewport.center.x).toBeCloseTo(0.625);
		expect(viewport.center.y).toBeCloseTo(0.5);
	});

	it('combines pinch with two-finger pan and clamps the supported zoom range', () => {
		const viewport = viewportForPinch({
			startZoom: 5,
			startCenter: { x: 0.5, y: 0.5 },
			startCentroid: { x: 200, y: 200 },
			centroid: { x: 240, y: 160 },
			startDistance: 100,
			distance: 300,
			width: 400,
			height: 400,
		});
		expect(viewport.zoom).toBe(6);
		expect(viewport.center.x).toBeLessThan(0.5);
		expect(viewport.center.y).toBeGreaterThan(0.5);
	});
});
