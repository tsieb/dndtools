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
		<div
			style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', ...style }}
			{...rest}
		>
			{shown.map((lvl) => {
				const used = Math.max(0, Math.min(lvl.total, lvl.used || 0));
				const avail = lvl.total - used;
				return (
					<div
						key={lvl.level}
						style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
					>
						<span
							style={{
								fontFamily: 'var(--font-mono)',
								fontSize: 'var(--text-sm)',
								fontWeight: 'var(--font-weight-bold)',
								color: 'var(--color-text-secondary)',
								width: 56,
								flex: '0 0 auto',
							}}
						>
							{lvl.level === 0 ? 'Cantrip' : `Lvl ${lvl.level}`}
						</span>
						<div style={{ display: 'flex', gap: 'var(--space-1)', flex: 1, flexWrap: 'wrap' }}>
							{Array.from({ length: lvl.total }).map((_, i) => {
								const filled = i < avail;
								const name = `Level ${lvl.level} slot ${i + 1} ${filled ? 'available' : 'expended'}`;
								const pip = (
									// The rotate lives on the DIAMOND, never on the hit box: rotating the
									// button turns its 24px square into a diamond whose corners overhang the
									// neighbouring slots, so a mis-tap spends someone else's spell.
									<span
										style={{
											width: 12,
											height: 12,
											borderRadius: 2,
											transform: 'rotate(45deg)',
											background: filled ? 'var(--color-accent)' : 'transparent',
											border: `1.5px solid ${filled ? 'var(--color-accent)' : 'var(--color-border-strong)'}`,
											boxShadow: filled ? 'var(--shadow-sm)' : 'none',
											transition:
												'background var(--duration-fast) var(--easing-standard), border-color var(--duration-fast) var(--easing-standard)',
										}}
									/>
								);
								// Read-only is a STATE, not an unavailable action: a natively `disabled`
								// button leaves the tab order and is UA-dimmed, so a player looking at a
								// shared sheet got a grid of dead grey controls instead of a readable
								// slot economy. Render the same pips as plain images instead.
								if (readOnly) {
									return (
										<span
											key={i}
											role="img"
											aria-label={name}
											style={{
												width: 24,
												height: 24,
												display: 'inline-flex',
												alignItems: 'center',
												justifyContent: 'center',
											}}
										>
											{pip}
										</span>
									);
								}
								return (
									<button
										key={i}
										type="button"
										aria-label={name}
										aria-pressed={filled}
										onClick={() => onToggle && onToggle(lvl.level, i, filled)}
										style={{
											// 24px is the WCAG 2.5.8 minimum; the painted diamond stays 12px.
											width: 24,
											height: 24,
											padding: 0,
											border: 'none',
											background: 'transparent',
											cursor: 'pointer',
											display: 'inline-flex',
											alignItems: 'center',
											justifyContent: 'center',
										}}
									>
										{pip}
									</button>
								);
							})}
						</div>
						<span
							style={{
								fontFamily: 'var(--font-mono)',
								fontSize: 'var(--text-xs)',
								color:
									avail === 0 ? 'var(--color-status-error-text)' : 'var(--color-text-tertiary)',
								flex: '0 0 auto',
							}}
						>
							{avail}/{lvl.total}
						</span>
					</div>
				);
			})}
		</div>
	);
}
