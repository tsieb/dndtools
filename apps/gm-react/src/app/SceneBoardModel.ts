import type { BoardWidget, FlowTier } from './board-helpers';
import type { LayoutHistory } from './canvas/useLayoutHistory';
import type { MessageKey } from '../i18n';

/**
 * The scene board canvas's constants, geometry helpers, prop contract and gesture types.
 *
 * A pure move out of `SceneBoardCanvas.tsx` (RC-ENG-2.2 — that file had grown past the RC-STB-2.7
 * file-size limit). Nothing here renders; it is the model half of the canvas, unchanged apart from
 * being exported.
 */

export const GRID = 20;
export const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
export const snapTo = (n: number, snap: boolean) =>
	snap ? Math.round(n / GRID) * GRID : Math.round(n);
/** Drop one widget's in-flight drag draft, so it falls back to its durable position/size. */
export function omitKey<T>(map: Record<string, T>, id: string): Record<string, T> {
	if (!(id in map)) return map;
	const next = { ...map };
	delete next[id];
	return next;
}

/** RC-CAN-3.1 — the three named zoom steps both policies share, coarse to fine. */
export type ZoomPreset = 'fit' | 'comfortable' | 'detail';
export const ZOOM_PRESETS = ['fit', 'comfortable', 'detail'] as const;
/** Fit is computed from the pane; the other two are fixed, so a board reads the same on every
 *  window. Comfortable is 1:1 with the authored layout, Detail is the "lean in and read it" step. */
export const FIXED_PRESET_SCALE: Record<Exclude<ZoomPreset, 'fit'>, number> = {
	comfortable: 1,
	detail: 1.5,
};
/** Fit never goes below this. Below ~0.5 the widget titles paint under 7px on a handset, so the
 *  surface scrolls rather than scaling every widget out of legibility. */
export const FIT_FLOOR = 0.5;
/** `0`/`1`/`2` jump straight to a step, coarse to fine. */
export const ZOOM_KEY: Record<string, ZoomPreset | undefined> = {
	'0': 'fit',
	'1': 'comfortable',
	'2': 'detail',
};
/** Both hosts label the presets from the same catalog keys. */
export const ZOOM_PRESET_KEY: Record<ZoomPreset, MessageKey> = {
	fit: 'boardCanvas.zoomFit',
	comfortable: 'boardCanvas.zoomComfortable',
	detail: 'boardCanvas.zoomDetail',
};

export interface SceneBoardCanvasProps {
	widgets: BoardWidget[];
	policy: 'bounded' | 'canvas';
	editing: boolean;
	snap: boolean;
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	onMove: (id: string, x: number, y: number) => void | Promise<unknown>;
	onResize: (id: string, w: number, h: number) => void | Promise<unknown>;
	/** System widgets are move-only (never resizable), mirroring the prototype. */
	canResize?: (widget: BoardWidget) => boolean;
	/** Keyboard traversal order (widget instance ids) — pass `SceneSummary.focusOrder` ids. Widgets
	 *  missing from it are appended in render order so nothing becomes unreachable. */
	focusOrder?: string[];
	/** Remove the focused widget (Delete key, edit mode). Omit to disable keyboard removal. */
	onRemove?: (id: string) => void;
	/** VIEW-mode widget operation: dispatch a widget-declared durable command
	 *  (`widget.dispatch-command`). Bodies render inert chips when omitted. */
	onWidgetCommand?: (
		widgetInstanceId: string,
		commandType: string,
		payload: Record<string, unknown>,
	) => void;
	emptyHint?: string;
	/** Overrides the empty-state headline — the caller uses it to say "loading" instead of "empty". */
	emptyTitle?: string;
	/** RC-CAN-3.1: the active zoom preset. Supplying it makes the preset CONTROLLED — the host owns
	 *  the state and renders the control itself (the bounded board puts it in its toolbar, where it
	 *  cannot scroll away with the canvas), and this canvas renders no zoom cluster of its own. */
	zoomPreset?: ZoomPreset;
	/** Called for every preset change the canvas originates (the `0`/`1`/`2` and `+`/`-` keys). */
	onZoomPresetChange?: (preset: ZoomPreset) => void;
	/** RC-CAN-1.3: the screen's local layout undo stack. Supplying it renders the Undo/Redo cluster,
	 *  binds `Ctrl+Z` / `Ctrl+Shift+Z` inside this canvas and announces each reversal. */
	history?: LayoutHistory;
}

/** Arrow-key vector: [dx, dy] in grid steps. */
export const ARROW_DELTA: Record<string, readonly [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};

export type Drag =
	| { mode: 'move'; id: string; sx: number; sy: number; ox: number; oy: number }
	| { mode: 'resize'; id: string; sx: number; sy: number; ow: number; oh: number }
	| { mode: 'pan'; sx: number; sy: number; tx: number; ty: number }
	// RC-CAN-3.2 — middle-button drag on the BOUNDED board. It has no transform view to move (the
	// board is a real `overflow:auto` element), so the gesture scrolls the wrap directly instead of
	// updating `view`.
	| { mode: 'scroll-pan'; sx: number; sy: number; sl: number; st: number };

export interface View {
	tx: number;
	ty: number;
	scale: number;
}

/* ------------------------------------------------------------------------------------------------
 * RC-CAN-7.7 / ADR-041 — the FLOW policy's prop contract and gesture type, beside the canvas's.
 * --------------------------------------------------------------------------------------------- */

export interface FlowBoardProps {
	widgets: BoardWidget[];
	/** The viewport tier the column count comes from (`app/useViewport.ts`). */
	tier: FlowTier;
	editing: boolean;
	selectedId: string | null;
	onSelect: (id: string | null) => void;
	/**
	 * `scene.move-widget` — the SAME command behind a drag, an arrow key and the tile menu. Flow
	 * computes the coordinate; the three input paths only differ in how they pick a target index.
	 */
	onMove: (id: string, x: number, y: number) => void | Promise<unknown>;
	/** `scene.resize-widget`. In flow a resize picks a column SPAN, so only `w` ever changes: a
	 *  flow tile's height follows its content. */
	onResize: (id: string, w: number, h: number) => void | Promise<unknown>;
	/** System widgets are move-only, exactly as on the canvas. */
	canResize?: (widget: BoardWidget) => boolean;
	/** Remove the focused tile (Delete key / the tile menu, edit mode). Omit to disable removal. */
	onRemove?: (id: string) => void;
	/** VIEW-mode widget operation (`widget.dispatch-command`), as on the canvas. */
	onWidgetCommand?: (
		widgetInstanceId: string,
		commandType: string,
		payload: Record<string, unknown>,
	) => void;
	emptyTitle?: string;
	emptyHint?: string;
	/** The screen's local layout undo stack (ADR-029). A flow reorder is one move command, so one
	 *  Ctrl+Z reverses the whole gesture. */
	history?: LayoutHistory;
	/**
	 * DELIBERATELY ABSENT: `focusOrder`. ADR-041 makes flow's visual, DOM and focus order ONE order —
	 * the layout order — so a per-widget traversal override would contradict the policy's only
	 * invariant. The canvas policy keeps `SceneBoardCanvasProps.focusOrder`.
	 */
}

/** Flow's one gesture: drag a tile onto another tile to take its place in the reading order. */
export interface FlowDrag {
	id: string;
	/** Reading-order index the pointer is currently over, or `null` while it is off every tile. */
	overIndex: number | null;
}
