import type { CSSProperties } from 'react';

// RC-POL-1.2 — the stacked board's styles, out of `StackedBoard.tsx`.

export const LIST: CSSProperties = {
	flex: 1,
	minHeight: 0,
	minWidth: 0,
	display: 'flex',
	flexDirection: 'column',
	gap: 'var(--space-2)',
	padding: 'var(--space-2)',
	boxSizing: 'border-box',
	overflowX: 'hidden',
	overscrollBehavior: 'contain',
	// Vertical scroll is the ONLY gesture on the stack: no pinch-zoom and no sideways pan.
	touchAction: 'pan-y',
};

export const TILE: CSSProperties = {
	position: 'relative',
	flexDirection: 'column',
	minHeight: 0,
	borderRadius: 'var(--radius-md)',
};

export const RAIL: CSSProperties = {
	position: 'absolute',
	insetInlineStart: 0,
	top: 0,
	bottom: 0,
	width: 0,
	borderStartStartRadius: 'var(--radius-md)',
	borderEndStartRadius: 'var(--radius-md)',
};

export const HEADER: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 'var(--space-1)',
	height: 'var(--space-12)',
	boxSizing: 'border-box',
	paddingInline: 'var(--space-1)',
	flex: '0 0 auto',
};

export const HEADING: CSSProperties = {
	margin: 'var(--space-0)',
	flex: '1 1 auto',
	minWidth: 0,
	display: 'flex',
	height: '100%',
};

export const HEADING_ROW: CSSProperties = {
	flex: '1 1 auto',
	minWidth: 0,
	height: '100%',
	display: 'flex',
	alignItems: 'center',
	gap: 'var(--space-2)',
	padding: 'var(--space-1) var(--space-2)',
	boxSizing: 'border-box',
	color: 'var(--color-text-secondary)',
};

export const DISCLOSURE: CSSProperties = {
	background: 'transparent',
	border: 'none',
	cursor: 'pointer',
	font: 'inherit',
	textAlign: 'start',
};

export const TITLE: CSSProperties = {
	flex: '1 1 auto',
	minWidth: 0,
	font: '700 var(--text-sm) var(--font-sans)',
	color: 'var(--color-text-primary)',
	overflow: 'hidden',
	textOverflow: 'ellipsis',
	whiteSpace: 'nowrap',
};

export const CHIP: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: 'var(--space-1)',
	flex: '0 0 auto',
	padding: 'var(--space-0-5) var(--space-2)',
	borderRadius: 'var(--radius-full)',
	font: '600 var(--text-2xs) var(--font-sans)',
	whiteSpace: 'nowrap',
};

// Secondary, not tertiary, text on the sunken chip: the same 4.5:1 fix WidgetFrame's chip carries.
export const CHIP_DM: CSSProperties = {
	...CHIP,
	background: 'var(--color-surface-sunken)',
	color: 'var(--color-text-secondary)',
};

export const CHIP_PLAYERS: CSSProperties = {
	...CHIP,
	background: 'var(--color-accent-subtle)',
	color: 'var(--color-accent)',
};

// The design package's touch floor on the phone tier (44px there, via the density lock).
export const TOUCH_TARGET: CSSProperties = {
	width: 'var(--density-touch-target)',
	height: 'var(--density-touch-target)',
	flex: '0 0 auto',
};

export const BODY: CSSProperties = {
	flexDirection: 'column',
	gap: 'var(--space-2)',
	minHeight: 0,
	padding: 'var(--space-2) var(--space-3) var(--space-3)',
	boxSizing: 'border-box',
	overflow: 'auto',
};

export const CONTENT: CSSProperties = {
	flex: '1 1 auto',
	minHeight: 0,
	minWidth: 0,
};

export const STATUS_NOTE: CSSProperties = {
	display: 'inline-flex',
	alignItems: 'center',
	gap: 'var(--space-1)',
	flex: '0 0 auto',
	font: '600 var(--text-2xs) var(--font-sans)',
	color: 'var(--color-status-warning-text)',
};

export const EMPTY: CSSProperties = {
	margin: 'auto',
	display: 'flex',
	flexDirection: 'column',
	alignItems: 'center',
	gap: 'var(--space-3)',
	padding: 'var(--space-6)',
	textAlign: 'center',
};

export const EMPTY_TITLE: CSSProperties = {
	font: '700 var(--text-lg) var(--font-sans)',
	color: 'var(--color-text-secondary)',
};

export const EMPTY_HINT: CSSProperties = {
	font: 'var(--text-sm) var(--font-sans)',
	color: 'var(--color-text-secondary)',
	maxWidth: '20rem',
};
