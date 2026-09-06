import { Icon } from '../../ds';
import { TIER_LABEL, visibilityChip, type BoardWidget } from '../board-helpers';
import { WidgetRenderSlot, type WidgetCommandHandler } from '../widgets/WidgetRenderSlot';

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

export function ZoomBtn({
	icon,
	label,
	onClick,
}: {
	icon: string;
	label: string;
	onClick: () => void;
}) {
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

export interface WidgetFrameProps {
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
