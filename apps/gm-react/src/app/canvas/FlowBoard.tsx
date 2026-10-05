import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon, VisibilityChip } from '../../ds';
import {
	FLOW_COLUMNS,
	flowPlacements,
	flowReorderMoves,
	flowSpanOf,
	flowSpanWidth,
	isWidgetResizable,
	type BoardWidget,
	type FlowPlacement,
} from '../board-helpers';
import { srOnly, T } from '../screen-kit';
import { NoteFrameContext } from '../widgets/builtin/NoteBody';
import { tileMetadataForWidget } from '../widgets/tileMeta';
import { WidgetRenderSlot } from '../widgets/WidgetRenderSlot';
import type { FlowBoardProps, FlowDrag } from '../SceneBoardModel';
import {
	HistoryBtn,
	LIFT_TRANSITION,
	liftStyle,
	TileGrip,
	useHoverLift,
	WidgetGlyph,
} from './WidgetFrame';
import { canvasSurfaceProps, OperationLiveRegion, useOperationNotice } from './surfaceA11y';
import { AUTHORING_COLUMNS, FlowTileMenu, useLongPress, type MenuHandle } from './TileActionMenu';

/**
 * FlowBoard — ADR-041's FLOW layout policy, the responsive counterpart to `SceneBoardCanvas`.
 *
 * A flow screen lays its tiles in a column grid whose column count comes from the viewport tier.
 * Heights follow content; there is no zoom, because there is nothing fixed to scale. The one
 * invariant the policy rests on is that the layout order, the DOM order and the keyboard traversal
 * order are the SAME order — so this renders the tiles in reading order with explicit grid
 * coordinates, and never with `grid-auto-flow: dense`, masonry, or a CSS `order` property.
 *
 * Moving a tile by drag, by arrow key or from its menu all land in one place — `reorder` — which
 * dispatches `scene.move-widget` exactly as the canvas does. Resizing picks a column span, which is
 * a `scene.resize-widget` that changes only `w`.
 *
 * The tile chrome here is flow's own rather than `WidgetFrame`'s: a canvas frame is absolutely
 * positioned at a coordinate with a fixed width and height, which is the opposite of what a flow
 * tile is. Everything UNDER the frame — the type metadata, the visibility chip and the render slot —
 * is the same code both policies use, so a widget looks and behaves the same on either.
 */

/** Tile copy, English-only for now — the same convention `WidgetFrame` and `TileActionMenu` use in
 *  this directory, so flow does not half-migrate a catalog its siblings have not moved to. */
const TEXT = {
	toolbar: 'Layout history',
	hint: 'Drag a tile by its grip to reorder it, or select it and use the arrow keys.',
	at: (index: number, of: number) => `position ${index} of ${of}`,
	position: (title: string, index: number, of: number) => `${title}, position ${index} of ${of}`,
	spanNotice: (title: string, span: number, of: number) =>
		`${title}, ${span} of ${of} columns wide`,
	emptyTitle: 'An empty screen',
	emptyHint: 'Press Edit layout, then Add to place a widget.',
};

/** Half the grid gap plus half the indicator: centred in the gap beside the target tile. */
const OUTSIDE = `calc(-1 * ${T.space.two})`;

interface FlowTileProps {
	w: BoardWidget;
	placement: FlowPlacement;
	count: number;
	editing: boolean;
	selected: boolean;
	resizable: boolean;
	tabbable: boolean;
	dragging: boolean;
	/** RC-CAN-8.3: where a dragged tile would land relative to this one, while it is the target. */
	dropSide: 'before' | 'after' | null;
	/** The column count, so a full-row target shows its drop indicator above or below it. */
	columns: number;
	registerRef: (el: HTMLDivElement | null) => void;
	onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
	onFocusIn: () => void;
	onStartDrag: (e: React.PointerEvent) => void;
	onSelect: () => void;
	onMoveTo: (toIndex: number) => void;
	onSpan: (span: number) => void;
	onRemove?: () => void;
	onCommand?: (commandType: string, payload: Record<string, unknown>) => void;
}

function FlowTile({
	w,
	placement,
	count,
	editing,
	selected,
	resizable,
	tabbable,
	dragging,
	dropSide,
	columns,
	registerRef,
	onKeyDown,
	onFocusIn,
	onStartDrag,
	onSelect,
	onMoveTo,
	onSpan,
	onRemove,
	onCommand,
}: FlowTileProps) {
	const meta = tileMetadataForWidget(w);
	const placeholder = w.status !== 'available';
	const accent = `var(${meta.accentToken})`;
	const menuRef = useRef<MenuHandle | null>(null);
	const press = useLongPress((at) => menuRef.current?.open(at));
	const hover = useHoverLift(editing);
	// Selection, drop target and idle are three different rings, so a keyboard user and a pointer
	// user are told the same thing by the same affordance.
	const ring = dropSide
		? `2px dashed ${T.acc}`
		: selected
			? `2px solid ${T.acc}`
			: /* idle */ undefined;
	return (
		<div
			data-testid={`widget-${w.id}`}
			data-flow-index={placement.index}
			ref={registerRef}
			role="group"
			// Position is announced in EDIT mode only: in view mode a flow screen is just a page of
			// tiles, and "3 of 9" is layout telemetry nobody reading it asked for.
			aria-label={
				editing
					? `${w.title}, ${w.typeLabel} widget, ${TEXT.at(placement.index + 1, count)}`
					: `${w.title}, ${w.typeLabel} widget`
			}
			tabIndex={tabbable ? 0 : -1}
			onKeyDown={onKeyDown}
			onFocus={onFocusIn}
			{...hover.handlers}
			// RC-CAN-8.3: a right-click opens the tile menu at the pointer, as a long-press does. A press
			// inside the portalled menu bubbles here through React, so only this tile's own DOM counts.
			onContextMenu={(e) => {
				if (!editing || !e.currentTarget.contains(e.target as Node)) return;
				e.preventDefault();
				menuRef.current?.open({ x: e.clientX, y: e.clientY });
			}}
			className={meta.silhouetteClass}
			style={{
				gridColumn: `${placement.column + 1} / span ${placement.span}`,
				gridRow: String(placement.row + 1),
				position: 'relative',
				display: 'flex',
				flexDirection: 'column',
				gap: T.space.two,
				padding: T.space.three,
				borderRadius: T.radius.md,
				background: placeholder ? T.sunken : T.raised,
				border: `1px solid ${placeholder ? T.bdS : T.bd}`,
				// Heights follow CONTENT: no height, no maxHeight, and no `overflow:hidden` anywhere on
				// the path to the body — which is what keeps a tile from clipping at a narrow tier.
				minWidth: 0,
				minHeight: w.minSize?.height ?? 0,
				opacity: dragging ? 0.6 : placeholder ? 0.85 : 1,
				...(ring ? { outline: ring } : {}),
				outlineOffset: 2,
				...liftStyle(dragging ? 'drag' : hover.lifted ? 'hover' : 'rest', !!ring),
				transition: editing ? LIFT_TRANSITION : undefined,
			}}
		>
			{/* A BORDER, not a background: forced-colors repaints backgrounds as Canvas but keeps a
			    border and remaps it to CanvasText. Same reasoning as WidgetFrame's rail. */}
			<span
				aria-hidden
				data-testid="tile-accent-rail"
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					bottom: 0,
					width: 0,
					borderLeft: `4px solid ${accent}`,
				}}
			/>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: T.space.two,
					flex: '0 0 auto',
					minWidth: 0,
					// Room for the edit-mode grip and menu trigger.
					...(editing
						? { paddingInlineStart: T.space.three, paddingInlineEnd: T.space.eight }
						: {}),
				}}
			>
				<WidgetGlyph icon={meta.icon} size={16} color={accent} />
				<span
					style={{
						flex: 1,
						minWidth: 0,
						// Sans, not the display face: Cinzel starts at --text-xl (RC-ENG-8.4 emphasis lint).
						font: `700 var(--text-sm) ${T.sans}`,
						color: T.ink,
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}
				>
					{w.title}
				</span>
				<VisibilityChip level={w.visibility} byException data-testid="visibility-badge" />
			</div>
			<span
				title={meta.description}
				style={{
					font: `var(--text-2xs) ${T.sans}`,
					letterSpacing: 'var(--tracking-wide)',
					textTransform: 'uppercase',
					color: T.ter,
					flex: '0 0 auto',
				}}
			>
				{w.typeLabel}
			</span>
			<div style={{ flex: 1, minWidth: 0, pointerEvents: editing ? 'none' : 'auto' }}>
				<NoteFrameContext.Provider value={true}>
					<WidgetRenderSlot widget={w} onCommand={editing ? undefined : onCommand} />
				</NoteFrameContext.Provider>
			</div>
			{w.statusNote && (
				<div
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: T.space.one,
						font: `600 var(--text-2xs) ${T.sans}`,
						color: 'var(--color-status-warning-text)',
						flex: '0 0 auto',
					}}
				>
					<Icon name="warning" size={12} />
					{w.statusNote}
				</div>
			)}

			{/* The drag surface. It sits UNDER the menu in DOM order so the menu still takes presses. */}
			{editing && (
				<div
					data-testid={`flow-drag-${w.id}`}
					{...press}
					onPointerDown={(e) => {
						// A right press belongs to the context menu: selecting would open the scene
						// editor's Inspector, which takes focus and closes the menu it just opened.
						if (e.button === 2) return;
						press.onPointerDown(e);
						// A finger selects on release instead (see `finish`).
						if (e.pointerType !== 'touch') onSelect();
						onStartDrag(e);
					}}
					style={{
						position: 'absolute',
						inset: 0,
						borderRadius: T.radius.md,
						cursor: 'grab',
						// A finger has to be able to scroll the screen it is reading; a drag is a
						// deliberate press-and-move, which `pan-y` still delivers as a pointermove. The grip
						// is `none`, so a finger on it drags in any direction — a phone's one column too.
						touchAction: 'pan-y',
						WebkitTouchCallout: 'none',
					}}
				>
					<TileGrip />
				</div>
			)}
			{dropSide && (
				<span
					aria-hidden
					data-testid="flow-drop-indicator"
					data-side={dropSide}
					style={{
						position: 'absolute',
						pointerEvents: 'none',
						background: T.acc,
						borderRadius: T.radius.full,
						// In the middle of the grid gap: a full-row tile is crossed above or below, a tile
						// sharing its row is marked at its leading or trailing edge.
						...(placement.span >= columns
							? {
									left: 0,
									right: 0,
									height: 4,
									[dropSide === 'before' ? 'top' : 'bottom']: OUTSIDE,
								}
							: {
									top: 0,
									bottom: 0,
									width: 4,
									[dropSide === 'before' ? 'left' : 'right']: OUTSIDE,
								}),
					}}
				/>
			)}
			{editing && (
				<FlowTileMenu
					handle={menuRef}
					w={w}
					index={placement.index}
					count={count}
					resizable={resizable}
					onMoveTo={onMoveTo}
					onSpan={onSpan}
					onRemove={onRemove}
				/>
			)}
		</div>
	);
}

export function FlowBoard({
	widgets,
	tier,
	editing,
	selectedId,
	onSelect,
	onMove,
	onResize,
	canResize,
	onRemove,
	onWidgetCommand,
	emptyTitle,
	emptyHint,
	history,
}: FlowBoardProps) {
	const columns = FLOW_COLUMNS[tier];
	const frameRefs = useRef(new Map<string, HTMLDivElement>());
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [drag, setDrag] = useState<FlowDrag | null>(null);
	const dragRef = useRef<FlowDrag | null>(null);
	dragRef.current = drag;
	/** The tile a touch press is on, selected when the press ends without reaching another tile. */
	const tapRef = useRef<string | null>(null);
	const [notice, announce] = useOperationNotice();

	const placements = useMemo(() => flowPlacements(widgets, columns), [widgets, columns]);
	// Reading order IS render order here: the tiles are emitted in `placements` order, which is the
	// order `flowOrder` produced. Nothing re-sorts them for paint.
	const byId = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);
	const orderIds = useMemo(() => placements.map((p) => p.id), [placements]);

	/**
	 * The ONE place a flow tile moves. Drag, the arrow keys and the tile menu differ only in how
	 * they choose `toIndex`; all three arrive here and dispatch `scene.move-widget`.
	 */
	const reorder = useCallback(
		(id: string, toIndex: number) => {
			const moves = flowReorderMoves(widgets, id, toIndex);
			if (moves.length === 0) return;
			// Normally exactly one move. The renumber fallback is the rare exception, and its commands
			// are chained rather than fired in parallel: the screen's undo stack reads the state each
			// command was dispatched against, so overlapping dispatches would record inverses against a
			// tree that had already moved on.
			void moves.reduce<Promise<unknown>>(
				(chain, move) => chain.then(() => onMove(move.id, move.x, move.y)),
				Promise.resolve(),
			);
			const landed = Math.min(Math.max(0, Math.round(toIndex)), Math.max(0, widgets.length - 1));
			announce(TEXT.position(byId.get(id)?.title ?? '', landed + 1, widgets.length));
		},
		[announce, byId, onMove, widgets],
	);

	const setSpan = useCallback(
		(w: BoardWidget, span: number) => {
			const next = Math.min(AUTHORING_COLUMNS, Math.max(1, Math.round(span)));
			const width = flowSpanWidth(next);
			if (width === w.w) return;
			void onResize(w.id, width, w.h);
			// The announcement names the AUTHORING grid, because that is what the span was written
			// against — at rail and phone the tier clamps the tile narrower than the number says.
			announce(TEXT.spanNotice(w.title, next, AUTHORING_COLUMNS));
		},
		[announce, onResize],
	);

	// Roving tabindex: the selection, else the last-focused tile, else the first in reading order.
	const tabbableId =
		(selectedId && orderIds.includes(selectedId) ? selectedId : null) ??
		(focusedId && orderIds.includes(focusedId) ? focusedId : null) ??
		orderIds[0] ??
		null;

	const tileKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, w: BoardWidget, index: number) => {
		// Keys on the tile's own controls (a Roll button, the menu trigger) belong to those controls.
		if (e.target !== e.currentTarget) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onSelect(w.id);
			return;
		}
		if (e.key === 'Escape') {
			onSelect(null);
			return;
		}
		if ((e.key === 'Delete' || e.key === 'Backspace') && editing && onRemove) {
			e.preventDefault();
			onRemove(w.id);
			return;
		}
		const selected = editing && selectedId === w.id;
		if (selected && (e.key === 'Home' || e.key === 'End')) {
			e.preventDefault();
			reorder(w.id, e.key === 'Home' ? 0 : widgets.length - 1);
			return;
		}
		const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp';
		const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
		if (!back && !forward) return;
		e.preventDefault();
		if (selected) {
			if (e.shiftKey) {
				// Shift+Arrow picks the column span, one column at a time — flow's resize.
				if (!(canResize ? canResize(w) : isWidgetResizable(w))) return;
				setSpan(w, flowSpanOf(w, AUTHORING_COLUMNS) + (forward ? 1 : -1));
			} else {
				reorder(w.id, index + (forward ? 1 : -1));
			}
			return;
		}
		// Unselected (either mode): the arrows walk the reading order, in both axes, because in flow
		// there is only ONE order to walk.
		const next = orderIds[index + (forward ? 1 : -1)];
		if (next) frameRefs.current.get(next)?.focus();
	};

	const startDrag = (e: React.PointerEvent, id: string) => {
		if (!editing || e.button !== 0) return;
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			/* a pointer that has already ended cannot be captured — the window listeners still cover us */
		}
		document.body.style.userSelect = 'none';
		tapRef.current = e.pointerType === 'touch' ? id : null;
		setDrag({ id, overIndex: null });
	};

	const dragging = drag !== null;
	/** The drop indicator's side: `reorder` puts the tile AT the target's index, so a tile dragged
	 *  forward lands after its target and one dragged back lands before it. */
	const dropSideOf = (index: number) => {
		const from = drag ? orderIds.indexOf(drag.id) : -1;
		if (!drag || drag.overIndex !== index || from === index) return null;
		return from < index ? ('after' as const) : ('before' as const);
	};
	useEffect(() => {
		if (!dragging) return;
		const move = (e: PointerEvent) => {
			const under = document.elementFromPoint(e.clientX, e.clientY);
			const host = under instanceof Element ? under.closest('[data-flow-index]') : null;
			const raw = host?.getAttribute('data-flow-index');
			const overIndex = raw === null || raw === undefined ? null : Number(raw);
			setDrag((current) =>
				!current || current.overIndex === overIndex ? current : { ...current, overIndex },
			);
		};
		const finish = (commit: boolean) => {
			const current = dragRef.current;
			const tap = tapRef.current;
			tapRef.current = null;
			setDrag(null);
			document.body.style.userSelect = '';
			if (!commit || !current) return;
			const over = current.overIndex;
			// RC-CAN-8.3 — a touch press selects on release, and only when it never reached another
			// tile: on a phone, selecting on the press opened the scene editor's Inspector over the
			// board and hid every tile the finger could drop on.
			if (over === null || !Number.isFinite(over) || orderIds[over] === current.id) {
				if (tap) onSelect(tap);
				return;
			}
			reorder(current.id, over);
		};
		const up = () => finish(true);
		// A gesture the browser takes over (a touch that became a scroll) must abandon the reorder
		// rather than commit wherever the finger happened to be — the same contract the canvas keeps.
		const cancel = () => finish(false);
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', cancel);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', cancel);
		};
	}, [dragging, reorder, orderIds, onSelect]);

	/** `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`, scoped to this screen exactly as on the canvas. */
	const boardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (!history) return;
		const target = e.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
		if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
		const key = e.key.toLowerCase();
		if (key === 'z' && !e.shiftKey) {
			e.preventDefault();
			void history.undo();
		} else if ((key === 'z' && e.shiftKey) || key === 'y') {
			e.preventDefault();
			void history.redo();
		}
	};

	return (
		<div
			data-testid="scene-board-flow"
			{...canvasSurfaceProps('flow', editing, placements.length)}
			data-flow-columns={columns}
			tabIndex={history ? -1 : undefined}
			onKeyDown={boardKeyDown}
			onPointerDown={(e) => {
				// A press on the screen's own background — not on a tile — clears the selection.
				if (!(e.target as Element).closest('[data-flow-index]')) onSelect(null);
			}}
			style={{
				position: 'relative',
				flex: 1,
				minHeight: 0,
				overflowY: 'auto',
				overflowX: 'hidden',
				background: T.bg,
				borderRadius: T.radius.lg,
				border: `1px solid ${T.bd}`,
				padding: T.space.three,
				// A flow screen is a page of tiles; a finger scrolls it.
				touchAction: 'pan-y',
			}}
		>
			{/* RC-CAN-8.3 — Undo/Redo docked in a toolbar row above the tiles, not floating over them:
			    the old cluster stuck to the bottom of the scroll region and sat on the last tile on a
			    phone. Sticky, so it stays reachable while a long screen scrolls under it. */}
			{history && editing && (
				<div
					role="toolbar"
					aria-label={TEXT.toolbar}
					data-testid="flow-history-controls"
					style={{
						position: 'sticky',
						top: `calc(-1 * ${T.space.three})`,
						zIndex: 1,
						display: 'flex',
						alignItems: 'center',
						gap: T.space.two,
						margin: `calc(-1 * ${T.space.three}) calc(-1 * ${T.space.three}) ${T.space.three}`,
						padding: `${T.space.one} ${T.space.three}`,
						background: T.bg,
						borderBottom: `1px solid ${T.bd}`,
					}}
				>
					<span style={{ flex: 1, minWidth: 0, font: `var(--text-xs) ${T.sans}`, color: T.sub }}>
						{TEXT.hint}
					</span>
					<HistoryBtn
						icon="undo"
						label={history.undoLabel ? `Undo ${history.undoLabel.toLowerCase()}` : 'Undo'}
						disabled={!history.canUndo}
						onClick={() => void history.undo()}
					/>
					<HistoryBtn
						icon="redo"
						label={history.redoLabel ? `Redo ${history.redoLabel.toLowerCase()}` : 'Redo'}
						disabled={!history.canRedo}
						onClick={() => void history.redo()}
					/>
				</div>
			)}
			<div
				data-testid="flow-grid"
				style={
					{
						display: 'grid',
						// One track per column. `minmax(0, 1fr)` rather than `1fr` so a tile whose content
						// has a wide intrinsic minimum (a table, a long unbroken name) shrinks with its
						// track instead of forcing the whole row wider than the pane.
						gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
						gridAutoRows: 'minmax(0, auto)',
						gap: T.space.three,
						alignItems: 'stretch',
					} as CSSProperties
				}
			>
				{placements.map((placement) => {
					const w = byId.get(placement.id);
					if (!w) return null;
					return (
						<FlowTile
							key={w.id}
							w={w}
							placement={placement}
							count={placements.length}
							editing={editing}
							selected={editing && selectedId === w.id}
							resizable={editing && (canResize ? canResize(w) : isWidgetResizable(w))}
							tabbable={tabbableId === w.id}
							dragging={drag?.id === w.id}
							dropSide={dropSideOf(placement.index)}
							columns={columns}
							registerRef={(el) => {
								if (el) frameRefs.current.set(w.id, el);
								else frameRefs.current.delete(w.id);
							}}
							onKeyDown={(e) => tileKeyDown(e, w, placement.index)}
							onFocusIn={() => setFocusedId(w.id)}
							onStartDrag={(e) => startDrag(e, w.id)}
							onSelect={() => onSelect(w.id)}
							onMoveTo={(toIndex) => reorder(w.id, toIndex)}
							onSpan={(span) => setSpan(w, span)}
							onRemove={onRemove ? () => onRemove(w.id) : undefined}
							onCommand={
								onWidgetCommand
									? (commandType, payload) => onWidgetCommand(w.id, commandType, payload)
									: undefined
							}
						/>
					);
				})}
			</div>

			{/* Permanent live regions, present before the first change, so a reorder is announced by
			    the CONTENT changing rather than by a region appearing with its text already in it. */}
			{history && (
				<div role="status" aria-live="polite" aria-atomic="true" style={srOnly}>
					{history.announcement && (
						<span key={history.announcement.seq}>{history.announcement.text}</span>
					)}
				</div>
			)}
			<OperationLiveRegion notice={notice} testId="flow-announcement" />

			{widgets.length === 0 && (
				<div
					style={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: T.space.three,
						textAlign: 'center',
						padding: T.space.six,
					}}
				>
					<Icon name="widget" size="xl" color={T.ter} />
					<div style={{ font: `700 var(--text-lg) ${T.sans}`, color: T.sub }}>
						{emptyTitle ?? TEXT.emptyTitle}
					</div>
					<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter, maxWidth: 320 }}>
						{emptyHint ?? TEXT.emptyHint}
					</div>
				</div>
			)}
		</div>
	);
}
