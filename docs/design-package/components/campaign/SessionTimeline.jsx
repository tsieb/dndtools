import React from 'react';
import { Icon } from '../core/Icon.jsx';

const TONES = {
	default: 'var(--color-border-strong)',
	accent: 'var(--color-accent)',
	success: 'var(--color-status-success)',
	warning: 'var(--color-status-warning)',
	error: 'var(--color-status-error)',
	info: 'var(--color-status-info)',
};

/**
 * SessionTimeline — a vertical log of what happened: the recap rail in the Campaign section and the
 * live event feed during a session. Each entry is a node on a connecting line with a mono
 * timestamp, a title, and optional detail; `tone` + `icon` mark the kind of beat (combat, loot,
 * NPC, milestone). The most recent entry can be emphasized with `active`. Reads top-down, newest
 * first or oldest first — you order the array.
 */
export function SessionTimeline({ entries = [], style, ...rest }) {
	return (
		<ol style={{ margin: 0, padding: 0, listStyle: 'none', ...style }} {...rest}>
			{entries.map((e, i) => {
				const last = i === entries.length - 1;
				const color = TONES[e.tone] || TONES.default;
				const active = e.active;
				return (
					<li key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', columnGap: 'var(--space-3)' }}>
						<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
							<span style={{
								width: 28,
								height: 28,
								flex: '0 0 auto',
								borderRadius: 'var(--radius-full)',
								display: 'inline-flex',
								alignItems: 'center',
								justifyContent: 'center',
								background: active ? color : 'var(--color-surface)',
								color: active ? 'var(--color-accent-foreground)' : color,
								border: `2px solid ${color}`,
								boxShadow: active ? 'var(--shadow-sm)' : 'none',
							}}>
								<Icon name={e.icon || 'recent'} size={14} aria-hidden="true" />
							</span>
							{!last && <span aria-hidden="true" style={{ flex: 1, width: 2, minHeight: 16, background: 'var(--color-border)', margin: '2px 0' }} />}
						</div>
						<div style={{ paddingBottom: last ? 0 : 'var(--space-4)', minWidth: 0 }}>
							{e.time && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-2xs)', letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', marginBottom: 1 }}>{e.time}</div>}
							<div style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-base)', fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-text-primary)', lineHeight: 1.3 }}>{e.title}</div>
							{e.detail && <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{e.detail}</p>}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
