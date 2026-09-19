import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
	fitWidgetSize,
	isWidgetResizable,
	nextSizePreset,
	type BoardWidget,
} from './board-helpers';
import { getSceneForActor, type CoreCommand, type SectionLayoutRegion } from '@dndtools/core';
import { useParams } from 'react-router-dom';
import {
	ArrangeBar,
	EmptyCanvas,
	HistoryCluster,
	Marquee,
	WidgetFrame,
} from './canvas/WidgetFrame';
import {
	arrangeCommand,
	arrangeShortcut,
	boxFromPoints,
	dropSettled,
	enclosedIds,
	extentOf,
	planPlacements,
	toggleSelection,
	withGroupMates,
	zoomAbout,
	type ArrangeAction,
	type Box,
	type Placement,
} from './canvas/geometry';
import { useRuntime } from '../runtime/RuntimeContext';
import {
	enterTileContent,
	frameKey,
	openGallery,
	spatialNeighbour,
	useReadingOrder,
} from './canvas/keyboard';
import { matchesShortcut } from './shortcuts/registry';
import { ZoomCluster } from './canvas/ZoomCluster';
import * as A11y from './canvas/surfaceA11y';
import {
	ARROW_DELTA,
	clamp,
	FIT_FLOOR,
	FIXED_PRESET_SCALE,
	GRID,
	omitKey,
	snapTo,
	ZOOM_KEY,
	ZOOM_PRESETS,
	ZOOM_PRESET_KEY,
	type Drag,
	type SceneBoardCanvasProps,
	type View,
	type ZoomPreset,
} from './SceneBoardModel';
export { ZOOM_PRESETS, ZOOM_PRESET_KEY, type ZoomPreset } from './SceneBoardModel';

export { WidgetGlyph } from './canvas/WidgetFrame';
import { srOnly } from './screen-kit';
import { useI18n } from '../i18n';

const NO_SECTIONS: SectionLayoutRegion[] = [];

// Dock to the authored board extent; retain free coordinates for undocking.
function dockedPosition(
	position: { x: number; y: number; w: number; h: number },
	dock: string | null,
	extent: { width: number; height: number },
) {
	return {
		x: dock === 'left' ? 0 : dock === 'right' ? Math.max(0, extent.width - position.w) : position.x,
		y:
			dock === 'top' ? 0 : dock === 'bottom' ? Math.max(0, extent.height - position.h) : position.y,
	};
}

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
	const [wrapWidth, setWrapWidth] = useState(0);
	const dragRef = useRef<Drag | null>(null);
	const resizeMoved = useRef(false);
	const [notice, announce] = A11y.useOperationNotice();
	const resizeWidget = useCallback(
		(w: BoardWidget, width: number, height: number) => {
			const next = fitWidgetSize(w, width, height, policy === 'bounded');
			void onResize(w.id, next.w, next.h);
			announce(A11y.OPERATION_TEXT.resized(w.title, next.w, next.h));
		},
		[onResize, policy, announce],
	);
	const cycleSize = useCallback(
		(w: BoardWidget) => {
			const next = nextSizePreset(w, sizeDraftRef.current[w.id] ?? w, policy === 'bounded');
			resizeWidget(w, next.w, next.h);
		},
		[resizeWidget, policy],
	);
	const frameRefs = useRef(new Map<string, HTMLDivElement>());
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const { t } = useI18n();
	const runtime = useRuntime();
	const [multi, setMulti] = useState<string[]>([]);
	const [marquee, setMarquee] = useState<Box | null>(null);
	const marqueeRef = useRef<{ x: number; y: number; base: string[] } | null>(null);
	const groupDrag = useRef<Record<string, { x: number; y: number }>>({});
	const selection = multi.length ? multi : selectedId ? [selectedId] : [];
	const { id: routeSceneId } = useParams();
	const scene = useMemo(
		() =>
			runtime.state.scenes.scenes[
				routeSceneId ??
					(policy === 'bounded' ? (runtime.state.commandCenter.homeSceneId ?? '') : '')
			] ??
			Object.values(runtime.state.scenes.scenes).find((sc) =>
				sc.widgets.some((w) => w.id === authoredWidgets[0]?.id),
			),
		[runtime.state, authoredWidgets, routeSceneId, policy],
	);
	const summary = scene
		? getSceneForActor(
				runtime.state.scenes,
				runtime.state.permissions,
				runtime.defaultActorId,
				scene.id,
			)
		: null;
	const sections = summary && !('kind' in summary) ? summary.sections : NO_SECTIONS;
	const background = summary && !('kind' in summary) ? summary.visualSettings.background : 'paper';
	const widgets = useMemo(() => {
		const extent = extentOf([...authoredWidgets, ...sections.map((section) => section.bounds)]);
		return authoredWidgets.map((widget) => ({
			...widget,
			...dockedPosition(
				widget,
				scene?.widgets.find((w) => w.id === widget.id)?.layout.dock ?? null,
				extent,
			),
		}));
	}, [authoredWidgets, scene, sections]);
	const groupOf = useMemo(
		() => new Map(scene?.widgets.map((w) => [w.id, w.layout.groupId]) ?? []),
		[scene],
	);
	const select = (ids: string[]) => {
		setMulti(ids.length > 1 ? ids : []);
		onSelect(ids[ids.length - 1] ?? null);
	};
	useEffect(() => {
		if (!editing || !selectedId || !multi.includes(selectedId))
			setMulti((m) => (m.length ? [] : m));
	}, [editing, selectedId, multi]);
	const [view, setView] = useState<View>({ tx: 32, ty: 32, scale: 1 });
	const paneCentre = (): [number, number] => {
		const r = wrapRef.current?.getBoundingClientRect();
		return [(r?.width ?? 800) / 2, (r?.height ?? 600) / 2];
	};
	const [localPreset, setLocalPreset] = useState<ZoomPreset>(
		policy === 'bounded' ? 'fit' : 'comfortable',
	);
	const [zoomNotice, setZoomNotice] = useState<{
		seq: number;
		preset: ZoomPreset;
		percent: number;
	} | null>(null);
	const zoomSeq = useRef(0);
	const [posDraft, setPosDraft] = useState<Record<string, { x: number; y: number }>>({});
	const [sizeDraft, setSizeDraft] = useState<Record<string, { w: number; h: number }>>({});
	const posDraftRef = useRef(posDraft);
	const sizeDraftRef = useRef(sizeDraft);
	posDraftRef.current = posDraft;
	sizeDraftRef.current = sizeDraft;
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
	/** One `scene.move-widget` per tile, in sequence, so each lands as its own undo step. */
	const moveAll = useCallback(
		async (list: Placement[]) => {
			for (const p of list) await onMove(p.id, p.x, p.y);
		},
		[onMove],
	);

	useEffect(() => {
		// Commands persist free coordinates, even when docking derives a different painted position.
		setPosDraft((prev) => dropSettled(prev, authoredWidgets, (d, w) => d.x === w.x && d.y === w.y));
		setSizeDraft((prev) =>
			dropSettled(prev, authoredWidgets, (d, w) => d.w === w.w && d.h === w.h),
		);
	}, [authoredWidgets]);

	useEffect(() => {
		const node = wrapRef.current;
		if (!node) return;
		const update = () => setWrapWidth(node.clientWidth);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	const contentExtent = extentOf([...authoredWidgets, ...rects, ...sections.map((s) => s.bounds)]);

	const fitScale = wrapWidth > 0 ? clamp((wrapWidth - 16) / contentExtent.width, FIT_FLOOR, 1) : 1;
	const scaleForPreset = useCallback(
		(p: ZoomPreset) => (p === 'fit' ? fitScale : FIXED_PRESET_SCALE[p]),
		[fitScale],
	);
	const preset = zoomPreset ?? localPreset;

	const boundedScale = policy === 'bounded' ? scaleForPreset(preset) : 1;
	const scale = policy === 'canvas' ? view.scale : boundedScale;
	const tx = policy === 'canvas' ? view.tx : boundedScale < 1 ? 8 : 0;
	const ty = policy === 'canvas' ? view.ty : boundedScale < 1 ? 8 : 0;
	const overflowsHorizontally = policy === 'bounded' && scale * contentExtent.width > wrapWidth;

	/** Move to a named step. The bounded board reads its scale straight off the preset; the free
	 *  canvas has a translate to keep honest as well, so it re-frames or re-centres. */
	const applyPreset = useCallback(
		(next: ZoomPreset) => {
			setLocalPreset(next);
			onZoomPresetChange?.(next);
			const s1 = scaleForPreset(next);
			if (policy === 'canvas') {
				if (next === 'fit') setView({ tx: 32, ty: 32, scale: s1 });
				else setView((v) => zoomAbout(v, ...paneCentre(), s1));
			}
		},
		[onZoomPresetChange, policy, scaleForPreset],
	);

	const announcedRef = useRef<ZoomPreset | null>(null);
	useEffect(() => {
		if (announcedRef.current === null || announcedRef.current === preset) {
			announcedRef.current = preset;
			return;
		}
		announcedRef.current = preset;
		zoomSeq.current += 1;
		setZoomNotice({
			seq: zoomSeq.current,
			preset,
			percent: Math.round(scaleForPreset(preset) * 100),
		});
	}, [preset, scaleForPreset]);

	/** `+`/`-` step through the presets from whichever one the current scale sits nearest, and stop
	 *  at the ends: wrapping Detail back round to Fit reads as the control losing its place. */
	const cyclePreset = useCallback(
		(direction: 1 | -1) => {
			const nearest = ZOOM_PRESETS.reduce((best, p) =>
				Math.abs(scaleForPreset(p) - scale) < Math.abs(scaleForPreset(best) - scale) ? p : best,
			);
			const next = ZOOM_PRESETS[clamp(ZOOM_PRESETS.indexOf(nearest) + direction, 0, 2)];
			applyPreset(next);
		},
		[applyPreset, scale, scaleForPreset],
	);
	/** Which step the current scale IS — the free canvas can sit between two of them after a wheel
	 *  zoom, and then no preset is pressed. */
	const activePreset =
		ZOOM_PRESETS.find((p) => Math.abs(scaleForPreset(p) - scale) < 0.005) ?? null;

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
		const cur = posDraft[w.id] ?? { x: w.x, y: w.y };
		begin(e, { mode: 'move', id: w.id, sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y });
	};
	const startResize = (e: React.PointerEvent, w: BoardWidget) => {
		if (e.button !== 0) return;
		resizeMoved.current = false;
		e.stopPropagation();
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

	useEffect(() => {
		const move = (e: PointerEvent) => {
			const m = marqueeRef.current;
			if (m) return setMarquee(boxFromPoints(m, boardPoint.current(e)));
			const d = dragRef.current;
			if (!d) return;
			if (d.mode === 'pan') {
				setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.sx), ty: d.ty + (e.clientY - d.sy) }));
				return;
			}
			if (d.mode === 'scroll-pan') {
				const el = wrapRef.current;
				if (el) {
					el.scrollLeft = d.sl - (e.clientX - d.sx);
					el.scrollTop = d.st - (e.clientY - d.sy);
				}
				return;
			}
			const dx = (e.clientX - d.sx) / scale;
			const dy = (e.clientY - d.sy) / scale;
			if (d.mode === 'move') {
				const x = Math.max(0, snapTo(d.ox + dx, snap));
				const y = Math.max(0, snapTo(d.oy + dy, snap));
				setPosDraft((prev) => {
					const next = { ...prev, [d.id]: { x, y } };
					for (const [id, o] of Object.entries(groupDrag.current))
						next[id] = { x: Math.max(0, o.x + x - d.ox), y: Math.max(0, o.y + y - d.oy) };
					return next;
				});
			} else {
				if (!resizeMoved.current && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
				resizeMoved.current = true;
				const widget = widgets.find((w) => w.id === d.id);
				if (!widget) return;
				const width = snapTo(d.ow + dx, snap);
				const next = fitWidgetSize(widget, width, snapTo(d.oh + dy, snap), policy === 'bounded');
				setSizeDraft((prev) => ({ ...prev, [d.id]: next }));
			}
		};
		const up = (e: PointerEvent) => {
			const d = dragRef.current;
			const m = marqueeRef.current;
			dragRef.current = null;
			marqueeRef.current = null;
			document.body.style.userSelect = '';
			if (m) {
				setMarquee(null);
				marqueeEnd.current(boxFromPoints(m, boardPoint.current(e)), m.base);
			}
			if (!d) return;
			if (d.mode === 'move') {
				const ids = [d.id, ...Object.keys(groupDrag.current)];
				groupDrag.current = {};
				const drafts = posDraftRef.current;
				const p = drafts[d.id];
				if (p) void moveAll(ids.flatMap((id) => (drafts[id] ? [{ id, ...drafts[id] }] : [])));
				const w = widgets.find((c) => c.id === d.id);
				if (p && w) announce(A11y.OPERATION_TEXT.moved(w.title, p.x, p.y));
			} else if (d.mode === 'resize') {
				const s = sizeDraftRef.current[d.id];
				const widget = widgets.find((w) => w.id === d.id);
				if (widget) {
					if (!resizeMoved.current) cycleSize(widget);
					else if (s) resizeWidget(widget, s.w, s.h);
				}
			}
		};
		const cancel = () => {
			const d = dragRef.current;
			dragRef.current = null;
			marqueeRef.current = null;
			setMarquee(null);
			document.body.style.userSelect = '';
			if (!d || d.mode === 'pan' || d.mode === 'scroll-pan') return;
			if (d.mode === 'move') {
				const ids = [d.id, ...Object.keys(groupDrag.current)];
				groupDrag.current = {};
				setPosDraft((prev) => ids.reduce((acc, id) => omitKey(acc, id), prev));
			} else setSizeDraft((prev) => omitKey(prev, d.id));
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', cancel);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', cancel);
		};
	}, [scale, snap, policy, moveAll, widgets, cycleSize, resizeWidget, announce]);

	const onWheel = useCallback(
		(e: React.WheelEvent) => {
			if (policy !== 'canvas') return;
			if (e.ctrlKey || e.metaKey) {
				const r = wrapRef.current?.getBoundingClientRect();
				if (!r) return;
				const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
				setView((v) =>
					zoomAbout(v, e.clientX - r.left, e.clientY - r.top, clamp(v.scale * factor, 0.4, 1.8)),
				);
			} else {
				const horizontal = e.shiftKey && e.deltaX === 0;
				const dx = horizontal ? e.deltaY : e.deltaX;
				const dy = horizontal ? 0 : e.deltaY;
				setView((v) => ({ ...v, tx: v.tx - dx, ty: v.ty - dy }));
			}
		},
		[policy],
	);

	const zoom = (factor: number) =>
		setView((v) => zoomAbout(v, ...paneCentre(), clamp(v.scale * factor, 0.4, 1.8)));

	const orderedWidgets = useReadingOrder(widgets, focusOrder, focusedId, frameRefs, wrapRef);

	const frameKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, w: BoardWidget) => {
		const key = frameKey(e);
		if (!key) return;
		if (key === 'leave') {
			e.preventDefault();
			e.stopPropagation();
			if (editing && selectedId === w.id) announce(A11y.OPERATION_TEXT.dropped(w.title));
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
			if (e.key !== 'Enter' && editing) announce(A11y.OPERATION_TEXT.picked(w.title));
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
			const size = sizeDraft[w.id] ?? { w: w.w, h: w.h };
			if (e.shiftKey) {
				const resizable = canResize ? canResize(w) : isWidgetResizable(w);
				if (!resizable) return;
				resizeWidget(w, size.w + delta[0] * GRID, size.h + delta[1] * GRID);
			} else {
				const step = ({ id, x, y }: Placement) => ({
					id,
					x: Math.max(0, x + delta[0] * GRID),
					y: Math.max(0, y + delta[1] * GRID),
				});
				const moved = selection.flatMap(rectOf).map(step);
				void moveAll(moved);
				const own = moved.find((m) => m.id === w.id);
				if (own) announce(A11y.OPERATION_TEXT.moved(w.title, own.x, own.y));
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
		await moveAll(placed);
		const resolved = scene ? arrangeCommand(action, scene, selection) : null;
		if (resolved) {
			const command = { ...resolved, actorId: runtime.defaultActorId } as CoreCommand;
			await (history ? history.run(command, 'Arranged tiles') : runtime.dispatch(command));
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
		if (target?.closest('[data-tile-content]') && !target.hasAttribute('data-tile-content')) return;
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
		if (!e.ctrlKey && !e.metaKey && !e.altKey) {
			const direct = ZOOM_KEY[e.key];
			if (direct) {
				e.preventDefault();
				applyPreset(direct);
				return;
			}
			if (e.key === '+' || e.key === '=') {
				e.preventDefault();
				cyclePreset(1);
				return;
			}
			if (e.key === '-' || e.key === '_') {
				e.preventDefault();
				cyclePreset(-1);
				return;
			}
		}
		if (!history) return;
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

	const frames = orderedWidgets.map((w) => {
		const pos = posDraft[w.id] ?? { x: w.x, y: w.y };
		const size = sizeDraft[w.id] ?? { w: w.w, h: w.h };
		const selected = editing && selection.includes(w.id);
		const resizable = editing && (canResize ? canResize(w) : isWidgetResizable(w));
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
				tabbable
				stackOrder={widgets.indexOf(w)}
				ariaLabel={
					editing
						? `${w.title}, ${w.typeLabel} widget${selected && multi.length ? ', selected' : ''}, position ${pos.x}, ${pos.y}, size ${size.w} by ${size.h}`
						: `${w.title}, ${w.typeLabel} widget`
				}
				onKeyDown={(e) => frameKeyDown(e, w)}
				onFocusIn={() => setFocusedId(w.id)}
				registerRef={(el) => {
					if (el) frameRefs.current.set(w.id, el);
					else frameRefs.current.delete(w.id);
				}}
				onStartMove={(e) => startMove(e, w)}
				onStartResize={(e) => startResize(e, w)}
				onCycleSize={() => cycleSize(w)}
				onResizeStep={(dx, dy) => resizeWidget(w, size.w + dx * GRID, size.h + dy * GRID)}
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
			{...A11y.canvasSurfaceProps(policy, editing, widgets.length)}
			tabIndex={widgets.length === 0 ? 0 : -1}
			onWheel={onWheel}
			onKeyDown={canvasKeyDown}
			onPointerDown={onBgDown}
			style={{
				position: 'relative',
				flex: 1,
				minHeight: 0,
				background: 'var(--color-bg)',
				// RC-CAN-3.1: Fit stops at `FIT_FLOOR`, and Comfortable/Detail are deliberately bigger
				// than the pane on a narrow window — so the bounded board scrolls sideways to the rest
				// of the layout instead of scaling it away.
				overflowX: overflowsHorizontally ? 'auto' : 'hidden',
				overflowY: policy === 'bounded' ? 'auto' : 'hidden',
				cursor: policy === 'canvas' ? 'grab' : 'default',
				// The bounded board deliberately overflows vertically. Let a finger pan that scroll
				// region; `none` turns a mobile GM Screen into a desktop-only scrollbar workflow.
				// Free-canvas scenes retain their gesture ownership for drag/pan/zoom interactions.
				touchAction:
					policy === 'bounded' ? (overflowsHorizontally ? 'pan-x pan-y' : 'pan-y') : 'none',
				borderRadius: 'var(--radius-lg)',
				border: '1px solid var(--color-border)',
			}}
		>
			<div
				data-testid="scene-background"
				data-theme={
					background === 'paper' || background === 'parchment'
						? 'parchment'
						: background === 'dark'
							? 'tavern'
							: undefined
				}
				style={{
					position: 'absolute',
					inset: 0,
					background: background === 'paper' ? 'var(--color-surface-raised)' : 'var(--color-bg)',
					pointerEvents: 'none',
				}}
			/>
			<div
				style={
					{
						position: 'absolute',
						left: 0,
						top: 0,
						transformOrigin: '0 0',
						transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
						// Bare number: `.scene-board-operation` divides its touch target by it.
						'--scene-board-scale': String(scale),
						minWidth: policy === 'bounded' ? contentExtent.width : '100%',
						height: policy === 'bounded' ? contentExtent.height : undefined,
					} as CSSProperties
				}
			>
				{(editing || background === 'grid') && (
					<div
						style={{
							position: 'absolute',
							// Bounded covers only its own extent: an oversized sheet inside its scroll
							// container ballooned /board's scrollHeight. The free canvas keeps the sheet.
							...(policy === 'bounded'
								? { inset: 0 }
								: { left: -2000, top: -2000, width: 6000, height: 6000 }),
							backgroundImage: 'radial-gradient(var(--color-border-strong) 1px, transparent 1px)',
							backgroundSize: `${GRID}px ${GRID}px`,
							pointerEvents: 'none',
						}}
					/>
				)}
				{sections.map((section) => (
					<div
						key={section.id}
						data-testid={`scene-section-${section.id}`}
						role="region"
						aria-label={section.name}
						style={{
							position: 'absolute',
							left: section.bounds.x,
							top: section.bounds.y,
							width: section.bounds.w,
							height: section.bounds.h,
							pointerEvents: 'none',
							border: '1px solid var(--color-border-strong)',
							background: 'color-mix(in srgb, var(--color-surface) 35%, transparent)',
						}}
					>
						<div
							style={{
								padding: 'var(--space-1) var(--space-2)',
								background: 'var(--color-surface)',
								color: 'var(--color-text-primary)',
								fontWeight: 600,
							}}
						>
							{section.name}
						</div>
					</div>
				))}
				{frames}
				{marquee && <Marquee box={marquee} />}
			</div>

			{history && editing && <HistoryCluster history={history} policy={policy} />}
			{editing && selection.length > 1 && (
				<ArrangeBar
					count={selection.length}
					grouped={selection.some((id) => groupOf.get(id))}
					policy={policy}
					onAction={(action) => void arrange(action)}
				/>
			)}

			{/* Permanent live regions: announced by CONTENT changing, never by a region being inserted
			    (screen readers drop those). Re-keying on `seq` repeats an identical announcement. */}
			{history && (
				<div role="status" aria-live="polite" aria-atomic="true" style={srOnly}>
					{history.announcement && (
						<span key={history.announcement.seq}>{history.announcement.text}</span>
					)}
				</div>
			)}

			{/* RC-CAN-3.1: zoom steps announce here — bare `aria-live`, since one `status` per canvas. */}
			<div aria-live="polite" aria-atomic="true" style={srOnly}>
				{zoomNotice && (
					<span key={zoomNotice.seq}>
						{t('boardCanvas.zoomAnnouncement', {
							preset: t(ZOOM_PRESET_KEY[zoomNotice.preset]),
							percent: zoomNotice.percent,
						})}
					</span>
				)}
			</div>

			{policy === 'canvas' && zoomPreset === undefined && (
				<ZoomCluster
					scale={scale}
					activePreset={activePreset}
					onZoom={zoom}
					onPreset={applyPreset}
				/>
			)}

			{/* RC-UX-2.2: every layout operation (move, resize, pick up, put down) speaks here. */}
			<A11y.OperationLiveRegion notice={notice} testId="canvas-resize-announcement" />
			{widgets.length === 0 && <EmptyCanvas title={emptyTitle} hint={emptyHint} />}
		</div>
	);
}
