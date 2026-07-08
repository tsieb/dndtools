/**
 * Canvas keyboard model (UX-A11Y-003): selection, move, resize, link without a pointer.
 *
 * The spatial half of the two-mode canvas access story (the structural half is `scene-outline.ts`).
 * This engine resolves keyboard intent over the canvas into discrete results — nearest-neighbour
 * selection in spatial mode, the spatial⇄action mode transitions, a keyboard link operation, and the
 * announcement strings — while delegating the actual move/resize geometry to the shared
 * `drag-alternative` controller so the keyboard path dispatches the IDENTICAL core command a pointer
 * drag would (UX-A11Y-013). Multi-select and layer-order (Tab/Home/End) traversal are resolved here
 * too, so no surface re-implements the canvas key model.
 *
 * NO-LEAK: this engine only ever receives the viewer-FILTERED widget set (built by the caller via
 * `filterVisibleForViewer`), so a hidden DM-only widget is never a spatial-nav target, never in the
 * Tab sequence, and never named in a move/resize/link announcement (UX-A11Y-008).
 *
 * Pure — no DOM. The Svelte canvas/Scene Outline maps a key event to a result and calls `el.focus()`.
 */

import { buildMoveCommand, nudge, type MoveCommand, type NudgeOptions, type Vec2 } from './drag-alternative';

export type ArrowDirection = 'up' | 'down' | 'left' | 'right';

/** Arrow key → spatial direction, or `null` for a non-arrow key. */
export function arrowDirection(key: string): ArrowDirection | null {
	switch (key) {
		case 'ArrowUp':
			return 'up';
		case 'ArrowDown':
			return 'down';
		case 'ArrowLeft':
			return 'left';
		case 'ArrowRight':
			return 'right';
		default:
			return null;
	}
}

/** A widget's bounding box on the canvas (already visibility-filtered by the caller). */
export interface SpatialWidget {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
}

function center(widget: SpatialWidget): Vec2 {
	return { x: widget.x + widget.w / 2, y: widget.y + widget.h / 2 };
}

/**
 * Spatial mode: the id of the nearest widget in `direction` from `fromId`, or `null` when none lies in
 * that direction. "In direction" means strictly beyond the source centre along the primary axis;
 * ties break by smallest perpendicular offset then smallest primary distance, so arrow navigation is
 * deterministic and reproduces the same order a sighted user would expect (Figma-style nearest
 * neighbour).
 */
export function nearestInDirection(
	widgets: readonly SpatialWidget[],
	fromId: string,
	direction: ArrowDirection,
): string | null {
	const from = widgets.find((w) => w.id === fromId);
	if (!from) return null;
	const origin = center(from);

	let best: { id: string; primary: number; perpendicular: number } | null = null;
	for (const widget of widgets) {
		if (widget.id === fromId) continue;
		const c = center(widget);
		const dx = c.x - origin.x;
		const dy = c.y - origin.y;

		let primary: number;
		let perpendicular: number;
		switch (direction) {
			case 'up':
				if (dy >= 0) continue;
				primary = -dy;
				perpendicular = Math.abs(dx);
				break;
			case 'down':
				if (dy <= 0) continue;
				primary = dy;
				perpendicular = Math.abs(dx);
				break;
			case 'left':
				if (dx >= 0) continue;
				primary = -dx;
				perpendicular = Math.abs(dy);
				break;
			case 'right':
				if (dx <= 0) continue;
				primary = dx;
				perpendicular = Math.abs(dy);
				break;
		}

		if (
			best === null ||
			perpendicular < best.perpendicular ||
			(perpendicular === best.perpendicular && primary < best.primary)
		) {
			best = { id: widget.id, primary, perpendicular };
		}
	}
	return best?.id ?? null;
}

/**
 * Layer-order traversal for Tab/Shift+Tab/Home/End over the widget set in document/layer order. Returns
 * the next index, or `null` when the key is not a traversal key. Tab wraps to first/last like the
 * roving sequence; Home/End jump to the ends (UX-A11Y-003 spatial-mode spec).
 */
export function layerOrderIndex(key: string, shiftKey: boolean, currentIndex: number, count: number): number | null {
	if (count <= 0) return null;
	if (key === 'Home') return 0;
	if (key === 'End') return count - 1;
	if (key === 'Tab') {
		const next = shiftKey ? currentIndex - 1 : currentIndex + 1;
		if (next < 0) return count - 1;
		if (next >= count) return 0;
		return next;
	}
	return null;
}

export type CanvasMode = 'spatial' | 'action';

/** The minimal canvas keyboard state: which mode, and the focused widget id (null when canvas empty). */
export interface CanvasKeyboardState {
	mode: CanvasMode;
	focusedId: string | null;
	/** Multi-select set (Shift+Arrow / Ctrl+A). Always includes `focusedId` when non-null. */
	selectedIds: readonly string[];
}

export function initialCanvasState(focusedId: string | null = null): CanvasKeyboardState {
	return { mode: 'spatial', focusedId, selectedIds: focusedId ? [focusedId] : [] };
}

/** Enter action mode on the focused widget (Enter in spatial mode). No-op when nothing is focused. */
export function enterActionMode(state: CanvasKeyboardState): CanvasKeyboardState {
	if (!state.focusedId) return state;
	return { ...state, mode: 'action' };
}

/** Exit action mode back to spatial mode, keeping the widget focused (Escape in action mode). */
export function exitActionMode(state: CanvasKeyboardState): CanvasKeyboardState {
	return { ...state, mode: 'spatial' };
}

/** Move focus to `id` in spatial mode, replacing the selection (single-select arrow move). */
export function focusWidget(state: CanvasKeyboardState, id: string): CanvasKeyboardState {
	return { mode: 'spatial', focusedId: id, selectedIds: [id] };
}

/** Extend the multi-select to include `id` and make it the focus (Shift+Arrow). */
export function extendSelection(state: CanvasKeyboardState, id: string): CanvasKeyboardState {
	const selected = state.selectedIds.includes(id)
		? state.selectedIds
		: [...state.selectedIds, id];
	return { ...state, mode: 'spatial', focusedId: id, selectedIds: selected };
}

/** Select every widget (Ctrl+A). Focus stays on the current widget if any, else the first. */
export function selectAll(
	state: CanvasKeyboardState,
	allIds: readonly string[],
): CanvasKeyboardState {
	const first = allIds[0];
	if (first === undefined) return { mode: 'spatial', focusedId: null, selectedIds: [] };
	const focusedId =
		state.focusedId && allIds.includes(state.focusedId) ? state.focusedId : first;
	return { mode: 'spatial', focusedId, selectedIds: [...allIds] };
}

// --- Move / resize (delegating geometry to the shared drag-alternative) ---------------------------

/**
 * Keyboard move (Ctrl+Arrow): the new position after one grid-snap nudge, or `null` for a non-arrow
 * key. Identical target a pointer drag would produce; both feed {@link buildMoveCommand}.
 */
export function keyboardMove(position: Vec2, key: string, options: NudgeOptions): Vec2 | null {
	return nudge(position, key, options);
}

/** Build the move command for the keyboard path — the SAME shape the pointer drag commits. */
export function buildCanvasMoveCommand(id: string, from: Vec2, to: Vec2): MoveCommand {
	return buildMoveCommand(id, from, to);
}

export interface Size {
	w: number;
	h: number;
}

export interface ResizeCommand {
	kind: 'resize';
	id: string;
	from: Size;
	to: Size;
}

/**
 * Keyboard resize (action mode, resize handle + Arrow): the new size after one snap step, clamped to
 * a 1×1 minimum, or `null` for a non-arrow key. Right/Down grow; Left/Up shrink the primary axis.
 */
export function keyboardResize(size: Size, key: string, options: NudgeOptions): Size | null {
	const direction = arrowDirection(key);
	if (!direction) return null;
	const step = options.fine ? (options.fineStep ?? 1) : options.step;
	let { w, h } = size;
	switch (direction) {
		case 'right':
			w += step;
			break;
		case 'left':
			w -= step;
			break;
		case 'down':
			h += step;
			break;
		case 'up':
			h -= step;
			break;
	}
	return { w: Math.max(1, w), h: Math.max(1, h) };
}

export function buildResizeCommand(id: string, from: Size, to: Size): ResizeCommand {
	return { kind: 'resize', id, from, to };
}

// --- Keyboard link operation ----------------------------------------------------------------------

export type LinkPhase = 'idle' | 'selecting';

export interface LinkOperation {
	phase: LinkPhase;
	sourceId: string | null;
	targetId: string | null;
}

export const NO_LINK: LinkOperation = { phase: 'idle', sourceId: null, targetId: null };

/** Begin a link from a source widget (Enter on the link port in action mode). */
export function beginLink(sourceId: string): LinkOperation {
	return { phase: 'selecting', sourceId, targetId: null };
}

/** Move the link target as arrow keys select among widgets. No-op when not selecting. */
export function selectLinkTarget(op: LinkOperation, targetId: string): LinkOperation {
	if (op.phase !== 'selecting') return op;
	return { ...op, targetId };
}

export interface LinkCommand {
	kind: 'link';
	sourceId: string;
	targetId: string;
}

/**
 * Complete the link (Enter on the chosen target): the link command plus the reset operation, or `null`
 * when there is no source/target yet (Escape path uses {@link cancelLink}).
 */
export function completeLink(op: LinkOperation): { command: LinkCommand; next: LinkOperation } | null {
	if (op.phase !== 'selecting' || !op.sourceId || !op.targetId) return null;
	if (op.sourceId === op.targetId) return null;
	return {
		command: { kind: 'link', sourceId: op.sourceId, targetId: op.targetId },
		next: NO_LINK,
	};
}

/** Cancel an in-progress link (Escape), emitting no command. */
export function cancelLink(): LinkOperation {
	return NO_LINK;
}

// --- Announcements (polite live-region text; visibility-safe names supplied by caller) -------------

/** "Widget {name} of {total}" position context spoken when spatial focus lands on a widget. */
export function positionDescription(index: number, total: number): string {
	return `item ${index + 1} of ${total}`;
}

/** Polite announcement after a keyboard move. `name` is the already-visibility-safe widget name. */
export function moveAnnouncement(name: string, to: Vec2): string {
	return `${name} moved to ${Math.round(to.x)}, ${Math.round(to.y)}.`;
}

/** Polite announcement after a keyboard resize. */
export function resizeAnnouncement(name: string, to: Size): string {
	return `${name} resized to ${Math.round(to.w)} by ${Math.round(to.h)}.`;
}

/** Polite announcement after a link completes. Both names are visibility-safe. */
export function linkAnnouncement(sourceName: string, targetName: string): string {
	return `Link from ${sourceName} to ${targetName} created.`;
}

/** Polite announcement spoken when focus enters an empty canvas (UX-A11Y-003 AC6). */
export function emptyCanvasAnnouncement(): string {
	return 'Canvas empty — use the toolbar to add a widget.';
}
