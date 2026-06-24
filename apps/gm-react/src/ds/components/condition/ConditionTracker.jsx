import React from 'react';
import { ConditionBadge, CONDITIONS } from './ConditionBadge.jsx';
import { Icon } from '../core/Icon.jsx';

/**
 * ConditionTracker — the set of active conditions on one combatant, with an add affordance. Each
 * entry is a removable ConditionBadge; the optional `+ Add` button opens the DM's condition picker
 * (wire `onAdd`). When empty, prints a plain muted "No conditions" rather than a blank gap.
 * `entries` accepts either bare keys (`'poisoned'`) or `{ key, duration, level }` objects.
 */
export function ConditionTracker({ entries = [], onRemove, onAdd, compact = false, addable = true, style, ...rest }) {
	const norm = entries.map((e) => (typeof e === 'string' ? { key: e } : e));
	return (
		<div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--space-1-5)', ...style }} {...rest}>
			{norm.length === 0 && !addable && (
				<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>No conditions</span>
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
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 'var(--space-1)',
						padding: '2px var(--space-2)',
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
