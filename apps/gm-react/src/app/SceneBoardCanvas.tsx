import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	fitWidgetSize,
	frameName,
	isWidgetResizable,
	nextSizePreset,
	type BoardWidget,
} from './board-helpers';
import { type CoreCommand } from '@dndtools/core';

import { WidgetFrame } from './canvas/WidgetFrame';
import { EmptyCanvas, HistoryCluster } from './canvas/frameParts';
import {
	arrangeCommand,
	arrangeShortcut,
	enclosedIds,
	extentOf,
	planPlacements,
	toggleSelection,
	withGroupMates,
	type ArrangeAction,
	type Box,
	type DragGuides,
	type Placement,
} from './canvas/geometry';
import { useRuntime } from '../runtime/RuntimeContext';
import {
	canvasKey,
	enterTileContent,
	frameKey,
	isTileContentKey,
	openGallery,
	spatialNeighbour,
	useDragOverlay,
	useNudges,
	useReadingOrder,
} from './canvas/keyboard';
import { matchesShortcut } from './shortcuts/registry';
import { ZoomCluster } from './canvas/ZoomCluster';
import { useCanvasZoom, usePaneWidth } from './canvas/useCanvasZoom';
import { useCanvasScene } from './canvas/useCanvasScene';
import { useWindowGestures } from './canvas/useWindowGestures';
import {
	CanvasAnnouncements,
	CanvasBackdrop,
	CanvasStage,
	canvasSurfaceStyle,
} from './canvas/CanvasLayers';
import * as A11y from './canvas/surfaceA11y';
import { ARROW_DELTA, GRID, type Drag, type SceneBoardCanvasProps } from './SceneBoardModel';
export { ZOOM_PRESETS, ZOOM_PRESET_KEY, type ZoomPreset } from './SceneBoardModel';
export { WidgetGlyph } from './canvas/frameParts';
import { useI18n } from '../i18n';

export function SceneBoardCanvas({
	widgets: authoredWidgets,
	policy,
	editing,
	snap,
	selectedId,
	onSelect,
	onMove,
	onResize,
	canResize,
	focusOrder,
	onRemove,
	onWidgetCommand,
	emptyHint,
	emptyTitle,
	history,
	zoomPreset,
	onZoomPresetChange,
}: SceneBoardCanvasProps) {
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<Drag | null>(null);
	const resizeMoved = useRef(false);
	const [notice, announce] = A11y.useOperationNotice();
	const { t } = useI18n();
	const op = useMemo(() => A11y.operationText(t), [t]);
	// The undo stack, read from inside the window pointer listeners without re-subscribing them.
	const historyRef = useRef(history);
	historyRef.current = history;
	const { posDraft, sizeDraft, overlay } = useDragOverlay(
		history?.announcement?.seq,
		() => dragRef.current !== null,
	);
	const resizeWidget = useCallback(
		(w: BoardWidget, width: number, height: number) => {
			const next = fitWidgetSize(w, width, height, policy === 'bounded');
			announce(op.resized(w.title, next.w, next.h));
			return Promise.resolve(onResize(w.id, next.w, next.h));
		},
		[onResize, policy, announce, op],
	);
	const cycleSize = useCallback(
		(w: BoardWidget) => {
			const next = nextSizePreset(w, overlay.sizeRef.current[w.id] ?? w, policy === 'bounded');
			return resizeWidget(w, next.w, next.h);
		},
		[resizeWidget, policy, overlay],
	);
	const frameRefs = useRef(new Map<string, HTMLDivElement>());
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const runtime = useRuntime();
	const [multi, setMulti] = useState<string[]>([]);
	const [marquee, setMarquee] = useState<Box | null>(null);
	// RC-CAN-8.3 — the snap guides and gaps of the tile under a move drag (`id`), while it moves.
	const [guides, setGuides] = useState<(DragGuides & { id: string }) | null>(null);
	const marqueeRef = useRef<{ x: number; y: number; base: string[] } | null>(null);
	const groupDrag = useRef<Record<string, { x: number; y: number }>>({});
	const selection = multi.length ? multi : selectedId ? [selectedId] : [];
	const { scene, sections, background, surfaceTheme, widgets, groupOf } = useCanvasScene(
		authoredWidgets,
		policy,
	);
	const select = (ids: string[]) => {
		setMulti(ids.length > 1 ? ids : []);
		onSelect(ids[ids.length - 1] ?? null);
	};
	useEffect(() => {
		if (!editing || !selectedId || !multi.includes(selectedId))
			setMulti((m) => (m.length ? [] : m));
	}, [editing, selectedId, multi]);
	const { pending, nudge } = useNudges();
	const rects = useMemo(
		() =>
			widgets.map((w) => ({
				id: w.id,
				...(posDraft[w.id] ?? { x: w.x, y: w.y }),
				...(sizeDraft[w.id] ?? { w: w.w, h: w.h }),
			})),
		[widgets, posDraft, sizeDraft],
	);
	const rectOf = (id: string) => rects.filter((r) => r.id === id);
	/** One `scene.move-widget` per tile, in sequence. */
	const moveAll = useCallback(
		// Every tile's move is issued at once, so each joins the burst open at the gesture (the undo
		// stack and the runtime both keep them in order) — not whichever one is open by its turn.
		async (list: Placement[]) => {
			await Promise.all(list.map((p) => onMove(p.id, p.x, p.y)));
		},
		[onMove],
	);

	const wrapWidth = usePaneWidth(wrapRef);

	const contentExtent = extentOf([...authoredWidgets, ...rects, ...sections.map((s) => s.bounds)]);
	const {
		view,
		setView,
		scale,
		tx,
		ty,
		overflowsHorizontally,
		applyPreset,
		cyclePreset,
		activePreset,
		zoomNotice,
		onWheel,
		zoom,
	} = useCanvasZoom({
		policy,
		wrapRef,
		wrapWidth,
		contentWidth: contentExtent.width,
		zoomPreset,
		onZoomPresetChange,
	});

	const capture = (e: React.PointerEvent) => {
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			/* a pointer that has already ended cannot be captured — the listeners still cover us */
		}
	};

	/** Start a pointer gesture: capture it, record it (`null` for a marquee) and stop text selection. */
	const begin = (e: React.PointerEvent, drag: Drag | null) => {
		capture(e);
		dragRef.current = drag;
		document.body.style.userSelect = 'none';
	};

	const startMove = (e: React.PointerEvent, w: BoardWidget) => {
		e.stopPropagation();
		if (!editing) return onSelect(w.id);
		const tile = withGroupMates([w.id], groupOf);
		if (e.shiftKey || e.ctrlKey || e.metaKey) return select(toggleSelection(selection, tile));
		const moving = selection.includes(w.id) ? selection : tile;
		if (!selection.includes(w.id)) select(tile);
		groupDrag.current = Object.fromEntries(
			moving.flatMap(rectOf).flatMap((r) => (r.id === w.id ? [] : [[r.id, { x: r.x, y: r.y }]])),
		);
		history?.settle();
		const cur = posDraft[w.id] ?? { x: w.x, y: w.y };
		begin(e, { mode: 'move', id: w.id, sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y });
	};
	const startResize = (e: React.PointerEvent, w: BoardWidget) => {
		if (e.button !== 0) return;
		resizeMoved.current = false;
		e.stopPropagation();
		history?.settle();
		const cur = sizeDraft[w.id] ?? { w: w.w, h: w.h };
		begin(e, { mode: 'resize', id: w.id, sx: e.clientX, sy: e.clientY, ow: cur.w, oh: cur.h });
	};
	const onBgDown = (e: React.PointerEvent) => {
		if (e.button === 1) {
			e.preventDefault();
			const el = wrapRef.current;
			const [sl, st] = [el?.scrollLeft ?? 0, el?.scrollTop ?? 0];
			const at = { sx: e.clientX, sy: e.clientY };
			return begin(
				e,
				policy === 'bounded'
					? { mode: 'scroll-pan', ...at, sl, st }
					: { mode: 'pan', ...at, tx: view.tx, ty: view.ty },
			);
		}
		onSelect(null);
		const onTile = (e.target as HTMLElement).closest('[data-testid^="widget-"]');
		if (editing && e.button === 0 && !onTile && (policy === 'bounded' || e.shiftKey)) {
			marqueeRef.current = { ...boardPoint.current(e), base: e.shiftKey ? selection : [] };
			return begin(e, null);
		}
		if (policy !== 'canvas') return;
		if (e.target !== e.currentTarget) return;
		begin(e, { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty });
	};

	const boardPoint = useRef((_e: { clientX: number; clientY: number }) => ({ x: 0, y: 0 }));
	boardPoint.current = (e) => {
		const el = wrapRef.current!;
		const r = el.getBoundingClientRect();
		return {
			x: (e.clientX - r.left - el.clientLeft + el.scrollLeft - tx) / scale,
			y: (e.clientY - r.top - el.clientTop + el.scrollTop - ty) / scale,
		};
	};
	const marqueeEnd = useRef((_box: Box, _base: string[]) => {});
	marqueeEnd.current = (box, base) =>
		select([...new Set([...base, ...withGroupMates(enclosedIds(rects, box), groupOf)])]);
	useWindowGestures({
		dragRef,
		marqueeRef,
		groupDrag,
		resizeMoved,
		boardPoint,
		marqueeEnd,
		wrapRef,
		historyRef,
		overlay,
		widgets,
		scale,
		snap,
		policy,
		moveAll,
		cycleSize,
		resizeWidget,
		announce,
		op,
		setMarquee,
		setView,
		setGuides,
	});

	const orderedWidgets = useReadingOrder(widgets, focusOrder, focusedId, frameRefs, wrapRef);

	/** One Shift+Arrow (or resize-handle arrow) step, folded into the keyboard burst. */
	const keyboardResize = (w: BoardWidget, dx: number, dy: number) => {
		history?.beginBurst();
		const headed = pending(w.id);
		const size = sizeDraft[w.id] ?? { w: w.w, h: w.h };
		const next = fitWidgetSize(
			w,
			(headed?.w ?? size.w) + dx * GRID,
			(headed?.h ?? size.h) + dy * GRID,
			policy === 'bounded',
		);
		nudge(w.id, next, resizeWidget(w, next.w, next.h));
	};

	const frameKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, w: BoardWidget) => {
		const key = frameKey(e);
		if (!key) return;
		if (key === 'leave') {
			e.preventDefault();
			e.stopPropagation();
			// RC-CAN-8.1 — Escape ends the keyboard burst: its nudges are now ONE undo step.
			history?.settle();
			if (editing && selectedId === w.id) announce(op.dropped(w.title));
			onSelect(null);
			e.currentTarget.focus();
			return;
		}
		if (editing && e.key === ' ' && e.shiftKey) {
			e.preventDefault();
			select(toggleSelection(selection, withGroupMates([w.id], groupOf)));
			return;
		}
		if (matchesShortcut('canvas.select', e) || matchesShortcut('canvas.moveMode', e)) {
			e.preventDefault();
			if (!editing || !selection.includes(w.id)) select(withGroupMates([w.id], groupOf));
			if (e.key === 'Enter') enterTileContent(e.currentTarget);
			else e.currentTarget.focus();
			if (e.key !== 'Enter' && editing) announce(op.picked(w.title));
			return;
		}
		if ((e.key === 'Delete' || e.key === 'Backspace') && editing && onRemove) {
			e.preventDefault();
			onRemove(w.id);
			return;
		}
		const delta = ARROW_DELTA[e.key];
		if (!delta) return;
		e.preventDefault();
		if (editing && selection.includes(w.id)) {
			if (e.shiftKey) {
				const resizable = isWidgetResizable(w) && (canResize?.(w) ?? true);
				if (!resizable) return;
				keyboardResize(w, delta[0], delta[1]);
			} else {
				// RC-CAN-8.1 — a run of nudges is one burst, ONE undo step, closed on Escape or blur.
				history?.beginBurst();
				const step = ({ id, x, y }: Placement) => ({
					id,
					x: Math.max(0, x + delta[0] * GRID),
					y: Math.max(0, y + delta[1] * GRID),
				});
				const moved = selection
					.flatMap(rectOf)
					.map((r) => ({ ...r, ...pending(r.id) }))
					.map(step);
				const commit = moveAll(moved);
				for (const m of moved) nudge(m.id, { x: m.x, y: m.y }, commit);
				const own = moved.find((m) => m.id === w.id);
				if (own) announce(op.moved(w.title, own.x, own.y));
			}
			return;
		}
		const next = spatialNeighbour(orderedWidgets, w.id, delta);
		if (next) frameRefs.current.get(next)?.focus();
	};

	/** RC-CAN-3.6 — run an arrange action over the selection. Align/distribute move each tile through
	 *  the host's `onMove`; layer and group are single core commands through the undo stack. */
	const arrange = async (action: ArrangeAction) => {
		if (action.kind === 'select-all') return select(widgets.map((w) => w.id));
		const placed = planPlacements(action, selection.flatMap(rectOf));
		const resolved = scene ? arrangeCommand(action, scene, selection) : null;
		const step = async () => {
			await moveAll(placed);
			if (!resolved) return;
			const command = { ...resolved, actorId: runtime.defaultActorId } as CoreCommand;
			await (history
				? history.run(command, t('boardCanvas.step.arranged'))
				: runtime.dispatch(command));
		};
		await (history ? history.oneStep(step) : step());
		if (resolved) {
			requestAnimationFrame(() => {
				if (document.activeElement === document.body && focusedId)
					frameRefs.current.get(focusedId)?.focus();
			});
		}
		if (placed.length || resolved)
			announce(t('boardCanvas.arrange.done', { count: selection.length }));
	};

	const canvasKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		const target = e.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
		if (isTileContentKey(e)) return;
		const action = editing ? arrangeShortcut(e) : null;
		if (action && (action.kind === 'select-all' || selection.length)) {
			e.preventDefault();
			void arrange(action);
			return;
		}
		if (editing && matchesShortcut('canvas.add', e)) {
			e.preventDefault();
			openGallery(e.currentTarget, t(policy === 'bounded' ? 'board.add' : 'sceneEditor.add'));
			return;
		}
		const key = canvasKey(e);
		if (!key || ((key.kind === 'undo' || key.kind === 'redo') && !history)) return;
		e.preventDefault();
		if (key.kind === 'zoom') applyPreset(key.preset);
		else if (key.kind === 'step') cyclePreset(key.by);
		else void (key.kind === 'undo' ? history?.undo() : history?.redo());
	};

	const frames = orderedWidgets.map((w) => {
		const pos = posDraft[w.id] ?? { x: w.x, y: w.y };
		const size = sizeDraft[w.id] ?? { w: w.w, h: w.h };
		const selected = editing && selection.includes(w.id);
		const resizable = editing && isWidgetResizable(w) && (canResize?.(w) ?? true);
		return (
			<WidgetFrame
				key={w.id}
				history={history}
				w={w}
				x={pos.x}
				y={pos.y}
				width={size.w}
				height={size.h}
				editing={editing}
				selected={selected}
				multi={selected && multi.length > 1}
				scale={scale}
				resizable={resizable}
				dragging={guides?.id === w.id}
				tabbable
				stackOrder={widgets.indexOf(w)}
				ariaLabel={frameName(w, { editing, selected: selected && multi.length > 0 }, t)}
				onKeyDown={(e) => frameKeyDown(e, w)}
				onFocusIn={() => setFocusedId(w.id)}
				onSettle={() => history?.settle()}
				registerRef={(el) => {
					if (el) frameRefs.current.set(w.id, el);
					else frameRefs.current.delete(w.id);
				}}
				onStartMove={(e) => startMove(e, w)}
				onStartResize={(e) => startResize(e, w)}
				onCycleSize={() => void cycleSize(w)}
				onResizeStep={(dx, dy) => keyboardResize(w, dx, dy)}
				onCommand={
					!editing && onWidgetCommand
						? (commandType, payload) => onWidgetCommand(w.id, commandType, payload)
						: undefined
				}
			/>
		);
	});

	return (
		<div
			ref={wrapRef}
			data-testid={`scene-board-${policy}`}
			data-background={background}
			{...A11y.canvasSurfaceProps(policy, editing, widgets.length, t)}
			tabIndex={widgets.length === 0 ? 0 : -1}
			onWheel={onWheel}
			onKeyDown={canvasKeyDown}
			onPointerDown={onBgDown}
			style={canvasSurfaceStyle(policy, overflowsHorizontally)}
		>
			<CanvasBackdrop
				policy={policy}
				theme={surfaceTheme}
				background={background}
				tx={tx}
				ty={ty}
				scale={scale}
				extent={contentExtent}
			/>
			<CanvasStage
				policy={policy}
				tx={tx}
				ty={ty}
				scale={scale}
				extent={contentExtent}
				showGrid={editing || background === 'grid'}
				sections={sections}
				marquee={marquee}
				guides={guides}
			>
				{frames}
			</CanvasStage>

			{history && editing && <HistoryCluster history={history} policy={policy} />}
			{editing && selection.length > 1 && (
				<A11y.ArrangeBar
					count={selection.length}
					grouped={selection.some((id) => groupOf.get(id))}
					policy={policy}
					onAction={(action) => void arrange(action)}
				/>
			)}

			<CanvasAnnouncements history={history} zoomNotice={zoomNotice} />

			{policy === 'canvas' && zoomPreset === undefined && (
				<ZoomCluster
					scale={scale}
					activePreset={activePreset}
					onZoom={zoom}
					onPreset={applyPreset}
				/>
			)}

			<A11y.OperationLiveRegion notice={notice} testId="canvas-resize-announcement" />
			{widgets.length === 0 && (
				<EmptyCanvas theme={surfaceTheme} title={emptyTitle} hint={emptyHint} />
			)}
		</div>
	);
}
