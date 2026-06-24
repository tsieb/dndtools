import React from 'react';
import { Avatar } from '../core/Avatar.jsx';
import { HPBar } from './HPBar.jsx';
import { Chip } from '../feedback/Chip.jsx';
import { VisibilityChip } from '../feedback/VisibilityChip.jsx';

/**
 * InitiativeRow — one combatant in the initiative tracker (the Session/Combat hot path). The
 * ACTIVE row (current turn) is emphasized with the gold accent rail + raised tone; DM-only
 * combatants get the visibility cue. Initiative number is mono. Designed for fast HP edits.
 */
export function InitiativeRow({ name, initiative, current, max, conditions = [], active = false, dmOnly = false, onHpUp, onHpDown, style, ...rest }) {
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-3)',
				padding: 'var(--space-2) var(--space-3)',
				borderRadius: 'var(--radius-md)',
				background: active ? 'var(--color-accent-subtle)' : 'var(--color-surface)',
				borderLeft: `3px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
				border: `1px solid ${active ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
				borderLeftWidth: 3,
				boxShadow: active ? 'var(--shadow-sm)' : 'none',
				...style,
			}}
			{...rest}
		>
			<span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-weight-bold)', color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)', minWidth: 28, textAlign: 'center' }}>{initiative}</span>
			<Avatar name={name} size="sm" ring={active ? 'turn' : undefined} />
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
					<strong style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</strong>
					{dmOnly && <VisibilityChip level="dm-only" compact />}
				</div>
				{conditions.length > 0 && (
					<div style={{ display: 'flex', gap: 'var(--space-1)', marginTop: 'var(--space-1)', flexWrap: 'wrap' }}>
						{conditions.map((c) => <Chip key={c} tone="danger">{c}</Chip>)}
					</div>
				)}
			</div>
			<div style={{ width: 120, flex: '0 0 auto' }}>
				<HPBar current={current} max={max} size="sm" />
			</div>
			<div style={{ display: 'flex', gap: 'var(--space-1)' }}>
				<HpStep label="−" onClick={onHpDown} />
				<HpStep label="+" onClick={onHpUp} />
			</div>
		</div>
	);
}

function HpStep({ label, onClick }) {
	return (
		<button
			type="button"
			aria-label={label === '+' ? 'Heal 1' : 'Damage 1'}
			onClick={onClick}
			style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-strong)', background: 'var(--color-surface-raised)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-md)', fontWeight: 'var(--font-weight-bold)', cursor: 'pointer', lineHeight: 1 }}
		>
			{label}
		</button>
	);
}
