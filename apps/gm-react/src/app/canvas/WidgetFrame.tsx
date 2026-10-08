import type { LayoutHistory } from './useLayoutHistory';
import { useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { widgetPresentation, type WidgetLibraryEntry } from '@dndtools/core';
import { Badge, Icon, VisibilityChip } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import { noteDepth, type NoteDepth } from '../widgets/builtin/Note';
import { NoteFrameContext } from '../widgets/builtin/NoteBody';
import { useRuntime } from '../../runtime/RuntimeContext';
import { TIER_LABEL, type BoardWidget } from '../board-helpers';
import {
	safeBoundEntityName,
	tileBindingState,
	tileMetadataForWidget,
	tileMetadataForDefinition,
	type TileBindingState,
} from '../widgets/tileMeta';
import {
	TileTitle,
	WidgetRenderSlot,
	useTileFit,
	type WidgetCommandHandler,
} from '../widgets/WidgetRenderSlot';
import { TileActionMenu, TRIGGER_SIZE, useLongPress, type MenuHandle } from './TileActionMenu';

/** Shared canvas frame and overlay controls. Frames follow the scene's metadata reading order;
 * explicit stack indices let the canvas change DOM order without changing visual overlap. */

// Widget definition icons are normally semantic registry keys ('map', 'dice', …). Third-party
// packages created by older builds may still contain an emoji glyph, so retain a decorative legacy
// fallback instead of replacing persisted package content with a broken square.
const isRegistryKey = (icon: string) => /^[a-z0-9-]+$/i.test(icon);

const NOTE_DEPTH_LABEL: Record<NoteDepth, MessageKey> = {
	title: 'widgetBody.note.depthTitle',
	summary: 'widgetBody.note.depthSummary',
	full: 'widgetBody.note.depthFull',
};

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

/** Undo/Redo overlay control. Disabled — not hidden — so the canvas never gains or loses a control
 *  under the user's cursor, and the shortcut and the button always agree about what is available. */
export function HistoryBtn({
	icon,
	label,
	disabled,
	onClick,
}: {
	icon: string;
	label: string;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			disabled={disabled}
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
				color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
				cursor: disabled ? 'default' : 'pointer',
				opacity: disabled ? 0.5 : 1,
			}}
		>
			<Icon name={icon} size="sm" />
		</button>
	);
}

/** The canvas Undo/Redo cluster. Anchored top-right on the bounded board (it scrolls, and an edit
 *  session starts at the top) and bottom-left on the free canvas, opposite its zoom cluster. */
export function HistoryCluster({
	history,
	policy,
}: {
	history: LayoutHistory;
	policy: 'bounded' | 'canvas';
}) {
	return (
		<div
			data-testid="canvas-history-controls"
			style={{
				position: 'absolute',
				...(policy === 'bounded' ? { top: 12, right: 12 } : { left: 16, bottom: 16 }),
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
	);
}

/** The empty canvas. It doubles as the LOADING state (a board has no widgets while
 *  `command-center.ensure-home` is in flight), so the caller may say which it is. The heading is
 *  sans: the display face starts at `--text-xl` (the RC-ENG-8.4 emphasis lint). */
type EmptyCanvasProps = { title?: string; hint?: string; theme?: string };
export function EmptyCanvas({ title, hint, theme }: EmptyCanvasProps) {
	return (
		<div
			data-theme={theme}
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
			<Icon name="widget" size="xl" color="var(--color-text-secondary)" />
			<div
				style={{
					font: '700 var(--text-lg) var(--font-sans)',
					color: 'var(--color-text-secondary)',
				}}
			>
				{title ?? 'An empty scene'}
			</div>
			<div
				style={{
					font: 'var(--text-sm) var(--font-sans)',
					color: 'var(--color-text-secondary)',
					maxWidth: 320,
				}}
			>
				{hint ?? 'Press Edit, then add a widget.'}
			</div>
		</div>
	);
}

const EASE = 'var(--duration-fast) var(--easing-standard)';
/** RC-CAN-8.3 — edit mode's tile transition: the hover outline and shadow ease on the motion tokens,
 *  which collapse to 0ms under reduced motion (styles/tokens/spacing.css), so the cue is static. */
export const LIFT_TRANSITION = `outline-color ${EASE}, box-shadow ${EASE}`;

/**
 * RC-CAN-8.3 — the hover lift on an edited tile: an outline (unless a selection or drop ring is
 * already drawn) and an elevation shadow; a dragged tile casts the deeper shadow of a held card. The
 * lift is elevation only, never a `transform`: moving a frame that holds the focused menu trigger
 * made Chrome scroll the overflow-hidden canvas to keep the trigger in view, and the tile menu
 * closes on any scroll.
 */
export function liftStyle(lift: 'rest' | 'hover' | 'drag', ringed: boolean): CSSProperties {
	if (lift === 'rest') return {};
	return {
		...(ringed ? {} : { outline: '2px solid var(--color-accent-border)' }),
		boxShadow: lift === 'drag' ? 'var(--shadow-lg)' : 'var(--shadow-md)',
	};
}

/** Pointer hover on an edited tile. A finger has no hover, so touch never lifts a tile. Entering
 *  counts only while editing, so a view-mode frame does not re-render as the pointer crosses it. */
export function useHoverLift(editing: boolean) {
	const [hovered, setHovered] = useState(false);
	return {
		lifted: editing && hovered,
		handlers: {
			onPointerEnter: (e: React.PointerEvent) => setHovered(editing && e.pointerType !== 'touch'),
			onPointerLeave: () => setHovered(false),
		},
	};
}

/**
 * RC-CAN-8.3 — the grip in an edited tile's title bar: the glyph that says "drag here". It lives on
 * the drag surface (the title row leaves it room), and it is `touch-action: none`, so a finger on it
 * drags the tile where a finger anywhere else on the tile still scrolls the board.
 */
export function TileGrip() {
	return (
		<span
			aria-hidden
			data-testid="tile-grip"
			style={{
				position: 'absolute',
				top: 'var(--space-2)',
				left: 0,
				display: 'inline-flex',
				padding: 'var(--space-1)',
				color: 'var(--color-text-secondary)',
				touchAction: 'none',
				cursor: 'grab',
			}}
		>
			<Icon name="drag-handle" size={16} />
		</span>
	);
}

/** The zoom cluster's control: the same overlay button, never disabled. */
export function ZoomBtn(props: { icon: string; label: string; onClick: () => void }) {
	return <HistoryBtn {...props} disabled={false} />;
}

/** The header's binding glyph: a word as well as a shape, so no state rests on colour alone. */
const QUIET = 'var(--color-text-secondary)';
const WARN = 'var(--color-status-warning-text)';
const BINDING_GLYPH: Record<TileBindingState, { icon: string; label: MessageKey; tone: string }> = {
	bound: { icon: 'link', label: 'boardCanvas.binding.bound', tone: QUIET },
	unbound: { icon: 'link', label: 'boardCanvas.binding.unbound', tone: QUIET },
	missing: { icon: 'warning', label: 'boardCanvas.binding.missing', tone: WARN },
	conflicted: { icon: 'warning', label: 'boardCanvas.binding.conflicted', tone: WARN },
	hidden: { icon: 'visibility-hidden', label: 'boardCanvas.binding.hidden', tone: QUIET },
};

export interface WidgetFrameProps {
	history?: LayoutHistory;
	w: BoardWidget;
	x: number;
	y: number;
	width: number;
	height: number;
	editing: boolean;
	selected: boolean;
	/** RC-CAN-3.6: one of several selected tiles — outlined, without the single-tile chip/handle. */
	multi?: boolean;
	scale: number;
	resizable: boolean;
	/** Frames participate in the metadata-ordered native Tab sequence. */
	tabbable: boolean;
	stackOrder?: number;
	ariaLabel: string;
	onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
	onFocusIn: () => void;
	/** Focus left the frame (and its content), or Escape left its resize handle: burst over. */
	onSettle?: () => void;
	registerRef: (el: HTMLDivElement | null) => void;
	onStartMove: (e: React.PointerEvent) => void;
	onStartResize: (e: React.PointerEvent) => void;
	onCycleSize?: () => void;
	onResizeStep?: (dx: number, dy: number) => void;
	/** VIEW-mode operate dispatch, pre-bound to this widget instance. Absent while editing. */
	onCommand?: WidgetCommandHandler;
	/** RC-CAN-8.3: this tile is the one under the pointer in a move drag — it casts the held shadow. */
	dragging?: boolean;
}

export function WidgetFrame({
	w,
	x,
	y,
	width,
	height,
	editing,
	selected,
	multi = false,
	scale,
	resizable,
	tabbable,
	stackOrder,
	ariaLabel,
	onKeyDown,
	onFocusIn,
	onSettle,
	registerRef,
	onStartMove,
	onStartResize,
	onCycleSize,
	onResizeStep,
	onCommand,
	history,
	dragging = false,
}: WidgetFrameProps) {
	const { t } = useI18n();
	const placeholder = w.status !== 'available';
	const presentation =
		w.configuration.presentation ??
		w.configFields.find((field) => field.key === 'presentation')?.default;
	const bare = !editing && widgetPresentation({ presentation }) === 'bare';
	// RC-WID-5.3: a bare tile paints no surface of its own, so its content takes the scene surface's
	// palette (the board background's `data-theme`, a sibling of the tile layer) to keep its text
	// contrast against the page. Written to the node, not rendered: React never owns the attribute,
	// and each render re-reads it, so a changed scene background follows without a state round-trip.
	const bodyRef = useRef<HTMLDivElement | null>(null);
	useLayoutEffect(() => {
		const body = bodyRef.current;
		if (!body) return;
		const theme = bare
			? body
					.closest('[data-background]')
					?.querySelector(':scope > [data-testid="scene-background"]')
					?.getAttribute('data-theme')
			: null;
		if (theme) body.setAttribute('data-theme', theme);
		else body.removeAttribute('data-theme');
	});
	const fit = useTileFit(editing, height, stackOrder);
	// RC-CAN-2.2 — the header is the tile's identity at a glance: the type's accent rail and tinted
	// icon, the label, who can see it, and what it is bound to.
	const meta = tileMetadataForWidget(w);
	const binding = tileBindingState(w);
	const glyph = binding ? BINDING_GLYPH[binding] : null;
	const { state, defaultActorId } = useRuntime();
	const refType = w.bindingRef?.entityType ?? null;
	const refId = w.bindingRef?.entityId ?? null;
	// Memoised on primitives: a frame re-renders on every pointer move while a tile is dragged, and
	// the name is an actor-filtered core read, not a field lookup.
	const entityName = useMemo(
		() =>
			safeBoundEntityName(state, defaultActorId, {
				status: w.status,
				bindingRef: refType && refId ? { entityType: refType, entityId: refId } : null,
			}),
		[state, defaultActorId, w.status, refType, refId],
	);
	const accent = `var(${meta.accentToken})`;
	// RC-CAN-2.4: Shift+F10 and the ContextMenu key open the tile menu from a focused frame, under its
	// trigger. RC-CAN-8.3: a right-click (it lands on the drag overlay) or a long-press opens it at the
	// pointer. A keyboard-raised `contextmenu` targets the frame itself and keeps the trigger anchor.
	const menuRef = useRef<MenuHandle | null>(null);
	const press = useLongPress((at) => menuRef.current?.open(at));
	const hover = useHoverLift(editing);
	const openMenu = (e: React.KeyboardEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
		// A press inside the portalled menu bubbles here through React; only this frame's DOM counts.
		if (!editing || !e.currentTarget.contains(e.target as Node)) return false;
		e.preventDefault();
		const pointer = 'clientX' in e && e.target !== e.currentTarget;
		menuRef.current?.open(pointer ? { x: e.clientX, y: e.clientY } : undefined);
		return true;
	};
	return (
		<div
			data-testid={`widget-${w.id}`}
			ref={registerRef}
			role={bare ? 'region' : 'group'}
			aria-label={ariaLabel}
			aria-description={
				editing
					? `Enter opens tile content. Space selects move mode; Shift with Space adds the tile to the selection. Arrows navigate between tiles or move the selected tiles; ${resizable ? 'Shift with arrows resizes.' : `${w.title} declares a fixed size.`} Alt with A, H, D, W, V or S aligns the selection. Escape leaves move mode. A opens Add. Delete removes; Control or Command with Z undoes.`
					: 'Arrows navigate to the nearest tile. Enter opens tile content. Escape returns to the tile.'
			}
			tabIndex={tabbable ? 0 : -1}
			onKeyDown={(e) => {
				const menuKey = e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
				if (!(menuKey && e.target === e.currentTarget && openMenu(e))) onKeyDown(e);
			}}
			onContextMenu={openMenu}
			{...hover.handlers}
			onFocus={onFocusIn}
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onSettle?.();
			}}
			style={{
				position: 'absolute',
				...fit.box,
				left: x,
				top: y,
				width,
				borderRadius: 'var(--radius-md)',
				// `outline`, NOT `box-shadow`: forced-colors mode suppresses box-shadow outright, so
				// the selected widget had NO ring at all in Windows High Contrast. An outline survives
				// and remaps to `Highlight`. (The title chip is the other selection cue.)
				// Emit the key ONLY when selected. `outline:'none'` is an INLINE style, so it beat the
				// app's global `:focus-visible` rule (styles/tokens/base.css) and left every widget
				// frame with no focus indicator at all — on the one surface whose whole navigation
				// model is a roving tabindex across those frames (CANVAS-016, WCAG 2.4.7).
				...(selected ? { outline: '2px solid var(--color-accent)' } : {}),
				outlineOffset: 2,
				...liftStyle(dragging ? 'drag' : hover.lifted ? 'hover' : 'rest', selected),
				transition: selected
					? 'none'
					: editing
						? LIFT_TRANSITION
						: 'outline-color var(--duration-fast) var(--easing-standard)',
			}}
		>
			<div
				ref={bodyRef}
				className={bare ? undefined : meta.silhouetteClass}
				style={{
					position: 'relative',
					height: '100%',
					display: 'flex',
					flexDirection: 'column',
					gap: 'var(--space-2)',
					padding: bare ? 'var(--space-0)' : 'var(--space-3)',
					borderRadius: 'var(--radius-md)',
					background: bare
						? 'transparent'
						: placeholder
							? 'var(--color-surface-sunken)'
							: 'var(--color-surface-raised)',
					border: bare
						? 'none'
						: `1px solid ${placeholder ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
					opacity: placeholder ? 0.85 : 1,
					overflow: 'hidden',
					pointerEvents: editing ? 'none' : 'auto',
				}}
			>
				{!bare && (
					<>
						{/* A BORDER, not a background: forced-colors mode repaints backgrounds as Canvas, which
				    would erase the rail, but keeps a border and remaps it to CanvasText. */}
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
								gap: 'var(--space-2)',
								flex: '0 0 auto',
								// Room for the edit-mode grip, and for the menu trigger held at screen size (÷ scale).
								...(editing
									? {
											paddingLeft: 'var(--space-3)',
											paddingRight: `calc(${TRIGGER_SIZE} / ${scale})`,
										}
									: {}),
							}}
						>
							<WidgetGlyph icon={meta.icon} size={16} color={accent} />
							<TileTitle>{w.title}</TileTitle>
							<VisibilityChip level={w.visibility} byException data-testid="visibility-badge" />
						</div>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 'var(--space-2)',
								minWidth: 0,
								flex: '0 0 auto',
							}}
						>
							<span
								title={meta.description}
								style={{
									font: 'var(--text-2xs) var(--font-sans)',
									letterSpacing: 'var(--tracking-wide)',
									textTransform: 'uppercase',
									color: 'var(--color-text-tertiary)',
									whiteSpace: 'nowrap',
									flex: '0 0 auto',
								}}
							>
								{w.typeLabel}
							</span>
							{editing &&
								w.type === 'note' &&
								w.configFields.some((field) => field.key === 'depth') && (
									<Badge data-testid="note-depth-badge">
										{t('widgetBody.note.depthBadge', { depth: t(NOTE_DEPTH_LABEL[noteDepth(w)]) })}
									</Badge>
								)}
							{binding && glyph && (
								<span
									data-testid="tile-binding"
									data-binding-state={binding}
									title={
										entityName
											? t('boardCanvas.binding.boundTo', { name: entityName })
											: t(glyph.label)
									}
									style={{
										display: 'inline-flex',
										alignItems: 'center',
										gap: 'var(--space-1)',
										minWidth: 0,
										font: '600 var(--text-2xs) var(--font-sans)',
										color: glyph.tone,
									}}
								>
									<Icon name={glyph.icon} size={12} />
									<span
										style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
									>
										{entityName ?? t(glyph.label)}
									</span>
								</span>
							)}
						</div>
					</>
				)}
				<div
					data-tile-content
					tabIndex={-1}
					role="group"
					aria-label={t('boardCanvas.tile.content', { title: w.title })}
					style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
				>
					<NoteFrameContext.Provider value={true}>
						<WidgetRenderSlot widget={w} onCommand={onCommand} {...fit.slot} />
					</NoteFrameContext.Provider>
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
					data-testid="tile-drag-surface"
					{...press}
					onPointerDown={(e) => {
						// A right press is the context menu's, not a drag, and must not reach the canvas.
						if (e.button === 2) return e.stopPropagation();
						press.onPointerDown(e);
						onStartMove(e);
					}}
					style={{
						position: 'absolute',
						inset: 0,
						borderRadius: 'var(--radius-md)',
						cursor: 'grab',
						WebkitTouchCallout: 'none',
					}}
				>
					<TileGrip />
				</div>
			)}

			{/* After the drag overlay in DOM order, so it paints — and takes presses — above it. */}
			{editing && (
				<TileActionMenu
					handle={menuRef}
					history={history}
					w={w}
					scale={scale}
					resizable={resizable}
					entityName={entityName}
				/>
			)}

			{(selected || hover.lifted) && !multi && !bare && (
				<>
					{/* RC-CAN-8.3: INSIDE the frame's bottom-left corner, held at screen size and capped to the
					    frame's width. Above the frame it overlapped the canvas edge on a top-row tile. */}
					<div
						hidden={!selected}
						data-testid="tile-selection-chip"
						style={{
							position: 'absolute',
							bottom: 'var(--space-2)',
							left: 'var(--space-2)',
							maxWidth: Math.max(0, (width - 16) * scale),
							overflow: 'hidden',
							display: selected ? 'inline-flex' : 'none',
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
						<button
							type="button"
							aria-label={t('boardCanvas.tile.resize', { title: w.title })}
							title={t('boardCanvas.tile.resizeHelp')}
							aria-description={t('boardCanvas.tile.resizeHelp')}
							onClick={(e) => {
								e.stopPropagation();
								if (e.detail === 0) onCycleSize?.();
							}}
							onKeyDown={(e) => {
								const delta: Record<string, [number, number]> = {
									ArrowLeft: [-1, 0],
									ArrowRight: [1, 0],
									ArrowUp: [0, -1],
									ArrowDown: [0, 1],
								};
								if (delta[e.key]) {
									e.preventDefault();
									e.stopPropagation();
									onResizeStep?.(...delta[e.key]);
								}
								if (e.key === 'Escape') {
									e.preventDefault();
									e.stopPropagation();
									onSettle?.();
									e.currentTarget.closest<HTMLElement>('[role="group"]')?.focus();
								}
							}}
							onPointerDown={onStartResize}
							style={{
								position: 'absolute',
								right: -5,
								bottom: -5,
								width: 24,
								height: 24,
								padding: 0,
								touchAction: 'none',
								borderRadius: 'var(--radius-sm)',
								// A tinted handle, not a gold fill: the canvas's one accent-filled primary
								// belongs to the zoom cluster (RC-ENG-8.4 emphasis lint).
								background: 'var(--color-accent-subtle)',
								border: '2px solid var(--color-accent-border)',
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

/** Row text: one font shorthand plus a colour. */
const rowText = (font: string, color: string) => ({ font: `${font} var(--font-sans)`, color });
const ONE_LINE = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
type RowProps = {
	entry: WidgetLibraryEntry;
	/** The pick control's whole name, "Add Dice": the row's visible title is part of it. */
	label: string;
	onPick: () => void;
	/** Hover by mouse or keyboard focus: the row to show a miniature beside, or null to hide it. */
	onPreview?: (row: HTMLElement | null) => void;
};

/**
 * One Add-panel row (RC-CAN-8.5): glyph, title, category and a one-line purpose, all inside ONE
 * button named "Add <widget>". The miniature is not part of the row — the gallery draws it beside
 * the row on mouse hover or keyboard focus, `aria-hidden` and `inert`, so a list of forty widgets
 * is forty short rows and forty tab stops, not forty live bodies full of dead buttons.
 */
export function WidgetLibraryCard({ entry, label, onPick, onPreview }: RowProps) {
	const baseId = useId();
	const [descId, reasonId] = [`${baseId}-desc`, `${baseId}-reason`];
	const meta = tileMetadataForDefinition(entry);
	const reason = entry.availability.available ? null : entry.availability.reason;
	const accent = reason ? 'var(--color-border-strong)' : `var(${meta.accentToken})`;
	const show = (e: React.SyntheticEvent<HTMLElement>) => onPreview?.(e.currentTarget);
	const hide = () => onPreview?.(null);
	return (
		<li data-testid={`gallery-card-${entry.type}`} className={meta.silhouetteClass}>
			<button
				type="button"
				data-testid={`gallery-entry-${entry.type}`}
				data-category={entry.category ?? ''}
				aria-label={label}
				aria-describedby={reason ? `${descId} ${reasonId}` : descId}
				// `aria-disabled`, not `disabled`, keeps the reason reachable by keyboard (tab order).
				aria-disabled={reason ? true : undefined}
				onClick={() => reason || onPick()}
				onPointerEnter={(e) => e.pointerType === 'mouse' && show(e)}
				onPointerLeave={hide}
				// Keyboard focus only: a tap focuses the row on its way to picking it.
				onFocus={(e) => e.currentTarget.matches(':focus-visible') && show(e)}
				onBlur={hide}
				style={{
					display: 'grid',
					gridTemplateColumns: 'auto minmax(0, 1fr) auto',
					alignItems: 'center',
					columnGap: 'var(--space-2)',
					rowGap: 'var(--space-0-5)',
					width: '100%',
					minHeight: 44,
					padding: 'var(--space-2) var(--space-3)',
					textAlign: 'left',
					border: '1px solid var(--color-border)',
					// The accent rail is a border, not a background: forced-colors keeps it (as WidgetFrame's).
					borderLeft: `4px solid ${accent}`,
					borderRadius: 'var(--radius-md)',
					background: reason ? 'var(--color-surface-sunken)' : 'var(--color-surface-raised)',
					cursor: reason ? 'not-allowed' : 'pointer',
				}}
			>
				<WidgetGlyph
					icon={meta.icon}
					size={16}
					color={reason ? 'var(--color-text-tertiary)' : accent}
				/>
				<span
					style={{
						...ONE_LINE,
						...rowText(
							'600 var(--text-sm)',
							reason ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
						),
					}}
				>
					{entry.displayName}
				</span>
				<span style={rowText('var(--text-2xs)', 'var(--color-text-tertiary)')}>
					{entry.category ?? ''}
				</span>
				<span
					id={descId}
					style={{
						gridColumn: '2 / -1',
						...ONE_LINE,
						...rowText('var(--text-2xs)/1.4', 'var(--color-text-secondary)'),
					}}
				>
					{meta.description}
				</span>
				{reason && (
					<span
						id={reasonId}
						style={{
							gridColumn: '2 / -1',
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-1)',
							...rowText('600 var(--text-2xs)/1.4', 'var(--color-text-primary)'),
						}}
					>
						<Icon name="lock" size="sm" />
						{reason}
					</span>
				)}
			</button>
		</li>
	);
}
