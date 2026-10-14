import type { LayoutHistory } from './useLayoutHistory';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { widgetPresentation } from '@dndtools/core';
import { Badge, Icon, VisibilityChip } from '../../ds';
import { useI18n, type MessageKey } from '../../i18n';
import { noteDepth, type NoteDepth } from '../widgets/builtin/Note';
import { NoteFrameContext } from '../widgets/builtin/NoteBody';
import { useRuntime } from '../../runtime/RuntimeContext';
import { TIER_KEY, type BoardWidget } from '../board-helpers';
import {
	safeBoundEntityName,
	tileBindingState,
	tileMetadataForWidget,
	type TileBindingState,
} from '../widgets/tileMeta';
import {
	TileTitle,
	WidgetRenderSlot,
	useTileFit,
	type WidgetCommandHandler,
} from '../widgets/WidgetRenderSlot';
import { TileActionMenu, TRIGGER_SIZE, useLongPress, type MenuHandle } from './TileActionMenu';
import { LIFT_TRANSITION, TileGrip, WidgetGlyph, liftStyle, useHoverLift } from './frameParts';

/** Shared canvas frame and overlay controls. Frames follow the scene's metadata reading order;
 * explicit stack indices let the canvas change DOM order without changing visual overlap. */

const NOTE_DEPTH_LABEL: Record<NoteDepth, MessageKey> = {
	title: 'widgetBody.note.depthTitle',
	summary: 'widgetBody.note.depthSummary',
	full: 'widgetBody.note.depthFull',
};

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
					? t('boardCanvas.frame.helpEditing', {
							resize: resizable
								? t('boardCanvas.frame.helpResize')
								: t('boardCanvas.frame.helpFixed', { title: w.title }),
						})
					: t('boardCanvas.frame.helpView')
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
							gap: 'var(--space-1-5)',
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
							gap: 'var(--space-1-5)',
							padding: 'var(--space-0-5) var(--space-2)',
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
						<span style={{ opacity: 0.85, fontWeight: 500 }}>· {t(TIER_KEY[w.tier])}</span>
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
								padding: 'var(--space-0)',
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
