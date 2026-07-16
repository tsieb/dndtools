import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * BottomTabBar — the mobile expression of the IA: icon-over-label tabs pinned to the bottom edge,
 * each a ≥44px touch target (the comfortable-density floor). On phones the seven sections usually
 * reduce to the 4–5 hot destinations + a "More" tab. Active is the gold accent; the rest are
 * secondary. Same `items`/`active` contract as the sidebar and rail.
 */
export function BottomTabBar({ items = [], active, onSelect, style, ...rest }) {
	return (
		<nav
			aria-label="Primary"
			style={{
				display: 'flex',
				alignItems: 'stretch',
				width: '100%',
				boxSizing: 'border-box',
				padding:
					'var(--space-1) max(var(--space-1), var(--safe-area-right, 0px)) calc(var(--space-1) + var(--safe-area-bottom, 0px)) max(var(--space-1), var(--safe-area-left, 0px))',
				background: 'var(--color-surface)',
				borderTop: '1px solid var(--color-border)',
				...style,
			}}
			{...rest}
		>
			{items.map((it) => {
				const on = active === it.key;
				return (
					<button
						key={it.key}
						type="button"
						aria-current={on ? 'page' : undefined}
						onClick={() => onSelect && onSelect(it.key)}
						style={{
							flex: 1,
							minWidth: 0,
							display: 'flex',
							flexDirection: 'column',
							alignItems: 'center',
							justifyContent: 'center',
							gap: 2,
							minHeight: 52,
							padding: 'var(--space-1)',
							border: 'none',
							background: 'transparent',
							color: on ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
							cursor: 'pointer',
							position: 'relative',
						}}
					>
						<span style={{ position: 'relative', display: 'inline-flex' }}>
							<Icon name={it.icon} size="sm" aria-hidden="true" />
							{it.badge != null && (
								<span
									aria-hidden="true"
									style={{
										position: 'absolute',
										top: -3,
										right: -6,
										minWidth: 7,
										height: 7,
										borderRadius: 'var(--radius-full)',
										background: 'var(--color-accent)',
										border: '1.5px solid var(--color-surface)',
									}}
								/>
							)}
						</span>
						<span
							style={{
								maxWidth: '100%',
								fontFamily: 'var(--font-sans)',
								fontSize: 'var(--text-2xs)',
								fontWeight: on ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
								lineHeight: 1.1,
								overflowWrap: 'anywhere',
								textAlign: 'center',
							}}
						>
							{it.label}
						</span>
					</button>
				);
			})}
		</nav>
	);
}
