import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '../ds';
import { TIER_LABEL, visibilityChip, type BoardWidget } from './board-helpers';
import { WidgetBody, type WidgetCommandHandler } from './widget-bodies';

/**
 * SceneBoardCanvas — the ONE canvas engine the prototype's `scene-canvas.jsx` describes: the same
 * widget frames + edit interactions under two overflow POLICIES.
 *   • 'bounded' (Command Center / `/board`): top-anchored, scrolls vertically, glanceable. No pan.
 *   • 'canvas'  (custom scenes / `/scene/:id`): free pan + zoom.
 *
 * It is wired to the REAL Processing Core, not the prototype's local state: every move/resize is
 * committed through the parent's dispatch on pointer-UP only (one `scene.move-widget` /
 * `scene.resize-widget` per gesture — never per pointer-move, which would hammer IndexedDB). While a
 * gesture is in flight an optimistic local draft drives the frame; the draft is dropped the moment
 * the core-confirmed layout catches up, so there is no snap-back flicker.
 *
 * KEYBOARD OPERATION (CANVAS-016). Widget frames are focusable with a roving tabindex that follows
 * the core-computed scene focus order (`SceneSummary.focusOrder`, passed as `focusOrder`): Tab enters
 * the canvas at the selected (else last-focused, else first) widget, and plain arrow keys walk the
 * focus order. Enter/Space selects the focused widget (opening the inspector where the host screen
 * mounts one); Escape deselects. In EDIT mode, arrows on the SELECTED widget commit one grid step
 * per key press through `onMove` (`scene.move-widget`), Shift+arrows one resize step through
 * `onResize`, and Delete removes via `onRemove` — each key press is ONE discrete core op, exactly
 * like a pointer gesture's pointer-up. The pointer paths are untouched.
 */

const GRID = 20;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const snapTo = (n: number, snap: boolean) => (snap ? Math.round(n / GRID) * GRID : Math.round(n));
/** Drop one widget's in-flight drag draft, so it falls back to its durable position/size. */
function omitKey<T>(map: Record<string, T>, id: string): Record<string, T> {
	if (!(id in map)) return map;
	const next = { ...map };
	delete next[id];
	return next;
}

// Widget definition icons are normally semantic registry keys ('map', 'dice', …). Third-party
// packages created by older builds may still contain an emoji glyph, so retain a decorative legacy
// fallback instead of replacing persisted package content with a broken square.
const isRegistryKey = (icon: string) => /^[a-z0-9-]+$/i.test(icon);

export function WidgetGlyph({
	icon,
	size = 'sm',
	color = 'var(--color-accent)',
}: {
	icon: string;
	size?: 'sm' | 'md' | number;
	color?: string;
}) {
	if (isRegistryKey(icon)) return <Icon name={icon} size={size} color={color} />;
	const px = size === 'md' ? 20 : typeof size === 'number' ? size : 16;
	return (
		<span aria-hidden style={{ fontSize: px, lineHeight: 1, flex: '0 0 auto' }}>
			{icon}
		</span>
	);
}

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
}

/** Arrow-key vector: [dx, dy] in grid steps. */
const ARROW_DELTA: Record<string, readonly [number, number]> = {
	ArrowLeft: [-1, 0],
	ArrowRight: [1, 0],
	ArrowUp: [0, -1],
	ArrowDown: [0, 1],
};

type Drag =
	| { mode: 'move'; id: string; sx: number; sy: number; ox: number; oy: number }
	| { mode: 'resize'; id: string; sx: number; sy: number; ow: number; oh: number }
	| { mode: 'pan'; sx: number; sy: number; tx: number; ty: number };

interface View {
	tx: number;
	ty: number;
	scale: number;
}

export function SceneBoardCanvas({
	widgets,
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
}: SceneBoardCanvasProps) {
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const [wrapWidth, setWrapWidth] = useState(0);
	const dragRef = useRef<Drag | null>(null);
	// Keyboard roving-tabindex state: live frame elements by id + the last-focused widget.
	const frameRefs = useRef(new Map<string, HTMLDivElement>());
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [view, setView] = useState<View>({ tx: 32, ty: 32, scale: 1 });
	// Optimistic per-gesture overrides (x/y for moves, w/h for resizes).
	const [posDraft, setPosDraft] = useState<Record<string, { x: number; y: number }>>({});
	const [sizeDraft, setSizeDraft] = useState<Record<string, { w: number; h: number }>>({});
	// Refs so the global pointerup handler reads the latest drafts without re-binding the listener.
	const posDraftRef = useRef(posDraft);
	const sizeDraftRef = useRef(sizeDraft);
	posDraftRef.current = posDraft;
	sizeDraftRef.current = sizeDraft;

	// Drop a draft once the core-confirmed layout matches it — flicker-free hand-off from optimistic
	// drag to persisted state.
	useEffect(() => {
		setPosDraft((prev) => {
			let changed = false;
			const next = { ...prev };
			for (const w of widgets) {
				const d = prev[w.id];
				if (d && d.x === w.x && d.y === w.y) {
					delete next[w.id];
					changed = true;
				}
			}
			return changed ? next : prev;
		});
		setSizeDraft((prev) => {
			let changed = false;
			const next = { ...prev };
			for (const w of widgets) {
				const d = prev[w.id];
				if (d && d.w === w.w && d.h === w.h) {
					delete next[w.id];
					changed = true;
				}
			}
			return changed ? next : prev;
		});
	}, [widgets]);

	useEffect(() => {
		const node = wrapRef.current;
		if (!node) return;
		const update = () => setWrapWidth(node.clientWidth);
		update();
		const observer = new ResizeObserver(update);
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	// The bounded GM Screen is a composed dashboard, not a free-panning canvas. At narrow window
	// sizes fit the authored board width into view so controls on right-hand widgets remain reachable.
	// Canvas-mode scenes keep their explicit user-controlled zoom unchanged.
	const boundedExtent = useMemo(() => {
		let right = 0;
		let bottom = 0;
		for (const widget of widgets) {
			const pos = posDraft[widget.id] ?? widget;
			const size = sizeDraft[widget.id] ?? widget;
			right = Math.max(right, pos.x + size.w);
			bottom = Math.max(bottom, pos.y + size.h);
		}
		return { width: Math.max(1, right), height: Math.max(1, bottom) };
	}, [widgets, posDraft, sizeDraft]);
	const boundedScale =
		policy === 'bounded' && wrapWidth > 0
			? clamp((wrapWidth - 16) / boundedExtent.width, 0.4, 1)
			: 1;
	const scale = policy === 'canvas' ? view.scale : boundedScale;
	const tx = policy === 'canvas' ? view.tx : boundedScale < 1 ? 8 : 0;
	const ty = policy === 'canvas' ? view.ty : boundedScale < 1 ? 8 : 0;

	// Capturing the pointer keeps the gesture bound to the element it started on, so releasing outside
	// the browser window (or over another frame) still delivers `pointerup`/`pointercancel` to us.
	// Without it — and without the `pointercancel` listener below — a drag interrupted by the browser
	// taking over the touch (the phone board sets `touch-action:'pan-y'`, so a vertical swipe does
	// exactly that) left `dragRef` set and `document.body.style.userSelect` pinned to `'none'`
	// APP-WIDE: every later pointermove kept dragging the widget with no button down, and the next
	// stray pointerup committed a move the DM never made.
	const capture = (e: React.PointerEvent) => {
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			/* a pointer that has already ended cannot be captured — the listeners still cover us */
		}
	};

	const startMove = (e: React.PointerEvent, w: BoardWidget) => {
		e.stopPropagation();
		onSelect(w.id);
		if (!editing) return;
		capture(e);
		const cur = posDraft[w.id] ?? { x: w.x, y: w.y };
		dragRef.current = {
			mode: 'move',
			id: w.id,
			sx: e.clientX,
			sy: e.clientY,
			ox: cur.x,
			oy: cur.y,
		};
		document.body.style.userSelect = 'none';
	};
	const startResize = (e: React.PointerEvent, w: BoardWidget) => {
		e.stopPropagation();
		capture(e);
		const cur = sizeDraft[w.id] ?? { w: w.w, h: w.h };
		dragRef.current = {
			mode: 'resize',
			id: w.id,
			sx: e.clientX,
			sy: e.clientY,
			ow: cur.w,
			oh: cur.h,
		};
		document.body.style.userSelect = 'none';
	};
	const onBgDown = (e: React.PointerEvent) => {
		onSelect(null);
		if (policy !== 'canvas') return;
		// The drag overlay that swallows pointerdown only exists in EDIT mode, so in VIEW mode this
		// handler received every press that landed on widget CONTENT — note text, character stats, a map
		// thumbnail — started a canvas pan and set `userSelect:'none'` on <body>. A DM could therefore
		// never select or copy a note, and an accidental drag while reading threw the whole canvas
		// off-screen. Only a press on the background itself is a pan.
		if (e.target !== e.currentTarget) return;
		dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty };
		document.body.style.userSelect = 'none';
	};

	useEffect(() => {
		const move = (e: PointerEvent) => {
			const d = dragRef.current;
			if (!d) return;
			if (d.mode === 'pan') {
				setView((v) => ({ ...v, tx: d.tx + (e.clientX - d.sx), ty: d.ty + (e.clientY - d.sy) }));
				return;
			}
			const dx = (e.clientX - d.sx) / scale;
			const dy = (e.clientY - d.sy) / scale;
			if (d.mode === 'move') {
				setPosDraft((prev) => ({
					...prev,
					[d.id]: {
						x: Math.max(0, snapTo(d.ox + dx, snap)),
						y: Math.max(0, snapTo(d.oy + dy, snap)),
					},
				}));
			} else {
				setSizeDraft((prev) => ({
					...prev,
					[d.id]: {
						w: Math.max(180, snapTo(d.ow + dx, snap)),
						h: Math.max(120, snapTo(d.oh + dy, snap)),
					},
				}));
			}
		};
		const up = () => {
			const d = dragRef.current;
			dragRef.current = null;
			document.body.style.userSelect = '';
			if (!d) return;
			if (d.mode === 'move') {
				const p = posDraftRef.current[d.id];
				if (p) void onMove(d.id, p.x, p.y);
			} else if (d.mode === 'resize') {
				const s = sizeDraftRef.current[d.id];
				if (s) void onResize(d.id, s.w, s.h);
			}
		};
		// `pointerup` was the ONLY terminator. When the browser takes the gesture over — which the
		// phone board invites, since it sets `touch-action:'pan-y'` so a vertical swipe scrolls —
		// it fires `pointercancel` instead, and the drag never ended: `dragRef` stayed set and
		// `document.body.style.userSelect` stayed pinned to `'none'` app-wide. Cancel abandons the
		// gesture WITHOUT dispatching; the drafts are dropped so the widget snaps back to its
		// durable position rather than committing a move the DM never asked for.
		const cancel = () => {
			const d = dragRef.current;
			dragRef.current = null;
			document.body.style.userSelect = '';
			if (!d || d.mode === 'pan') return;
			if (d.mode === 'move') setPosDraft((prev) => omitKey(prev, d.id));
			else setSizeDraft((prev) => omitKey(prev, d.id));
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', cancel);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
			window.removeEventListener('pointercancel', cancel);
		};
	}, [scale, snap, onMove, onResize]);

	const onWheel = useCallback(
		(e: React.WheelEvent) => {
			if (policy !== 'canvas') return;
			if (e.ctrlKey || e.metaKey) {
				const r = wrapRef.current?.getBoundingClientRect();
				if (!r) return;
				const cx = e.clientX - r.left;
				const cy = e.clientY - r.top;
				setView((v) => {
					const s1 = clamp(v.scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1), 0.4, 1.8);
					const wx = (cx - v.tx) / v.scale;
					const wy = (cy - v.ty) / v.scale;
					return { tx: cx - wx * s1, ty: cy - wy * s1, scale: s1 };
				});
			} else {
				setView((v) => ({ ...v, tx: v.tx - e.deltaX, ty: v.ty - e.deltaY }));
			}
		},
		[policy],
	);

	const zoom = (factor: number) =>
		setView((v) => {
			const r = wrapRef.current?.getBoundingClientRect();
			const cx = (r?.width ?? 800) / 2;
			const cy = (r?.height ?? 600) / 2;
			const s1 = clamp(v.scale * factor, 0.4, 1.8);
			const wx = (cx - v.tx) / v.scale;
			const wy = (cy - v.ty) / v.scale;
			return { tx: cx - wx * s1, ty: cy - wy * s1, scale: s1 };
		});

	// Keyboard traversal order: the core-computed scene focus order first, then any widget it does
	// not cover (in render order) so every frame stays reachable. Frames keep their RENDER order in
	// the DOM (paint/stacking unchanged) — traversal moves focus by id instead.
	const orderIds = useMemo(() => {
		const present = new Set(widgets.map((w) => w.id));
		const ordered = (focusOrder ?? []).filter((id) => present.has(id));
		const seen = new Set(ordered);
		for (const w of widgets) if (!seen.has(w.id)) ordered.push(w.id);
		return ordered;
	}, [widgets, focusOrder]);

	// Roving tabindex holder: the selection, else the last-focused frame, else the first in order.
	const tabbableId =
		(selectedId && orderIds.includes(selectedId) ? selectedId : null) ??
		(focusedId && orderIds.includes(focusedId) ? focusedId : null) ??
		orderIds[0] ??
		null;

	const frameKeyDown = (e: React.KeyboardEvent, w: BoardWidget) => {
		// Keys on the widget's own controls (Roll/Start buttons) belong to those controls.
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
			// `onRemove` only STAGES a confirm dialog now — the frame does not unmount here. Moving
			// focus to a neighbour at this point meant the Dialog captured the NEIGHBOUR as the element
			// to restore to, so pressing "Keep" silently relocated the keyboard cursor to a widget the
			// user never selected. The Dialog's own focus return lands back on this frame instead, and
			// the host screen owns focus for the confirmed case.
			onRemove(w.id);
			return;
		}
		const delta = ARROW_DELTA[e.key];
		if (!delta) return;
		e.preventDefault();
		if (editing && selectedId === w.id) {
			// One grid step per key press, committed as ONE core op (like a pointer gesture's up).
			const pos = posDraft[w.id] ?? { x: w.x, y: w.y };
			const size = sizeDraft[w.id] ?? { w: w.w, h: w.h };
			if (e.shiftKey) {
				const resizable = canResize ? canResize(w) : w.tier !== 'system';
				if (!resizable) return;
				void onResize(
					w.id,
					Math.max(180, size.w + delta[0] * GRID),
					Math.max(120, size.h + delta[1] * GRID),
				);
			} else {
				void onMove(
					w.id,
					Math.max(0, pos.x + delta[0] * GRID),
					Math.max(0, pos.y + delta[1] * GRID),
				);
			}
			return;
		}
		// Unselected (any mode): arrows walk the scene focus order.
		const dir = delta[0] + delta[1];
		const next = orderIds[orderIds.indexOf(w.id) + dir];
		if (next) frameRefs.current.get(next)?.focus();
	};

	const frames = widgets.map((w) => {
		const pos = posDraft[w.id] ?? { x: w.x, y: w.y };
		const size = sizeDraft[w.id] ?? { w: w.w, h: w.h };
		const selected = editing && selectedId === w.id;
		const resizable = editing && (canResize ? canResize(w) : w.tier !== 'system');
		return (
			<WidgetFrame
				key={w.id}
				w={w}
				x={pos.x}
				y={pos.y}
				width={size.w}
				height={size.h}
				editing={editing}
				selected={selected}
				scale={scale}
				resizable={resizable}
				tabbable={tabbableId === w.id}
				ariaLabel={`${w.title}, ${w.typeLabel} widget, position ${pos.x}, ${pos.y}, size ${size.w} by ${size.h}`}
				onKeyDown={(e) => frameKeyDown(e, w)}
				onFocusIn={() => setFocusedId(w.id)}
				registerRef={(el) => {
					if (el) frameRefs.current.set(w.id, el);
					else frameRefs.current.delete(w.id);
				}}
				onStartMove={(e) => startMove(e, w)}
				onStartResize={(e) => startResize(e, w)}
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
			onWheel={onWheel}
			onPointerDown={onBgDown}
			style={{
				position: 'relative',
				flex: 1,
				minHeight: 0,
				background: 'var(--color-bg)',
				overflowX: 'hidden',
				overflowY: policy === 'bounded' ? 'auto' : 'hidden',
				cursor: policy === 'canvas' ? 'grab' : 'default',
				// The bounded board deliberately overflows vertically. Let a finger pan that scroll
				// region; `none` turns a mobile GM Screen into a desktop-only scrollbar workflow.
				// Free-canvas scenes retain their gesture ownership for drag/pan/zoom interactions.
				touchAction: policy === 'bounded' ? 'pan-y' : 'none',
				borderRadius: 'var(--radius-lg)',
				border: '1px solid var(--color-border)',
			}}
		>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background:
						// Not a literal warm rgba: parchment and high-contrast got an unrequested gold film
						// that no token controlled. color-mix keeps the wash tied to the active accent.
						'radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--color-accent) 7%, transparent), transparent 60%)',
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
						'--scene-board-touch-target': `${48 / scale}px`,
						minWidth: policy === 'bounded' ? boundedExtent.width : '100%',
						height: policy === 'bounded' ? boundedExtent.height : undefined,
					} as CSSProperties
				}
			>
				{editing && (
					<div
						style={{
							position: 'absolute',
							// Under the bounded policy this layer sits inside an `overflow: auto` scroll
							// container, and an absolutely-positioned child still contributes scrollable
							// overflow — so the oversized -2000/6000 sheet ballooned /board's scrollHeight
							// to ~4000px against a real extent of ~550px. Bounded only ever needs to cover
							// its own extent; the roaming sheet stays for the free `canvas` policy.
							...(policy === 'bounded'
								? { inset: 0 }
								: { left: -2000, top: -2000, width: 6000, height: 6000 }),
							backgroundImage: 'radial-gradient(var(--color-border-strong) 1px, transparent 1px)',
							backgroundSize: `${GRID}px ${GRID}px`,
							pointerEvents: 'none',
						}}
					/>
				)}
				{frames}
			</div>

			{policy === 'canvas' && (
				<div
					style={{
						position: 'absolute',
						right: 16,
						bottom: 16,
						display: 'flex',
						alignItems: 'center',
						gap: 2,
						padding: 4,
						borderRadius: 'var(--radius-md)',
						background: 'var(--color-surface-overlay)',
						border: '1px solid var(--color-border-strong)',
						boxShadow: 'var(--shadow-lg)',
					}}
				>
					<ZoomBtn icon="zoom-out" label="Zoom out" onClick={() => zoom(1 / 1.2)} />
					<span
						style={{
							font: 'var(--text-2xs) var(--font-mono)',
							color: 'var(--color-text-secondary)',
							minWidth: 38,
							textAlign: 'center',
						}}
					>
						{Math.round(scale * 100)}%
					</span>
					<ZoomBtn icon="zoom-in" label="Zoom in" onClick={() => zoom(1.2)} />
					<ZoomBtn
						icon="zoom-fit"
						label="Reset view"
						onClick={() => setView({ tx: 32, ty: 32, scale: 1 })}
					/>
				</div>
			)}

			{widgets.length === 0 && (
				<div
					style={{
						position: 'absolute',
						inset: 0,
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 'var(--space-3)',
						pointerEvents: 'none',
						textAlign: 'center',
						padding: 'var(--space-6)',
					}}
				>
					<Icon name="widget" size="xl" color="var(--color-text-tertiary)" />
					<div
						style={{
							font: '700 var(--text-lg) var(--font-display)',
							color: 'var(--color-text-secondary)',
						}}
					>
						{/* The empty state doubles as the LOADING state (widgets.length is 0 while
						 * `command-center.ensure-home` is in flight), so /board's first paint used to read
						 * "An empty scene" over "Preparing your GM Screen…". Let the caller say which it is. */}
						{emptyTitle ?? 'An empty scene'}
					</div>
					<div
						style={{
							font: 'var(--text-sm) var(--font-sans)',
							color: 'var(--color-text-tertiary)',
							maxWidth: 320,
						}}
					>
						{emptyHint ?? 'Press Edit, then add a widget.'}
					</div>
				</div>
			)}
		</div>
	);
}

function ZoomBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			onClick={onClick}
			onPointerDown={(e) => e.stopPropagation()}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: 28,
				height: 28,
				border: 'none',
				borderRadius: 'var(--radius-sm)',
				background: 'transparent',
				color: 'var(--color-text-secondary)',
				cursor: 'pointer',
			}}
		>
			<Icon name={icon} size="sm" />
		</button>
	);
}

interface WidgetFrameProps {
	w: BoardWidget;
	x: number;
	y: number;
	width: number;
	height: number;
	editing: boolean;
	selected: boolean;
	scale: number;
	resizable: boolean;
	/** Roving tabindex: exactly one frame per canvas is tab-reachable (CANVAS-016). */
	tabbable: boolean;
	ariaLabel: string;
	onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
	onFocusIn: () => void;
	registerRef: (el: HTMLDivElement | null) => void;
	onStartMove: (e: React.PointerEvent) => void;
	onStartResize: (e: React.PointerEvent) => void;
	/** VIEW-mode operate dispatch, pre-bound to this widget instance. Absent while editing. */
	onCommand?: WidgetCommandHandler;
}

function WidgetFrame({
	w,
	x,
	y,
	width,
	height,
	editing,
	selected,
	scale,
	resizable,
	tabbable,
	ariaLabel,
	onKeyDown,
	onFocusIn,
	registerRef,
	onStartMove,
	onStartResize,
	onCommand,
}: WidgetFrameProps) {
	const chip = visibilityChip(w.visibility);
	const placeholder = w.status !== 'available';
	return (
		<div
			data-testid={`widget-${w.id}`}
			ref={registerRef}
			role="group"
			aria-label={ariaLabel}
			tabIndex={tabbable ? 0 : -1}
			onKeyDown={onKeyDown}
			onFocus={onFocusIn}
			style={{
				position: 'absolute',
				left: x,
				top: y,
				width,
				height,
				borderRadius: 'var(--radius-md)',
				// `outline`, NOT `box-shadow`: forced-colors mode suppresses box-shadow outright, so
				// the selected widget had NO ring at all in Windows High Contrast — and the only
				// other selection cue, the title chip at `top:-26`, is clipped by the bounded
				// container for top-row widgets. An outline survives and remaps to `Highlight`.
				// Emit the key ONLY when selected. `outline:'none'` is an INLINE style, so it beat the
				// app's global `:focus-visible` rule (styles/tokens/base.css) and left every widget
				// frame with no focus indicator at all — on the one surface whose whole navigation
				// model is a roving tabindex across those frames (CANVAS-016, WCAG 2.4.7).
				...(selected ? { outline: '2px solid var(--color-accent)' } : {}),
				outlineOffset: 2,
				transition: selected ? 'none' : 'outline-color var(--duration-fast) var(--easing-standard)',
			}}
		>
			<div
				style={{
					height: '100%',
					display: 'flex',
					flexDirection: 'column',
					gap: 'var(--space-2)',
					padding: 'var(--space-3)',
					borderRadius: 'var(--radius-md)',
					background: placeholder ? 'var(--color-surface-sunken)' : 'var(--color-surface-raised)',
					border: `1px solid ${placeholder ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
					opacity: placeholder ? 0.85 : 1,
					overflow: 'hidden',
					pointerEvents: editing ? 'none' : 'auto',
				}}
			>
				<div
					style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: '0 0 auto' }}
				>
					<WidgetGlyph icon={w.icon} size="sm" />
					<span
						style={{
							flex: 1,
							minWidth: 0,
							font: '700 var(--text-sm) var(--font-display)',
							color: 'var(--color-text-primary)',
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}
					>
						{w.title}
					</span>
					<span
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 4,
							padding: '2px 7px',
							borderRadius: 'var(--radius-full)',
							background: chip.players
								? 'var(--color-accent-subtle)'
								: 'var(--color-surface-sunken)',
							// `--color-text-tertiary` on `--color-surface-sunken` is 3.54:1 in parchment
							// — under 4.5:1 for this 10px text, and this DM-only/Players chip renders
							// on EVERY widget frame on both /board and /scene/:id. Secondary is
							// 6.28:1 on the same surface.
							color: chip.players ? 'var(--color-accent)' : 'var(--color-text-secondary)',
							font: '600 var(--text-2xs) var(--font-sans)',
							whiteSpace: 'nowrap',
						}}
					>
						<Icon name={chip.players ? 'visibility-players' : 'dm-only'} size={11} />
						{chip.label}
					</span>
				</div>
				<div
					style={{
						font: 'var(--text-2xs) var(--font-sans)',
						letterSpacing: 'var(--tracking-wide)',
						textTransform: 'uppercase',
						color: 'var(--color-text-tertiary)',
						flex: '0 0 auto',
					}}
				>
					{w.typeLabel}
				</div>
				<div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
					<WidgetBody widget={w} onCommand={onCommand} />
				</div>
				{w.statusNote && (
					<div
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 5,
							font: '600 var(--text-2xs) var(--font-sans)',
							color: 'var(--color-status-warning-text)',
							flex: '0 0 auto',
						}}
					>
						<Icon name="warning" size={12} />
						{w.statusNote}
					</div>
				)}
			</div>

			{editing && (
				<div
					onPointerDown={onStartMove}
					style={{
						position: 'absolute',
						inset: 0,
						borderRadius: 'var(--radius-md)',
						cursor: 'grab',
					}}
				/>
			)}

			{selected && (
				<>
					<div
						style={{
							position: 'absolute',
							top: -26,
							left: 0,
							display: 'inline-flex',
							alignItems: 'center',
							gap: 5,
							padding: '2px 7px',
							borderRadius: 'var(--radius-sm)',
							background: 'var(--color-accent)',
							color: 'var(--color-accent-foreground)',
							font: '600 var(--text-2xs) var(--font-sans)',
							whiteSpace: 'nowrap',
							pointerEvents: 'none',
							transform: `scale(${1 / scale})`,
							transformOrigin: 'bottom left',
						}}
					>
						<Icon name={resizable ? 'move' : 'lock'} size={11} />
						{w.title}
						<span style={{ opacity: 0.85, fontWeight: 500 }}>· {TIER_LABEL[w.tier]}</span>
					</div>
					{resizable && (
						<div
							onPointerDown={onStartResize}
							style={{
								position: 'absolute',
								right: -5,
								bottom: -5,
								width: 14,
								height: 14,
								borderRadius: 4,
								background: 'var(--color-accent)',
								border: '2px solid var(--color-bg)',
								cursor: 'nwse-resize',
								transform: `scale(${1 / scale})`,
								transformOrigin: 'bottom right',
							}}
						/>
					)}
				</>
			)}
		</div>
	);
}
