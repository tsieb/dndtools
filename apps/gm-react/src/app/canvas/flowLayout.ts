import type { MessageKey } from '../../i18n';
import { boardWidgetPresentation, type BoardWidget } from '../board-helpers';

/* ------------------------------------------------------------------------------------------------
 * RC-CAN-7.7 / ADR-041 — THE FLOW LAYOUT POLICY
 *
 * Flow is the second of ADR-041's two layout policies: a responsive column grid whose column count
 * comes from the viewport tier, tile heights that follow content, and one order shared by the
 * layout, the DOM and keyboard focus. It is the default for hub screens; `canvas` (the bounded board
 * and the free editor above) keeps the spatial surfaces.
 *
 * Flow adds NO second layout model. A flow screen's tiles are the same `WidgetInstance.layout`
 * rectangles the canvas draws, read differently: the reading order is `(y, x)` and the width is a
 * column SPAN. That is what makes a policy switch preserve widget identity, configuration and
 * bindings by construction — there is nothing to convert.
 * --------------------------------------------------------------------------------------------- */

/** The viewport tiers the shell already resolves (`app/useViewport.ts`), named here so this module
 *  stays framework-free and the two definitions are structurally identical. */
export type FlowTier = 'desktop' | 'rail' | 'phone';

/**
 * Columns per tier. Twelve at desktop because it divides by 2, 3, 4 and 6 — halves, thirds and
 * quarters are all expressible — and because the Command Center's current `minmax(0,1.5fr)
 * minmax(0,1fr)` body is exactly spans 7 + 5 of it. Rail halves that; phone is one column, so every
 * tile is full width and nothing has to be dropped to fit (ADR-041: the phone tier "collapses to one
 * column without dropping controls").
 */
export const FLOW_COLUMNS: Record<FlowTier, number> = { desktop: 12, rail: 6, phone: 1 };

/** Desktop is the AUTHORING tier: a stored width is a span against THIS column count, and the
 *  narrower tiers re-read the same stored widths. */
export const FLOW_AUTHORING_TIER: FlowTier = 'desktop';

/**
 * RC-CAN-7.6 — the columns a flow screen reads at `tier`. A screen whose tiles are ALL bare in view
 * mode is one page of content rather than a board of tiles (the Command Center): like the hub it
 * replaces, it keeps its authored arrangement at rail and only the phone collapses it. Any framed
 * tile, or edit mode (which frames every tile), reads the tier's own grid. `/` and `/screen/:id`
 * both ask here, so the home screen lays out the same on either route at every tier.
 */
export function flowColumnsFor(
	tier: FlowTier,
	widgets: readonly Pick<BoardWidget, 'configuration' | 'configFields'>[],
	editing = false,
): number {
	const pageOnly =
		!editing &&
		widgets.length > 0 &&
		widgets.every((widget) => boardWidgetPresentation(widget) === 'bare');
	return pageOnly && tier === 'rail' ? FLOW_COLUMNS[FLOW_AUTHORING_TIER] : FLOW_COLUMNS[tier];
}

/** Durable px per column. 12 × 96 = 1152, a content width the desktop pane comfortably holds, and a
 *  240px default widget lands on span 3 (a quarter) rather than on a fraction nothing can render. */
export const FLOW_COLUMN_STEP = 96;

/** Durable y per row. Flow never reads a tile's height (heights follow content); this exists only so
 *  a canonical renumber writes rows that stay in order, and so a screen switched back to the canvas
 *  policy lands on a readable grid rather than on a single stack. */
export const FLOW_ROW_STEP = 240;

/** What flow needs of a tile: an identity, an order key, a width and, optionally, its layout group. */
export interface FlowRect {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
	groupId?: string | null;
}

/** A single `scene.move-widget` payload — flow's ONLY durable layout write for a reorder. */
export interface FlowMove {
	id: string;
	x: number;
	y: number;
}

/**
 * The reading order: top to bottom, then left to right, ties broken by id so the order is total and
 * two tiles dropped at the same coordinates can never swap places between renders.
 */
export function flowOrder<T extends FlowRect>(widgets: readonly T[]): T[] {
	return [...widgets].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
}

/** A tile's column span at `columns`, read from its durable width. Clamped, never rescaled — see
 *  {@link flowPlacements} for why that is the reflow rule rather than a proportional one. */
export function flowSpanOf(widget: { w: number }, columns: number = FLOW_COLUMNS.desktop): number {
	const span = Math.round(widget.w / FLOW_COLUMN_STEP);
	if (!Number.isFinite(span)) return 1;
	return Math.min(columns, Math.max(1, span));
}

/** The durable width a chosen span commits — the `w` of the `scene.resize-widget` a span pick
 *  dispatches. Its `h` is left alone: in flow, height follows content. */
export function flowSpanWidth(span: number): number {
	return Math.min(FLOW_COLUMNS.desktop, Math.max(1, Math.round(span))) * FLOW_COLUMN_STEP;
}

/**
 * The span a width preset commits: a fraction of the AUTHORING grid, never of the tier the reader
 * happens to be at.
 *
 * It takes no tier on purpose. A preset is a durable choice — it goes out through
 * {@link flowSpanWidth}, which measures against the twelve authoring columns — so reading "Half"
 * off the tier would commit a different width depending on where the GM was standing when they
 * picked it. On a phone, where the tier has one column, every preset would round to span 1 and the
 * control would shrink the tile to a twelfth of the screen everywhere else.
 */
export function flowPresetSpan(divisor: number): number {
	const columns = FLOW_COLUMNS[FLOW_AUTHORING_TIER];
	return Math.min(columns, Math.max(1, Math.round(columns / Math.max(1, divisor))));
}

/**
 * The width rows a flow tile's menu offers, resolved once against the authoring grid — the four
 * fractions a hub layout actually uses. A table rather than four divisors computed at render time,
 * because a preset read off the TIER is the bug this shape exists to prevent: at phone, where the
 * tier has one column, every divisor rounds to span 1, so every row reports itself checked and
 * picking any of them shrinks the tile to a twelfth of the screen everywhere else.
 */
export const FLOW_SPAN_PRESETS: readonly { labelKey: MessageKey; span: number }[] = [
	{ labelKey: 'boardCanvas.flow.span.full', span: flowPresetSpan(1) },
	{ labelKey: 'boardCanvas.flow.span.half', span: flowPresetSpan(2) },
	{ labelKey: 'boardCanvas.flow.span.third', span: flowPresetSpan(3) },
	{ labelKey: 'boardCanvas.flow.span.quarter', span: flowPresetSpan(4) },
];

/** Breathing room between a portalled flow panel and the viewport edge it is pulled back from. */
export const FLOW_PANEL_MARGIN = 8;

/**
 * Pull a fixed-position panel back inside the viewport.
 *
 * A tile menu is hung off its trigger's bottom edge, and a tile low in the board's scroll region
 * put the whole panel below the fold — on a phone, where tiles are full width and the list is
 * long, that took the Width group out of reach entirely, which is the one thing the phone tier is
 * not allowed to lose. `Popover` corrects this only for its own `anchor` placement, which a
 * caller-positioned menu does not use.
 *
 * Self-stabilising: a corrected position measures back to itself, so applying the result and
 * re-measuring settles in one pass instead of oscillating.
 */
export function flowPanelPosition(
	wanted: { top: number; left: number },
	panel: { width: number; height: number },
	viewport: { width: number; height: number },
	margin: number = FLOW_PANEL_MARGIN,
): { top: number; left: number } {
	// Taller (or wider) than the screen: pin the near edge rather than flipping between the two
	// overflows — the caller scrolls the panel from there.
	const clamp = (value: number, size: number, extent: number) =>
		Math.max(margin, Math.min(value, extent - size - margin));
	return {
		top: clamp(wanted.top, panel.height, viewport.height),
		left: clamp(wanted.left, panel.width, viewport.width),
	};
}

/** One tile's place in the grid. `index` is its position in the reading order, which is also its
 *  DOM position and its keyboard traversal position — in flow those are one order, not three. */
export interface FlowPlacement {
	id: string;
	/** 0-based grid column of the tile's left edge. */
	column: number;
	/** 0-based grid row. */
	row: number;
	span: number;
	index: number;
	/** Rows the tile spans: set on a tile that sits beside a stack (see {@link flowPlacements}). */
	rowSpan?: number;
}

/**
 * Pack a reading order into `columns` columns, left to right and top to bottom.
 *
 * Plain non-dense row fill: a tile that does not fit in what is left of the current row starts a new
 * one, and NOTHING is ever pulled back into an earlier gap. That is the whole reason flow may not
 * use masonry or `grid-auto-flow: dense` — either would place a later tile visually before an
 * earlier one, and ADR-041 makes visual order, DOM order and focus order the same order.
 *
 * Narrow tiers CLAMP a span rather than rescaling it. Rescaling (span × columns ÷ 12) would have
 * kept a 6 + 6 desktop pair two-up at rail — that is not a reflow, and reflowing at rail is the
 * point. Clamping alone leaves ragged rows (a span-5 tile alone in a 6-column rail row), so a tile
 * that ends up ALONE in its row at a narrower-than-authoring tier fills the row. At the authoring
 * tier nothing is stretched, so the authored arrangement is reproduced exactly.
 *
 * RC-CAN-7.6 — consecutive tiles that share a layout group STACK in one lane: one column and span
 * (the widest member's), one tile per row, and the tiles before the stack in its band span its rows
 * (the Command Center's Create over Manage beside Scenes). A stack closes its band, so reading the
 * grid row by row still meets the tiles in layout order. Without groups the packing is unchanged.
 */
export function flowPlacements(
	widgets: readonly FlowRect[],
	columns: number = FLOW_COLUMNS.desktop,
): FlowPlacement[] {
	return flowPlacementsForOrder(flowOrder(widgets), columns);
}

/** {@link flowPlacements} for a list that is ALREADY in reading order (a renumber's proposed one). */
export function flowPlacementsForOrder(
	ordered: readonly FlowRect[],
	columns: number = FLOW_COLUMNS.desktop,
): FlowPlacement[] {
	const lanes = Math.max(1, Math.floor(columns));
	// A run of consecutive tiles in one layout group is one item; any other tile is an item alone.
	const items: FlowRect[][] = [];
	for (const widget of ordered) {
		const last = items[items.length - 1];
		if (last && widget.groupId && last[0]!.groupId === widget.groupId) last.push(widget);
		else items.push([widget]);
	}
	const placements: FlowPlacement[] = [];
	const bandOf: number[] = [];
	const itemsInBand: number[] = [];
	let band = 0;
	let beside: FlowPlacement[] = [];
	let row = 0;
	let column = 0;
	const nextBand = (rows: number) => {
		row += rows;
		column = 0;
		band += 1;
		beside = [];
	};
	for (const item of items) {
		const span = Math.max(...item.map((widget) => flowSpanOf(widget, lanes)));
		if (column > 0 && column + span > lanes) nextBand(1);
		itemsInBand[band] = (itemsInBand[band] ?? 0) + 1;
		if (item.length === 1) {
			const placement = { id: item[0]!.id, column, row, span, index: placements.length };
			bandOf.push(band);
			placements.push(placement);
			beside.push(placement);
			column += span;
			if (column >= lanes) nextBand(1);
			continue;
		}
		for (const [offset, widget] of item.entries()) {
			bandOf.push(band);
			placements.push({ id: widget.id, column, row: row + offset, span, index: placements.length });
		}
		for (const placement of beside) placement.rowSpan = item.length;
		nextBand(item.length);
	}
	if (lanes >= FLOW_COLUMNS[FLOW_AUTHORING_TIER]) return placements;
	// A tile alone in its band at a narrower tier fills the band (and so spans no stack).
	return placements.map((placement, index) => {
		if (itemsInBand[bandOf[index]!] !== 1) return placement;
		const { rowSpan: _rowSpan, ...rest } = placement;
		return { ...rest, column: 0, span: lanes };
	});
}

/**
 * A coordinate that sorts STRICTLY between `pred` and `succ` under {@link flowOrder}, or `null` when
 * no such coordinate exists in double precision.
 *
 * The between-rows case is exact and cannot degrade: it reuses the predecessor's row and steps one
 * column to its right, which is always greater than `(pred.y, pred.x)` and always less than
 * `(succ.y, succ.x)` because `succ.y` is strictly greater. Only the within-a-row case needs a
 * midpoint, and only that case can run out of room — after which the caller renumbers.
 */
export function flowKeyBetween(
	pred: FlowRect | null,
	succ: FlowRect | null,
): { x: number; y: number } | null {
	if (!pred && !succ) return { x: 0, y: 0 };
	if (!pred && succ) return { x: succ.x, y: succ.y - FLOW_ROW_STEP };
	if (pred && !succ) return { x: pred.x, y: pred.y + FLOW_ROW_STEP };
	if (!pred || !succ) return null;
	if (pred.y < succ.y) return { x: pred.x + FLOW_COLUMN_STEP, y: pred.y };
	if (pred.y > succ.y) return null;
	const x = (pred.x + succ.x) / 2;
	return x > pred.x && x < succ.x ? { x, y: pred.y } : null;
}

/**
 * Canonical coordinates for an explicit reading order — every tile on the authoring grid, rows and
 * columns from {@link flowPlacementsForOrder}. Only the tiles that actually move are returned.
 */
export function flowRenumber(ordered: readonly FlowRect[]): FlowMove[] {
	const placements = flowPlacementsForOrder(ordered, FLOW_COLUMNS[FLOW_AUTHORING_TIER]);
	const moves: FlowMove[] = [];
	placements.forEach((placement, index) => {
		const widget = ordered[index];
		const x = placement.column * FLOW_COLUMN_STEP;
		const y = placement.row * FLOW_ROW_STEP;
		if (widget.x !== x || widget.y !== y) moves.push({ id: widget.id, x, y });
	});
	return moves;
}

/**
 * The move(s) that put `id` at `toIndex` of the reading order. `toIndex` indexes the order WITHOUT
 * the moved tile, so "drop onto the tile currently at j" is `toIndex = j` whether the drag went up
 * or down, and "one step later" is always `from + 1`.
 *
 * Normally exactly one move — flow's reorder is a single `scene.move-widget`, so one Ctrl+Z reverses
 * the whole gesture. The empty result is a no-op reorder; a longer one is the renumber fallback for
 * the one case {@link flowKeyBetween} cannot solve.
 */
export function flowReorderMoves(
	widgets: readonly FlowRect[],
	id: string,
	toIndex: number,
): FlowMove[] {
	const ordered = flowOrder(widgets);
	const from = ordered.findIndex((widget) => widget.id === id);
	if (from === -1) return [];
	const moved = ordered[from];
	const rest = ordered.filter((widget) => widget.id !== id);
	const target = Math.min(Math.max(0, Math.round(toIndex)), rest.length);
	if (target === from) return [];
	const key = flowKeyBetween(rest[target - 1] ?? null, rest[target] ?? null);
	if (key) return [{ id, x: key.x, y: key.y }];
	const proposed = [...rest];
	proposed.splice(target, 0, moved);
	return flowRenumber(proposed);
}
