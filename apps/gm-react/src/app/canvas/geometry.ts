import {
	resolveSelectionLayoutCommand,
	resolveWidgetOrderCommand,
	widgetPaintOrder,
	type ResolvedLayoutCommand,
	type Scene,
} from '@dndtools/core';

/**
 * RC-CAN-3.6 — the canvas's geometry, kept pure so every rule is unit-tested without a DOM: marquee
 * selection, align, distribute, the bring-forward/send-back reorder, plus the board extent, draft
 * settling and zoom-about-a-point arithmetic the canvas used to inline. The canvas turns the results
 * into core commands (`scene.move-widget` per tile, `scene.set-widget-order`, `scene.group-widgets`);
 * nothing here dispatches.
 */

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Rect extends Box {
	id: string;
}

export interface Placement {
	id: string;
	x: number;
	y: number;
}

export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';
export type LayerMove = 'forward' | 'backward' | 'front' | 'back';

export type ArrangeAction =
	| { kind: 'align'; mode: AlignMode }
	| { kind: 'distribute'; axis: DistributeAxis }
	| { kind: 'layer'; move: LayerMove }
	| { kind: 'group' }
	| { kind: 'ungroup' }
	| { kind: 'select-all' };

/** The box two pointer positions span, whichever way the drag went. */
export function boxFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): Box {
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		w: Math.abs(a.x - b.x),
		h: Math.abs(a.y - b.y),
	};
}

/** Marquee selection is "fully enclosed": a tile the box only clips stays out. */
export function enclosedIds(rects: readonly Rect[], box: Box): string[] {
	return rects
		.filter(
			(r) =>
				r.x >= box.x && r.y >= box.y && r.x + r.w <= box.x + box.w && r.y + r.h <= box.y + box.h,
		)
		.map((r) => r.id);
}

/** The smallest box holding every rect. */
export function boundsOf(rects: readonly Box[]): Box {
	const left = Math.min(...rects.map((r) => r.x));
	const top = Math.min(...rects.map((r) => r.y));
	const right = Math.max(...rects.map((r) => r.x + r.w));
	const bottom = Math.max(...rects.map((r) => r.y + r.h));
	return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Only the tiles whose position actually changes, so a no-op align dispatches nothing. */
function changed(rects: readonly Rect[], next: readonly Placement[]): Placement[] {
	return next.filter((p) => {
		const r = rects.find((rect) => rect.id === p.id)!;
		return r.x !== p.x || r.y !== p.y;
	});
}

/** Align against the selection's own bounds (not the board), as design tools do. Needs two tiles. */
export function alignRects(rects: readonly Rect[], mode: AlignMode): Placement[] {
	if (rects.length < 2) return [];
	const b = boundsOf(rects);
	const place = (r: Rect): Placement => {
		switch (mode) {
			case 'left':
				return { id: r.id, x: b.x, y: r.y };
			case 'center':
				return { id: r.id, x: Math.round(b.x + (b.w - r.w) / 2), y: r.y };
			case 'right':
				return { id: r.id, x: b.x + b.w - r.w, y: r.y };
			case 'top':
				return { id: r.id, x: r.x, y: b.y };
			case 'middle':
				return { id: r.id, x: r.x, y: Math.round(b.y + (b.h - r.h) / 2) };
			case 'bottom':
				return { id: r.id, x: r.x, y: b.y + b.h - r.h };
		}
	};
	return changed(rects, rects.map(place));
}

/**
 * Equal gaps between neighbours along `axis`. The first and last tile (by position) stay put and the
 * ones between are spaced evenly across the span; ties keep selection order. Tiles too wide to fit
 * the span without overlapping get evenly spaced CENTRES instead, so none jumps past its neighbour.
 * Needs three tiles.
 */
export function distributeRects(rects: readonly Rect[], axis: DistributeAxis): Placement[] {
	if (rects.length < 3) return [];
	const horizontal = axis === 'horizontal';
	const start = (r: Box) => (horizontal ? r.x : r.y);
	const size = (r: Box) => (horizontal ? r.w : r.h);
	const sorted = [...rects].sort((a, b) => start(a) - start(b));
	const first = sorted[0];
	const last = sorted[sorted.length - 1];
	const span = start(last) + size(last) - start(first);
	const gap = (span - sorted.reduce((sum, r) => sum + size(r), 0)) / (sorted.length - 1);
	const firstCentre = start(first) + size(first) / 2;
	const step = (start(last) + size(last) / 2 - firstCentre) / (sorted.length - 1);
	let cursor = start(first);
	const next = sorted.map((r, index) => {
		const even = gap >= 0 ? cursor : firstCentre + step * index - size(r) / 2;
		const at = index === 0 || index === sorted.length - 1 ? start(r) : Math.round(even);
		cursor += size(r) + gap;
		return horizontal ? { id: r.id, x: at, y: r.y } : { id: r.id, x: r.x, y: at };
	});
	return changed(rects, next);
}

/**
 * Bring forward / send back over a back-to-front paint order. Forward moves each selected tile one
 * step past the next unselected tile above it (a contiguous selection moves as a block); front and
 * back move the whole selection to the end, keeping its relative order.
 */
export function reorderLayers(
	order: readonly string[],
	selected: readonly string[],
	move: LayerMove,
): string[] {
	const picked = new Set(selected);
	const next = [...order];
	if (move === 'front' || move === 'back') {
		const inSel = next.filter((id) => picked.has(id));
		const rest = next.filter((id) => !picked.has(id));
		return move === 'front' ? [...rest, ...inSel] : [...inSel, ...rest];
	}
	const swap = (i: number, j: number) => ([next[i], next[j]] = [next[j], next[i]]);
	if (move === 'forward') {
		for (let i = next.length - 2; i >= 0; i--) {
			if (picked.has(next[i]) && !picked.has(next[i + 1])) swap(i, i + 1);
		}
	} else {
		for (let i = 1; i < next.length; i++) {
			if (picked.has(next[i]) && !picked.has(next[i - 1])) swap(i, i - 1);
		}
	}
	return next;
}

/** Add `ids` to the selection, or take them out when the first is already in it. */
export function toggleSelection(selection: readonly string[], ids: readonly string[]): string[] {
	if (ids.length === 0) return [...selection];
	if (selection.includes(ids[0])) return selection.filter((id) => !ids.includes(id));
	return [...selection, ...ids.filter((id) => !selection.includes(id))];
}

/** A grouped tile selects with its whole group, so align and move treat the group as one. */
export function withGroupMates(
	ids: readonly string[],
	groupOf: ReadonlyMap<string, string | null>,
): string[] {
	const groups = new Set(ids.map((id) => groupOf.get(id)).filter(Boolean));
	const mates = [...groupOf].filter(([, g]) => g && groups.has(g)).map(([id]) => id);
	return [...new Set([...ids, ...mates])];
}

interface ArrangeKeyEvent {
	code: string;
	altKey: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
}

const ALIGN_CODES: Record<string, AlignMode> = {
	KeyA: 'left',
	KeyH: 'center',
	KeyD: 'right',
	KeyW: 'top',
	KeyV: 'middle',
	KeyS: 'bottom',
};

/**
 * The arrange shortcuts, read off `code` so Option-letter on a Mac (which types `å`) still matches:
 *   Alt+A/H/D align left/center/right · Alt+W/V/S align top/middle/bottom
 *   Alt+Shift+H/V distribute horizontally/vertically
 *   Ctrl/⌘+] bring forward (+Shift: to front) · Ctrl/⌘+[ send backward (+Shift: to back)
 *   Ctrl/⌘+G group (+Shift: ungroup) · Ctrl/⌘+A select every tile
 */
export function arrangeShortcut(e: ArrangeKeyEvent): ArrangeAction | null {
	const mod = e.ctrlKey || e.metaKey;
	if (e.altKey && !mod) {
		if (e.shiftKey) {
			if (e.code === 'KeyH') return { kind: 'distribute', axis: 'horizontal' };
			if (e.code === 'KeyV') return { kind: 'distribute', axis: 'vertical' };
			return null;
		}
		const mode = ALIGN_CODES[e.code];
		return mode ? { kind: 'align', mode } : null;
	}
	if (!mod || e.altKey) return null;
	if (e.code === 'BracketRight') return { kind: 'layer', move: e.shiftKey ? 'front' : 'forward' };
	if (e.code === 'BracketLeft') return { kind: 'layer', move: e.shiftKey ? 'back' : 'backward' };
	if (e.code === 'KeyG') return { kind: e.shiftKey ? 'ungroup' : 'group' };
	if (e.code === 'KeyA' && !e.shiftKey) return { kind: 'select-all' };
	return null;
}

/** The positional plan for an align/distribute action; empty for the other kinds. */
export function planPlacements(action: ArrangeAction, rects: readonly Rect[]): Placement[] {
	if (action.kind === 'align') return alignRects(rects, action.mode);
	if (action.kind === 'distribute') return distributeRects(rects, action.axis);
	return [];
}

/** The resolved core command for a layer or group action over `selection`; `null` for the rest. */
export function arrangeCommand(
	action: ArrangeAction,
	scene: Scene,
	selection: readonly string[],
): ResolvedLayoutCommand | null {
	if (action.kind === 'layer') {
		const order = reorderLayers(widgetPaintOrder(scene), selection, action.move);
		return resolveWidgetOrderCommand(scene, order);
	}
	if (action.kind !== 'group' && action.kind !== 'ungroup') return null;
	const id = action.kind === 'group' ? 'group-selection' : 'ungroup-selection';
	return resolveSelectionLayoutCommand({ id }, scene, selection);
}

/** The authored extent of the board (its right and bottom edges), never below 1×1. */
export function extentOf(rects: readonly Box[]): { width: number; height: number } {
	let width = 1;
	let height = 1;
	for (const r of rects) {
		width = Math.max(width, r.x + r.w);
		height = Math.max(height, r.y + r.h);
	}
	return { width, height };
}

/** Drop each draft the confirmed layout has caught up with; `prev` itself when none has. */
export function dropSettled<D, W extends { id: string }>(
	prev: Record<string, D>,
	widgets: readonly W[],
	settled: (draft: D, widget: W) => boolean,
): Record<string, D> {
	const done = widgets.filter((w) => prev[w.id] && settled(prev[w.id], w)).map((w) => w.id);
	if (done.length === 0) return prev;
	const next = { ...prev };
	for (const id of done) delete next[id];
	return next;
}

/** RC-CAN-8.3 — an edge or centre line the dragged tile shares with a still one, in board units.
 *  `axis: 'x'` is a vertical line at x = `at`, running from `from` to `to` down the board. */
export interface Guide {
	axis: 'x' | 'y';
	at: number;
	from: number;
	to: number;
}

/** The free space between the dragged tile and its nearest still neighbour on one side: a run along
 *  `axis` from `from` to `to`, drawn across the other axis at `at`. */
export interface Gap extends Guide {
	distance: number;
}

export interface DragGuides {
	guides: Guide[];
	gaps: Gap[];
}

const linesOf = (b: Box, axis: 'x' | 'y') =>
	axis === 'x' ? [b.x, b.x + b.w / 2, b.x + b.w] : [b.y, b.y + b.h / 2, b.y + b.h];

/** The overlap of two boxes across `axis` (their shared y-range for 'x'), or null. */
function across(a: Box, b: Box, axis: 'x' | 'y'): [number, number] | null {
	const [a0, a1, b0, b1] =
		axis === 'x' ? [a.y, a.y + a.h, b.y, b.y + b.h] : [a.x, a.x + a.w, b.x, b.x + b.w];
	const lo = Math.max(a0, b0);
	const hi = Math.min(a1, b1);
	return hi > lo ? [lo, hi] : null;
}

/**
 * RC-CAN-8.3 — the snap guides and distance hints for a tile being dragged. A guide is every left,
 * centre or right (top, middle, bottom) line the moving box shares with a still box, within
 * `tolerance`, spanning both boxes; lines at the same place merge into one. A gap is the distance to
 * the nearest still box on each of the four sides that overlaps the moving box across that axis.
 */
export function dragGuides(moving: Box, still: readonly Box[], tolerance = 0.5): DragGuides {
	const guides = new Map<string, Guide>();
	const gaps: Gap[] = [];
	for (const axis of ['x', 'y'] as const) {
		const mine = linesOf(moving, axis);
		for (const other of still) {
			const span = boundsOf([moving, other]);
			const [from, to] = axis === 'x' ? [span.y, span.y + span.h] : [span.x, span.x + span.w];
			for (const at of linesOf(other, axis)) {
				if (!mine.some((line) => Math.abs(line - at) <= tolerance)) continue;
				const key = `${axis}:${at}`;
				const seen = guides.get(key);
				guides.set(key, {
					axis,
					at,
					from: Math.min(from, seen?.from ?? from),
					to: Math.max(to, seen?.to ?? to),
				});
			}
		}
		const start = axis === 'x' ? moving.x : moving.y;
		const end = start + (axis === 'x' ? moving.w : moving.h);
		let before: Gap | null = null;
		let after: Gap | null = null;
		for (const other of still) {
			const shared = across(moving, other, axis);
			if (!shared) continue;
			const at = (shared[0] + shared[1]) / 2;
			const [oStart, oEnd] =
				axis === 'x' ? [other.x, other.x + other.w] : [other.y, other.y + other.h];
			if (oEnd <= start && (!before || oEnd > before.from))
				before = { axis, at, from: oEnd, to: start, distance: start - oEnd };
			if (oStart >= end && (!after || oStart < after.to))
				after = { axis, at, from: end, to: oStart, distance: oStart - end };
		}
		for (const gap of [before, after]) if (gap && gap.distance > 0) gaps.push(gap);
	}
	return { guides: [...guides.values()], gaps };
}

/**
 * RC-CAN-8.3 — the magnet behind the snap guides: per axis, where `moving` would sit to share its
 * nearest edge or centre line with a still box, when that line is within `threshold`. An axis with no
 * line that close is absent, and the caller falls back to the grid.
 */
export function alignTo(
	moving: Box,
	still: readonly Box[],
	threshold: number,
): { x?: number; y?: number } {
	const out: { x?: number; y?: number } = {};
	for (const axis of ['x', 'y'] as const) {
		let best = threshold;
		const origin = axis === 'x' ? moving.x : moving.y;
		for (const line of linesOf(moving, axis)) {
			for (const other of still) {
				for (const at of linesOf(other, axis)) {
					if (Math.abs(at - line) > best) continue;
					best = Math.abs(at - line);
					out[axis] = origin + at - line;
				}
			}
		}
	}
	return out;
}

export interface ViewTransform {
	tx: number;
	ty: number;
	scale: number;
}

/** Re-scale a pan/zoom view about the pane point (cx, cy), which stays where it is on screen. */
export function zoomAbout(v: ViewTransform, cx: number, cy: number, scale: number): ViewTransform {
	return {
		tx: cx - ((cx - v.tx) / v.scale) * scale,
		ty: cy - ((cy - v.ty) / v.scale) * scale,
		scale,
	};
}
