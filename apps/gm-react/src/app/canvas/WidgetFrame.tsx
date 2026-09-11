import type { LayoutHistory } from './useLayoutHistory';
import { useMemo, useRef } from 'react';
import { Icon } from '../../ds';
import { useRuntime } from '../../runtime/RuntimeContext';
import { TIER_LABEL, visibilityChip, type BoardWidget } from '../board-helpers';
import {
	safeBoundEntityName,
	tileBindingState,
	tileMetadataForWidget,
	type TileBindingState,
} from '../widgets/tileMeta';
import { WidgetRenderSlot, type WidgetCommandHandler } from '../widgets/WidgetRenderSlot';
import { TileActionMenu, TRIGGER_SIZE } from './TileActionMenu';

/**
 * The pieces a scene canvas is DRAWN from: one widget frame, and the two overlay buttons that sit
 * on top of the canvas (undo/redo and zoom).
 *
 * Moved out of `SceneBoardCanvas.tsx` verbatim by RC-ENG-1.1 to bring that file back under the
 * RC-STB-2.7 file-size gate. Nothing here changed behaviour: the frame's markup, its roving
 * tabindex, the forced-colors outline note, and the two overlay buttons are exactly as they were.
 * `WidgetGlyph` came along because the frame renders it; `SceneBoardCanvas` re-exports it so its
 * existing importers (Board, Inspector, AddWidgetPanel) keep their import path.
 */

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

export function WidgetFrame({
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
	history,
}: WidgetFrameProps) {
	const chip = visibilityChip(w.visibility);
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
			tabIndex={tabbable ? 0 : -1}
			onKeyDown={(e) => {
				const menuKey = e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
				if (!(menuKey && openMenu(e))) onKeyDown(e);
			}}
			onContextMenu={openMenu}
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
				<div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
					<WidgetRenderSlot widget={w} onCommand={onCommand} />
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
