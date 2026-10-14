import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../../ds';
import {
	boardWidgetPresentation,
	flowColumnsFor,
	flowOrder,
	flowPlacementsForOrder,
	flowReorderMoves,
	flowSpanOf,
	flowSpanWidth,
	isWidgetResizable,
	type BoardWidget,
} from '../board-helpers';
import { srOnly, T } from '../screen-kit';

import type { FlowBoardProps, FlowDrag } from '../SceneBoardModel';
import { HistoryBtn, redoLabel, undoLabel } from './frameParts';
import { flowPartGap, useBlankTiles } from './FlowPart';
import { canvasSurfaceProps, OperationLiveRegion, useOperationNotice } from './surfaceA11y';
import { AUTHORING_COLUMNS } from './FlowTileMenu';
import { FlowTile, FlowViewTile } from './FlowTile';
import { useI18n } from '../../i18n';
export { FlowViewTile } from './FlowTile';

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
 *
 * RC-CAN-7.6 — a tile in BARE presentation (RC-WID-5.3) is page content in view mode: no frame, no
 * header, no tile focus stop of its own (its controls are the stops), and a body that draws nothing
 * leaves the layout. `FlowViewTile` is that view-mode tile, and the Command Center (`/`) renders the
 * home screen's parts through it and through the same placement, so a part looks the same on `/`,
 * at `/screen/:id`, and copied onto any other flow screen.
 */

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
	const { t } = useI18n();
	const columns = flowColumnsFor(tier, widgets, editing);
	const frameRefs = useRef(new Map<string, HTMLDivElement>());
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [drag, setDrag] = useState<FlowDrag | null>(null);
	const dragRef = useRef<FlowDrag | null>(null);
	dragRef.current = drag;
	/** The tile a touch press is on, selected when the press ends without reaching another tile. */
	const tapRef = useRef<string | null>(null);
	const [notice, announce] = useOperationNotice();
	const [blank, reportBlank] = useBlankTiles();

	// Bare presentation is a VIEW-mode reading: editing frames every tile, so each can be grabbed.
	const isBare = useCallback(
		(w: BoardWidget) => !editing && boardWidgetPresentation(w) === 'bare',
		[editing],
	);
	const ordered = useMemo(() => flowOrder(widgets), [widgets]);
	// A bare part that draws nothing leaves the layout (it stays mounted, see `FlowPart`).
	const placements = useMemo(
		() =>
			flowPlacementsForOrder(
				ordered.filter((w) => !(blank.has(w.id) && isBare(w))),
				columns,
			),
		[ordered, blank, isBare, columns],
	);
	const placementOf = useMemo(() => new Map(placements.map((p) => [p.id, p])), [placements]);
	// Reading order IS render order here: the tiles are emitted in `flowOrder`, the order the
	// placements follow. Nothing re-sorts them for paint.
	const byId = useMemo(() => new Map(widgets.map((w) => [w.id, w])), [widgets]);
	const orderIds = useMemo(() => placements.map((p) => p.id), [placements]);
	// The tiles the keyboard walks: every tile while editing; in view mode the framed ones, since a
	// bare part is page content whose own controls are the tab stops.
	const walkIds = useMemo(
		() => orderIds.filter((id) => !isBare(byId.get(id)!)),
		[orderIds, byId, isBare],
	);
	const allBare = placements.length > 0 && walkIds.length === 0;

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
			announce(
				t('boardCanvas.flow.position', {
					title: byId.get(id)?.title ?? '',
					index: landed + 1,
					count: widgets.length,
				}),
			);
		},
		[announce, byId, onMove, widgets, t],
	);

	const setSpan = useCallback(
		(w: BoardWidget, span: number) => {
			const next = Math.min(AUTHORING_COLUMNS, Math.max(1, Math.round(span)));
			const width = flowSpanWidth(next);
			if (width === w.w) return;
			void onResize(w.id, width, w.h);
			// The announcement names the AUTHORING grid, because that is what the span was written
			// against — at rail and phone the tier clamps the tile narrower than the number says.
			announce(
				t('boardCanvas.flow.span', { title: w.title, span: next, columns: AUTHORING_COLUMNS }),
			);
		},
		[announce, onResize, t],
	);

	// Roving tabindex: the selection, else the last-focused tile, else the first in reading order.
	const tabbableId =
		(selectedId && walkIds.includes(selectedId) ? selectedId : null) ??
		(focusedId && walkIds.includes(focusedId) ? focusedId : null) ??
		walkIds[0] ??
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
		const next = walkIds[walkIds.indexOf(w.id) + (forward ? 1 : -1)];
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
					aria-label={t('boardCanvas.history.toolbar')}
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
						{t('boardCanvas.flow.hint')}
					</span>
					<HistoryBtn
						icon="undo"
						label={undoLabel(t, history)}
						disabled={!history.canUndo}
						onClick={() => void history.undo()}
					/>
					<HistoryBtn
						icon="redo"
						label={redoLabel(t, history)}
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
						gap: allBare ? flowPartGap(columns) : T.space.three,
						alignItems: 'stretch',
					} as CSSProperties
				}
			>
				{ordered.map((w) => {
					const placement = placementOf.get(w.id) ?? null;
					if (isBare(w))
						return (
							<FlowViewTile
								key={w.id}
								w={w}
								placement={placement}
								count={placements.length}
								columns={columns}
								onCommand={
									onWidgetCommand
										? (commandType, payload) => onWidgetCommand(w.id, commandType, payload)
										: undefined
								}
								onBlank={(isBlank) => reportBlank(w.id, isBlank)}
							/>
						);
					if (!placement) return null;
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
						{emptyTitle ?? t('boardCanvas.flow.emptyTitle')}
					</div>
					<div style={{ font: `var(--text-sm) ${T.sans}`, color: T.ter, maxWidth: 320 }}>
						{emptyHint ?? t('boardCanvas.flow.emptyHint')}
					</div>
				</div>
			)}
		</div>
	);
}
