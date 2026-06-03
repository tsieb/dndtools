import type { GroupId, WidgetInstanceId } from '../state/ids';
import type { WidgetDock, WidgetInstance, WidgetLayout } from '../state/scene-state';

/**
 * Which layout characteristic placed a widget into its focus tier (CANVAS-016).
 * Tier precedence is explicit metadata, then pinned chrome, then docked chrome,
 * then free-floating widgets.
 */
export type WidgetFocusTier = 'explicit' | 'pinned' | 'docked' | 'floating';

export interface SceneFocusEntry {
	widgetInstanceId: WidgetInstanceId;
	/** Zero-based position in keyboard traversal order. */
	tabIndex: number;
	tier: WidgetFocusTier;
	groupId: GroupId | null;
	z: number;
	dock: WidgetDock;
	pinned: boolean;
	focusOrder: number | null;
}

/**
 * The minimal layout shape the focus-order computation needs. Accepting this rather
 * than a full `WidgetInstance` keeps the function reusable for view models that carry
 * only layout metadata.
 */
export interface FocusOrderInput {
	id: WidgetInstanceId;
	layout: Pick<WidgetLayout, 'z' | 'groupId' | 'dock' | 'pinned' | 'focusOrder'>;
}

const TIER_RANK: Record<WidgetFocusTier, number> = {
	explicit: 0,
	pinned: 1,
	docked: 2,
	floating: 3,
};

// Docked chrome reads top-to-bottom, then left-to-right, so keyboard traversal lands
// on persistent edges in a predictable spatial order.
const DOCK_RANK: Record<NonNullable<WidgetDock>, number> = {
	top: 0,
	left: 1,
	right: 2,
	bottom: 3,
};

function tierOf(layout: FocusOrderInput['layout']): WidgetFocusTier {
	if (layout.focusOrder !== null) return 'explicit';
	if (layout.pinned) return 'pinned';
	if (layout.dock !== null) return 'docked';
	return 'floating';
}

function dockRank(dock: WidgetDock): number {
	return dock === null ? Number.MAX_SAFE_INTEGER : DOCK_RANK[dock];
}

/**
 * Base ordering without group contiguity. Deterministic and independent of array
 * insertion order: ties always resolve on the widget id, never on DOM position.
 */
function compareBase(a: FocusOrderInput, b: FocusOrderInput): number {
	const tierA = TIER_RANK[tierOf(a.layout)];
	const tierB = TIER_RANK[tierOf(b.layout)];
	if (tierA !== tierB) return tierA - tierB;

	// Explicit metadata wins outright: lower focusOrder is reached first.
	if (a.layout.focusOrder !== null && b.layout.focusOrder !== null) {
		if (a.layout.focusOrder !== b.layout.focusOrder) {
			return a.layout.focusOrder - b.layout.focusOrder;
		}
	}

	// Within docked chrome, order by edge before z so the same edge stays together.
	const dockA = dockRank(a.layout.dock);
	const dockB = dockRank(b.layout.dock);
	if (dockA !== dockB) return dockA - dockB;

	// Higher z-order (visually on top) is reached first.
	if (a.layout.z !== b.layout.z) return b.layout.z - a.layout.z;

	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Compute the deterministic keyboard focus traversal order for a Scene's widgets
 * (CANVAS-016). Order follows explicit focus metadata, then dock/pin chrome, then
 * z-order, with grouped widgets kept contiguous and anchored by their
 * highest-priority member. Every supplied widget appears exactly once, so no widget
 * control becomes unreachable when layout changes.
 */
export function computeWidgetFocusOrder(
	widgets: readonly FocusOrderInput[],
): SceneFocusEntry[] {
	const base = [...widgets].sort(compareBase);

	// Group contiguity pass: when a group's anchor (its first base-ordered member) is
	// emitted, pull the remaining members up so the whole group travels together while
	// keeping their relative base order.
	const ordered: FocusOrderInput[] = [];
	const emitted = new Set<WidgetInstanceId>();
	for (const widget of base) {
		if (emitted.has(widget.id)) continue;
		ordered.push(widget);
		emitted.add(widget.id);
		const groupId = widget.layout.groupId;
		if (groupId === null) continue;
		for (const candidate of base) {
			if (emitted.has(candidate.id)) continue;
			if (candidate.layout.groupId === groupId) {
				ordered.push(candidate);
				emitted.add(candidate.id);
			}
		}
	}

	return ordered.map((widget, index) => ({
		widgetInstanceId: widget.id,
		tabIndex: index,
		tier: tierOf(widget.layout),
		groupId: widget.layout.groupId,
		z: widget.layout.z,
		dock: widget.layout.dock,
		pinned: widget.layout.pinned,
		focusOrder: widget.layout.focusOrder,
	}));
}

/** Convenience overload for callers that already hold full widget instances. */
export function computeSceneFocusOrder(
	widgets: readonly WidgetInstance[],
): SceneFocusEntry[] {
	return computeWidgetFocusOrder(widgets);
}
