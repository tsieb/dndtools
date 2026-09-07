import { describe, expect, it } from 'vitest';
import {
	QUICK_MAP_TOOL_IDS,
	isQuickMapTool,
	normalizeQuickMapTool,
	inertialPanStep,
	nextDoubleTapZoom,
	panVelocityFromSamples,
	viewportForAnchoredZoom,
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

describe('RC-MAP-4.3 touch gesture model', () => {
	it('holds the tapped point still through a double-tap zoom step', () => {
		const viewport = viewportForAnchoredZoom({
			zoom: 1,
			center: { x: 0.5, y: 0.5 },
			factor: 2,
			anchor: { x: 300, y: 200 },
			width: 400,
			height: 400,
		});
		expect(viewport.zoom).toBe(2);
		// The map point under x=75% is still under x=75% at the new zoom.
		expect(viewport.center.x).toBeCloseTo(0.625);
		expect(viewport.center.y).toBeCloseTo(0.5);
	});

	it('wraps the double-tap step back to 1x once past the zoom ceiling', () => {
		expect(nextDoubleTapZoom(1)).toBe(2);
		expect(nextDoubleTapZoom(2)).toBe(4);
		expect(nextDoubleTapZoom(4)).toBe(1);
	});

	it('reads a fling as centre velocity opposite the finger, scaled by zoom', () => {
		const slow = panVelocityFromSamples(
			[
				{ x: 200, y: 200, t: 0 },
				{ x: 260, y: 200, t: 60 },
			],
			{ zoom: 1, width: 400, height: 400 },
		);
		// The finger went right, so the map centre travels left.
		expect(slow.x).toBeLessThan(0);
		expect(slow.y).toBeCloseTo(0);
		const zoomedIn = panVelocityFromSamples(
			[
				{ x: 200, y: 200, t: 0 },
				{ x: 260, y: 200, t: 60 },
			],
			{ zoom: 4, width: 400, height: 400 },
		);
		expect(Math.abs(zoomedIn.x)).toBeCloseTo(Math.abs(slow.x) / 4);
	});

	it('ignores a finger that paused before lifting, and a single sample', () => {
		expect(
			panVelocityFromSamples(
				[
					{ x: 200, y: 200, t: 0 },
					{ x: 300, y: 200, t: 400 },
					{ x: 300, y: 200, t: 500 },
				],
				{ zoom: 1, width: 400, height: 400 },
			),
		).toEqual({ x: 0, y: 0 });
		expect(
			panVelocityFromSamples([{ x: 1, y: 1, t: 0 }], { zoom: 1, width: 400, height: 400 }),
		).toEqual({ x: 0, y: 0 });
	});

	it('glides and decays to a stop, staying inside the map', () => {
		let state = { center: { x: 0.5, y: 0.5 }, velocity: { x: 0.0005, y: 0 } };
		let frames = 0;
		for (; frames < 600; frames += 1) {
			const step = inertialPanStep({ ...state, dtMs: 16 });
			state = { center: step.center, velocity: step.velocity };
			if (step.done) break;
		}
		expect(frames).toBeGreaterThan(2);
		expect(frames).toBeLessThan(600);
		expect(state.center.x).toBeGreaterThan(0.5);
		expect(state.center.x).toBeLessThanOrEqual(1);
	});

	it('stops the glide the moment the centre is pinned at an edge', () => {
		const step = inertialPanStep({
			center: { x: 1, y: 1 },
			velocity: { x: 0.001, y: 0.001 },
			dtMs: 16,
		});
		expect(step.done).toBe(true);
		expect(step.center).toEqual({ x: 1, y: 1 });
	});
});
