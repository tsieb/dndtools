import React from 'react';
import { Avatar } from '../core/Avatar.jsx';
import { Icon } from '../core/Icon.jsx';
import { Chip } from '../feedback/Chip.jsx';
import { VisibilityChip } from '../feedback/VisibilityChip.jsx';

const DISPOSITION = {
	friendly: { label: 'Friendly', color: 'var(--color-status-success-text)', dot: 'var(--color-status-success)' },
	neutral: { label: 'Neutral', color: 'var(--color-text-secondary)', dot: 'var(--color-text-tertiary)' },
	hostile: { label: 'Hostile', color: 'var(--color-status-error-text)', dot: 'var(--color-status-error)' },
	unknown: { label: 'Unknown', color: 'var(--color-text-tertiary)', dot: 'var(--color-border-strong)' },
};

/**
 * NpcCard — a non-player character reference in the Campaign roster: avatar, name, the role ·
 * location line, a disposition dot (friendly / neutral / hostile — color + label, never color
 * alone), the secret hook the DM plays them with, and relationship tags. `dmOnly` flags NPCs the
 * party hasn't met. Compact enough to tile in a grid, rich enough to run a scene from.
 */
export function NpcCard({ name, role, location, disposition = 'neutral', hook, tags = [], src, dmOnly = false, onClick, style, ...rest }) {
	const d = DISPOSITION[disposition] || DISPOSITION.neutral;
	const interactive = !!onClick;
	return (
		<article
			onClick={onClick}
			style={{
				background: 'var(--color-surface)',
				border: '1px solid var(--color-border)',
				borderRadius: 'var(--radius-md)',
				boxShadow: 'var(--shadow-sm)',
				padding: 'var(--space-4)',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-3)',
				color: 'var(--color-text-primary)',
				cursor: interactive ? 'pointer' : 'default',
				transition: interactive ? 'border-color var(--duration-fast) var(--easing-standard)' : 'none',
				...style,
			}}
			onMouseEnter={interactive ? (e) => { e.currentTarget.style.borderColor = 'var(--color-border-strong)'; } : undefined}
			onMouseLeave={interactive ? (e) => { e.currentTarget.style.borderColor = 'var(--color-border)'; } : undefined}
			{...rest}
		>
			<div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
				<Avatar name={name} src={src} size="lg" />
				<div style={{ flex: 1, minWidth: 0 }}>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
						<h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--text-md)', fontWeight: 'var(--font-weight-bold)', lineHeight: 1.15, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</h3>
						{dmOnly && <VisibilityChip level="dm-only" compact />}
					</div>
					{(role || location) && (
						<p style={{ margin: '2px 0 0', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
							{role}{role && location ? ' · ' : ''}{location}
						</p>
					)}
					<div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginTop: 'var(--space-1)' }}>
						<span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: d.dot }} />
						<span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-semibold)', color: d.color }}>{d.label}</span>
					</div>
				</div>
			</div>

			{hook && (
				<p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontStyle: 'italic', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>
					<Icon name="dm-only" size={13} color="var(--color-dm-only-badge)" aria-hidden="true" style={{ verticalAlign: '-2px', marginRight: 4 }} />{hook}
				</p>
			)}

			{tags.length > 0 && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
					{tags.map((t) => <Chip key={t}>{t}</Chip>)}
				</div>
			)}
		</article>
	);
}
