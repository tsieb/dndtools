import type { LayoutHistory } from './useLayoutHistory';
import { useId, useMemo, useRef, type ReactNode } from 'react';
import type { WidgetLibraryEntry } from '@dndtools/core';
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
import { WidgetRenderSlot, type WidgetCommandHandler } from '../widgets/WidgetRenderSlot';
import { TileActionMenu, TRIGGER_SIZE } from './TileActionMenu';
import type { ArrangeAction, Box } from './geometry';

/** Shared canvas frame and overlay controls. Frames follow the scene's metadata reading order;
 * explicit stack indices let the canvas change DOM order without changing visual overlap. */

// Kept with the tile chrome copy, like TileActionMenu's local TEXT catalog.
const RESIZE_HELP =
	'Click to cycle small, medium and large. Focus and use arrow keys to resize; Escape returns to the tile.';

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

/** RC-CAN-3.6 — the marquee rectangle, in board coordinates inside the canvas transform layer. */
export function Marquee({ box }: { box: Box }) {
	return (
		<div
			data-testid="canvas-marquee"
			aria-hidden
			style={{
				position: 'absolute',
				left: box.x,
				top: box.y,
				width: box.w,
				height: box.h,
				border: '1px dashed var(--color-accent)',
				background: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
				pointerEvents: 'none',
				zIndex: 100000,
			}}
		/>
	);
}

interface ArrangeButton {
	action: ArrangeAction;
	short: MessageKey;
	full: MessageKey;
	keys: string;
	/** Tiles the action needs before it can do anything. */
	min: number;
}

const ARRANGE_BUTTONS: ArrangeButton[] = [
	['left', 'A'],
	['center', 'H'],
	['right', 'D'],
	['top', 'W'],
	['middle', 'V'],
	['bottom', 'S'],
].map(([mode, key]) => ({
	action: { kind: 'align', mode } as ArrangeAction,
	short: `boardCanvas.arrange.${mode}` as MessageKey,
	full: `boardCanvas.arrange.${mode}Full` as MessageKey,
	keys: `Alt+${key}`,
	min: 2,
}));
ARRANGE_BUTTONS.push(
	{
		action: { kind: 'distribute', axis: 'horizontal' },
		short: 'boardCanvas.arrange.distributeH',
		full: 'boardCanvas.arrange.distributeHFull',
		keys: 'Alt+Shift+H',
		min: 3,
	},
	{
		action: { kind: 'distribute', axis: 'vertical' },
		short: 'boardCanvas.arrange.distributeV',
		full: 'boardCanvas.arrange.distributeVFull',
		keys: 'Alt+Shift+V',
		min: 3,
	},
	{
		action: { kind: 'layer', move: 'forward' },
		short: 'boardCanvas.arrange.forward',
		full: 'boardCanvas.arrange.forwardFull',
		keys: 'Control+]',
		min: 1,
	},
	{
		action: { kind: 'layer', move: 'backward' },
		short: 'boardCanvas.arrange.backward',
		full: 'boardCanvas.arrange.backwardFull',
		keys: 'Control+[',
		min: 1,
	},
);

/**
 * RC-CAN-3.6 — the multi-selection toolbar: align, distribute, layer and group, each also a
 * shortcut (`geometry.ts` `arrangeShortcut`). A real toolbar of buttons, so every arrange action is
 * reachable without a pointer AND without memorising a chord. Buttons a selection this small cannot
 * use are disabled rather than hidden, so the bar does not reflow under the cursor.
 */
export function ArrangeBar({
	count,
	grouped,
	policy,
	onAction,
}: {
	count: number;
	grouped: boolean;
	policy: 'bounded' | 'canvas';
	onAction: (action: ArrangeAction) => void;
}) {
	const { t } = useI18n();
	const buttons: ArrangeButton[] = [
		...ARRANGE_BUTTONS,
		grouped
			? {
					action: { kind: 'ungroup' },
					short: 'boardCanvas.arrange.ungroup',
					full: 'boardCanvas.arrange.ungroupFull',
					keys: 'Control+Shift+G',
					min: 1,
				}
			: {
					action: { kind: 'group' },
					short: 'boardCanvas.arrange.group',
					full: 'boardCanvas.arrange.groupFull',
					keys: 'Control+G',
					min: 2,
				},
	];
	return (
		<div
			role="toolbar"
			aria-label={t('boardCanvas.arrange.toolbar', { count })}
			data-testid="canvas-arrange-bar"
			onPointerDown={(e) => e.stopPropagation()}
			style={{
				position: 'absolute',
				...(policy === 'bounded' ? { top: 12, left: 12 } : { top: 16, left: 16 }),
				maxWidth: 'calc(100% - 24px)',
				display: 'flex',
				flexWrap: 'wrap',
				alignItems: 'center',
				gap: 'var(--space-1)',
				padding: 'var(--space-1)',
				borderRadius: 'var(--radius-md)',
				background: 'var(--color-surface-overlay)',
				border: '1px solid var(--color-border-strong)',
				boxShadow: 'var(--shadow-lg)',
				zIndex: 1,
			}}
		>
			{buttons.map((button) => (
				<button
					key={button.short}
					type="button"
					aria-label={t(button.full)}
					aria-keyshortcuts={button.keys}
					title={`${t(button.full)} (${button.keys})`}
					disabled={count < button.min}
					onClick={() => onAction(button.action)}
					style={{
						minHeight: 28,
						border: 'none',
						borderRadius: 'var(--radius-sm)',
						padding: '0 var(--space-2)',
						background: 'transparent',
						color:
							count < button.min ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
						font: '600 var(--text-xs) var(--font-sans)',
						cursor: count < button.min ? 'default' : 'pointer',
					}}
				>
					{t(button.short)}
				</button>
			))}
		</div>
	);
}

/** The zoom cluster's control: the same overlay button, never disabled. */
export function ZoomBtn(props: { icon: string; label: string; onClick: () => void }) {
	return <HistoryBtn {...props} disabled={false} />;
}

/** The header's binding glyph: a word as well as a shape, so no state rests on colour alone. */
const BINDING_GLYPH: Record<TileBindingState, { icon: string; label: string; tone: string }> = {
	bound: { icon: 'link', label: 'Bound', tone: 'var(--color-text-secondary)' },
	unbound: { icon: 'link', label: 'Not bound', tone: 'var(--color-text-secondary)' },
	missing: { icon: 'warning', label: 'Missing', tone: 'var(--color-status-warning-text)' },
	conflicted: { icon: 'warning', label: 'Conflict', tone: 'var(--color-status-warning-text)' },
	hidden: { icon: 'visibility-hidden', label: 'Hidden', tone: 'var(--color-text-secondary)' },
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
	registerRef: (el: HTMLDivElement | null) => void;
	onStartMove: (e: React.PointerEvent) => void;
	onStartResize: (e: React.PointerEvent) => void;
	onCycleSize?: () => void;
	onResizeStep?: (dx: number, dy: number) => void;
	/** VIEW-mode operate dispatch, pre-bound to this widget instance. Absent while editing. */
	onCommand?: WidgetCommandHandler;
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
	registerRef,
	onStartMove,
	onStartResize,
	onCycleSize,
	onResizeStep,
	onCommand,
	history,
}: WidgetFrameProps) {
	const { t } = useI18n();
	const placeholder = w.status !== 'available';
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
	// RC-CAN-2.4: Shift+F10 and the ContextMenu key open the tile menu from a focused frame. A
	// keyboard-raised `contextmenu` lands on the frame too; a right-click lands on the drag overlay.
	const menuRef = useRef<{ open: () => void } | null>(null);
	const openMenu = (e: React.SyntheticEvent<HTMLDivElement>) => {
		if (!editing || e.target !== e.currentTarget) return false;
		e.preventDefault();
		menuRef.current?.open();
		return true;
	};
	return (
		<div
			data-testid={`widget-${w.id}`}
			ref={registerRef}
			role="group"
			aria-label={ariaLabel}
			aria-description={
				editing
					? 'Enter opens tile content. Space selects move mode; Shift with Space adds the tile to the selection. Arrows navigate between tiles or move the selected tiles; Shift with arrows resizes. Alt with A, H, D, W, V or S aligns the selection. Escape leaves move mode. A opens Add. Delete removes; Control or Command with Z undoes.'
					: 'Arrows navigate to the nearest tile. Enter opens tile content. Escape returns to the tile.'
			}
			tabIndex={tabbable ? 0 : -1}
			onKeyDown={(e) => {
				const menuKey = e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
				if (!(menuKey && openMenu(e))) onKeyDown(e);
			}}
			onContextMenu={openMenu}
			onFocus={onFocusIn}
			style={{
				position: 'absolute',
				zIndex: stackOrder,
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
				className={meta.silhouetteClass}
				style={{
					position: 'relative',
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
						// Room for the edit-mode menu trigger, held at screen size (hence ÷ scale).
						...(editing ? { paddingRight: `calc(${TRIGGER_SIZE} / ${scale})` } : {}),
					}}
				>
					<WidgetGlyph icon={meta.icon} size={16} color={accent} />
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
							title={entityName ? `Bound to ${entityName}` : glyph.label}
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
							<span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
								{entityName ?? glyph.label}
							</span>
						</span>
					)}
				</div>
				<div
					data-tile-content
					tabIndex={-1}
					role="group"
					aria-label={`${w.title} content`}
					style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
				>
					<NoteFrameContext.Provider value={true}>
						<WidgetRenderSlot widget={w} onCommand={onCommand} />
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
					onPointerDown={onStartMove}
					style={{
						position: 'absolute',
						inset: 0,
						borderRadius: 'var(--radius-md)',
						cursor: 'grab',
					}}
				/>
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

			{selected && !multi && (
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
						<button
							type="button"
							aria-label={`Resize ${w.title}`}
							title={RESIZE_HELP}
							aria-description={RESIZE_HELP}
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

/** Card text: one font shorthand plus a colour. */
const cardText = (font: string, color: string) => ({ font: `${font} var(--font-sans)`, color });
const CARD_ROW = { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } as const;
const CARD_META = cardText('var(--text-2xs)', 'var(--color-text-tertiary)');
type CardProps = { entry: WidgetLibraryEntry; children: ReactNode; onPick: () => void };

/**
 * One library card. The visible content is plain text plus an `inert` miniature; the control is a
 * transparent button laid over the whole card. Putting the miniature INSIDE a button would nest the
 * preview's own buttons in it, which HTML forbids and assistive tech reads as one run-on name.
 */
export function WidgetLibraryCard({ entry, children, onPick }: CardProps) {
	const baseId = useId();
	const [nameId, descId, reasonId] = ['name', 'desc', 'reason'].map((s) => `${baseId}-${s}`);
	const meta = tileMetadataForDefinition(entry);
	const reason = entry.availability.available ? null : entry.availability.reason;
	const accent = reason ? 'var(--color-border-strong)' : `var(${meta.accentToken})`;
	const glyph = reason ? 'var(--color-text-tertiary)' : accent;
	const name = reason ? 'var(--color-text-secondary)' : 'var(--color-text-primary)';
	return (
		<li
			data-testid={`gallery-card-${entry.type}`}
			className={meta.silhouetteClass}
			style={{
				position: 'relative',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-2)',
				padding: 'var(--space-3)',
				border: '1px solid var(--color-border)',
				// The accent rail is a border, not a background: forced-colors keeps it (as WidgetFrame's).
				borderLeft: `4px solid ${accent}`,
				borderRadius: 'var(--radius-md)',
				background: reason ? 'var(--color-surface-sunken)' : 'var(--color-surface-raised)',
				overflow: 'hidden',
			}}
		>
			<div style={CARD_ROW}>
				<WidgetGlyph icon={meta.icon} size={16} color={glyph} />
				<span id={nameId} style={{ flex: 1, minWidth: 0, ...cardText('600 var(--text-sm)', name) }}>
					{entry.displayName}
				</span>
				{entry.category && <span style={CARD_META}>{entry.category}</span>}
			</div>
			<div id={descId} style={cardText('var(--text-2xs)/1.4', 'var(--color-text-secondary)')}>
				{meta.description}
			</div>
			{reason && (
				<div
					id={reasonId}
					style={{
						...CARD_ROW,
						gap: 'var(--space-1)',
						...cardText('600 var(--text-2xs)/1.4', 'var(--color-text-primary)'),
					}}
				>
					<Icon name="lock" size="sm" />
					{reason}
				</div>
			)}
			{children}
			<button
				type="button"
				data-testid={`gallery-entry-${entry.type}`}
				data-category={entry.category ?? ''}
				aria-labelledby={nameId}
				aria-describedby={reason ? `${descId} ${reasonId}` : descId}
				// `aria-disabled`, not `disabled`, keeps the reason reachable by keyboard (tab order).
				aria-disabled={reason ? true : undefined}
				onClick={() => reason || onPick()}
				style={{
					position: 'absolute',
					inset: 0,
					width: '100%',
					height: '100%',
					border: 'none',
					borderRadius: 'var(--radius-md)',
					background: 'transparent',
					cursor: reason ? 'not-allowed' : 'pointer',
					// Inside the edge: the card's `overflow: hidden` clips an outset ring (WCAG 2.4.7).
					outlineOffset: 'calc(-1 * var(--focus-ring-width) - 2px)',
				}}
			/>
		</li>
	);
}
