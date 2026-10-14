import { useState, type CSSProperties } from 'react';
import { Icon } from '../../ds';
import { useI18n } from '../../i18n';
import { asPhrase } from './canvasCopy';
import type { LayoutHistory } from './useLayoutHistory';

type Translate = ReturnType<typeof useI18n>['t'];

/** The Undo button's name: what the next Ctrl+Z reverses, when there is something to reverse. */
export const undoLabel = (t: Translate, history: LayoutHistory) =>
	history.undoLabel
		? t('boardCanvas.history.undoStep', { step: asPhrase(history.undoLabel) })
		: t('boardCanvas.history.undo');

export const redoLabel = (t: Translate, history: LayoutHistory) =>
	history.redoLabel
		? t('boardCanvas.history.redoStep', { step: asPhrase(history.redoLabel) })
		: t('boardCanvas.history.redo');

// RC-POL-1.2 — the canvas frame's small parts (glyph, overlay buttons, empty canvas, hover lift,
// grip), out of `WidgetFrame.tsx`.

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

/** The canvas Undo/Redo cluster. Anchored top-right on the bounded board (it scrolls, and an edit
 *  session starts at the top) and bottom-left on the free canvas, opposite its zoom cluster. */
export function HistoryCluster({
	history,
	policy,
}: {
	history: LayoutHistory;
	policy: 'bounded' | 'canvas';
}) {
	const { t } = useI18n();
	return (
		<div
			data-testid="canvas-history-controls"
			style={{
				position: 'absolute',
				...(policy === 'bounded' ? { top: 12, right: 12 } : { left: 16, bottom: 16 }),
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-0-5)',
				padding: 'var(--space-1)',
				borderRadius: 'var(--radius-md)',
				background: 'var(--color-surface-overlay)',
				border: '1px solid var(--color-border-strong)',
				boxShadow: 'var(--shadow-lg)',
			}}
		>
			<HistoryBtn
				icon="undo"
				label={undoLabel(t, history)}
				disabled={!history.canUndo}
				onClick={() => void history.undo()}
			/>
			<HistoryBtn
				icon="redo"
				label={redoLabel(t, history)}
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
	const { t } = useI18n();
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
				{title ?? t('board.emptySceneTitle')}
			</div>
			<div
				style={{
					font: 'var(--text-sm) var(--font-sans)',
					color: 'var(--color-text-secondary)',
					maxWidth: 320,
				}}
			>
				{hint ?? t('boardCanvas.emptyHint')}
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
