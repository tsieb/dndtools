import type {
	WidgetBindingPayload,
	WidgetConfigField,
	WidgetDefinition,
	WidgetInstance,
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
