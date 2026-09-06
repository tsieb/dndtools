import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Chip } from '../feedback/Chip.jsx';

/**
 * SystemPackageCard — one rules system in the System Package Picker: its sigil, its name, the tier
 * it comes from (built-in, forked, installed), what it declares as chips, and whether it is the
 * system the campaign is currently running.
 *
 * The whole card is the control, so pointer and keyboard reach the same place (it is a real
 * `<button>`, not a div with a click handler). "Active" is carried by a text label as well as the
 * dot, and the card the picker is showing in detail is marked `aria-current="true"` rather than by
 * its border alone — neither state is colour-only.
 *
 * `compact` renders the detail view's left rail: the same identity, no summary, no chips.
 */
export function SystemPackageCard({
	name,
	tier,
	summary,
	chips = [],
	icon = 'widget',
	active = false,
	activeLabel = 'Active',
	current = false,
	compact = false,
	onSelect,
	style,
	...rest
}) {
	const glyph = (
		<span
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				justifyContent: 'center',
				width: compact ? 32 : 38,
				height: compact ? 32 : 38,
				borderRadius: 'var(--radius-sm)',
				background: 'var(--color-surface-sunken)',
				border: '1px solid var(--color-border)',
				color: 'var(--color-accent)',
				flex: '0 0 auto',
			}}
		>
			<Icon name={icon} size={compact ? 'micro' : 'sm'} aria-hidden="true" />
		</span>
	);
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-current={current ? 'true' : undefined}
			style={{
				textAlign: 'left',
				font: 'inherit',
				color: 'var(--color-text-primary)',
				cursor: 'pointer',
				background: current ? 'var(--color-surface-raised)' : 'var(--color-surface)',
				border: `1px solid ${current ? 'var(--color-accent-border)' : 'var(--color-border)'}`,
				boxShadow: current ? 'var(--shadow-sm)' : 'none',
				borderRadius: 'var(--radius-md)',
				padding: compact ? 'var(--space-3)' : 'var(--space-4)',
				display: 'flex',
				flexDirection: compact ? 'row' : 'column',
				alignItems: compact ? 'center' : 'stretch',
				gap: 'var(--space-3)',
				...style,
			}}
			{...rest}
		>
			<div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', flex: 1 }}>
				{glyph}
				<span style={{ flex: 1, minWidth: 0 }}>
					<span
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 'var(--space-2)',
							flexWrap: 'wrap',
						}}
					>
						<span
							style={{
								fontFamily: 'var(--font-display)',
								fontSize: compact ? 'var(--text-sm)' : 'var(--text-lg)',
								fontWeight: 'var(--font-weight-bold)',
								lineHeight: 1.2,
							}}
						>
							{name}
						</span>
						{active && (
							<Chip tone="accent" icon="check">
								{activeLabel}
							</Chip>
						)}
					</span>
					{tier && (
						<span
							style={{
								display: 'block',
								marginTop: 3,
								font: `600 11px var(--font-sans)`,
								letterSpacing: '.08em',
								textTransform: 'uppercase',
								color: 'var(--color-text-secondary)',
							}}
						>
							{tier}
						</span>
					)}
				</span>
			</div>
			{!compact && summary && (
				<span
					style={{
						font: `var(--text-sm)/1.5 var(--font-sans)`,
						color: 'var(--color-text-secondary)',
						flex: 1,
					}}
				>
					{summary}
				</span>
			)}
			{!compact && chips.length > 0 && (
				<span style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
					{chips.map((chip) => (
						<Chip key={chip.label} icon={chip.icon}>
							{chip.label}
						</Chip>
					))}
				</span>
			)}
		</button>
	);
}
