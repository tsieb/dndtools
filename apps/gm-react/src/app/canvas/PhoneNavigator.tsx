import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
	type RefObject,
	type TouchEvent as ReactTouchEvent,
} from 'react';
import { Button, IconButton, Sheet } from '../../ds';
import { useI18n } from '../../i18n';
import type { BoardWidget } from '../board-helpers';
import { ZOOM_PRESETS, type SceneBoardCanvasProps, type ZoomPreset } from '../SceneBoardModel';
import { tileMetadataForWidget } from '../widgets/tileMeta';
import { WidgetRenderSlot } from '../widgets/WidgetRenderSlot';
import { extentOf } from './geometry';
import { stackOrder, type StackedPosture } from './StackedBoard';
import { WidgetGlyph } from './WidgetFrame';

/**
 * PhoneNavigator — RC-CAN-5.4, moving around a canvas screen on a phone.
 *
 * A phone opens a canvas screen as the RC-CAN-5.1 panel list. `PhoneViewSwitch` offers the other
 * reading, Layout: the spatial arrangement, drawn so that nothing on it is too small to read.
 *
 * - Layout never paints tile text under 12px. Comfortable (1×) and Detail (1.5×) are the real
 *   bounded canvas (`SceneBoardCanvas`, passed in as `children`), so every tile still operates and
 *   configures exactly as it does on a desktop. Fit is an overview this component draws itself: each
 *   tile at its fitted place, carrying its title at its natural size and no body, one tap from full
 *   screen. `PHONE_TEXT_FLOOR` lifts the 10px `--text-2xs` step to 12px for the whole phone board.
 * - One finger pans both axes natively, momentum included: the canvas and the overview are real
 *   scroll containers with `touch-action: pan-x pan-y`, which also keeps the browser from
 *   pinch-zooming the page. A two-finger pinch instead steps Fit ↔ Comfortable ↔ Detail — the named
 *   steps, never a free percentage — and keeps the point between the fingers where it was.
 * - Edge fades show which sides have more board past them.
 * - Under the layout, a minimap (tap to jump there) and "Jump to tile", a sheet listing every tile
 *   with Go to and Full screen. The minimap is a pointer shortcut and is hidden from assistive
 *   technology; the sheet is the path that works for everyone.
 * - A full-screen tile fills this component's box. AppShell bounds `<main>` above the phone tab bar,
 *   so the bottom navigation stays in view, and the host hides its toolbar meanwhile
 *   (`onFullScreenChange`). The canvas stays mounted underneath, hidden, so nothing loses its place.
 * - Edit mode stays the plain canvas (never at Fit — see `phoneZoomSteps`): arranging is spatial,
 *   and the reading aids here would sit on top of it.
 */

/** Lifts the 10px `--text-2xs` step to the 12px `--text-xs` for everything under a phone board. */
export const PHONE_TEXT_FLOOR = { '--text-2xs': 'var(--text-xs)' } as CSSProperties;

/** The steps a phone can show: all three reading the Layout, never Fit while arranging tiles. */
const EDIT_STEPS: readonly ZoomPreset[] = ['comfortable', 'detail'];

/**
 * Which step the canvas paints and which ones the toolbar offers. On a phone Fit is the overview
 * (drawn by PhoneNavigator, not the canvas), so the canvas itself is never asked to paint at Fit.
 */
export function phoneZoomSteps(phone: boolean, editing: boolean, zoom: ZoomPreset) {
	if (!phone) return { canvas: zoom, pressed: zoom, presets: ZOOM_PRESETS };
	const legible = zoom === 'fit' ? 'comfortable' : zoom;
	return editing
		? { canvas: legible, pressed: legible, presets: EDIT_STEPS }
		: { canvas: legible, pressed: zoom, presets: ZOOM_PRESETS };
}

/** The phone toolbar's List | Layout pair (the CAN-5.1 posture and its device preference). */
export function PhoneViewSwitch({ posture }: { posture: StackedPosture }) {
	const { t } = useI18n();
	if (!posture.available) return null;
	return (
		<div role="group" aria-label={t('phoneNavigator.viewGroup')} style={SWITCH}>
			{([true, false] as const).map((list) => (
				<Button
					key={String(list)}
					variant={posture.stacked === list ? 'secondary' : 'ghost'}
					size="sm"
					icon={list ? 'layout-list' : 'minimap'}
					aria-pressed={posture.stacked === list}
					onClick={() => posture.setStacked(list)}
				>
					{t(list ? 'phoneNavigator.list' : 'phoneNavigator.layout')}
				</Button>
			))}
		</div>
	);
}

export interface PhoneNavigatorProps {
	/** The phone tier. Anywhere else the canvas renders on its own. */
	active: boolean;
	/** Edit mode: keep the canvas, drop the reading aids. */
	editing: boolean;
	widgets: BoardWidget[];
	zoom: ZoomPreset;
	onZoom: (preset: ZoomPreset) => void;
	onWidgetCommand?: SceneBoardCanvasProps['onWidgetCommand'];
	onFullScreenChange?: (fullScreen: boolean) => void;
	/** The bounded `SceneBoardCanvas`, drawn at Comfortable and Detail. */
	children: ReactNode;
}

/** Overview inset, so a tile at the board's origin does not touch the frame. */
const PAD = 8;
/** A pinch has to open or close this far (ratio of finger spread) to take one step. */
const PINCH_STEP = 1.25;
const MINI = { width: 112, height: 64 };

type Metrics = Record<'left' | 'top' | 'width' | 'height' | 'scrollWidth' | 'scrollHeight', number>;

function readMetrics(el: HTMLElement): Metrics {
	return {
		left: el.scrollLeft,
		top: el.scrollTop,
		width: el.clientWidth,
		height: el.clientHeight,
		scrollWidth: el.scrollWidth,
		scrollHeight: el.scrollHeight,
	};
}

/** Scroll at once: the view has to be where the finger or the list put it before focus moves. */
const place = (el: HTMLElement, left: number, top: number) =>
	el.scrollTo({ left, top, behavior: 'instant' });

const sameMetrics = (a: Metrics | null, b: Metrics) =>
	!!a && (Object.keys(b) as (keyof Metrics)[]).every((key) => a[key] === b[key]);

function spread(touches: TouchList | ReactTouchEvent['touches']) {
	const [a, b] = [touches[0], touches[1]];
	return {
		distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
		x: (a.clientX + b.clientX) / 2,
		y: (a.clientY + b.clientY) / 2,
	};
}

export function PhoneNavigator(props: PhoneNavigatorProps) {
	if (!props.active) return <>{props.children}</>;
	return <PhoneLayout {...props} />;
}

function PhoneLayout({
	editing,
	widgets,
	zoom,
	onZoom,
	onWidgetCommand,
	onFullScreenChange,
	children,
}: PhoneNavigatorProps) {
	const { t } = useI18n();
	const aids = !editing;
	const overview = aids && zoom === 'fit';
	const stageRef = useRef<HTMLDivElement>(null);
	const overviewRef = useRef<HTMLDivElement>(null);
	const [stageWidth, setStageWidth] = useState(0);
	const [metrics, setMetrics] = useState<Metrics | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [fullId, setFullId] = useState<string | null>(null);
	const pendingJump = useRef<string | null>(null);
	const anchor = useRef<{ fx: number; fy: number; ox: number; oy: number } | null>(null);
	const ordered = useMemo(() => stackOrder(widgets), [widgets]);
	const extent = useMemo(() => extentOf(widgets), [widgets]);
	const full = aids ? (ordered.find((w) => w.id === fullId) ?? null) : null;

	/** The element that scrolls right now: the overview at Fit, else the canvas's own wrap. */
	const scroller = useCallback(
		(): HTMLElement | null =>
			overview
				? overviewRef.current
				: (stageRef.current?.querySelector<HTMLElement>('[data-testid^="scene-board-"]') ?? null),
		[overview],
	);

	useEffect(() => {
		const stage = stageRef.current;
		if (!stage) return;
		const observer = new ResizeObserver(() => setStageWidth(stage.clientWidth));
		setStageWidth(stage.clientWidth);
		observer.observe(stage);
		return () => observer.disconnect();
	}, []);

	// Scroll position and extent feed the edge fades and the minimap's viewport box. The canvas sizes
	// its content in its own effects, so read once more on the next frame as well.
	useEffect(() => {
		const el = scroller();
		if (!el || !aids) return;
		const update = () => {
			const next = readMetrics(el);
			setMetrics((prev) => (sameMetrics(prev, next) ? prev : next));
		};
		update();
		const frame = requestAnimationFrame(update);
		el.addEventListener('scroll', update, { passive: true });
		const observer = new ResizeObserver(update);
		observer.observe(el);
		return () => {
			cancelAnimationFrame(frame);
			el.removeEventListener('scroll', update);
			observer.disconnect();
		};
	}, [scroller, aids, zoom, widgets, stageWidth, full]);

	// A pinch keeps the board point between the fingers where it was, across the step it takes.
	useEffect(() => {
		const pin = anchor.current;
		if (!pin) return;
		const frame = requestAnimationFrame(() => {
			anchor.current = null;
			const el = scroller();
			if (!el) return;
			place(el, pin.fx * el.scrollWidth - pin.ox, pin.fy * el.scrollHeight - pin.oy);
		});
		return () => cancelAnimationFrame(frame);
	}, [zoom, scroller]);

	useEffect(() => {
		onFullScreenChange?.(full !== null);
	}, [full, onFullScreenChange]);
	useEffect(() => () => onFullScreenChange?.(false), [onFullScreenChange]);

	/** Bring a tile into the middle of the layout (its top-left when it is bigger than the view). */
	const reveal = useCallback(
		(id: string) => {
			const el = scroller();
			const prefix = overview ? 'phone-overview-' : 'widget-';
			const target = stageRef.current?.querySelector<HTMLElement>(
				`[data-testid="${prefix}${CSS.escape(id)}"]`,
			);
			if (!el || !target) return;
			const view = el.getBoundingClientRect();
			const box = target.getBoundingClientRect();
			place(
				el,
				el.scrollLeft + box.left - view.left - Math.max(PAD, (view.width - box.width) / 2),
				el.scrollTop + box.top - view.top - Math.max(PAD, (view.height - box.height) / 2),
			);
			target.focus({ preventScroll: true });
		},
		[scroller, overview],
	);

	// "Go to" closes the sheet first; the sheet hands focus back to its opener as it unmounts, and
	// only then can the tile (inert behind the modal until now) take focus. Leaving full screen lands
	// on the same tile in the layout, the way it went in.
	useEffect(() => {
		const id = pendingJump.current;
		if (sheetOpen || full || id === null) return;
		pendingJump.current = null;
		const frame = requestAnimationFrame(() => reveal(id));
		return () => cancelAnimationFrame(frame);
	}, [sheetOpen, full, reveal]);

	function step(direction: 1 | -1, at: { x: number; y: number }) {
		const index = ZOOM_PRESETS.indexOf(zoom) + direction;
		const next = ZOOM_PRESETS[index];
		if (!next) return;
		const el = scroller();
		if (el) {
			const view = el.getBoundingClientRect();
			const ox = at.x - view.left;
			const oy = at.y - view.top;
			anchor.current = {
				fx: (el.scrollLeft + ox) / Math.max(1, el.scrollWidth),
				fy: (el.scrollTop + oy) / Math.max(1, el.scrollHeight),
				ox,
				oy,
			};
		}
		onZoom(next);
	}
	const stepRef = useRef(step);
	stepRef.current = step;

	// A step can swap the canvas for the overview mid-gesture. The rest of that gesture's touch events
	// still go to the elements the fingers started on, detached or not, but no longer bubble up to
	// here or to the window, so the listeners sit on those targets and the next pinch clears them.
	const endPinch = useRef<() => void>(() => {});
	useEffect(() => () => endPinch.current(), []);
	function onTouchStart(e: ReactTouchEvent) {
		if (!aids || e.touches.length !== 2) return;
		endPinch.current();
		let base = spread(e.touches).distance;
		const targets = new Set([e.touches[0].target, e.touches[1].target]);
		const move = (event: Event) => {
			const touches = (event as TouchEvent).touches;
			if (touches.length !== 2 || base <= 0) return;
			const now = spread(touches);
			const ratio = now.distance / base;
			if (ratio >= PINCH_STEP || ratio <= 1 / PINCH_STEP) {
				stepRef.current(ratio > 1 ? 1 : -1, now);
				base = now.distance;
			}
		};
		const end = (event: Event) => {
			if ((event as TouchEvent).touches.length < 2) endPinch.current();
		};
		const listen = (on: boolean) => {
			for (const target of targets) {
				const method = on ? target.addEventListener : target.removeEventListener;
				method.call(target, 'touchmove', move, { passive: true });
				method.call(target, 'touchend', end);
				method.call(target, 'touchcancel', end);
			}
		};
		listen(true);
		endPinch.current = () => {
			listen(false);
			endPinch.current = () => {};
		};
	}

	function jumpTo(id: string) {
		pendingJump.current = id;
		setSheetOpen(false);
	}
	function openFull(id: string) {
		setSheetOpen(false);
		setFullId(id);
	}
	function closeFull() {
		pendingJump.current = fullId;
		setFullId(null);
	}

	const fades = aids && metrics && !full ? edgesOf(metrics) : null;

	return (
		<div data-testid="phone-navigator" style={ROOT}>
			<div
				ref={stageRef}
				data-testid="phone-layout-stage"
				onTouchStart={onTouchStart}
				style={{ ...STAGE, display: full ? 'none' : 'flex' }}
			>
				{overview ? (
					<Overview
						scrollRef={overviewRef}
						widgets={ordered}
						extent={extent}
						width={stageWidth}
						onOpen={openFull}
					/>
				) : (
					children
				)}
				{fades &&
					(Object.keys(fades) as Edge[])
						.filter((edge) => fades[edge])
						.map((edge) => (
							<span
								key={edge}
								aria-hidden="true"
								data-testid={`phone-edge-fade-${edge}`}
								style={FADE[edge]}
							/>
						))}
			</div>
			{aids && !full && (
				<div data-testid="phone-navigator-bar" style={BAR}>
					<Minimap
						widgets={ordered}
						extent={extent}
						metrics={metrics}
						onJump={(fx, fy) => {
							const el = scroller();
							if (el)
								place(
									el,
									fx * el.scrollWidth - el.clientWidth / 2,
									fy * el.scrollHeight - el.clientHeight / 2,
								);
						}}
					/>
					<Button
						variant="secondary"
						size="sm"
						icon="search"
						aria-haspopup="dialog"
						aria-expanded={sheetOpen}
						data-testid="phone-jump-open"
						onClick={() => setSheetOpen(true)}
					>
						{t('phoneNavigator.jump')}
					</Button>
				</div>
			)}
			{full && (
				<FullScreenTile
					widget={full}
					onClose={closeFull}
					onCommand={
						onWidgetCommand
							? (commandType, payload) => onWidgetCommand(full.id, commandType, payload)
							: undefined
					}
				/>
			)}
			<Sheet
				open={sheetOpen}
				onClose={() => setSheetOpen(false)}
				title={t('phoneNavigator.jump')}
				description={t('phoneNavigator.jumpHint')}
				size="min(560px, 80vh)"
				data-testid="phone-jump-sheet"
			>
				<ul style={JUMP_LIST}>
					{ordered.map((w) => (
						<li key={w.id} style={JUMP_ROW}>
							<Button
								variant="ghost"
								size="md"
								data-testid={`phone-jump-${w.id}`}
								aria-label={t('phoneNavigator.goTo', { name: w.title })}
								onClick={() => jumpTo(w.id)}
								style={JUMP_BUTTON}
							>
								<WidgetGlyph
									icon={tileMetadataForWidget(w).icon}
									size={16}
									color={`var(${tileMetadataForWidget(w).accentToken})`}
								/>
								<span style={JUMP_TITLE}>{w.title}</span>
								<span style={JUMP_TYPE}>{w.typeLabel}</span>
							</Button>
							<IconButton
								icon="maximize-2"
								label={t('atlas.expandMap', { name: w.title })}
								variant="ghost"
								data-testid={`phone-jump-full-${w.id}`}
								onClick={() => openFull(w.id)}
								style={TOUCH_TARGET}
							/>
						</li>
					))}
				</ul>
			</Sheet>
		</div>
	);
}

type Edge = 'left' | 'right' | 'top' | 'bottom';

function edgesOf(m: Metrics): Record<Edge, boolean> {
	return {
		left: m.left > 1,
		right: m.left + m.width < m.scrollWidth - 1,
		top: m.top > 1,
		bottom: m.top + m.height < m.scrollHeight - 1,
	};
}

/** Fit on a phone: every tile at its fitted place, titled at a readable size, no body. */
function Overview({
	scrollRef,
	widgets,
	extent,
	width,
	onOpen,
}: {
	scrollRef: RefObject<HTMLDivElement>;
	widgets: BoardWidget[];
	extent: { width: number; height: number };
	width: number;
	onOpen: (id: string) => void;
}) {
	const { t } = useI18n();
	const scale = Math.min(1, Math.max(0.05, (width - 2 * PAD - 2) / extent.width));
	return (
		<div
			ref={scrollRef}
			role="group"
			aria-label={t('phoneNavigator.overview')}
			data-testid="phone-layout-overview"
			style={OVERVIEW}
		>
			<div
				style={{
					position: 'relative',
					width: extent.width * scale + 2 * PAD,
					height: extent.height * scale + 2 * PAD,
				}}
			>
				{widgets.map((w) => {
					const meta = tileMetadataForWidget(w);
					return (
						<button
							key={w.id}
							type="button"
							data-testid={`phone-overview-${w.id}`}
							aria-label={t('atlas.expandMap', { name: w.title })}
							onClick={() => onOpen(w.id)}
							style={{
								...OVERVIEW_TILE,
								left: PAD + w.x * scale,
								top: PAD + w.y * scale,
								width: w.w * scale,
								height: w.h * scale,
								borderInlineStart: `4px solid var(${meta.accentToken})`,
							}}
						>
							<WidgetGlyph icon={meta.icon} size={14} color={`var(${meta.accentToken})`} />
							<span style={OVERVIEW_TITLE}>{w.title}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}

/** The whole board in a thumbnail, with the part in view outlined. Tap to centre the view there. */
function Minimap({
	widgets,
	extent,
	metrics,
	onJump,
}: {
	widgets: BoardWidget[];
	extent: { width: number; height: number };
	metrics: Metrics | null;
	onJump: (fx: number, fy: number) => void;
}) {
	const scale = Math.min(MINI.width / extent.width, MINI.height / extent.height);
	const width = extent.width * scale;
	const height = extent.height * scale;
	const view = metrics && {
		left: (metrics.left / metrics.scrollWidth) * width,
		top: (metrics.top / metrics.scrollHeight) * height,
		width: Math.min(1, metrics.width / metrics.scrollWidth) * width,
		height: Math.min(1, metrics.height / metrics.scrollHeight) * height,
	};
	return (
		<div
			aria-hidden="true"
			data-testid="phone-minimap"
			onClick={(e) => {
				const box = e.currentTarget.getBoundingClientRect();
				onJump((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
			}}
			style={{ ...MINIMAP, width, height }}
		>
			{widgets.map((w) => (
				<span
					key={w.id}
					style={{
						...MINI_TILE,
						left: w.x * scale,
						top: w.y * scale,
						width: Math.max(2, w.w * scale),
						height: Math.max(2, w.h * scale),
					}}
				/>
			))}
			{view && <span data-testid="phone-minimap-view" style={{ ...MINI_VIEW, ...view }} />}
		</div>
	);
}

/** One tile filling the navigator's box — above the tab bar, which AppShell keeps outside `<main>`. */
function FullScreenTile({
	widget: w,
	onClose,
	onCommand,
}: {
	widget: BoardWidget;
	onClose: () => void;
	onCommand?: Parameters<typeof WidgetRenderSlot>[0]['onCommand'];
}) {
	const { t } = useI18n();
	const headingId = useId();
	const rootRef = useRef<HTMLDivElement>(null);
	const meta = tileMetadataForWidget(w);
	// Its opener (a sheet row, an overview tile) is gone or hidden now, so focus starts on the way out.
	useEffect(() => {
		rootRef.current
			?.querySelector<HTMLElement>('[data-testid="phone-fullscreen-close"]')
			?.focus({ preventScroll: true });
	}, [w.id]);
	return (
		<div
			ref={rootRef}
			role="group"
			aria-labelledby={headingId}
			data-testid="phone-fullscreen"
			data-fullscreen-tile={w.id}
			className={meta.silhouetteClass}
			onKeyDown={(e) => {
				if (e.key !== 'Escape' || e.defaultPrevented) return;
				e.preventDefault();
				onClose();
			}}
			style={{ ...FULL, borderInlineStart: `4px solid var(${meta.accentToken})` }}
		>
			<div style={FULL_HEADER}>
				<WidgetGlyph icon={meta.icon} size={16} color={`var(${meta.accentToken})`} />
				<h2 id={headingId} style={FULL_TITLE}>
					{w.title}
				</h2>
				<IconButton
					icon="minimize-2"
					label={t('atlas.collapseMap', { name: w.title })}
					variant="ghost"
					data-testid="phone-fullscreen-close"
					onClick={onClose}
					style={TOUCH_TARGET}
				/>
			</div>
			<div style={FULL_BODY}>
				<WidgetRenderSlot widget={w} onCommand={onCommand} />
			</div>
		</div>
	);
}

const STAGE: CSSProperties = { flex: 1, minWidth: 0, minHeight: 0, position: 'relative' };
const ROOT: CSSProperties = { ...STAGE, display: 'flex', flexDirection: 'column' };

const SWITCH: CSSProperties = {
	display: 'flex',
	flexWrap: 'wrap',
	gap: 'var(--space-0-5)',
	flex: '0 1 auto',
	minWidth: 0,
};

const OVERVIEW: CSSProperties = {
	flex: 1,
	minWidth: 0,
	minHeight: 0,
	overflow: 'auto',
	overscrollBehavior: 'contain',
	touchAction: 'pan-x pan-y',
	background: 'var(--color-bg)',
	border: '1px solid var(--color-border)',
	borderRadius: 'var(--radius-lg)',
};

const OVERVIEW_TILE: CSSProperties = {
	position: 'absolute',
	boxSizing: 'border-box',
	minWidth: 'var(--space-6)',
	minHeight: 'var(--space-6)',
	display: 'flex',
	alignItems: 'flex-start',
	gap: 'var(--space-1)',
	padding: 'var(--space-1)',
	overflow: 'hidden',
	background: 'var(--color-surface-raised)',
	border: '1px solid var(--color-border)',
	borderRadius: 'var(--radius-sm)',
	color: 'var(--color-text-primary)',
	font: '600 var(--text-xs) var(--font-sans)',
	textAlign: 'start',
	cursor: 'pointer',
};

const OVERVIEW_TITLE: CSSProperties = {
	minWidth: 0,
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
};

const fade = (edge: Edge): CSSProperties => {
	const across = edge === 'left' || edge === 'right';
	return {
		position: 'absolute',
		pointerEvents: 'none',
		[edge]: 0,
		...(across
			? { top: 0, bottom: 0, width: 'var(--space-6)' }
			: { left: 0, right: 0, height: 'var(--space-6)' }),
		background: `linear-gradient(to ${{ left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[edge]}, color-mix(in srgb, var(--color-text-primary) 22%, transparent), transparent)`,
	};
};

const FADE = Object.fromEntries(
	(['left', 'right', 'top', 'bottom'] as const).map((edge) => [edge, fade(edge)]),
) as Record<Edge, CSSProperties>;

const BAR: CSSProperties = {
	flex: '0 0 auto',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'space-between',
	gap: 'var(--space-2)',
	paddingTop: 'var(--space-2)',
};

const MINIMAP: CSSProperties = {
	position: 'relative',
	flex: '0 0 auto',
	boxSizing: 'content-box',
	background: 'var(--color-surface-sunken)',
	border: '1px solid var(--color-border-strong)',
	borderRadius: 'var(--radius-sm)',
	overflow: 'hidden',
	cursor: 'pointer',
	touchAction: 'manipulation',
};

const MINI_TILE: CSSProperties = {
	position: 'absolute',
	boxSizing: 'border-box',
	background: 'var(--color-surface-raised)',
	border: '1px solid var(--color-border-strong)',
};

const MINI_VIEW: CSSProperties = {
	position: 'absolute',
	boxSizing: 'border-box',
	border: '2px solid var(--color-accent)',
	pointerEvents: 'none',
};

const JUMP_LIST: CSSProperties = {
	listStyle: 'none',
	margin: 'var(--space-0)',
	padding: 'var(--space-0)',
	display: 'flex',
	flexDirection: 'column',
	gap: 'var(--space-1)',
};

const JUMP_ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--space-1)' };

const JUMP_BUTTON: CSSProperties = {
	flex: '1 1 auto',
	minWidth: 0,
	justifyContent: 'flex-start',
	textAlign: 'start',
};

const JUMP_TITLE: CSSProperties = {
	minWidth: 0,
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
	color: 'var(--color-text-primary)',
};

const JUMP_TYPE: CSSProperties = {
	flex: '0 0 auto',
	marginInlineStart: 'auto',
	font: 'var(--text-xs) var(--font-sans)',
	color: 'var(--color-text-secondary)',
};

// The design package's touch floor on the phone tier (44px there, via the density lock).
const TOUCH_TARGET: CSSProperties = {
	width: 'var(--density-touch-target)',
	height: 'var(--density-touch-target)',
	flex: '0 0 auto',
};

const FULL: CSSProperties = {
	flex: 1,
	minHeight: 0,
	display: 'flex',
	flexDirection: 'column',
	boxSizing: 'border-box',
	background: 'var(--color-surface-raised)',
	border: '1px solid var(--color-border)',
	borderRadius: 'var(--radius-md)',
};

const FULL_HEADER: CSSProperties = {
	flex: '0 0 auto',
	display: 'flex',
	alignItems: 'center',
	gap: 'var(--space-2)',
	minHeight: 'var(--space-12)',
	paddingInline: 'var(--space-3) var(--space-1)',
	borderBottom: '1px solid var(--color-border)',
};

const FULL_TITLE: CSSProperties = {
	flex: '1 1 auto',
	minWidth: 0,
	margin: 'var(--space-0)',
	font: '700 var(--text-sm) var(--font-sans)',
	color: 'var(--color-text-primary)',
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
};

const FULL_BODY: CSSProperties = {
	flex: '1 1 auto',
	minHeight: 0,
	overflow: 'auto',
	padding: 'var(--space-2) var(--space-3) var(--space-3)',
};
