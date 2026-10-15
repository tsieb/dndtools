import {
	cloneElement,
	isValidElement,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
	type TouchEvent as ReactTouchEvent,
} from 'react';
import { Button, IconButton, Sheet } from '../../ds';
import { useI18n } from '../../i18n';
import type { BoardWidget } from '../board-helpers';
import { ZOOM_PRESETS, type SceneBoardCanvasProps, type ZoomPreset } from '../SceneBoardModel';
import { tileMetadataForWidget } from '../widgets/tileMeta';

import { extentOf } from './geometry';
import { TileSizePresets, stackOrder, type StackedPosture } from './StackedBoard';
import { FitTextFloor, PhoneEditLoupe, useAfterTapClick } from './ZoomCluster';
import { WidgetGlyph } from './frameParts';
import {
	PAD,
	type Metrics,
	type Edge,
	edgesOf,
	Overview,
	Minimap,
	FullScreenTile,
	STAGE,
	ROOT,
	SWITCH,
	FADE,
	BAR,
	JUMP_LIST,
	JUMP_ROW,
	JUMP_BUTTON,
	JUMP_TITLE,
	JUMP_TYPE,
	TOUCH_TARGET,
} from './phoneParts';
export const PHONE_TEXT_FLOOR = { '--text-2xs': 'var(--text-xs)' } as CSSProperties;
export { phoneZoomSteps } from './ZoomCluster';
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
	active: boolean;
	onMove?: SceneBoardCanvasProps['onMove'];
	onResize?: SceneBoardCanvasProps['onResize'];
	editing: boolean;
	widgets: BoardWidget[];
	zoom: ZoomPreset;
	onZoom: (preset: ZoomPreset) => void;
	onWidgetCommand?: SceneBoardCanvasProps['onWidgetCommand'];
	onFullScreenChange?: (fullScreen: boolean) => void;
	/** Cleared when the loupe opens: it is the phone's editor for a touched tile. */
	onSelect?: (id: string | null) => void;
	children: ReactNode;
}
const PINCH_STEP = 1.25;
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
	if (!props.active)
		return (
			<div
				className="board-fit-floor"
				style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0 }}
			>
				<FitTextFloor />
				{props.children}
			</div>
		);
	return <PhoneLayout {...props} />;
}
function PhoneLayout({
	editing,
	widgets,
	zoom,
	onZoom,
	onWidgetCommand,
	onFullScreenChange,
	onMove,
	onResize,
	onSelect,
	children,
}: PhoneNavigatorProps) {
	const { t } = useI18n();
	const aids = !editing;
	const overview = !editing && zoom === 'fit';
	const touch = useRef<{ id: string; x: number; y: number; time: number } | null>(null);
	const stageRef = useRef<HTMLDivElement>(null);
	const overviewRef = useRef<HTMLDivElement>(null);
	const [stageWidth, setStageWidth] = useState(0);
	const [metrics, setMetrics] = useState<Metrics | null>(null);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [loupeId, setLoupeId] = useState<string | null>(null);
	const afterTapClick = useAfterTapClick();
	const [fullId, setFullId] = useState<string | null>(null);
	const previousWidgets = useRef(widgets);
	useEffect(() => {
		const added = widgets.find((w) => !previousWidgets.current.some((old) => old.id === w.id));
		previousWidgets.current = widgets;
		if (editing && loupeId && added) setLoupeId(added.id);
	}, [widgets, editing, loupeId]);
	const pendingJump = useRef<string | null>(null);
	const anchor = useRef<{ fx: number; fy: number; ox: number; oy: number } | null>(null);
	const ordered = useMemo(() => stackOrder(widgets), [widgets]);
	const extent = useMemo(() => extentOf(widgets), [widgets]);
	const loupe = editing ? ordered.find((w) => w.id === loupeId) : undefined;
	const select = useRef(onSelect);
	select.current = onSelect;
	useEffect(() => {
		if (loupe?.id) select.current?.(null);
	}, [loupe?.id]);
	const full = aids ? (ordered.find((w) => w.id === fullId) ?? null) : null;
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
	function closeLoupe() {
		const id = loupeId;
		setLoupeId(null);
		requestAnimationFrame(() => {
			if (id)
				stageRef.current
					?.querySelector<HTMLElement>(`[data-testid="widget-${CSS.escape(id)}"]`)
					?.focus({ preventScroll: true });
		});
	}
	const fades = aids && metrics && !full ? edgesOf(metrics) : null;
	return (
		<div data-testid="phone-navigator" style={ROOT}>
			<div
				ref={stageRef}
				data-testid="phone-layout-stage"
				onTouchStart={onTouchStart}
				className="board-fit-floor"
				onPointerDownCapture={(e) => {
					if (!editing || !onMove || e.pointerType !== 'touch') return;
					const target = (e.target as HTMLElement).closest<HTMLElement>('[data-testid^="widget-"]');
					if (target && !(e.target as HTMLElement).closest('button, input, select, textarea'))
						touch.current = {
							id: target.dataset.testid!.slice(7),
							x: e.clientX,
							y: e.clientY,
							time: e.timeStamp,
						};
				}}
				onPointerUpCapture={(e) => {
					const start = touch.current;
					touch.current = null;
					if (
						start &&
						e.timeStamp - start.time < 400 &&
						Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6
					)
						afterTapClick(() => setLoupeId(start.id));
				}}
				onPointerCancelCapture={() => {
					touch.current = null;
				}}
				style={{
					...STAGE,
					display: full ? 'none' : 'flex',
					visibility: loupe ? 'hidden' : undefined,
				}}
			>
				{editing && <FitTextFloor />}
				{overview ? (
					<Overview
						scrollRef={overviewRef}
						widgets={ordered}
						extent={extent}
						width={stageWidth}
						onOpen={openFull}
					/>
				) : loupe ? null : (
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
			<PhoneEditLoupe open={!!loupe} onClose={closeLoupe} title={loupe?.title ?? 'Tile'}>
				{loupe && (
					<div data-testid="phone-edit-loupe" style={{ minWidth: 0 }}>
						<TileSizePresets widget={loupe} onResize={onResize} />
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
							{(['Left', 'Right', 'Up', 'Down'] as const).map((direction, i) => (
								<Button
									key={direction}
									onClick={() =>
										void onMove?.(
											loupe.id,
											Math.max(0, loupe.x + [-20, 20, 0, 0][i]),
											Math.max(0, loupe.y + [0, 0, -20, 20][i]),
										)
									}
								>
									{t(
										(
											[
												'boardArrange.left',
												'boardArrange.right',
												'boardArrange.up',
												'boardArrange.down',
											] as const
										)[i],
									)}
								</Button>
							))}
						</div>
						<div
							style={{ height: Math.max(240, loupe.h + 48), display: 'flex', position: 'relative' }}
						>
							{isValidElement<SceneBoardCanvasProps>(children) &&
								cloneElement(children, {
									widgets: [{ ...loupe, x: 24, y: 24, w: Math.min(loupe.w, stageWidth - 50) }],
									zoomPreset: 'comfortable',
									onMove: (id, x, y) => onMove?.(id, loupe.x + x - 24, loupe.y + y - 24),
									onResize: (id, w, h) =>
										onResize?.(id, w + loupe.w - Math.min(loupe.w, stageWidth - 50), h),
								})}
						</div>
					</div>
				)}
			</PhoneEditLoupe>
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
