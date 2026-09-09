import { describe, expect, it } from 'vitest';
import {
	MAP_IMPORT_MAX_ASSET_BYTES,
	deriveGridCalibration,
	deriveImportScale,
	traceWallsFromLuminance,
	type MapGridCalibration,
} from '../src/index';

// RC-MAP-3.2 — the raster import wizard's pure policy: grid calibration from two dragged corners,
// the physical scale that follows from "1 square = N units", and luminance wall tracing. These are
// the three things the v1 wizard could not do, and all three must be deterministic and fail closed.

function calibrationOf(result: ReturnType<typeof deriveGridCalibration>): MapGridCalibration {
	if ('error' in result) throw new Error(`expected a calibration, got ${result.error.message}`);
	return result;
}

describe('deriveGridCalibration', () => {
	it('turns a one-cell drag into the cell count across a square-gridded image', () => {
		// A 1000×800 image, one cell dragged across 1/10 of the width and 1/8 of the height: a 100 px
		// square cell, so ten cells across and eight down.
		const calibration = calibrationOf(
			deriveGridCalibration({
				corners: [
					{ x: 0.2, y: 0.25 },
					{ x: 0.3, y: 0.375 },
				],
				imageWidth: 1000,
				imageHeight: 800,
				shape: 'square',
			}),
		);
		expect(calibration.cellWidthPx).toBeCloseTo(100, 6);
		expect(calibration.cellHeightPx).toBeCloseTo(100, 6);
		expect(calibration.cellsAcross).toBe(10);
		expect(calibration.cellsDown).toBe(8);
	});

	it('keeps the column pitch but tightens the row pitch on a hex grid', () => {
		const corners = [
			{ x: 0, y: 0 },
			{ x: 0.1, y: 0.125 },
		] as const;
		const square = calibrationOf(
			deriveGridCalibration({ corners, imageWidth: 1000, imageHeight: 800, shape: 'square' }),
		);
		const hex = calibrationOf(
			deriveGridCalibration({ corners, imageWidth: 1000, imageHeight: 800, shape: 'hex' }),
		);
		// Pointy-top hexes tile horizontally at their across-flats width, exactly like squares.
		expect(hex.cellsAcross).toBe(square.cellsAcross);
		// They interlock vertically at three quarters of the cell height, so more rows fit.
		expect(hex.cellsDown).toBe(Math.round(800 / (100 * 0.75)));
		expect(hex.cellsDown).toBeGreaterThan(square.cellsDown);
	});

	it('does not care which corner was dragged first', () => {
		const forward = calibrationOf(
			deriveGridCalibration({
				corners: [
					{ x: 0.2, y: 0.25 },
					{ x: 0.3, y: 0.375 },
				],
				imageWidth: 1000,
				imageHeight: 800,
				shape: 'square',
			}),
		);
		const backward = calibrationOf(
			deriveGridCalibration({
				corners: [
					{ x: 0.3, y: 0.375 },
					{ x: 0.2, y: 0.25 },
				],
				imageWidth: 1000,
				imageHeight: 800,
				shape: 'square',
			}),
		);
		expect(backward).toEqual(forward);
	});

	it('fails closed on a sub-pixel drag rather than guessing a grid', () => {
		const result = deriveGridCalibration({
			corners: [
				{ x: 0.5, y: 0.5 },
				{ x: 0.5001, y: 0.5001 },
			],
			imageWidth: 1000,
			imageHeight: 800,
			shape: 'square',
		});
		expect('error' in result && result.error.kind).toBe('degenerate-drag');
	});

	it('fails closed when the image has no readable pixel size', () => {
		const result = deriveGridCalibration({
			corners: [
				{ x: 0, y: 0 },
				{ x: 0.5, y: 0.5 },
			],
			imageWidth: 0,
			imageHeight: 0,
			shape: 'square',
		});
		expect('error' in result && result.error.kind).toBe('unknown-dimensions');
	});
});

describe('deriveImportScale', () => {
	const calibration = calibrationOf(
		deriveGridCalibration({
			corners: [
				{ x: 0, y: 0 },
				{ x: 0.05, y: 0.05 },
			],
			imageWidth: 1000,
			imageHeight: 1000,
			shape: 'square',
		}),
	);

	it('spans the full map width at one square = 5 feet', () => {
		expect(calibration.cellsAcross).toBe(20);
		expect(deriveImportScale(calibration, 5, 'feet')).toEqual({ unitsPerMap: 100, unit: 'feet' });
	});

	it('trims the unit label', () => {
		expect(deriveImportScale(calibration, 1.5, '  meters ')).toEqual({
			unitsPerMap: 30,
			unit: 'meters',
		});
	});

	it('refuses a zero-length square and an unnamed unit', () => {
		const zero = deriveImportScale(calibration, 0, 'feet');
		expect('error' in zero && zero.error.kind).toBe('invalid-scale');
		const unnamed = deriveImportScale(calibration, 5, '   ');
		expect('error' in unnamed && unnamed.error.kind).toBe('invalid-scale');
	});
});

describe('traceWallsFromLuminance', () => {
	/** A 32×32 field, white everywhere except a dark 12-cell-wide square ring of "wall ink". */
	function ringField(): number[] {
		const size = 32;
		const luminance = new Array<number>(size * size).fill(255);
		for (let y = 8; y < 24; y += 1) {
			for (let x = 8; x < 24; x += 1) {
				const onEdge = x === 8 || x === 23 || y === 8 || y === 23;
				if (onEdge) luminance[y * size + x] = 12;
			}
		}
		return luminance;
	}

	it('traces dark ink into wall features that block sight and movement', () => {
		const walls = traceWallsFromLuminance({
			luminance: ringField(),
			width: 32,
			height: 32,
			threshold: 128,
			idPrefix: 'trace-a',
		});
		expect(walls.length).toBeGreaterThan(0);
		for (const wall of walls) {
			expect(wall.kind).toBe('wall');
			expect(wall.props?.blocksSight).toBe(true);
			expect(wall.props?.blocksMovement).toBe(true);
			// Geometry stays in normalized 0..1 map space like every other feature.
			for (const point of wall.points) {
				expect(point.x).toBeGreaterThanOrEqual(0);
				expect(point.x).toBeLessThanOrEqual(1);
				expect(point.y).toBeGreaterThanOrEqual(0);
				expect(point.y).toBeLessThanOrEqual(1);
			}
		}
		expect(walls.map((wall) => wall.id)).toEqual(walls.map((_, i) => `trace-a-${i}`));
	});

	it('is deterministic and re-traces under a fresh id prefix without colliding', () => {
		const first = traceWallsFromLuminance({
			luminance: ringField(),
			width: 32,
			height: 32,
			threshold: 128,
			idPrefix: 'trace-a',
		});
		const again = traceWallsFromLuminance({
			luminance: ringField(),
			width: 32,
			height: 32,
			threshold: 128,
			idPrefix: 'trace-b',
		});
		expect(again.map((w) => w.points)).toEqual(first.map((w) => w.points));
		expect(again.every((w) => w.id.startsWith('trace-b-'))).toBe(true);
	});

	it('traces nothing when the threshold sees no ink', () => {
		expect(
			traceWallsFromLuminance({
				luminance: ringField(),
				width: 32,
				height: 32,
				threshold: 0,
				idPrefix: 'trace-c',
			}),
		).toEqual([]);
	});

	it('returns nothing rather than throwing on a malformed sample buffer', () => {
		expect(
			traceWallsFromLuminance({
				luminance: [1, 2, 3],
				width: 32,
				height: 32,
				threshold: 128,
				idPrefix: 'trace-d',
			}),
		).toEqual([]);
		expect(
			traceWallsFromLuminance({
				luminance: [],
				width: 0,
				height: 0,
				threshold: 128,
				idPrefix: 'x',
			}),
		).toEqual([]);
	});
});

describe('MAP_IMPORT_MAX_ASSET_BYTES', () => {
	it('is the honest 50 MB cap the wizard states', () => {
		expect(MAP_IMPORT_MAX_ASSET_BYTES).toBe(50 * 1024 * 1024);
	});
});
