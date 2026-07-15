import { describe, expect, it } from 'vitest';
import type { MapEntity, MapFeature } from '../src/state/map-state';
import { normalizeMapEntity, normalizeMapLayer } from '../src/state/map-state';
import { exportUvtt, exportUvttJson, type UvttDocument } from '../src/export/uvtt';

const NOW = '2026-07-14T00:00:00.000Z';

function mapWith(content: MapFeature[], gridSize = 30): MapEntity {
	return normalizeMapEntity({
		id: 'map-test',
		name: 'Test',
		description: '',
		visibility: 'dm-only',
		scale: { unitsPerMap: 150, unit: 'feet' },
		layers: [
			normalizeMapLayer(
				{
					id: 'layer-derived',
					name: 'Derived',
					category: 'base',
					visibility: 'dm-only',
					enabled: true,
					opacity: 1,
					content,
				},
				0,
			),
		],
		regions: [],
		overlay: {
			mode: 'none',
			gridVisible: true,
			gridSize,
			tokensEnabled: false,
			unitsPerCell: 5,
			revision: 1,
			updatedBy: null,
			updatedAt: NOW,
		},
		defaultRegionId: null,
		updatedAt: NOW,
		revision: 1,
	});
}

const WALL: MapFeature = {
	id: 'w1',
	kind: 'wall',
	points: [
		{ x: 0.5, y: 0.25 },
		{ x: 0.5, y: 0.75 },
		{ x: 0.25, y: 0.75 },
	],
	style: 'wall:stone',
	props: { blocksSight: true, thickness: 0.004 },
};

const DOOR: MapFeature = {
	id: 'd1',
	kind: 'door',
	points: [
		{ x: 0.5, y: 0.4 },
		{ x: 0.5, y: 0.5 },
	],
	style: 'door:door',
	props: { portal: 'door', state: 'closed' },
};

const LIGHT: MapFeature = {
	id: 'l1',
	kind: 'light',
	points: [{ x: 0.25, y: 0.5 }],
	style: 'light:torch',
	props: { radius: 0.05, dimRadius: 0.1, color: 'ffd6aa', intensity: 1 },
};

describe('exportUvtt — coordinates are GRID SQUARES, not normalized and not pixels', () => {
	it('scales normalized 0.5 to square 15 on a 30-square map', () => {
		const doc = exportUvtt(mapWith([WALL, DOOR, LIGHT]), { gridSize: 100 });

		expect(doc.resolution.map_size).toEqual({ x: 30, y: 30 });
		expect(doc.resolution.map_origin).toEqual({ x: 0, y: 0 });
		expect(doc.resolution.pixels_per_grid).toBe(100);

		// THE assertion this whole exporter turns on.
		expect(doc.line_of_sight[0]![0]).toEqual({ x: 15, y: 7.5 });
		expect(doc.line_of_sight[0]![1]).toEqual({ x: 15, y: 22.5 });
		expect(doc.line_of_sight[0]![2]).toEqual({ x: 7.5, y: 22.5 });

		// Not normalized, and not pixels (which would be 1500).
		expect(doc.line_of_sight[0]![0]!.x).not.toBe(0.5);
		expect(doc.line_of_sight[0]![0]!.x).not.toBe(1500);

		// Doors and lights are in squares too.
		expect(doc.portals[0]!.bounds[0]).toEqual({ x: 15, y: 12 });
		expect(doc.portals[0]!.position).toEqual({ x: 15, y: 13.5 });
		expect(doc.lights[0]!.position).toEqual({ x: 7.5, y: 15 });
		expect(doc.lights[0]!.range).toBe(3); // 0.1 dim radius * 30 squares
	});

	it('rescales with the map grid, and honours an explicit override', () => {
		expect(exportUvtt(mapWith([WALL], 60)).line_of_sight[0]![0]!.x).toBe(30);
		expect(exportUvtt(mapWith([WALL], 30), { squaresAcross: 10 }).line_of_sight[0]![0]!.x).toBe(5);
	});

	it('falls back to scale / unitsPerCell when the grid is unset', () => {
		// 150 feet across at 5 feet per cell = 30 squares. Same answer, stated in world units.
		const map = mapWith([WALL], 0);
		expect(exportUvtt(map).resolution.map_size).toEqual({ x: 30, y: 30 });
	});
});

describe('exportUvtt — schema shape', () => {
	it('matches the format 0.3 schema exactly', () => {
		const doc = exportUvtt(mapWith([WALL, DOOR, LIGHT]), {
			gridSize: 70,
			bakedLighting: true,
			ambientLight: '11223344',
		});

		expect(Object.keys(doc).sort()).toEqual(
			[
				'environment',
				'format',
				'image',
				'lights',
				'line_of_sight',
				'objects_line_of_sight',
				'portals',
				'resolution',
			].sort(),
		);
		expect(doc.format).toBe(0.3);
		expect(Object.keys(doc.resolution).sort()).toEqual(
			['map_origin', 'map_size', 'pixels_per_grid'].sort(),
		);
		expect(doc.environment).toEqual({ baked_lighting: true, ambient_light: '11223344' });
		expect(doc.objects_line_of_sight).toEqual([]);
		expect(doc.image).toBe('');

		expect(Object.keys(doc.portals[0]!).sort()).toEqual(
			['bounds', 'closed', 'freestanding', 'position', 'rotation'].sort(),
		);
		expect(Object.keys(doc.lights[0]!).sort()).toEqual(
			['color', 'intensity', 'position', 'range', 'shadows'].sort(),
		);
	});

	it('defaults the environment to fully lit and dynamic', () => {
		const doc = exportUvtt(mapWith([WALL]));
		expect(doc.environment).toEqual({ baked_lighting: false, ambient_light: 'ffffffff' });
	});
});

describe('exportUvtt — portals', () => {
	it('carries position, bounds, rotation in RADIANS, closed and freestanding', () => {
		const doc = exportUvtt(mapWith([DOOR]));
		const portal = doc.portals[0]!;

		expect(doc.portals).toHaveLength(1);
		expect(portal.closed).toBe(true);
		expect(portal.freestanding).toBe(false);
		// A vertical door span: pi/2 radians, NOT 90.
		expect(portal.rotation).toBeCloseTo(Math.PI / 2, 5);
		expect(Math.abs(portal.rotation)).toBeLessThanOrEqual(Math.PI);
		expect(portal.bounds).toHaveLength(2);
	});

	it('reports an OPEN door as not closed', () => {
		const open: MapFeature = { ...DOOR, props: { portal: 'archway', state: 'open' } };
		expect(exportUvtt(mapWith([open])).portals[0]!.closed).toBe(false);
	});

	it('gives a horizontal door a rotation of 0', () => {
		const horizontal: MapFeature = {
			...DOOR,
			points: [
				{ x: 0.4, y: 0.5 },
				{ x: 0.5, y: 0.5 },
			],
		};
		expect(exportUvtt(mapWith([horizontal])).portals[0]!.rotation).toBe(0);
	});
});

describe('exportUvtt — line of sight', () => {
	it('omits a wall flagged blocksSight: false and routes an object wall separately', () => {
		const window: MapFeature = { ...WALL, id: 'w-window', props: { blocksSight: false } };
		const furniture: MapFeature = { ...WALL, id: 'w-crate', props: { los: 'object' } };

		const doc = exportUvtt(mapWith([WALL, window, furniture]));
		expect(doc.line_of_sight).toHaveLength(1); // the window is not an occluder
		expect(doc.objects_line_of_sight).toHaveLength(1);
	});

	it('ignores non-wall/door/light features', () => {
		const room: MapFeature = {
			id: 'r',
			kind: 'room',
			points: [
				{ x: 0.1, y: 0.1 },
				{ x: 0.4, y: 0.4 },
			],
			style: 'floor:stone',
		};
		const doc = exportUvtt(mapWith([room, WALL]));
		expect(doc.line_of_sight).toHaveLength(1);
		expect(doc.portals).toEqual([]);
		expect(doc.lights).toEqual([]);
	});
});

describe('exportUvtt — image + round-trip', () => {
	it('strips the data-URL prefix from the image', () => {
		const doc = exportUvtt(mapWith([WALL]), { imageDataUrl: 'data:image/png;base64,QUJD' });
		expect(doc.image).toBe('QUJD');
		// A bare base64 payload passes through untouched.
		expect(exportUvtt(mapWith([WALL]), { imageDataUrl: 'QUJD' }).image).toBe('QUJD');
	});

	it('round-trips through JSON.parse unchanged', () => {
		const map = mapWith([WALL, DOOR, LIGHT]);
		const doc = exportUvtt(map, { gridSize: 100, imageDataUrl: 'data:image/png;base64,QUJD' });
		const parsed = JSON.parse(exportUvttJson(map, {
			gridSize: 100,
			imageDataUrl: 'data:image/png;base64,QUJD',
		})) as UvttDocument;
		expect(parsed).toEqual(doc);
	});

	it('is pure — it does not mutate the map', () => {
		const map = mapWith([WALL, DOOR, LIGHT]);
		const before = JSON.stringify(map);
		exportUvtt(map);
		expect(JSON.stringify(map)).toBe(before);
	});
});
