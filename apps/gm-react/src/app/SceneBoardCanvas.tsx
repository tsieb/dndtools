import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../ds';
import { TIER_LABEL, visibilityChip, type BoardWidget } from './board-helpers';
import { WidgetBody } from './widget-bodies';

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
 */

const GRID = 20;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const snapTo = (n: number, snap: boolean) => (snap ? Math.round(n / GRID) * GRID : Math.round(n));

// Widget definition icons are EITHER a semantic registry key ('map', 'dice', …) OR an emoji glyph
// (the core's system widgets ship emoji: ⏱ 🎲 📝 🗺 …). Registry keys are kebab-ascii; anything else
// is rendered as its own emoji — which is the design's actual chosen glyph, so more faithful than
// forcing it through Lucide.
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
	emptyHint?: string;
}

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
	emptyHint,
}: SceneBoardCanvasProps) {
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const dragRef = useRef<Drag | null>(null);
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

	const scale = policy === 'canvas' ? view.scale : 1;
	const tx = policy === 'canvas' ? view.tx : 0;
	const ty = policy === 'canvas' ? view.ty : 0;

	const startMove = (e: React.PointerEvent, w: BoardWidget) => {
		e.stopPropagation();
		onSelect(w.id);
		if (!editing) return;
		const cur = posDraft[w.id] ?? { x: w.x, y: w.y };
		dragRef.current = { mode: 'move', id: w.id, sx: e.clientX, sy: e.clientY, ox: cur.x, oy: cur.y };
		document.body.style.userSelect = 'none';
	};
	const startResize = (e: React.PointerEvent, w: BoardWidget) => {
		e.stopPropagation();
		const cur = sizeDraft[w.id] ?? { w: w.w, h: w.h };
		dragRef.current = { mode: 'resize', id: w.id, sx: e.clientX, sy: e.clientY, ow: cur.w, oh: cur.h };
		document.body.style.userSelect = 'none';
	};
	const onBgDown = (e: React.PointerEvent) => {
		onSelect(null);
		if (policy !== 'canvas') return;
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
					[d.id]: { x: Math.max(0, snapTo(d.ox + dx, snap)), y: Math.max(0, snapTo(d.oy + dy, snap)) },
				}));
			} else {
				setSizeDraft((prev) => ({
					...prev,
					[d.id]: { w: Math.max(180, snapTo(d.ow + dx, snap)), h: Math.max(120, snapTo(d.oh + dy, snap)) },
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
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
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
				onStartMove={(e) => startMove(e, w)}
				onStartResize={(e) => startResize(e, w)}
			/>
		);
	});

	return (
		<div
			ref={wrapRef}
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
				touchAction: 'none',
				borderRadius: 'var(--radius-lg)',
				border: '1px solid var(--color-border)',
			}}
		>
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background: 'radial-gradient(120% 80% at 50% -10%, rgba(224,176,111,.07), transparent 60%)',
					pointerEvents: 'none',
				}}
			/>
			<div
				style={{
					position: 'absolute',
					left: 0,
					top: 0,
					transformOrigin: '0 0',
					transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
					minWidth: '100%',
				}}
			>
				{editing && (
					<div
						style={{
							position: 'absolute',
							left: -2000,
							top: -2000,
							width: 6000,
							height: 6000,
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
					<ZoomBtn icon="zoom-fit" label="Reset view" onClick={() => setView({ tx: 32, ty: 32, scale: 1 })} />
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
					<div style={{ font: '700 var(--text-lg) var(--font-display)', color: 'var(--color-text-secondary)' }}>
						An empty scene
					</div>
					<div style={{ font: 'var(--text-sm) var(--font-sans)', color: 'var(--color-text-tertiary)', maxWidth: 320 }}>
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
	onStartMove: (e: React.PointerEvent) => void;
	onStartResize: (e: React.PointerEvent) => void;
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
	onStartMove,
	onStartResize,
}: WidgetFrameProps) {
	const chip = visibilityChip(w.visibility);
	const placeholder = w.status !== 'available';
	return (
		<div
			data-testid={`widget-${w.id}`}
			style={{
				position: 'absolute',
				left: x,
				top: y,
				width,
				height,
				borderRadius: 'var(--radius-md)',
				boxShadow: selected ? '0 0 0 2px var(--color-accent)' : 'none',
				transition: selected ? 'none' : 'box-shadow var(--duration-fast) var(--easing-standard)',
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
				<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: '0 0 auto' }}>
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
							background: chip.players ? 'var(--color-accent-subtle)' : 'var(--color-surface-sunken)',
							color: chip.players ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
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
					<WidgetBody widget={w} />
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
