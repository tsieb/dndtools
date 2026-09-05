import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { useConditionDef } from './SystemProvider.jsx';

export { CONDITIONS, DEFAULT_CONDITIONS } from './conditions-catalog.js';

const TONES = {
	danger: {
		fg: 'var(--color-status-error-text)',
		bg: 'var(--color-status-error-subtle)',
		bd: 'var(--color-status-error)',
	},
	warning: {
		fg: 'var(--color-status-warning-text)',
		bg: 'var(--color-status-warning-subtle)',
		bd: 'var(--color-status-warning)',
	},
	good: {
		fg: 'var(--color-status-success-text)',
		bg: 'var(--color-status-success-subtle)',
		bd: 'var(--color-status-success)',
	},
	info: {
		fg: 'var(--color-status-info-text)',
		bg: 'var(--color-status-info-subtle)',
		bd: 'var(--color-status-info)',
	},
	neutral: {
		fg: 'var(--color-text-secondary)',
		bg: 'var(--color-surface-overlay)',
		bd: 'var(--color-border-strong)',
	},
};

/**
 * ConditionBadge — a status effect pill carrying COLOR + a distinct icon shape + the label, so the
 * effect reads at a glance and in grayscale. Pass a known condition key (auto label/icon/tone) or a
 * custom `label`. Optional `duration` (rounds left) sets a mono countdown; `level={n}` shows an
 * exhaustion-style stack. `onRemove` adds a clear affordance for the combat tracker.
 *
 * The key is looked up in the ACTIVE system package first (RC-SYS-2.3), then the default table.
 */
export function ConditionBadge({
	condition,
	label,
	tone,
	icon,
	duration,
	level,
	compact = false,
	onRemove,
	style,
	...rest
}) {
	const def = useConditionDef(condition) || {};
	const t = TONES[tone || def.tone || 'neutral'] || TONES.neutral;
	const glyph = icon || def.icon || 'info';
	const text = label || def.label || condition || '';
	return (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 'var(--space-1)',
				padding: compact ? '2px var(--space-1-5)' : '2px var(--space-2)',
				borderRadius: 'var(--radius-full)',
				background: t.bg,
				color: t.fg,
				border: `1px solid ${t.bd}`,
				fontFamily: 'var(--font-sans)',
				fontSize: 'var(--text-xs)',
				fontWeight: 'var(--font-weight-semibold)',
				lineHeight: 1.4,
				whiteSpace: 'nowrap',
				...style,
			}}
			{...rest}
		>
			<Icon name={glyph} size={13} label={compact ? text : undefined} />
			{!compact && text}
			{level ? (
				<span style={{ fontFamily: 'var(--font-mono)', opacity: 0.85 }}>{level}</span>
			) : null}
			{duration != null && (
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 2,
						fontFamily: 'var(--font-mono)',
						fontSize: 'var(--text-2xs)',
						opacity: 0.85,
					}}
				>
					<Icon name="hourglass" size={11} /> {duration}
				</span>
			)}
			{onRemove && (
				<button
					type="button"
					aria-label={`Clear ${text}`}
					onClick={onRemove}
					// 14x14 failed WCAG 2.5.8, and in the Session combat tracker these sit in a wrapping row
					// of other tiny targets. Match Chip's remove button: a 24px hit box around the 11px glyph.
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						minWidth: 24,
						minHeight: 24,
						marginLeft: 2,
						padding: 0,
						border: 'none',
						borderRadius: 'var(--radius-full)',
						background: 'transparent',
						color: 'inherit',
						cursor: 'pointer',
						opacity: 0.7,
					}}
				>
					<Icon name="close" size={11} />
				</button>
			)}
		</span>
	);
}
