import type { Point } from './types';

/**
 * RC-MAP-1.2 — AREA-OF-EFFECT TEMPLATE coverage, for square AND hex grids.
 *
 * This is the pure geometry half of "the fireball lands here — which creatures are caught?". It takes
 * a template (a shape, an origin, a rotation, a size in table units) plus a grid description, and
 * returns the CELLS the template covers. Nothing here knows about combat, maps, actors or storage:
 * it is coordinates in, coordinates out, so the same helper serves the command layer, a query, a
 * renderer overlay and a test.
 *
 * The coverage rule is the one the table already uses (DMG, "Areas of Effect on a grid"): a cell is
 * affected when the template covers AT LEAST HALF of it. Half-coverage is measured by sampling each
 * cell on a fixed {@link CELL_SAMPLES}×{@link CELL_SAMPLES} lattice of its interior and counting the
 * samples inside the shape — deterministic, no RNG, no clock, and it works unchanged for a hexagon,
 * which an exact-area clipper would not. The sampling resolution is a documented approximation: a
 * cell whose true coverage sits within ~1% of exactly half may fall either side of the line.
 *
 * Coordinates: a template's `origin` is NORMALIZED (0..1 on each axis), the same vector model every
 * other map annotation uses (ADR-014/024). Everything inside is computed in TABLE UNITS (feet by
 * default) so a 20-foot radius means 20 feet regardless of how the map is displayed, and the
 * conversion happens once, here.
 */

/** The four 5e area shapes a template can take. */
export type TemplateKind = 'sphere' | 'cone' | 'line' | 'cube';

export const TEMPLATE_KINDS: readonly TemplateKind[] = Object.freeze([
	'sphere',
	'cone',
	'line',
	'cube',
]);

/**
 * A placed area of effect, in the shape the geometry needs it. Combat's stored template is a
 * superset of this (it adds an id, a map and provenance), so a stored template can be handed to
 * {@link templateCells} directly.
 */
export interface AreaTemplate {
	kind: TemplateKind;
	/** Where the template is anchored, NORMALIZED (0..1 on each axis). */
	origin: Point;
	/**
	 * Which way the template points, in DEGREES CLOCKWISE FROM NORTH (0 ≤ rotation < 360), where
	 * north is −y — up, as the map is drawn. Ignored for a sphere, which points nowhere.
	 */
	rotation: number;
	/**
	 * The defining length in table units: a sphere's RADIUS, a cone's LENGTH, a line's LENGTH, a
	 * cube's SIDE.
	 */
	size: number;
	/** A line's WIDTH in table units. Only meaningful for `line`; defaults to {@link DEFAULT_LINE_WIDTH}. */
	width?: number;
}

/** How a map's cells are laid out, as the coverage math needs to see them. */
export interface TemplateGrid {
	kind: TemplateGridKind;
	/** Cells across the normalized map WIDTH. Matches `MapOverlaySettings.gridSize`. */
	size: number;
	/** Table units per cell — 5 feet on a standard battle map. Matches `MapOverlaySettings.unitsPerCell`. */
	unitsPerCell: number;
}

export type TemplateGridKind = 'square' | 'hex';

/**
 * One covered cell. On a SQUARE grid `q` is the column and `r` the row, both 0-based from the map's
 * top-left. On a HEX grid they are AXIAL coordinates of a pointy-top hex (`q` along the row, `r` down
 * the staggered columns), which may be negative near the top-left edge.
 */
export interface TemplateCell {
	q: number;
	r: number;
}

/** A 5e line is 5 feet wide unless the spell says otherwise. */
export const DEFAULT_LINE_WIDTH = 5;

/** Sub-samples per axis inside each cell when measuring coverage (64 samples per cell). */
export const CELL_SAMPLES = 8;

/**
 * The largest number of candidate cells a single coverage query will examine. A template far bigger
 * than its map (or a grid of 500 cells) is a bad input, not a reason to lock the thread: the scan is
 * bounded and returns what it found inside the bound.
 */
export const MAX_TEMPLATE_CELLS_SCANNED = 20000;

/** Whether a grid description can be used for coverage math at all. Pure. */
export function isTemplateGrid(grid: TemplateGrid): boolean {
	if (grid.kind !== 'square' && grid.kind !== 'hex') return false;
	if (!Number.isFinite(grid.size) || grid.size <= 0) return false;
	if (!Number.isFinite(grid.unitsPerCell) || grid.unitsPerCell <= 0) return false;
	return true;
}

/** Whether a template is well-formed: a known shape, a normalized origin, a turn's rotation, a positive size. */
export function isAreaTemplate(template: AreaTemplate): boolean {
	if (!TEMPLATE_KINDS.includes(template.kind)) return false;
	const { x, y } = template.origin;
	if (!Number.isFinite(x) || x < 0 || x > 1) return false;
	if (!Number.isFinite(y) || y < 0 || y > 1) return false;
	if (!Number.isFinite(template.rotation) || template.rotation < 0 || template.rotation >= 360) {
		return false;
	}
	if (!Number.isFinite(template.size) || template.size <= 0) return false;
	if (template.width !== undefined) {
		if (!Number.isFinite(template.width) || template.width <= 0) return false;
	}
	return true;
}

/** The unit direction the template points, from its rotation. 0° = north = (0, −1). Pure. */
export function templateDirection(rotationDegrees: number): Point {
	const radians = (rotationDegrees * Math.PI) / 180;
	return { x: Math.sin(radians), y: -Math.cos(radians) };
}

/**
 * How far, in table units, the template can possibly reach from its origin. Used to bound the cell
 * scan; never used as the shape itself.
 */
export function templateReach(template: AreaTemplate): number {
	switch (template.kind) {
		case 'sphere':
			return template.size;
		case 'cone':
			// The far edge is `size` along the axis and `size/2` to each side.
			return Math.hypot(template.size, template.size / 2);
		case 'line': {
			const halfWidth = (template.width ?? DEFAULT_LINE_WIDTH) / 2;
			return Math.hypot(template.size, halfWidth);
		}
		case 'cube':
			return Math.hypot(template.size, template.size);
	}
}

/**
 * Whether a point (in table units, relative to the template's origin) is INSIDE the template. This is
 * the shape definition, and the only place the four 5e shapes are described:
 *
 *   - **sphere** — everything within `size` of the origin.
 *   - **cone** — the 5e cone: it widens as it goes, its width at any distance `d` from the origin
 *     equalling `d`, out to `size`. That is a triangle with a half-angle of `atan(1/2)`.
 *   - **line** — `size` long and `width` wide (5 feet by default), centred on the ray from the origin.
 *   - **cube** — a square of side `size` whose NEAR EDGE is centred on the origin and which extends
 *     along the rotation. 5e puts a cube's point of origin anywhere on one of its faces; anchoring it
 *     to the middle of the near face is the placement a DM actually makes ("it starts here and goes
 *     that way") and keeps the origin on the template, where a drag handle belongs.
 */
export function isPointInTemplate(template: AreaTemplate, offset: Point): boolean {
	if (template.kind === 'sphere') {
		return Math.hypot(offset.x, offset.y) <= template.size;
	}
	const direction = templateDirection(template.rotation);
	// Distance ALONG the axis, and to the side of it.
	const along = offset.x * direction.x + offset.y * direction.y;
	// Signed distance to the axis's RIGHT (the cube needs the sign; the other two are symmetric).
	const side = offset.x * -direction.y + offset.y * direction.x;
	const across = Math.abs(side);
	if (along < 0 || along > template.size) return false;
	switch (template.kind) {
		case 'cone':
			return across <= along / 2;
		case 'line':
			return across <= (template.width ?? DEFAULT_LINE_WIDTH) / 2;
		case 'cube':
			return side >= 0 && side <= template.size;
	}
}

/** The sample offsets inside a unit cell: `CELL_SAMPLES` per axis, at sample-cell centres. Pure. */
function sampleOffsets(): number[] {
	const offsets: number[] = [];
	for (let i = 0; i < CELL_SAMPLES; i += 1) offsets.push((i + 0.5) / CELL_SAMPLES - 0.5);
	return offsets;
}

const SAMPLE_OFFSETS = Object.freeze(sampleOffsets());

/** Half the width of a pointy-top hex, i.e. its circumradius, from the across-flats cell width. */
function hexCircumradius(unitsPerCell: number): number {
	return unitsPerCell / Math.sqrt(3);
}

/** The centre of a cell, in table units from the map's top-left corner. Pure. */
export function templateCellCenter(grid: TemplateGrid, cell: TemplateCell): Point {
	if (grid.kind === 'square') {
		return {
			x: (cell.q + 0.5) * grid.unitsPerCell,
			y: (cell.r + 0.5) * grid.unitsPerCell,
		};
	}
	// Pointy-top axial: a row steps one full width across, and each row down steps half a width
	// sideways and 1.5 circumradii down.
	const radius = hexCircumradius(grid.unitsPerCell);
	return {
		x: (cell.q + cell.r / 2) * grid.unitsPerCell + grid.unitsPerCell / 2,
		y: cell.r * 1.5 * radius + radius,
	};
}

/**
 * The fraction (0..1) of a cell the template covers, by sub-sampling. For a hex, samples that land
 * outside the hexagon itself are not counted on either side, so the fraction stays a fraction OF THE
 * HEX rather than of its bounding box. Pure.
 */
export function templateCellCoverage(
	template: AreaTemplate,
	grid: TemplateGrid,
	cell: TemplateCell,
	originUnits: Point,
): number {
	const center = templateCellCenter(grid, cell);
	const radius = grid.kind === 'hex' ? hexCircumradius(grid.unitsPerCell) : 0;
	let inside = 0;
	let counted = 0;
	for (const dy of SAMPLE_OFFSETS) {
		for (const dx of SAMPLE_OFFSETS) {
			const px = center.x + dx * grid.unitsPerCell;
			// A pointy-top hex is 2·circumradius tall, so its samples span that, not the cell width.
			const py = center.y + dy * (grid.kind === 'hex' ? 2 * radius : grid.unitsPerCell);
			if (grid.kind === 'hex' && !isPointInHex(px - center.x, py - center.y, radius)) continue;
			counted += 1;
			if (isPointInTemplate(template, { x: px - originUnits.x, y: py - originUnits.y })) {
				inside += 1;
			}
		}
	}
	return counted === 0 ? 0 : inside / counted;
}

/** Whether an offset from a pointy-top hex's centre is inside that hex. Pure. */
function isPointInHex(dx: number, dy: number, circumradius: number): boolean {
	const halfWidth = (Math.sqrt(3) / 2) * circumradius;
	const ax = Math.abs(dx);
	const ay = Math.abs(dy);
	if (ax > halfWidth || ay > circumradius) return false;
	// The two slanted edges: |y| ≤ 2R − |x|/√3·... expressed as a half-plane test.
	return circumradius * halfWidth - circumradius * ax * 0.5 - halfWidth * ay >= -1e-12;
}

/** The map's full extent in table units, on each axis (the map is square in normalized space). */
function mapExtentUnits(grid: TemplateGrid): number {
	return grid.size * grid.unitsPerCell;
}

/**
 * The CELLS a template covers, in a deterministic order (row-major by `r` then `q`). A cell counts as
 * covered when the template covers at least half of it — the DMG's grid rule. Cells outside the map
 * are never returned: an effect that spills off the edge simply affects fewer cells.
 *
 * Returns an empty list for a malformed template or grid rather than guessing at what was meant.
 */
export function templateCells(template: AreaTemplate, grid: TemplateGrid): TemplateCell[] {
	if (!isAreaTemplate(template) || !isTemplateGrid(grid)) return [];
	const extent = mapExtentUnits(grid);
	const originUnits: Point = { x: template.origin.x * extent, y: template.origin.y * extent };
	const reach = templateReach(template);
	const covered: TemplateCell[] = [];
	let scanned = 0;

	for (const cell of candidateCells(grid, originUnits, reach)) {
		scanned += 1;
		if (scanned > MAX_TEMPLATE_CELLS_SCANNED) break;
		const center = templateCellCenter(grid, cell);
		if (center.x < 0 || center.y < 0 || center.x > extent || center.y > extent) continue;
		if (templateCellCoverage(template, grid, cell, originUnits) >= 0.5) covered.push(cell);
	}
	return covered;
}

/** How many cells the template covers. Pure convenience over {@link templateCells}. */
export function templateCellCount(template: AreaTemplate, grid: TemplateGrid): number {
	return templateCells(template, grid).length;
}

/** Whether a template covers the cell a point (normalized) falls in — the "is this token caught?" test. */
export function templateCoversPoint(
	template: AreaTemplate,
	grid: TemplateGrid,
	point: Point,
): boolean {
	if (!isAreaTemplate(template) || !isTemplateGrid(grid)) return false;
	const extent = mapExtentUnits(grid);
	const originUnits: Point = { x: template.origin.x * extent, y: template.origin.y * extent };
	return isPointInTemplate(template, {
		x: point.x * extent - originUnits.x,
		y: point.y * extent - originUnits.y,
	});
}

/**
 * Every cell whose centre could plausibly be within `reach` of the origin, row-major. The generator is
 * the only place that knows how to walk each grid kind, so the coverage loop stays grid-agnostic.
 */
function* candidateCells(
	grid: TemplateGrid,
	originUnits: Point,
	reach: number,
): Generator<TemplateCell> {
	if (grid.kind === 'square') {
		// One extra cell of margin so a cell whose centre is just outside `reach` but whose near half
		// is inside still gets measured.
		const margin = reach + grid.unitsPerCell;
		const minQ = Math.floor((originUnits.x - margin) / grid.unitsPerCell);
		const maxQ = Math.ceil((originUnits.x + margin) / grid.unitsPerCell);
		const minR = Math.floor((originUnits.y - margin) / grid.unitsPerCell);
		const maxR = Math.ceil((originUnits.y + margin) / grid.unitsPerCell);
		for (let r = minR; r <= maxR; r += 1) {
			for (let q = minQ; q <= maxQ; q += 1) yield { q, r };
		}
		return;
	}
	const radius = hexCircumradius(grid.unitsPerCell);
	const margin = reach + grid.unitsPerCell;
	const minR = Math.floor((originUnits.y - margin - radius) / (1.5 * radius));
	const maxR = Math.ceil((originUnits.y + margin - radius) / (1.5 * radius));
	for (let r = minR; r <= maxR; r += 1) {
		const rowX = originUnits.x - (r / 2) * grid.unitsPerCell;
		const minQ = Math.floor((rowX - margin) / grid.unitsPerCell) - 1;
		const maxQ = Math.ceil((rowX + margin) / grid.unitsPerCell) + 1;
		for (let q = minQ; q <= maxQ; q += 1) yield { q, r };
	}
}
