import React from 'react';
import { ConditionBadge, CONDITIONS } from './ConditionBadge.jsx';
import { Icon } from '../core/Icon.jsx';

/**
 * ConditionTracker — the set of active conditions on one combatant, with an add affordance. Each
 * entry is a removable ConditionBadge; the optional `+ Add` button opens the DM's condition picker
 * (wire `onAdd`). When empty, prints a plain muted "No conditions" rather than a blank gap.
 * `entries` accepts either bare keys (`'poisoned'`) or `{ key, duration, level }` objects.
 */
export function ConditionTracker({
	entries = [],
	onRemove,
	onAdd,
	compact = false,
	addable = true,
	style,
	...rest
}) {
	const norm = entries.map((e) => (typeof e === 'string' ? { key: e } : e));
	return (
		<div
			style={{
				display: 'flex',
				flexWrap: 'wrap',
				alignItems: 'center',
				gap: 'var(--space-1-5)',
				...style,
			}}
			{...rest}
		>
			{/* This was gated on `!addable`, so the documented "No conditions" line appeared ONLY on the
			    read-only tracker: the DM's own empty tracker was a bare dashed button with nothing saying
			    the combatant is unafflicted. Emptiness is a fact about the combatant, not about the viewer. */}
			{norm.length === 0 && (
				<span
					style={{
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-sm)',
						color: 'var(--color-text-tertiary)',
					}}
				>
					No conditions
				</span>
			)}
			{norm.map((e, i) => (
				<ConditionBadge
					key={e.key + i}
					condition={CONDITIONS[e.key] ? e.key : undefined}
					label={CONDITIONS[e.key] ? undefined : e.key}
					duration={e.duration}
					level={e.level}
					compact={compact}
					onRemove={onRemove ? () => onRemove(e.key, i) : undefined}
				/>
			))}
			{addable && (
				<button
					type="button"
					onClick={onAdd}
					// The whole accessible name was the noun "Condition" — the `add` Icon carries no label,
					// so there was no verb anywhere and it read as a status chip rather than a control.
					aria-label="Add condition"
					// ~21px tall from `2px` padding + --text-xs, under the WCAG 2.5.8 floor, while every
					// migrated sibling (Checkbox, Switch, Chip, Slider's steppers) follows the density token.
					// There is no global `button:hover` in this app and an inline style cannot express one,
					// so the hover has to be handlers.
					onMouseEnter={(e) => {
						e.currentTarget.style.background = 'var(--color-interactive-hover)';
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.background = 'transparent';
					}}
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						justifyContent: 'center',
						gap: 'var(--space-1)',
						padding: '2px var(--space-2)',
						minHeight: 'var(--density-touch-target, 24px)',
						borderRadius: 'var(--radius-full)',
						background: 'transparent',
						color: 'var(--color-text-secondary)',
						border: '1px dashed var(--color-border-strong)',
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-xs)',
						fontWeight: 'var(--font-weight-semibold)',
						cursor: 'pointer',
						lineHeight: 1.4,
					}}
				>
					<Icon name="add" size={12} /> Condition
				</button>
			)}
		</div>
	);
}
