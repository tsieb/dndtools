import React from 'react';

/**
 * SpellSlots — a caster's slot economy: one row per spell level with filled/empty diamond pips
 * (filled = available, hollow = expended). Pips are clickable to spend/recover a slot; the level
 * label is mono. Designed to sit in a character sheet or the session sidebar so a DM tracks
 * resource attrition at a glance. Levels with zero total slots are omitted.
 */
export function SpellSlots({ levels = [], onToggle, readOnly = false, style, ...rest }) {
	const shown = levels.filter((l) => l.total > 0);
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', ...style }} {...rest}>
			{shown.map((lvl) => {
				const used = Math.max(0, Math.min(lvl.total, lvl.used || 0));
				const avail = lvl.total - used;
				return (
					<div key={lvl.level} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
						<span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-text-secondary)', width: 56, flex: '0 0 auto' }}>
							{lvl.level === 0 ? 'Cantrip' : `Lvl ${lvl.level}`}
						</span>
						<div style={{ display: 'flex', gap: 'var(--space-1)', flex: 1, flexWrap: 'wrap' }}>
							{Array.from({ length: lvl.total }).map((_, i) => {
								const filled = i < avail;
								return (
									<button
										key={i}
										type="button"
										disabled={readOnly}
										aria-label={`Level ${lvl.level} slot ${i + 1} ${filled ? 'available' : 'expended'}`}
										aria-pressed={filled}
										onClick={readOnly ? undefined : () => onToggle && onToggle(lvl.level, i, filled)}
										style={{
											width: 16,
											height: 16,
											padding: 0,
											border: 'none',
											background: 'transparent',
											cursor: readOnly ? 'default' : 'pointer',
											display: 'inline-flex',
											transform: 'rotate(45deg)',
										}}
									>
										<span style={{
											width: 12,
											height: 12,
											margin: 2,
											borderRadius: 2,
											background: filled ? 'var(--color-accent)' : 'transparent',
											border: `1.5px solid ${filled ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
											boxShadow: filled ? 'var(--shadow-sm)' : 'none',
											transition: 'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
										}} />
									</button>
								);
							})}
						</div>
						<span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: avail === 0 ? 'var(--color-status-error-text)' : 'var(--color-text-tertiary)', flex: '0 0 auto' }}>
							{avail}/{lvl.total}
						</span>
					</div>
				);
			})}
		</div>
	);
}
