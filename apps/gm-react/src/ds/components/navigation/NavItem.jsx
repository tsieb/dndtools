import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * NavItem — one destination in the global navigation. Shared by NavSidebar (label visible) and
 * NavRail (collapsed → icon only, label moves to the accessible name + native tooltip). The ACTIVE
 * item gets the gold tint + a gold left rail; hover is the faint gold wash. One name per
 * destination — the nav label IS the page title. Optional `badge` shows a count (e.g. live players).
 */
export function NavItem({
	icon,
	label,
	active = false,
	collapsed = false,
	badge,
	onClick,
	as = 'button',
	href,
	style,
	...rest
}) {
	const Tag = as === 'a' ? 'a' : 'button';
	return (
		<Tag
			type={as === 'a' ? undefined : 'button'}
			href={as === 'a' ? href : undefined}
			onClick={onClick}
			aria-current={active ? 'page' : undefined}
			aria-label={collapsed ? label : undefined}
			title={collapsed ? label : undefined}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 'var(--space-3)',
				width: '100%',
				padding: collapsed ? 'var(--space-2)' : 'var(--space-2) var(--space-3)',
				justifyContent: collapsed ? 'center' : 'flex-start',
				minHeight: 'var(--density-nav-item-height, 40px)',
				borderRadius: 'var(--radius-md)',
				border: 'none',
				borderLeft: collapsed
					? 'none'
					: `2px solid ${active ? 'var(--color-accent)' : 'transparent'}`,
				background: active ? 'var(--color-accent-subtle)' : 'transparent',
				color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
				fontFamily: 'var(--font-sans)',
				fontSize: 'var(--text-base)',
				fontWeight: active ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
				textAlign: 'left',
				textDecoration: 'none',
				cursor: 'pointer',
				transition:
					'background var(--duration-fast) var(--easing-standard), color var(--duration-fast) var(--easing-standard)',
				...style,
			}}
			onMouseEnter={(e) => {
				if (!active) {
					e.currentTarget.style.background = 'var(--color-interactive-hover)';
					e.currentTarget.style.color = 'var(--color-text-primary)';
				}
			}}
			onMouseLeave={(e) => {
				if (!active) {
					e.currentTarget.style.background = 'transparent';
					e.currentTarget.style.color = 'var(--color-text-secondary)';
				}
			}}
			{...rest}
		>
			{/* No explicit aria-hidden: the glyph is decorative in BOTH states (the collapsed rail
			    carries its name on the button's own aria-label), and Icon already hides a label-less
			    glyph. Passing `aria-hidden={!collapsed}` spread AFTER Icon's own a11y props actively
			    UN-hid the expanded rail's nameless graphic. */}
			<Icon name={icon} size="sm" label={null} style={{ flex: '0 0 auto' }} />
			{!collapsed && (
				<span
					style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
				>
					{label}
				</span>
			)}
			{!collapsed && badge != null && (
				<span
					style={{
						fontFamily: 'var(--font-mono)',
						fontSize: 'var(--text-2xs)',
						fontWeight: 'var(--font-weight-bold)',
						padding: '1px var(--space-1-5)',
						borderRadius: 'var(--radius-full)',
						background: active ? 'var(--color-accent)' : 'var(--color-surface-overlay)',
						color: active ? 'var(--color-accent-foreground)' : 'var(--color-text-secondary)',
					}}
				>
					{badge}
				</span>
			)}
			{collapsed && badge != null && (
				<span
					aria-hidden="true"
					style={{
						position: 'absolute',
						marginTop: -16,
						marginLeft: 16,
						width: 7,
						height: 7,
						borderRadius: 'var(--radius-full)',
						background: 'var(--color-accent)',
						border: '1.5px solid var(--color-surface)',
					}}
				/>
			)}
		</Tag>
	);
}
