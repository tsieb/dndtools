// RC-POL-1.2 — the bounded board's column geometry and its layout-issue guard, out of
// `board-helpers.ts` (which re-exports them).

/**
 * RC-CAN-3.3 — column-overflow guard. `/board` is the BOUNDED canvas (`SceneBoardCanvas`
 * `policy="bounded"`): it has no free horizontal scroll, so it fit-scales its whole extent to the
 * pane. A widget dragged (or arrow-nudged) past the board's own right edge therefore either dragged
 * that fit-scale down for every other widget or landed invisibly on top of whatever already lived
 * there — neither is a fixed layout. Both conditions collapse into one "layout doesn't fit" check
 * (out of bounds OR overlapping), with one fix: a deterministic greedy repack back into the same
 * three-column grid the Command Center template seeds
 * (`packages/core/src/state/command-center-state.ts` `defaultLayout`: 3 columns, 240px widgets,
 * 24px gutter/margin) — the numbers below mirror that geometry so a freshly seeded board never
 * trips the guard it did not cause.
 */
export const BOARD_COLUMNS = 3;
export const BOARD_MARGIN = 24;
export const BOARD_COLUMN_STEP = 264; // DEFAULT_WIDGET_SIZE.w (240) + GUTTER (24)
export const BOARD_ROW_GUTTER = 24;
/** The board's right edge: the x a widget's `x + w` may never cross. */
export const BOARD_RIGHT_BOUND =
	BOARD_MARGIN + BOARD_COLUMNS * BOARD_COLUMN_STEP - BOARD_ROW_GUTTER;

export interface BoardLayoutRect {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

function rectsOverlap(a: BoardLayoutRect, b: BoardLayoutRect): boolean {
	return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Clamp a proposed x so a widget of width `w` never crosses the board's right edge — the "snap
 *  back" a drop or an arrow-nudge past the grid gets, in place of silently growing the board. */
export function clampToColumns(x: number, w: number, bound: number = BOARD_RIGHT_BOUND): number {
	return Math.min(Math.max(0, x), Math.max(0, bound - w));
}

/** The resize counterpart: clamp a proposed width so a widget FIXED at `x` never crosses the
 *  board's right edge — the moving edge is the one being resized, not the anchored one. */
export function clampWidthToColumns(
	x: number,
	w: number,
	bound: number = BOARD_RIGHT_BOUND,
): number {
	return Math.min(w, Math.max(1, bound - Math.max(0, x)));
}

export type BoardLayoutIssueKind = 'overflow' | 'overlap';

/**
 * RC-CAN-3.4 — one entry per layout problem, named rather than collapsed into a single boolean, so
 * the quality indicator's popover can list each offender and offer a "Select" that jumps straight
 * to it instead of leaving the DM to hunt the board for whatever tripped the banner.
 */
export interface BoardLayoutIssue {
	kind: BoardLayoutIssueKind;
	widgetId: string;
	/** The other widget in the pair, for an `overlap` issue (each overlapping pair reported once). */
	otherWidgetId?: string;
}

/** Every overflow and overlap on the board, in widget order — the detail behind `boardHasLayoutIssues`. */
export function boardLayoutIssues(
	widgets: readonly BoardLayoutRect[],
	bound: number = BOARD_RIGHT_BOUND,
): BoardLayoutIssue[] {
	const issues: BoardLayoutIssue[] = [];
	for (const widget of widgets) {
		if (widget.x < 0 || widget.y < 0 || widget.x + widget.w > bound) {
			issues.push({ kind: 'overflow', widgetId: widget.id });
		}
	}
	for (let i = 0; i < widgets.length; i++) {
		for (let j = i + 1; j < widgets.length; j++) {
			if (rectsOverlap(widgets[i], widgets[j])) {
				issues.push({ kind: 'overlap', widgetId: widgets[i].id, otherWidgetId: widgets[j].id });
			}
		}
	}
	return issues;
}

/** True when any widget sits off the board's columns or overlaps another — the "Fix layout" trigger. */
export function boardHasLayoutIssues(
	widgets: readonly BoardLayoutRect[],
	bound: number = BOARD_RIGHT_BOUND,
): boolean {
	return boardLayoutIssues(widgets, bound).length > 0;
}

/**
 * Greedy shelf repack: widgets are read in their current (y, x) reading order and each is placed
 * into the narrowest run of columns its width spans, choosing whichever run has the SHORTEST
 * current stack ("next open shelf") — the rule a hand-tidied grid follows. Pure and deterministic;
 * only positions move, sizes are untouched.
 */
export function repackBoardColumns(
	widgets: readonly BoardLayoutRect[],
	columns: number = BOARD_COLUMNS,
	columnStep: number = BOARD_COLUMN_STEP,
	margin: number = BOARD_MARGIN,
	gutter: number = BOARD_ROW_GUTTER,
): Map<string, { x: number; y: number }> {
	const ordered = [...widgets].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
	const columnBottoms = new Array<number>(columns).fill(margin);
	const next = new Map<string, { x: number; y: number }>();
	for (const widget of ordered) {
		const span = Math.max(1, Math.min(columns, Math.ceil(widget.w / columnStep)));
		let bestCol = 0;
		let bestBottom = Infinity;
		for (let col = 0; col <= columns - span; col++) {
			const bottom = Math.max(...columnBottoms.slice(col, col + span));
			if (bottom < bestBottom) {
				bestBottom = bottom;
				bestCol = col;
			}
		}
		next.set(widget.id, { x: margin + bestCol * columnStep, y: bestBottom });
		const rowBottom = bestBottom + widget.h + gutter;
		for (let col = bestCol; col < bestCol + span; col++) columnBottoms[col] = rowBottom;
	}
	return next;
}
