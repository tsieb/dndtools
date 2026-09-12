import { en } from '../../../i18n/messages/en';

export interface ChipProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'onClick'> {
	onClick?: (
		event: React.MouseEvent<HTMLSpanElement> | React.KeyboardEvent<HTMLSpanElement>,
	) => void;
	icon?: string;
	tone?: 'neutral' | 'accent' | 'danger' | 'info';
	selected?: boolean;
	/** Render a remove (×) affordance and call this when clicked. */
	onRemove?: () => void;
	children?: React.ReactNode;
}

import React from 'react';
import { Icon } from '../core/Icon';

/**
 * Chip — a compact, optionally-removable token (conditions, tags, filters). Square-ish pill;
 * pass `onRemove` to render a close affordance, `icon` for a leading glyph, `tone` to tint.
 */
export function Chip({
	icon,
	tone = 'neutral',
	onRemove,
	selected = false,
	children,
	style,
	onClick,
	...rest
}: ChipProps) {
	const tones = {
		neutral: {
			bg: selected ? 'var(--color-interactive-selected)' : 'var(--color-surface-overlay)',
			fg: 'var(--color-text-primary)',
			bd: 'var(--color-border-strong)',
		},
		accent: {
			bg: 'var(--color-accent-subtle)',
			fg: 'var(--color-accent)',
			bd: 'var(--color-accent-border)',
		},
		danger: {
			bg: 'var(--color-status-error-subtle)',
			fg: 'var(--color-status-error-text)',
			bd: 'var(--color-status-error)',
		},
		info: {
			bg: 'var(--color-status-info-subtle)',
			fg: 'var(--color-status-info-text)',
			bd: 'var(--color-status-info)',
		},
	};
	const t = tones[tone] || tones.neutral;
	// A clickable chip must be operable by keyboard and expose its selected state semantically —
	// `selected` otherwise drives a background change with no counterpart in the a11y tree.
	const interactive = typeof onClick === 'function';
	return (
		<span
			onClick={onClick}
			role={interactive ? 'button' : undefined}
			tabIndex={interactive ? 0 : undefined}
			aria-pressed={interactive ? selected : undefined}
			onKeyDown={
				interactive
					? (e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								onClick(e);
							}
						}
					: undefined
			}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 'var(--space-1)',
				padding: '3px var(--space-2)',
				borderRadius: 'var(--radius-sm)',
				background: t.bg,
				color: t.fg,
				border: `1px solid ${t.bd}`,
				fontFamily: 'var(--font-sans)',
				fontSize: 'var(--text-xs)',
				fontWeight: 'var(--font-weight-medium)',
				cursor: onClick ? 'pointer' : 'default',
				...style,
			}}
			{...rest}
		>
			{icon && <Icon name={icon} size={13} />}
			{children}
			{onRemove && (
				<button
					type="button"
					aria-label={en['ds.chip.remove']}
					onClick={(e) => {
						e.stopPropagation();
						onRemove();
					}}
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						border: 'none',
						background: 'transparent',
						color: 'inherit',
						cursor: 'pointer',
						padding: 0,
						marginLeft: 2,
						minWidth: 'var(--density-touch-target, 24px)',
						minHeight: 'var(--density-touch-target, 24px)',
					}}
				>
					<Icon name="close" size={12} />
				</button>
			)}
		</span>
	);
}
