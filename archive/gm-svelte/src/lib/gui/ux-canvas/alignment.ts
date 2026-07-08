/**
 * Alignment, grid, and smart-guide math (UX-CANVAS-009). Pure functions that compute new top-left
 * positions for a selection — align edges/centres, distribute even spacing — and the snap model (grid
 * snap, sibling edge/centre snap, equidistance) used during a drag. The same processing-core
 * `scene.move-widget` command carries the result on every platform, so the align toolbar on Desktop and
 * the align menu item on Mobile are the same operation (UX-CANVAS-009 AC3). No DOM, no `$state`.
 */

import type { SpatialWidget } from '$lib/gui/a11y/canvas-keyboard';
import type { Rect } from '$lib/canvas-runtime/viewport';

export type AlignEdge =
	| 'left'
	| 'center-horizontal'
	| 'right'
	| 'top'
	| 'center-vertical'
	| 'bottom';

export type DistributeAxis = 'horizontal' | 'vertical';

/** A computed move: the widget id and its new top-left world position. */
export interface PositionChange {
	id: string;
	x: number;
	y: number;
}

function selected(widgets: readonly SpatialWidget[], ids: ReadonlySet<string>): SpatialWidget[] {
	return widgets.filter((w) => ids.has(w.id));
}

/**
 * Align the selected widgets to a shared edge or centre of the selection's bounding box. Returns only
 * the widgets whose position actually changes (so the caller dispatches the minimum set of commands).
 */
export function alignWidgets(
	widgets: readonly SpatialWidget[],
	ids: ReadonlySet<string>,
	edge: AlignEdge,
): PositionChange[] {
	const group = selected(widgets, ids);
	if (group.length < 2) return [];
	const minX = Math.min(...group.map((w) => w.x));
	const maxX = Math.max(...group.map((w) => w.x + w.w));
	const minY = Math.min(...group.map((w) => w.y));
	const maxY = Math.max(...group.map((w) => w.y + w.h));
	const centerX = (minX + maxX) / 2;
	const centerY = (minY + maxY) / 2;

	const out: PositionChange[] = [];
	for (const w of group) {
		let { x, y } = w;
		switch (edge) {
			case 'left':
				x = minX;
				break;
			case 'right':
				x = maxX - w.w;
				break;
			case 'center-horizontal':
				x = centerX - w.w / 2;
				break;
			case 'top':
				y = minY;
				break;
			case 'bottom':
				y = maxY - w.h;
				break;
			case 'center-vertical':
				y = centerY - w.h / 2;
				break;
		}
		if (x !== w.x || y !== w.y) out.push({ id: w.id, x, y });
	}
	return out;
}

/**
 * Distribute the selected widgets so the gaps between them are equal along an axis (UX-CANVAS-009 align
 * toolbar — "Distribute Horizontal/Vertical"). The two extreme widgets stay put; interior widgets are
 * evenly spaced by total free space. Needs ≥3 widgets to have an interior to move.
 */
export function distributeWidgets(
	widgets: readonly SpatialWidget[],
	ids: ReadonlySet<string>,
	axis: DistributeAxis,
): PositionChange[] {
	const group = selected(widgets, ids);
	if (group.length < 3) return [];

	const horizontal = axis === 'horizontal';
	const sorted = [...group].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
	const first = sorted[0]!;
	const last = sorted[sorted.length - 1]!;
	const startEdge = horizontal ? first.x : first.y;
	const endEdge = horizontal ? last.x + last.w : last.y + last.h;
	const totalExtent = sorted.reduce((sum, w) => sum + (horizontal ? w.w : w.h), 0);
	const free = endEdge - startEdge - totalExtent;
	const gap = free / (sorted.length - 1);

	const out: PositionChange[] = [];
	let cursor = startEdge;
	for (let i = 0; i < sorted.length; i += 1) {
		const w = sorted[i]!;
		const extent = horizontal ? w.w : w.h;
		if (i > 0 && i < sorted.length - 1) {
			const target = Math.round(cursor);
			if (horizontal && target !== w.x) out.push({ id: w.id, x: target, y: w.y });
			else if (!horizontal && target !== w.y) out.push({ id: w.id, x: w.x, y: target });
		}
		cursor += extent + gap;
	}
	return out;
}

// --- Grid + smart-guide snapping (UX-CANVAS-009) ---------------------------------------------------

/** Default grid size (UX-CANVAS-009 §Grid: 16 px default, 8–128 px range). */
export const DEFAULT_GRID = 16;

/** Snap threshold (UX-CANVAS-009): 4 CSS px at 100% zoom; scales inversely with zoom. */
export const SNAP_THRESHOLD = 4;

/** Snap a single world value to the nearest grid line. */
export function snapToGrid(value: number, grid: number): number {
	if (grid <= 0) return value;
	return Math.round(value / grid) * grid;
}

/** The snap distance threshold in WORLD px for the given zoom scale (4 screen px ÷ scale). */
export function snapThresholdForZoom(scale: number): number {
	return SNAP_THRESHOLD / Math.max(scale, 1e-6);
}

export interface SnapSettings {
	/** Grid is enabled and corners snap to grid intersections. */
	grid: boolean;
	gridSize: number;
	/** Edge snap (widget edges align to sibling edges). */
	edge: boolean;
	/** Centre snap (widget centres align to sibling centres). */
	center: boolean;
	/** World-px threshold within which a snap engages. */
	threshold: number;
}

export interface SnapGuide {
	axis: 'x' | 'y';
	/** World position of the guide line. */
	at: number;
}

export interface SnapResult {
	x: number;
	y: number;
	guides: SnapGuide[];
}

/**
 * Snap a moving widget's proposed top-left against the grid and its siblings (UX-CANVAS-009). Returns
 * the snapped position plus the guide lines to render. The Alt/Option override is honoured by the caller
 * passing `settings` with all layers disabled (it simply skips this call during the override).
 */
export function snapMove(
	moving: Rect,
	siblings: readonly SpatialWidget[],
	settings: SnapSettings,
): SnapResult {
	let { x, y } = moving;
	const guides: SnapGuide[] = [];
	const t = settings.threshold;

	// Grid snap takes priority (it is the coarse layer); corner → nearest intersection.
	if (settings.grid && settings.gridSize > 0) {
		const gx = snapToGrid(x, settings.gridSize);
		const gy = snapToGrid(y, settings.gridSize);
		if (Math.abs(gx - x) <= t) x = gx;
		if (Math.abs(gy - y) <= t) y = gy;
	}

	// Candidate world lines from siblings: left/centre/right edges (X) and top/middle/bottom (Y).
	const xLines: number[] = [];
	const yLines: number[] = [];
	for (const s of siblings) {
		if (settings.edge) {
			xLines.push(s.x, s.x + s.w);
			yLines.push(s.y, s.y + s.h);
		}
		if (settings.center) {
			xLines.push(s.x + s.w / 2);
			yLines.push(s.y + s.h / 2);
		}
	}

	// Apply at most ONE snap per axis — the single closest (line, moving-edge) pair within threshold — so
	// overlapping candidates (e.g. a sibling edge AND a sibling centre) never compound into a double shift.
	const bestX = closestSnap([x, x + moving.w / 2, x + moving.w], xLines, t);
	if (bestX) {
		x += bestX.delta;
		guides.push({ axis: 'x', at: bestX.line });
	}
	const bestY = closestSnap([y, y + moving.h / 2, y + moving.h], yLines, t);
	if (bestY) {
		y += bestY.delta;
		guides.push({ axis: 'y', at: bestY.line });
	}

	return { x, y, guides };
}

/** The closest snap (smallest absolute delta within threshold) of any moving edge to any candidate line. */
function closestSnap(
	movingEdges: readonly number[],
	lines: readonly number[],
	threshold: number,
): { line: number; delta: number } | null {
	let best: { line: number; delta: number } | null = null;
	for (const line of lines) {
		for (const edge of movingEdges) {
			const delta = line - edge;
			if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best.delta))) {
				best = { line, delta };
			}
		}
	}
	return best;
}

/** Polite announcement after an align/distribute command (UX-CANVAS-009 accessibility). */
export function alignAnnouncement(count: number, edge: AlignEdge): string {
	const label: Record<AlignEdge, string> = {
		left: 'left',
		right: 'right',
		'center-horizontal': 'horizontal center',
		top: 'top',
		bottom: 'bottom',
		'center-vertical': 'vertical center',
	};
	return `${count} widget${count === 1 ? '' : 's'} aligned ${label[edge]}.`;
}

export function distributeAnnouncement(count: number, axis: DistributeAxis): string {
	return `${count} widgets distributed ${axis === 'horizontal' ? 'horizontally' : 'vertically'}.`;
}
