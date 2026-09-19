import type {
	WidgetBindingPayload,
	WidgetConfigField,
	WidgetDefinition,
	WidgetInstance,
	WidgetStyleTokenDefinition,
} from '@dndtools/core';

/**
 * board-helpers — the shared view-model that turns the Processing Core's widget state into the flat
 * shape the canvas substrate draws. Both `/board` (the Command Center spatial board) and
 * `/scene/:id` (the scene editor) read the SAME core scene/widget surface (CANVAS-009): a
 * `SceneSummary.widgets` carries the per-widget BINDING kind (available / degraded / disabled /
 * hidden / …), while the raw `Scene.widgets` carries the authoritative LAYOUT (x/y/w/h). We merge
 * them by id so every placed widget always has a real position, and surface the binding kind as the
 * widget's availability so disabled/missing widgets read honestly on the canvas.
 *
 * This mirrors how the production routes derive their tiles; it is intentionally framework-free so
 * the two screen files stay thin.
 */

export type WidgetTier = 'system' | 'template' | 'custom' | 'ai';
export type WidgetStatus = WidgetBindingPayload['kind'];

export interface BoardWidget {
	id: string;
	type: string;
	title: string;
	/** Library category or display name — the small caption under the title. */
	typeLabel: string;
	icon: string;
	tier: WidgetTier;
	description: string;
	/** 'dm-only' | 'shared' | 'player-visible' from the instance configuration. */
	visibility: string;
	x: number;
	y: number;
	w: number;
	h: number;
	/** Binding availability from the actor-scoped summary (CANVAS-009). */
	status: WidgetStatus;
	statusNote: string | null;
	/**
	 * The raw instance configuration — the free-form `Record` that `scene.configure-widget` writes.
	 * Surfaced so the canvas can render each widget's representative BODY from its real settings
	 * (note text, timer duration, dice formulas, toggles…) and so the inspector round-trips edits.
	 */
	configuration: Record<string, unknown>;
	/**
	 * The widget definition's DECLARED customization fields (`WidgetDefinition.configFields`) — the
	 * core's own data-driven settings surface. The tiered inspector renders these as live controls and
	 * the canvas body reads the same keys, so inspector edits and the rendered body always agree.
	 */
	configFields: WidgetConfigField[];
	/**
	 * True when the widget's CONTENT comes from a required data binding (a Map's map, a Character's
	 * sheet) rather than free-form configuration. Such content is managed by its binding, so the
	 * inspector shows it as locked instead of an editable field.
	 */
	requiresBinding: boolean;
	/**
	 * The command types this widget's definition DECLARES (`WidgetDefinition.commands`). Operate
	 * affordances (Roll / Start) verify a command is declared here before dispatching
	 * `widget.dispatch-command`; an undeclared command renders as an inert decoration instead.
	 */
	commands: string[];
	/**
	 * The instance's data-binding source (a Character widget's character, a Map widget's map), when
	 * bound. Live bodies resolve the bound entity through the actor-filtered queries from this ref.
	 */
	bindingRef: { entityType: string; entityId: string } | null;
	/**
	 * The `--widget-*` style tokens the definition DECLARES (`WidgetDefinition.style.tokens`,
	 * RC-WID-2.4), listed in the scene Inspector's Style group. Optional so hand-built view-models
	 * (the builder preview, test fixtures) that declare none need not spell out an empty list.
	 */
	styleTokens?: WidgetStyleTokenDefinition[];
	defaultSize?: { width: number; height: number };
	minSize?: { width: number; height: number };
}

// WidgetDefinition.author is the closest core analogue to the prototype's four widget "tiers".
const TIER_BY_AUTHOR: Record<string, WidgetTier> = {
	system: 'system',
	user: 'custom',
	workspace: 'template',
	ai: 'ai',
};

export function tierOf(author: string | undefined): WidgetTier {
	if (!author) return 'template';
	return TIER_BY_AUTHOR[author] ?? 'template';
}

/**
 * Whether the canvas lets the DM change a widget's size. `system`-tier instances are painted with a
 * padlock, get no resize handle and swallow Shift+Arrow, so every surface offering a size control has
 * to ask the same question — the scene Inspector used to offer S/M/L unconditionally and quietly
 * disagreed with the canvas about the same widget.
 */
export function isWidgetResizable(widget: { tier: WidgetTier }): boolean {
	return widget.tier !== 'system';
}

export const TIER_LABEL: Record<WidgetTier, string> = {
	system: 'System · locked content',
	template: 'Template',
	custom: 'Custom',
	ai: 'AI',
};

function statusNoteFor(payload: WidgetBindingPayload | undefined): string | null {
	if (!payload) return null;
	switch (payload.kind) {
		case 'degraded':
			return 'Some host permissions are unavailable here';
		case 'disabled':
			return payload.reason || 'Widget package disabled';
		case 'hidden':
			return 'Hidden from this viewer';
		case 'conflicted':
			return `Binding conflict (${payload.conflictPaths.length})`;
		case 'unbound':
			return 'Awaiting a data binding';
		case 'missing':
			return 'Bound entity is missing';
		default:
			return null;
	}
}

/**
 * Map raw widget instances (authoritative layout) + the actor-scoped binding payloads (availability)
 * into the flat board view-model. `defOf` resolves a widget definition for chrome (title / icon /
 * tier); pass `findWidgetDefinition(runtime.state.widgets, type)`.
 */
export function boardWidgetsOf(
	instances: readonly WidgetInstance[],
	payloadById: Map<string, WidgetBindingPayload>,
	defOf: (type: string) => WidgetDefinition | null,
): BoardWidget[] {
	return instances.map((instance) => {
		const def = defOf(instance.type);
		const payload = payloadById.get(instance.id);
		const visibility =
			typeof instance.configuration.visibility === 'string'
				? instance.configuration.visibility
				: 'dm-only';
		const titleOverride =
			typeof instance.configuration.title === 'string' && instance.configuration.title.trim()
				? instance.configuration.title
				: null;
		return {
			id: instance.id,
			type: instance.type,
			title: titleOverride ?? def?.displayName ?? instance.type,
			typeLabel: def?.category ?? def?.displayName ?? instance.type,
			icon: def?.icon ?? 'widget',
			tier: tierOf(def?.author),
			description: def?.description ?? '',
			visibility,
			configuration: instance.configuration,
			configFields: def?.configFields ?? [],
			requiresBinding: (def?.requiredBindings?.length ?? 0) > 0,
			commands: (def?.commands ?? []).map((command) => command.type),
			styleTokens: def?.style?.tokens ?? [],
			defaultSize: def?.defaultSize,
			minSize: def?.minSize,
			bindingRef: instance.binding
				? {
						entityType: instance.binding.source.entityType,
						entityId: instance.binding.source.entityId,
					}
				: null,
			x: instance.layout.x,
			y: instance.layout.y,
			w: instance.layout.w,
			h: instance.layout.h,
			status: payload?.kind ?? 'available',
			statusNote: statusNoteFor(payload),
		};
	});
}

/** Index the summary's binding payloads by widget instance id for the merge above. */
export function payloadIndex(
	payloads: readonly WidgetBindingPayload[],
): Map<string, WidgetBindingPayload> {
	const map = new Map<string, WidgetBindingPayload>();
	for (const payload of payloads) {
		const id =
			payload.kind === 'available' || payload.kind === 'degraded'
				? payload.widget.id
				: payload.widgetInstanceId;
		map.set(id, payload);
	}
	return map;
}

/** The visibility chip label + tone for a widget's configured visibility. */
export function visibilityChip(visibility: string): { label: string; players: boolean } {
	if (visibility === 'player-visible' || visibility === 'shared') {
		return { label: visibility === 'shared' ? 'Shared' : 'Players', players: true };
	}
	return { label: 'DM only', players: false };
}

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
const BOARD_MARGIN = 24;
const BOARD_COLUMN_STEP = 264; // DEFAULT_WIDGET_SIZE.w (240) + GUTTER (24)
const BOARD_ROW_GUTTER = 24;
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

/** The size a resize request actually commits: floored at the definition's minimum and, on the
 *  bounded board, clamped to its columns exactly as Board's `resize` does, so a live announcement
 *  or pointer draft never reports a width the board is about to refuse. */
export function fitWidgetSize(
	widget: BoardWidget,
	width: number,
	height: number,
	bounded: boolean,
): { w: number; h: number } {
	const w = Math.max(widget.minSize?.width ?? 180, width);
	return {
		w: bounded ? clampWidthToColumns(widget.x, w) : w,
		h: Math.max(widget.minSize?.height ?? 120, height),
	};
}

/** Small is the declared minimum, medium the default, large 150% of the default — each fitted, so
 *  a preset the bounded board clamps to an existing size collapses into it. */
export function widgetSizePresets(widget: BoardWidget, bounded = false) {
	const min = widget.minSize ?? { width: 180, height: 120 };
	const base = widget.defaultSize ?? { width: 280, height: 220 };
	return [min, base, { width: Math.round(base.width * 1.5), height: Math.round(base.height * 1.5) }]
		.map(({ width, height }) => fitWidgetSize(widget, width, height, bounded))
		.filter(
			(size, index, sizes) =>
				sizes.findIndex((other) => other.w === size.w && other.h === size.h) === index,
		);
}

/** The preset after `current` — the size on screen, which may be a draft the core has not
 *  confirmed yet. A custom size restarts the cycle at small. */
export function nextSizePreset(
	widget: BoardWidget,
	current: { w: number; h: number },
	bounded = false,
): { w: number; h: number } {
	const sizes = widgetSizePresets(widget, bounded);
	const index = sizes.findIndex((size) => size.w === current.w && size.h === current.h);
	return sizes[(index + 1) % sizes.length];
}

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

/** Durable px per column. 12 × 96 = 1152, a content width the desktop pane comfortably holds, and a
 *  240px default widget lands on span 3 (a quarter) rather than on a fraction nothing can render. */
export const FLOW_COLUMN_STEP = 96;

/** Durable y per row. Flow never reads a tile's height (heights follow content); this exists only so
 *  a canonical renumber writes rows that stay in order, and so a screen switched back to the canvas
 *  policy lands on a readable grid rather than on a single stack. */
export const FLOW_ROW_STEP = 240;

/** What flow needs of a tile: an identity, an order key and a width. */
export interface FlowRect {
	id: string;
	x: number;
	y: number;
	w: number;
	h: number;
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
export const FLOW_SPAN_PRESETS: readonly { label: string; span: number }[] = [
	{ label: 'Full width', span: flowPresetSpan(1) },
	{ label: 'Half', span: flowPresetSpan(2) },
	{ label: 'Third', span: flowPresetSpan(3) },
	{ label: 'Quarter', span: flowPresetSpan(4) },
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
	const placements: FlowPlacement[] = [];
	let row = 0;
	let column = 0;
	ordered.forEach((widget, index) => {
		const span = flowSpanOf(widget, lanes);
		if (column > 0 && column + span > lanes) {
			row += 1;
			column = 0;
		}
		placements.push({ id: widget.id, column, row, span, index });
		column += span;
		if (column >= lanes) {
			row += 1;
			column = 0;
		}
	});
	if (lanes >= FLOW_COLUMNS[FLOW_AUTHORING_TIER]) return placements;
	const perRow = new Map<number, number>();
	for (const placement of placements)
		perRow.set(placement.row, (perRow.get(placement.row) ?? 0) + 1);
	return placements.map((placement) =>
		perRow.get(placement.row) === 1 ? { ...placement, column: 0, span: lanes } : placement,
	);
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
