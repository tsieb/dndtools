import React from 'react';
import { Icon } from '../core/Icon.jsx';

/**
 * EmptyState — what a surface shows before it has content: a muted icon, a plain-spoken title, an
 * optional one-line explanation, and the single action that fills it. Calm, never apologetic —
 * "No combat running." / "Start one →", in the product's stage-manager voice. Use `inset` inside a
 * card/panel and the default for full-region empties.
 */
export function EmptyState({
	icon = 'info',
	title,
	description,
	action,
	inset = false,
	style,
	...rest
}) {
	return (
		<div
			// NOT a live region. `role="status"` made all ~34 live empty states permanent polite regions
			// with the implicit aria-atomic="true", so any change inside one re-announced its heading,
			// description AND action label — and a bare `getByRole('status')` became ambiguous against
			// the screens' real status channels. An empty state is content, not a status change; the
			// surface that CAUSED it (a filter, a delete) is what should announce.
			style={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				textAlign: 'center',
				gap: 'var(--space-2)',
				padding: inset ? 'var(--space-6) var(--space-4)' : 'var(--space-10) var(--space-6)',
				color: 'var(--color-text-secondary)',
				...style,
			}}
			{...rest}
		>
			<span
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: 56,
					height: 56,
					borderRadius: 'var(--radius-full)',
					background: 'var(--color-surface-sunken)',
					border: '1px solid var(--color-border)',
					color: 'var(--color-text-tertiary)',
					marginBottom: 'var(--space-1)',
				}}
			>
				<Icon name={icon} size="lg" aria-hidden="true" />
			</span>
			{title && (
				<h3
					style={{
						margin: 0,
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-md)',
						fontWeight: 'var(--font-weight-semibold)',
						color: 'var(--color-text-primary)',
					}}
				>
					{title}
				</h3>
			)}
			{description && (
				<p
					style={{
						margin: 0,
						maxWidth: 320,
						fontFamily: 'var(--font-sans)',
						fontSize: 'var(--text-sm)',
						lineHeight: 1.5,
						color: 'var(--color-text-tertiary)',
					}}
				>
					{description}
				</p>
			)}
			{action && <div style={{ marginTop: 'var(--space-2)' }}>{action}</div>}
		</div>
	);
}
