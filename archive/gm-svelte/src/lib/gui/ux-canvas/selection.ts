/**
 * Canvas selection model (UX-CANVAS-005): single, multi (toggle/add), marquee, and select-all over the
 * spatial canvas, plus the selection bounding box. Pure — no DOM, no `$state` — so the reactive
 * controller and the Svelte overlay both consume the SAME deterministic math and it is unit-tested in
 * isolation. The marquee uses Figma's "fully enclosed" rule (a widget is selected only when its whole
 * bounding box lies inside the rubber-band), which is the predictable, accidental-deselection-free model
 * from research §3.3.
 *
 * NO-LEAK (actor safety): every function here operates only over the widget set the CALLER supplies,
 * which on the scene route is already the viewer-FILTERED set (DM-only widgets are removed for a
 * player/observer before they ever reach selection). A hidden widget is therefore never a marquee hit,
 * never in select-all, and never contributes to the selection bounds — it simply is not in the input.
 */

import type { SpatialWidget } from '$lib/gui/a11y/canvas-keyboard';
import type { Bounds, Rect } from '$lib/canvas-runtime/viewport';

export type { SpatialWidget };

/**
 * How a click/tap/marquee combines with the current selection:
 *  - `replace`: plain click — select only the target, clear everything else.
 *  - `toggle`:  Shift/Ctrl+click — add the target if absent, remove it if present.
 *  - `add`:     Shift+marquee — union the new hits into the existing selection.
 */
export type SelectionMode = 'replace' | 'toggle' | 'add';

/** Apply a single-target selection intent, returning the next selected-id set (a new Set). */
export function applySelection(
	current: ReadonlySet<string>,
	id: string,
	mode: SelectionMode,
): Set<string> {
	if (mode === 'replace') return new Set([id]);
	const next = new Set(current);
	if (mode === 'toggle') {
		if (next.has(id)) next.delete(id);
		else next.add(id);
		return next;
	}
	// `add`
	next.add(id);
	return next;
}

/** Union a batch of ids (a marquee result) into the current selection per the mode. */
export function applyBatchSelection(
	current: ReadonlySet<string>,
	ids: readonly string[],
	mode: SelectionMode,
): Set<string> {
	if (mode === 'replace') return new Set(ids);
	const next = new Set(current);
	for (const id of ids) next.add(id);
	return next;
}

/** Select every supplied widget (Ctrl/Cmd+A). The input is already viewer-filtered (no-leak). */
export function selectAllIds(widgets: readonly SpatialWidget[]): string[] {
	return widgets.map((w) => w.id);
}

/** Normalise two corner points (pointer-down → pointer-up) into a positive-extent rect. */
export function marqueeRect(start: { x: number; y: number }, end: { x: number; y: number }): Rect {
	const x = Math.min(start.x, end.x);
	const y = Math.min(start.y, end.y);
	return { x, y, w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) };
}

function fullyEnclosed(widget: SpatialWidget, rect: Rect): boolean {
	return (
		widget.x >= rect.x &&
		widget.y >= rect.y &&
		widget.x + widget.w <= rect.x + rect.w &&
		widget.y + widget.h <= rect.y + rect.h
	);
}

/**
 * The ids of widgets FULLY enclosed by a marquee rectangle (UX-CANVAS-005 spec: "Widgets whose bounding
 * box is fully inside the marquee are selected on release"). A degenerate (zero-area) marquee — a click
 * that did not drag — selects nothing, so a click on empty canvas clears rather than mass-selects.
 */
export function marqueeHits(widgets: readonly SpatialWidget[], rect: Rect): string[] {
	if (rect.w <= 0 || rect.h <= 0) return [];
	return widgets.filter((w) => fullyEnclosed(w, rect)).map((w) => w.id);
}

/** The world-space bounding box of the selected widgets, or `null` when the selection is empty. */
export function selectionBounds(
	widgets: readonly SpatialWidget[],
	selectedIds: ReadonlySet<string>,
): Bounds | null {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let count = 0;
	for (const w of widgets) {
		if (!selectedIds.has(w.id)) continue;
		count += 1;
		minX = Math.min(minX, w.x);
		minY = Math.min(minY, w.y);
		maxX = Math.max(maxX, w.x + w.w);
		maxY = Math.max(maxY, w.y + w.h);
	}
	return count === 0 ? null : { minX, minY, maxX, maxY };
}

/** Polite live-region text announced when the selection count changes (UX-CANVAS-005 accessibility). */
export function selectionAnnouncement(count: number): string {
	if (count === 0) return 'Selection cleared.';
	return `${count} widget${count === 1 ? '' : 's'} selected.`;
}
