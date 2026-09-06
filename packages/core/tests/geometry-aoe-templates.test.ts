import { describe, expect, it } from 'vitest';
import {
	DEFAULT_LINE_WIDTH,
	TEMPLATE_KINDS,
	isAreaTemplate,
	isPointInTemplate,
	isTemplateGrid,
	templateCellCenter,
	templateCellCount,
	templateCells,
	templateCoversPoint,
	type AreaTemplate,
	type TemplateGrid,
} from '../src';

/**
 * RC-MAP-1.2 — AREA-OF-EFFECT COVERAGE geometry.
 *
 * The claims these tests hold down:
 *   - the four 5e shapes cover the cells the table's own grid table says they cover, on a square grid
 *     (the DMG rule: a cell is affected when the template covers at least half of it);
 *   - a hex grid answers the same questions with the same helper, no second code path for callers;
 *   - coverage is a pure function — same inputs, same cells, in a stable order — so two devices
 *     replaying the same combat draw the same fireball;
 *   - a malformed template or grid returns nothing instead of guessing.
 *
 * The standard battle map used throughout: 40 cells across, 5 feet per cell (a 200-foot map), with
 * the template origin at 0.5/0.5 — dead centre, which on this grid is a GRID INTERSECTION, the
 * placement the DMG's area-of-effect rule assumes.
 */

const SQUARE: TemplateGrid = { kind: 'square', size: 40, unitsPerCell: 5 };
const HEX: TemplateGrid = { kind: 'hex', size: 40, unitsPerCell: 5 };

/** A template of `kind`, `size` feet, anchored at the map's centre and pointing north. */
function at(kind: AreaTemplate['kind'], size: number, rotation = 0): AreaTemplate {
	return { kind, origin: { x: 0.5, y: 0.5 }, rotation, size };
}

describe('RC-MAP-1.2 sphere coverage matches the 5e grid table', () => {
	// The DMG's "areas of effect on a grid" rule, applied to a circle centred on an intersection:
	// a square is affected when the circle covers at least half of it. These are the counts that rule
	// produces for the radii the game actually uses — 10 feet (a spirit guardian's edge), 15 (a
	// hypnotic pattern), and 20 (a fireball).
	it.each([
		[5, 4],
		[10, 12],
		[15, 32],
		[20, 52],
	])('a %i-foot radius sphere covers %i squares', (radius, expected) => {
		expect(templateCellCount(at('sphere', radius), SQUARE)).toBe(expected);
	});

	it('is symmetric about its origin — four equal quadrants, no drift', () => {
		const cells = templateCells(at('sphere', 20), SQUARE);
		// The centre intersection sits on the boundary between cells 19 and 20 on each axis.
		const mirrored = cells.map((cell) => ({ q: 39 - cell.q, r: 39 - cell.r }));
		expect(new Set(mirrored.map((c) => `${c.q},${c.r}`))).toEqual(
			new Set(cells.map((c) => `${c.q},${c.r}`)),
		);
	});

	it('ignores rotation — a sphere points nowhere', () => {
		expect(templateCells(at('sphere', 20, 137), SQUARE)).toEqual(
			templateCells(at('sphere', 20, 0), SQUARE),
		);
	});

	it('clips at the map edge instead of returning cells that do not exist', () => {
		const corner: AreaTemplate = { kind: 'sphere', origin: { x: 0, y: 0 }, rotation: 0, size: 20 };
		const cells = templateCells(corner, SQUARE);
		expect(cells.length).toBeGreaterThan(0);
		for (const cell of cells) {
			expect(cell.q).toBeGreaterThanOrEqual(0);
			expect(cell.r).toBeGreaterThanOrEqual(0);
		}
		// A quarter of the full circle, give or take the cells the edge cuts.
		expect(cells.length).toBeLessThan(templateCellCount(at('sphere', 20), SQUARE));
	});
});

describe('RC-MAP-1.2 cone, line and cube coverage', () => {
	// A 5e cone is as wide at any point as it is long at that point, so a 15-foot cone pointing along
	// a grid line from an intersection covers the two squares to each side of the axis at 5–15 feet
	// out; the first 5 feet are too narrow to cover half of any square.
	it('a 15-foot cone covers four squares, all of them ahead of the origin', () => {
		const cells = templateCells(at('cone', 15), SQUARE);
		expect(cells).toHaveLength(4);
		for (const cell of cells) expect(cell.r).toBeLessThan(20); // north of the origin row
	});

	it('a cone grows roughly with the square of its length', () => {
		expect(templateCellCount(at('cone', 30), SQUARE)).toBe(18);
		expect(templateCellCount(at('cone', 60), SQUARE)).toBe(72);
	});

	it('a cone points where it is rotated', () => {
		const north = templateCells(at('cone', 30, 0), SQUARE);
		const south = templateCells(at('cone', 30, 180), SQUARE);
		expect(north).toHaveLength(south.length);
		expect(Math.max(...north.map((c) => c.r))).toBeLessThan(Math.min(...south.map((c) => c.r)));
	});

	// A lightning bolt is 100 feet long and 5 feet wide. Cast from a grid intersection it runs down
	// the line between two columns, and the DMG rule catches BOTH of them — each is exactly half
	// covered. That is the honest answer to that placement; nudging the origin half a cell gives the
	// single 20-square column instead.
	it('a 100-foot line from an intersection covers both columns it runs between', () => {
		expect(templateCellCount(at('line', 100), SQUARE)).toBe(40);
		const offCentre: AreaTemplate = {
			kind: 'line',
			origin: { x: 0.5 + 1 / 80, y: 0.5 },
			rotation: 0,
			size: 100,
		};
		expect(templateCellCount(offCentre, SQUARE)).toBe(20);
	});

	it('a wider line catches more columns', () => {
		// A 5- and a 10-foot-wide line both catch the two columns the axis runs between (the 5-foot one
		// covers each by exactly half, the 10-foot one entirely). At 15 feet wide it reaches a full
		// column further on each side.
		expect(templateCellCount(at('line', 30), SQUARE)).toBe(12);
		expect(templateCellCount({ ...at('line', 30), width: 10 }, SQUARE)).toBe(12);
		expect(templateCellCount({ ...at('line', 30), width: 15 }, SQUARE)).toBe(24);
		expect(DEFAULT_LINE_WIDTH).toBe(5);
	});

	// A cube is anchored by a corner of its near face, which is what makes it land on whole cells.
	it.each([
		[5, 1],
		[10, 4],
		[15, 9],
		[20, 16],
	])('a %i-foot cube covers %i squares', (side, expected) => {
		expect(templateCellCount(at('cube', side), SQUARE)).toBe(expected);
	});

	it('a cube extends along its rotation and to the rotation right', () => {
		const cells = templateCells(at('cube', 15), SQUARE);
		expect(cells).toHaveLength(9);
		expect(new Set(cells.map((c) => c.q))).toEqual(new Set([20, 21, 22]));
		expect(new Set(cells.map((c) => c.r))).toEqual(new Set([17, 18, 19]));
	});
});

describe('RC-MAP-1.2 hex grids answer the same questions', () => {
	it('covers a plausible, growing set of hexes for growing radii', () => {
		const counts = [5, 10, 15, 20].map((radius) => templateCellCount(at('sphere', radius), HEX));
		expect(counts).toEqual([...counts].sort((a, b) => a - b));
		expect(counts[0]).toBeGreaterThan(0);
		// A hex tiles the same plane as a square of the same across-flats width, so the same circle
		// catches a comparable number of them.
		for (const radius of [10, 15, 20]) {
			const hexCount = templateCellCount(at('sphere', radius), HEX);
			const squareCount = templateCellCount(at('sphere', radius), SQUARE);
			expect(hexCount).toBeGreaterThan(squareCount * 0.6);
			expect(hexCount).toBeLessThan(squareCount * 1.6);
		}
	});

	it('staggers its rows — a hex row is offset half a cell from the one above', () => {
		const a = templateCellCenter(HEX, { q: 0, r: 0 });
		const b = templateCellCenter(HEX, { q: 0, r: 1 });
		expect(b.x - a.x).toBeCloseTo(HEX.unitsPerCell / 2, 10);
		expect(b.y).toBeGreaterThan(a.y);
	});

	it('points a cone the same way on hexes as on squares', () => {
		const north = templateCells(at('cone', 30, 0), HEX);
		const south = templateCells(at('cone', 30, 180), HEX);
		expect(north.length).toBeGreaterThan(0);
		expect(Math.max(...north.map((c) => c.r))).toBeLessThan(Math.min(...south.map((c) => c.r)));
	});
});

describe('RC-MAP-1.2 the coverage helper is pure and fails closed', () => {
	it('returns identical cells in an identical order for identical inputs', () => {
		const first = templateCells(at('cone', 30, 37), SQUARE);
		const second = templateCells(at('cone', 30, 37), SQUARE);
		expect(second).toEqual(first);
		expect(first.length).toBeGreaterThan(0);
	});

	it('names exactly the four 5e shapes', () => {
		expect([...TEMPLATE_KINDS]).toEqual(['sphere', 'cone', 'line', 'cube']);
	});

	it('accepts a well-formed template and refuses every malformed one', () => {
		const good = at('cone', 15, 90);
		expect(isAreaTemplate(good)).toBe(true);
		expect(isAreaTemplate({ ...good, kind: 'blast' as AreaTemplate['kind'] })).toBe(false);
		expect(isAreaTemplate({ ...good, origin: { x: -0.01, y: 0.5 } })).toBe(false);
		expect(isAreaTemplate({ ...good, origin: { x: 0.5, y: 1.2 } })).toBe(false);
		expect(isAreaTemplate({ ...good, rotation: 360 })).toBe(false);
		expect(isAreaTemplate({ ...good, rotation: -1 })).toBe(false);
		expect(isAreaTemplate({ ...good, size: 0 })).toBe(false);
		expect(isAreaTemplate({ ...good, size: Number.NaN })).toBe(false);
		expect(isAreaTemplate({ ...good, width: 0 })).toBe(false);
	});

	it('refuses a grid it cannot measure against', () => {
		expect(isTemplateGrid(SQUARE)).toBe(true);
		expect(isTemplateGrid({ ...SQUARE, size: 0 })).toBe(false);
		expect(isTemplateGrid({ ...SQUARE, unitsPerCell: -5 })).toBe(false);
		expect(isTemplateGrid({ ...SQUARE, kind: 'triangle' as TemplateGrid['kind'] })).toBe(false);
	});

	it('returns no cells at all for a malformed template or grid — never a guess', () => {
		expect(templateCells({ ...at('sphere', 20), size: -1 }, SQUARE)).toEqual([]);
		expect(templateCells(at('sphere', 20), { ...SQUARE, size: 0 })).toEqual([]);
		expect(templateCoversPoint({ ...at('sphere', 20), size: -1 }, SQUARE, { x: 0.5, y: 0.5 })).toBe(
			false,
		);
	});

	it('answers "is this token caught?" from a normalized point', () => {
		const fireball = at('sphere', 20);
		expect(templateCoversPoint(fireball, SQUARE, { x: 0.5, y: 0.5 })).toBe(true);
		// 20 feet north of the centre on a 200-foot map is 0.1 of the height.
		expect(templateCoversPoint(fireball, SQUARE, { x: 0.5, y: 0.4 })).toBe(true);
		expect(templateCoversPoint(fireball, SQUARE, { x: 0.5, y: 0.35 })).toBe(false);
	});

	it('describes each shape from the origin outwards', () => {
		const cone = at('cone', 30);
		// Straight ahead is always in; behind the origin never is.
		expect(isPointInTemplate(cone, { x: 0, y: -20 })).toBe(true);
		expect(isPointInTemplate(cone, { x: 0, y: 20 })).toBe(false);
		// The cone is exactly as wide as it is far along: at 20 feet out it reaches 10 feet to a side.
		expect(isPointInTemplate(cone, { x: 10, y: -20 })).toBe(true);
		expect(isPointInTemplate(cone, { x: 10.1, y: -20 })).toBe(false);
	});
});
