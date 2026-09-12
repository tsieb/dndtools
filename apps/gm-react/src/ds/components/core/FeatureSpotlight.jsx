import React from 'react';
import { Icon } from './Icon.jsx';

/**
 * FeatureSpotlight — inline banner that highlights a feature or workflow edge.
 */
export function FeatureSpotlight({
	title,
	description,
	actionLabel,
	onAction,
	icon = 'sparkles',
	style,
	children,
	...rest
}) {
	return (
		<section
			role="complementary"
			aria-label={title}
			style={{
				borderRadius: 'var(--radius-md)',
				border: '1px solid var(--color-accent-border)',
				background: 'linear-gradient(180deg, var(--color-accent-subtle), var(--color-surface))',
				padding: 'var(--space-3)',
				display: 'flex',
				flexDirection: 'column',
				gap: 'var(--space-1-5)',
				...style,
			}}
			{...rest}
		>
			<div
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 'var(--space-1-5)',
					color: 'var(--color-accent)',
					fontFamily: 'var(--font-sans)',
					fontWeight: 'var(--font-weight-semibold)',
				}}
			>
				<Icon name={icon} size="sm" />
				{title}
			</div>
			<div
				style={{
					color: 'var(--color-text-secondary)',
					fontSize: 'var(--text-sm)',
					lineHeight: 1.45,
				}}
			>
				{description}
			</div>
			{children}
			{actionLabel && onAction && (
				<button
					type="button"
					onClick={onAction}
					style={{
						alignSelf: 'flex-start',
						border: '1px solid var(--color-accent-border)',
						background: 'var(--color-accent-subtle)',
						color: 'var(--color-accent)',
						borderRadius: 'var(--radius-sm)',
						padding: '6px 10px',
						fontSize: 'var(--text-xs)',
						fontFamily: 'var(--font-sans)',
						fontWeight: 'var(--font-weight-semibold)',
					}}
				>
					{actionLabel}
				</button>
			)}
		</section>
	);
}
